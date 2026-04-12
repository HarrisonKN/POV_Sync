import { WebSocketServer } from 'ws';
import * as syncManager from '../services/syncManager.js';
import { createUserClient } from '../lib/supabase.js';

// Store active connections per session
// Map<sessionId, Set<WebSocket>>
const sessionClients = new Map();

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

    if (!sessionId) {
      ws.close(1008, 'sessionId required');
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
      attachClient();
    } else {
      if (!token) {
        ws.close(1008, 'authentication required');
        return;
      }

      const userClient = createUserClient(token);
      userClient.auth.getUser(token)
        .then(({ data, error }) => {
          if (error || !data?.user) {
            ws.close(1008, 'authentication required');
            return;
          }
          // Connection may have closed during async auth
          if (ws.readyState !== 1 /* OPEN */) return;

          ws.userId = data.user.id;
          attachClient();
        })
        .catch((err) => {
          console.error('[WS] Auth lookup failed:', err);
          ws.close(1011, 'authentication lookup failed');
        });
    }

    ws.on('message', (data) => {
      try {
        if (ws.role === 'spectator') {
          return;
        }

        const message = JSON.parse(data);

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
