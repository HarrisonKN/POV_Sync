import { WebSocketServer } from 'ws';
import * as syncManager from '../services/syncManager.js';

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
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      ws.close(1008, 'sessionId required');
      return;
    }

    // Add to session room
    if (!sessionClients.has(sessionId)) {
      sessionClients.set(sessionId, new Set());
    }
    sessionClients.get(sessionId).add(ws);

    // Ensure a sync session exists for this room (idempotent)
    syncManager.startSession(sessionId, (msg) => broadcastToSession(sessionId, msg));

    // Send current control state to the newly connected client
    const ctrl = controlState.get(sessionId);
    if (ctrl) {
      try {
        ws.send(JSON.stringify({ type: 'CONTROL_STATE', ...ctrl }));
      } catch (_) {}
    }

    console.log(`[WS] Client joined session ${sessionId} (${sessionClients.get(sessionId).size} clients)`);

    ws.on('message', (data) => {
      try {
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

        // All other messages: broadcast to peers in the same session
        broadcastToSession(sessionId, message, ws);
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
