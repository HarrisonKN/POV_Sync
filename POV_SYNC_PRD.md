# POV Sync — Product Requirements Document

**Version:** 2.0  
**Status:** Live in production  
**Author:** Harrison  
**Last Updated:** April 2026  
**Production URL:** https://pov-sync.onrender.com/

---

## 1. Product Overview

### What It Is
POV Sync is a web-based multi-POV stream viewer built for gaming squads. It allows a group of players — all streaming to YouTube or Twitch individually as normal — to watch each other's streams simultaneously in a filmstrip layout with full synchronisation. Any POV can be brought to the main stage with a single click. Sessions can be watched live or revisited as VODs.

### Core Problem
Gaming sessions are inherently multi-perspective but no accessible tool exists to experience them that way. Coordinating five separate stream tabs manually, syncing them yourself, and having no way to switch between angles is the current reality. POV Sync solves this entirely without changing how anyone streams.

### Design Principle
Zero friction for participants. The host does the work. Everyone else just streams as normal and drops a link.

---

## 2. Target Users

**Primary:** The host — the person who creates and manages the session. Likely the most technically capable person in the group.

**Secondary:** Participants — the streamers. They submit their YouTube or Twitch link and stream as normal. No other action required.

**Tertiary:** Spectators — anyone watching the session live or as a VOD. Read-only access, no account required.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 (Vite 6.x), YouTube IFrame Player API, Twitch Embed API |
| Styling | Tailwind CSS 4.x |
| Backend | Node.js (Express 4.x) |
| Database | Supabase (PostgreSQL) with Row Level Security |
| Auth | Supabase Auth (Google OAuth, implicit flow) |
| Realtime | WebSocket (`ws` 8.x) for session sync, Supabase Realtime for stream joins |
| Deployment | Render — single instance serves frontend + backend + WebSocket |
| Sleep Prevention | UptimeRobot (free tier, 5-min pings) |

---

## 4. Authentication

- Google OAuth via Supabase Auth (implicit flow)
- Hosts and participants must be logged in
- Spectators do not need an account — spectator link is public
- On first login, a database trigger auto-creates a user profile (display name, avatar from Google)
- Sessions attach to the host's account; streams attach to participant accounts
- OAuth redirect flow uses localStorage-based intent tracking to survive the redirect round-trip and auto-forward users to their intended destination

---

## 5. User Profiles & Social

Each account has:
- Display name (from Google, editable)
- Profile picture (from Google)
- List of sessions hosted
- List of sessions participated in
- Public profile page showing participated VODs (viewable by anyone)
- **Follow system** — users can follow other users
- Following feed on Home page shows live/recent sessions from followed users

When another user views someone's profile and clicks a VOD, that person's POV loads as the main stage by default.

---

## 6. Session Architecture

### Session Creation
- Host logs in and creates a new session
- Host provides an optional session title and their YouTube/Twitch stream URL
- This makes the host the first participant, which automatically gives them anchor status
- **Three links** are generated immediately:
  - **Share Link** (`/room/:code`) — universal link that shows a role-select page (join as participant or spectate)
  - **Participant Link** (`/join/:code`) — direct join for streamers
  - **Spectator Link** (`/watch/:code`) — direct read-only view
- Session is live the moment it is created — no separate Start step

### Joining (Participants)
- Participant opens share link or participant link
- Logs in (or is prompted to sign in — auto-forwarded back after OAuth)
- Enters display name (pre-filled from account)
- Pastes their YouTube or Twitch stream URL
- Platform is auto-detected from the URL
- Appears in the session in real time for everyone

### Joining (Spectators)
- Spectator opens spectator link or chooses "Watch" from the share link page
- No login required
- Sees the filmstrip viewer in read-only mode
- Streams populate in real time as participants join
- If no streams have joined yet, shows a waiting state

