import { WebSocketServer } from 'ws';
import * as syncManager from '../services/syncManager.js';
import { createUserClient, supabaseAdmin } from '../lib/supabase.js';
import { createWebSocketRateLimit } from '../lib/rateLimit.js';

// Store active connections per session
// Map<sessionId, Set<WebSocket>>
const sessionClients = new Map();

// Per-user per-session connection limit
// Map<`${userId}:${sessionId}`, number>
const connectionCounts = new Map();
const MAX_CONNECTIONS_PER_USER_SESSION = 3;

// Per-IP spectator connection limit (prevents anonymous WS flooding)
const spectatorCounts = new Map();  // Map<ip, number>
const MAX_SPECTATOR_CONNECTIONS_PER_IP = 10;
const wsConnectionAttemptRateLimit = createWebSocketRateLimit({
  windowMs: 60_000,
  max: Number(process.env.WS_CONNECTION_ATTEMPT_RATE_LIMIT_MAX || 30),
  keyPrefix: 'ws-connection-attempt',
  keyGenerator: (context) => context.clientIp,
});
const wsInboundMessageRateLimit = createWebSocketRateLimit({
  windowMs: 10_000,
  max: Number(process.env.WS_INBOUND_MESSAGE_RATE_LIMIT_MAX || 120),
  keyPrefix: 'ws-inbound-message',
  keyGenerator: (context) => context.connectionKey,
});

// In-memory control delegation state: Map<sessionId, { hostUserId, delegateeUserId|null }>
const controlState = new Map();

/**
 * Set or clear control delegation for a session.
 * Called from the REST layer (sessions.js) so auth is already verified.
 * Broadcasts CONTROL_STATE to all clients in the session.
 */
export function setControlDelegation(sessionId, hostUserId, delegateeUserId) {
  controlState.set(sessionId, { hostUserId, delegateeUserId: delegateeUserId ?? null });
  broadcastToSession(sessionId, {
    type: 'CONTROL_STATE',
    hostUserId,
    delegateeUserId: delegateeUserId ?? null,
  });
}