### Anchor System
- The first stream to join becomes the anchor automatically (offset 0)
- The anchor role is indicated by an Anchor status label
- The host can promote any stream to anchor at any time
- On promotion, all other stream offsets recalculate relative to the new anchor
- YouTube `getVideoStartTime()` is used for automatic offset calculation

### Stream Limit
- MVP: up to 5 streams per session
- Architecture supports expansion to 10

---

## 7. Session Lifecycle

```
Host creates session (optional title + their stream URL)
        ↓
Session is immediately live
Share link + Participant link + Spectator link generated
First stream (host) = anchor, offset 0
        ↓
Participants join via share/participant link, submit their URLs
New streams auto-sync via YouTube start time offsets
Spectator view populates in real time via WebSocket
        ↓
Session runs — sync maintained via WebSocket broadcast
Host has full playback and sync controls (can delegate to one participant)
        ↓
Host clicks End Session OR streams go inactive
        ↓
Session status → 'ended'
        ↓
VOD available — accessible via participant profiles, share link, or spectator link
Saved offsets are reused for VOD playback
```

---

## 8. Sync System

### Layer 1 — YouTube Start Time Sync (Automatic)
- When participants join, the YouTube IFrame API's `getVideoStartTime()` is captured
- Offset is calculated as `streamStartTime − anchorStartTime`
- This provides automatic sync accurate to ~1 second with zero manual effort
- Start times are persisted in the database for VOD replay
- A "Sync to Latest" endpoint recalculates offsets from current start times

### Layer 2 — Manual Offset Controls (Host Only)
Per stream in the filmstrip:
```
[-30s]  [-5s]  [-1s]  [-1f]  —  Stream Name  —  [+1f]  [+1s]  [+5s]  [+30s]
```
- Frame step = 1/60s (≈16ms), using `seekTo(currentTime ± 0.0167)`
- All adjustments update that stream's stored offset value via API
- Every playback command applies offsets before executing

### Master Controls (Host / Delegatee Only)
- **Play All / Pause All** — fires simultaneously on all streams with offsets applied
- **Go Live** — snaps all streams to live edge with offsets applied
- **Re-sync** — re-runs the live snap to correct residual drift

### Offset Storage
- Offsets are stored in Supabase per session per stream
- When a VOD is loaded, saved offsets are applied automatically
- No recalculation needed for VODs — offsets from the live session are reused

---

## 9. Viewer UI

### Layout
```
┌─────────────────────────────────────────────────┐
│                                                 │
│              MAIN STAGE PLAYER                  │
│      (YouTube or Twitch embed, active POV)      │
│                                                 │
└─────────────────────────────────────────────────┘
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ POV1 │ │ POV2 │ │ POV3 │ │ POV4 │ │ POV5 │   ← Filmstrip
└──────┘ └──────┘ └──────┘ └──────┘ └──────┘
[Back 30][Back 5][Back 1][Back 1f] — Name — [Fwd 1f][Fwd 1][Fwd 5][Fwd 30]           ← Per-stream offset controls (host/delegatee)

[Play All]  [Pause All]  [Go Live]  [Re-sync]
```

### Filmstrip Thumbnails
Each thumbnail shows:
- Live video preview (YouTube or Twitch)
- Participant name label
- Status indicators (anchor, host, delegated control)
- Clicking brings that stream to main stage

### Platform Support
- **YouTube** — embedded via IFrame Player API with full sync controls
- **Twitch** — embedded via Twitch Embed API; platform auto-detected from URL

### Chat
- In-session chat via WebSocket
- Rate limited: 5 messages/second per user, 500 character cap
- User ID stamped server-side (cannot be spoofed)

---

## 10. Status Indicators

Displayed on each filmstrip thumbnail:

| Indicator | Meaning |
|---|---|
| Anchor | This stream is the current sync reference |
| Host | This participant controls the session |
| Control | Host has delegated control to this participant |

---

## 11. Host Controls

Host has exclusive access to:
- All sync controls (offset adjusters, master controls)
- Go Live and Re-sync buttons
- Anchor promotion (promote any stream to anchor)
- Control delegation — hand full controls to one other participant at a time
- End Session button
- Remove stream (kick a participant)

### Control Delegation
- Only one person holds control at a time
- Delegated person gets the full control set
- Host can reclaim at any time via "Revoke Control"
- Delegation state broadcast to all clients via WebSocket `CONTROL_STATE` message

---

## 12. VOD Experience

### Access Points
- Via a participant's public profile → that participant's POV loads as main stage first
- Via session link or spectator link → anchor stream loads as main stage first

### Behaviour
- Saved offsets from the live session are applied automatically
- All POVs available in filmstrip, fully switchable
- Session links never expire
- No account required to watch via spectator link

---

## 13. Database Schema (Supabase)

### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | References auth.users |
| email | text (unique) | |
| display_name | text | |
| avatar_url | text | |
| created_at | timestamptz | |

### `follows`
| Column | Type | Notes |
|---|---|---|
| follower_id | uuid (PK, FK → users) | |
| following_id | uuid (PK, FK → users) | |
| created_at | timestamptz | |
| | | No self-follows (CHECK constraint) |

### `sessions`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| host_id | uuid (FK → users) | |
| participant_link | text (unique) | |
| spectator_link | text (unique) | |
| share_link | text (unique) | Universal room link |
| title | text | Optional session title |
| status | text | 'live' or 'ended' |
| anchor_stream_id | uuid (FK → streams) | |
| created_at | timestamptz | |
| ended_at | timestamptz | |
| vod_ready_at | timestamptz | |

### `streams`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| session_id | uuid (FK → sessions) | CASCADE delete |
| user_id | uuid (FK → users) | |
| display_name | text | |
| youtube_url | text | Holds YouTube or Twitch URL |
| platform | text | 'youtube' or 'twitch' |
| offset_seconds | float (default 0) | |
| is_anchor | boolean (default false) | |
| youtube_start_time | float | Unix timestamp for sync calculation |
| is_active | boolean (default true) | |
| joined_at | timestamptz | |
| left_at | timestamptz | |

### Row Level Security
- **Users:** public read, self-update only
- **Follows:** public read, self-insert (no self-follow), self-delete
- **Sessions:** public read, authenticated insert (own host_id), host-update only
- **Streams:** public read, authenticated insert (own user_id), owner-or-host update/delete

### Auto-create Profile Trigger
A database trigger (`handle_new_user`) fires on `auth.users` INSERT and creates the corresponding `public.users` row with name/avatar from Google metadata.

---

## 14. API Routes

### Session Routes (`/api/sessions/...`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | Required | Create session (generates all 3 links) |
| GET | `/room/:code` | — | Resolve share_link → session info + internal codes |
| GET | `/join/:code` | — | Get session by participant_link |
| GET | `/watch/:code` | — | Get session by spectator_link |
| POST | `/:id/streams` | Required | Join session (add your stream) |
| POST | `/:id/promote-anchor` | Required | Promote a stream to anchor |
| POST | `/:id/sync-to-latest` | Required | Recalculate offsets from start times |
| PATCH | `/:id/streams/:streamId/start-time` | Required | Update stream start time |
| POST | `/:id/backfill-start-times` | Required | Batch update start times |
| PATCH | `/:id/streams/:streamId/offset` | Required | Update manual offset |
| POST | `/:id/streams/:streamId/auto-inactive` | Required | Mark stream inactive |
| POST | `/:id/leave` | Required | Leave session |
| POST | `/:id/end` | Required | End session (host only) |
| POST | `/:id/delegate` | Required | Delegate control |
| POST | `/:id/revoke-control` | Required | Revoke delegated control |
| DELETE | `/:id/streams/:streamId` | Required | Remove a stream |

### UUID Validation
All `:id` and `:streamId` route params are validated as proper UUIDs via middleware.