/** Return current delegatee (or null) for a session. */
export function getControlDelegatee(sessionId) {
  return controlState.get(sessionId)?.delegateeUserId ?? null;
}

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

  // ── Heartbeat: detect dead connections ──────────────────────────────────────
  const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
  const heartbeatTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        console.log(`[WS] Terminating dead connection (session=${ws.sessionId})`);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();

  wss.on('close', () => {
    clearInterval(heartbeatTimer);
  });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');
    const token = url.searchParams.get('token');
    const role = url.searchParams.get('role') || 'participant';

    if (!sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      ws.close(1008, 'valid sessionId required');
      return;
    }

    // Derive IP for spectator rate limiting
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const connectionKey = `${clientIp}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const connectionAttempt = wsConnectionAttemptRateLimit({ clientIp });
    if (!connectionAttempt.allowed) {
      ws.close(1008, 'too many websocket connection attempts');
      return;
    }

    const attachClient = () => {
      ws.sessionId = sessionId;
      ws.role = role;

      if (!sessionClients.has(sessionId)) {
        sessionClients.set(sessionId, new Set());
      }
      sessionClients.get(sessionId).add(ws);

      syncManager.startSession(sessionId, (msg) => broadcastToSession(sessionId, msg));

      const ctrl = controlState.get(sessionId);
      if (ctrl) {
        try {
          ws.send(JSON.stringify({ type: 'CONTROL_STATE', ...ctrl }));
        } catch (_) {}
      }

      console.log(`[WS] Client joined session ${sessionId} (${sessionClients.get(sessionId).size} clients, role=${role})`);
    };

    if (role === 'spectator') {
      // Enforce per-IP spectator connection limit
      const specCount = spectatorCounts.get(clientIp) || 0;
      if (specCount >= MAX_SPECTATOR_CONNECTIONS_PER_IP) {
        ws.close(1008, 'too many spectator connections');
        return;
      }
      spectatorCounts.set(clientIp, specCount + 1);
      ws._spectatorIp = clientIp;
      attachClient();
    } else {
      // Participant auth: token sent as first message (not in URL) to avoid
      // leaking JWTs in server logs, proxy logs, and browser history.
      // Also support legacy ?token= query param for backward compatibility.
      ws._pendingAuth = true;

      // Auto-close if no AUTH message within 10 seconds
      ws._authTimeout = setTimeout(() => {
        if (ws._pendingAuth && ws.readyState === 1) {
          ws.close(1008, 'authentication timeout');
        }
      }, 10_000);

      const authenticateParticipant = async (token) => {
        // Guard against concurrent invocations (e.g. legacy ?token= URL param +
        // first-message AUTH both arriving). Without this, two getUser() calls
        // race and both can pass membership checks, double-incrementing
        // connectionCounts and double-sending AUTH_OK.
        if (ws._authStarted) return;
        ws._authStarted = true;
        try {
          const userClient = createUserClient(token);
          const { data, error } = await userClient.auth.getUser(token);
          if (error || !data?.user) {
            ws.close(1008, 'authentication required');
            return;
          }
          if (ws.readyState !== 1) return;

          const userId = data.user.id;

          // Verify user is actually a participant in this session
          const { count, error: memberErr } = await supabaseAdmin
            .from('streams')
            .select('id', { head: true, count: 'exact' })
            .eq('session_id', sessionId)
            .eq('user_id', userId);

          if (memberErr || !count) {
            ws.close(1008, 'not a member of this session');
            return;
          }
          if (ws.readyState !== 1) return;

          // Enforce per-user per-session connection limit
          const connKey = `${userId}:${sessionId}`;
          const current = connectionCounts.get(connKey) || 0;
          if (current >= MAX_CONNECTIONS_PER_USER_SESSION) {
            ws.close(1008, 'too many connections');
            return;
          }
          connectionCounts.set(connKey, current + 1);
          ws._connKey = connKey;

          ws.userId = userId;
          ws._pendingAuth = false;
          clearTimeout(ws._authTimeout);
          attachClient();

          // Notify client that auth succeeded so it can send queued messages
          try { ws.send(JSON.stringify({ type: 'AUTH_OK' })); } catch (_) {}
        } catch (err) {
          console.error('[WS] Auth lookup failed:', err);
          ws.close(1011, 'authentication lookup failed');
        }
      };

      // Support legacy ?token= query param (backward compatibility)
      if (token) {
        authenticateParticipant(token);
      }

      // Store for use in message handler
      ws._authenticateParticipant = authenticateParticipant;
    }

    ws.on('message', (data) => {
      try {
        const inboundResult = wsInboundMessageRateLimit({ connectionKey });
        if (!inboundResult.allowed) {
          ws.close(1008, 'too many websocket messages');
          return;
        }

        // Spectators cannot send messages
        if (ws.role === 'spectator') {
          return;
        }

        const message = JSON.parse(data);

        // AUTH — first-message authentication for participants
        if (message.type === 'AUTH') {
          if (!ws._pendingAuth) return; // already authenticated
          if (typeof message.token !== 'string' || !message.token) {
            ws.close(1008, 'invalid auth token');
            return;
          }
          ws._authenticateParticipant(message.token);
          return;
        }

        // Block all other messages until authenticated
        if (ws._pendingAuth) return;

        // STREAM_START_TIME — client reports YouTube player.getVideoStartTime()
        // Route to syncManager (Layer 1 sync), do NOT echo to other clients
        if (message.type === 'STREAM_START_TIME') {
          const { streamId, startTime } = message;
          if (streamId && typeof startTime === 'number') {
            syncManager.reportStartTime(sessionId, streamId, startTime);
          }
          return;
        }

        // REGISTER_STREAMS — client sends all its known streams so the sync
        // manager can track them even after a server restart.  The Viewer
        // sends this once on connect with every stream it knows about.
        if (message.type === 'REGISTER_STREAMS') {
          const { streams: clientStreams } = message;
          if (Array.isArray(clientStreams)) {
            for (const s of clientStreams) {
              if (s.id) {
                syncManager.registerStream(sessionId, s.id, !!s.isAnchor);
              }
            }
            console.log(`[WS] Registered ${clientStreams.length} streams for session ${sessionId}`);
          }
          return;
        }

        // ── CHAT relay with validation ─────────────────────────────────
        if (message.type === 'CHAT') {
          // Rate limit: max 5 chat messages per second per connection
          const now = Date.now();
          if (!ws._chatWindow) ws._chatWindow = { ts: now, count: 0 };
          if (now - ws._chatWindow.ts > 1000) {
            ws._chatWindow = { ts: now, count: 0 };
          }
          ws._chatWindow.count += 1;
          if (ws._chatWindow.count > 5) return; // silently drop flood

          // Validate shape and sanitize
          if (typeof message.text !== 'string' || message.text.trim().length === 0) return;
          const sanitized = {
            type: 'CHAT',
            text: message.text.slice(0, 500).trim(),
            userId: ws.userId ?? null,
            ts: now,
          };
          broadcastToSession(sessionId, sanitized, ws);
          return;
        }

        // All other client-originated types are dropped
        // (CONTROL_STATE is only sent server-side via setControlDelegation)
        console.warn(`[WS] Dropped unknown message type: ${message.type}`);
      } catch (err) {
        console.error('[WS] Invalid message:', err);
      }
    });

    ws.on('close', () => {
      // Clear auth timeout if still pending
      if (ws._authTimeout) clearTimeout(ws._authTimeout);

      // Decrement per-IP spectator connection count
      if (ws._spectatorIp) {
        const sc = (spectatorCounts.get(ws._spectatorIp) || 1) - 1;
        if (sc <= 0) spectatorCounts.delete(ws._spectatorIp);
        else spectatorCounts.set(ws._spectatorIp, sc);
      }

      // Decrement per-user connection count
      if (ws._connKey) {
        const c = (connectionCounts.get(ws._connKey) || 1) - 1;
        if (c <= 0) connectionCounts.delete(ws._connKey);
        else connectionCounts.set(ws._connKey, c);
      }

      const clients = sessionClients.get(sessionId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
          sessionClients.delete(sessionId);
          controlState.delete(sessionId);
        }
        console.log(`[WS] Client left session ${sessionId} (${clients.size} clients remaining)`);
      }
    });

    ws.on('error', (err) => {
      console.error('[WS] Error:', err);
    });
  });

  console.log('[WS] WebSocket server ready on /ws');
  return wss;
}

/**
 * Broadcast a message to all clients in a session, optionally excluding the sender.
 */
export function broadcastToSession(sessionId, message, excludeWs = null) {
  const clients = sessionClients.get(sessionId);
  if (!clients) return;

  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(payload);
    }
  }
}