---

## 15. WebSocket Protocol

### Connection
- Endpoint: `/ws?sessionId=<uuid>&role=participant|spectator`
- Participants must authenticate via **first-message AUTH pattern**: send `{ type: 'AUTH', token: '<JWT>' }` within 10 seconds of connecting
- Server verifies JWT, checks session membership (stream exists in session), then responds with `AUTH_OK`
- Spectators connect without auth (read-only, cannot send messages)

### Message Types (Client → Server)
| Type | Auth Required | Description |
|---|---|---|
| `AUTH` | — | First message: JWT token for authentication |
| `REGISTER_STREAMS` | Required | Register which streams this client owns |
| `STREAM_START_TIME` | Required | Report YouTube start time for a stream |
| `CHAT` | Required | Send a chat message (rate limited: 5/sec, 500 char max) |

### Message Types (Server → Client)
| Type | Description |
|---|---|
| `AUTH_OK` | Authentication successful |
| `CONTROL_STATE` | Broadcast current host/delegatee state |
| `CHAT` | Broadcast chat message (userId stamped server-side) |
| All others | Relayed from authenticated participants |

### Connection Limits
- **Per-user per-session:** max 3 participant connections
- **Per-IP spectators:** max 10 connections
- **Heartbeat:** 30-second ping/pong, dead connections terminated
- **Max payload:** 16 KB

---

## 16. Security

### HTTP Security Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy` — restricts scripts, frames (YouTube/Twitch only), connections (Supabase + WSS)
- `Strict-Transport-Security` (production only)

### API Security
- Rate limiting: 120 requests/minute per IP
- JSON body limit: 16 KB
- CORS allowlist (configurable via `CORS_ORIGINS` env var)
- `requireAuth` middleware on all mutating routes (validates JWT via Supabase `getUser()`)
- Link codes are stripped from API responses to prevent leakage (share_link stripped from `/room/:code`, participant_link stripped from `/watch/:code`, etc.)

### WebSocket Security
- JWT first-message auth pattern (token not in URL query string)
- 10-second auth timeout — unauthenticated connections auto-closed
- Session membership verification before accepting messages
- Per-user and per-IP connection limits
- Spectators are read-only (messages dropped server-side)
- Chat rate limiting and message size caps
- User IDs stamped server-side on chat messages

### OpenGraph Meta Injection
- Server-side OG tag injection for `/watch/:code` and `/room/:code` routes
- HTML entity escaping via `escHtml()` to prevent XSS

---

## 17. Deployment

### Architecture
Everything runs on a single Render instance. The React frontend is built with `vite build` and Express serves the static output. The WebSocket server runs on the same HTTP server.

```
npm run build    →  cd client && vite build
npm start        →  cd server && node src/index.js
```

### Environment Variables
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGINS` (comma-separated allowlist)
- `NODE_ENV` (production enables HSTS)
- `PORT` (default 3002)
- `API_RATE_LIMIT_MAX` (default 120)

### Supabase Auth Configuration
- Site URL: `https://pov-sync.onrender.com/`
- Redirect URLs allowlist: `https://pov-sync.onrender.com/**`, `http://localhost:5173/**`

### Sleep Prevention (UptimeRobot)
UptimeRobot pings the health endpoint (`/api/health`) every 5 minutes to prevent Render free-tier sleep.

### Cost Summary
| Part | Tool | Cost |
|---|---|---|
| Frontend + Backend + WS | Render | Free |
| Sleep Prevention | UptimeRobot | Free |
| Database + Auth + Realtime | Supabase | Free |
| **Total** | | **$0** |

---

## 18. Pages & Routes

| Route | Component | Auth | Description |
|---|---|---|---|
| `/` | Home | — | Dashboard, create/join session, live sessions, social feed |
| `/room/:code` | RoleSelect | — | Universal share link — choose participant or spectator |
| `/join/:code` | JoinSession | Required | Join as participant, submit stream URL |
| `/join` | JoinSession | — | Manual join via code input |
| `/watch/:code` | Spectator | — | Read-only spectator view |
| `/session/:sessionId` | Viewer | Required | Full session room (host/participant controls) |
| `/create` | CreateSession | Required | Create new session form |
| `/profile` | Profile | Required | Own profile |
| `/profile/:userId` | Profile | — | Public profile view |
| `/setup` | Setup | — | Setup guide |
| `/terms` | Terms | — | Terms of service |
| `/privacy` | Privacy | — | Privacy policy |
| `/contact` | Contact | — | Contact page |

---

## 19. Build Progress

### Phase 1 — Foundation [done]
- [x] Supabase project setup (auth, schema, RLS, realtime)
- [x] Google OAuth flow
- [x] User profile auto-creation on first login (database trigger)
- [x] Full routing (home, create, join, viewer, spectator, profile, setup, legal pages)

### Phase 2 — Session Management [done]
- [x] Session creation with host YouTube/Twitch URL
- [x] Three-link generation (share, participant, spectator)
- [x] Participant join flow (link → auth → name → URL → submit)
- [x] Supabase Realtime — stream joins broadcast to viewers
- [x] Waiting state for spectators

### Phase 3 — Viewer UI [done]
- [x] YouTube IFrame Player API integration
- [x] Twitch Embed API integration
- [x] Main stage + filmstrip layout
- [x] Click-to-swap POV
- [x] Status indicators (anchor, host, delegated)
- [x] Waiting/empty state handling
- [x] Skeleton loaders for all pages

### Phase 4 — Sync System [done]
- [x] YouTube start time auto-sync (Layer 1)
- [x] Per-stream manual offset controls (30s / 5s / 1s / frame)
- [x] Master play/pause with offset application
- [x] Go Live button with offset-adjusted snap
- [x] Re-sync button
- [x] Offset persistence in database

### Phase 5 — Real-time & WebSocket [done]
- [x] WebSocket server with session rooms
- [x] JWT first-message AUTH pattern (token not in URL)
- [x] Session membership verification
- [x] Per-user and per-IP connection limits
- [x] Heartbeat / dead connection cleanup
- [x] Chat system (rate limited, size capped)
- [x] Control delegation broadcast

### Phase 6 — VOD + Profiles + Social [done]
- [x] Session end detection (manual via host)
- [x] VOD mode with saved offsets
- [x] Public profile page with session/VOD history
- [x] Follow/unfollow system
- [x] Social feed — live sessions from followed users on Home page
- [x] User search by name

### Phase 7 — Security Hardening [done]
- [x] Content Security Policy header
- [x] HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy
- [x] API rate limiting (120 req/min/IP)
- [x] requireAuth on all mutating routes
- [x] UUID validation on route params
- [x] WebSocket JWT auth (first-message pattern, 10s timeout)
- [x] WebSocket membership verification
- [x] Connection limits (per-user, per-IP spectator)
- [x] Link code stripping from API responses
- [x] HTML entity escaping for OG meta injection
- [x] Graceful shutdown handling

### Phase 8 — Polish [done]
- [x] OpenGraph meta tags for social link previews (spectator + share links)
- [x] OAuth redirect flow with localStorage intent tracking
- [x] Footer with legal links
- [x] Error states and 404 page
- [x] Dark premium UI theme (gaming-native aesthetic)
- [x] Responsive layout

---

## 20. Out of Scope (MVP)

- Mobile-native app
- Clip creation
- More than 5 streams per session
- Monetisation
- Recording through the viewer
- Server-side audio fingerprinting (FFT cross-correlation) — replaced by YouTube start time sync

---

## 21. Future Considerations

- Server-side audio fingerprinting for sub-second sync precision
- Expand stream limit to 10
- Spectator accounts with saved session history
- VOD deletion by host
- Additional OAuth providers
- Mobile-optimised participant/host view
