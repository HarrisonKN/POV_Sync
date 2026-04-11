# POV Sync — Product Requirements Document

**Version:** 1.0  
**Status:** Pre-build, fully specified  
**Author:** Harrison  
**Last Updated:** April 2026

---

## 1. Product Overview

### What It Is
POV Sync is a private, web-based multi-POV stream viewer built for gaming squads. It allows a group of players — all streaming to YouTube individually as normal — to watch each other's streams simultaneously in a filmstrip layout with full synchronisation. Any POV can be brought to the main stage with a single click. Sessions can be watched live or revisited as VODs.

### Core Problem
Gaming sessions are inherently multi-perspective but no accessible tool exists to experience them that way. Coordinating five separate YouTube tabs manually, syncing them yourself, and having no way to switch between angles is the current reality. POV Sync solves this entirely without changing how anyone streams.

### Design Principle
Zero friction for participants. The host does the work. Everyone else just streams as normal and drops a link.

---

## 2. Target Users

**Primary:** The host — the person who creates and manages the session. Likely the most technically capable person in the group.

**Secondary:** Participants — the streamers. They submit their YouTube link and stream as normal. No other action required.

**Tertiary:** Spectators — anyone watching the session live or as a VOD. Read-only access, no account required.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite), YouTube IFrame Player API |
| Styling | Tailwind CSS |
| Backend | Node.js (Express) |
| Realtime | Supabase Realtime |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (Google OAuth) |
| Audio Sync | ytdl-core + custom FFT fingerprinting |
| WebSocket | ws (Node.js) |
| Deployment | Render (free tier) — serves both frontend and backend |
| Sleep Prevention | UptimeRobot (free tier) |

---

## 4. Authentication

- Google OAuth via Supabase Auth
- Hosts and participants should be logged in
- Spectators do not need an account — spectator link is public
- On first login, a user profile is created: display name, Google profile picture, empty session history
- Sessions attach to the host's account and to any logged-in participants

---

## 5. User Profiles

Each account has:
- Display name (from Google)
- Profile picture (from Google)
- List of sessions hosted
- List of sessions participated in
- Public profile page showing participated VODs (viewable by anyone)

When another user views someone's profile and clicks a VOD, that person's POV loads as the main stage by default.

---

## 6. Session Architecture

### Session Creation
- Host logs in and creates a new session
- Host submits their own YouTube stream URL at creation time — this makes them the first participant, which automatically gives them anchor status
- Two links are generated immediately:
  - **Participant Link** — for streamers joining the session
  - **Spectator Link** — for anyone watching only
- Session is live the moment it is created — no separate Start step

### Joining (Participants)
- Participant opens participant link
- Logs in (or is prompted to log in)
- Enters display name (pre-filled from account)
- Pastes their YouTube stream URL
- Appears in the session in real time for everyone

### Joining (Spectators)
- Spectator opens spectator link
- No login required
- Sees the filmstrip viewer in read-only mode
- Streams populate in real time as participants join
- If no streams have joined yet, shows a waiting state

### Anchor System
- The first stream to join becomes the anchor automatically (offset 0)
- The anchor role is indicated by the ⚓ status indicator
- The host can promote any stream to anchor at any time
- On promotion, all other stream offsets recalculate relative to the new anchor
- The audio fingerprinting server recalculates from the new anchor reference
- If the anchor stream dies or ends, the host is prompted to promote a replacement

### Incremental Sync
- Each new stream that joins is synced against the existing anchor independently
- The server spins up an audio pull for that stream and cross-correlates it against the anchor
- Streams already in the session are not recalculated — only the new joiner
- The new stream shows a Syncing indicator until confidence threshold is met

### Stream Limit
- MVP: up to 5 streams
- Architecture supports up to 10
- Future: potentially higher

---

## 7. Session Lifecycle

```
Host creates session + submits their YouTube URL
        ↓
Session is immediately live
Participant link + Spectator link generated
First stream (host) = anchor, offset 0
        ↓
Participants join via participant link, submit their URLs
Each new stream gets incrementally synced as they join
Spectator view populates in real time
        ↓
Session runs — sync maintained continuously
Host has full playback and sync controls
        ↓
All streams end (detected via polling) OR host clicks End Session
        ↓
Session ends and closes — does NOT automatically transition to VOD
        ↓
VOD becomes available — accessible via participant profiles or session link
When a user navigates to the VOD, it autoplays from the start
```

---

## 8. Sync System

### Layer 1 — Manual Offset Controls
Available immediately when streams load. Per stream in the filmstrip:

```
[◀◀ 30s]  [◀ 5s]  [‹ 1s]  [⟨ frame]  —  Stream Name  —  [frame ⟩]  [1s ›]  [5s ▶]  [30s ▶▶]
```

- Frame step = 1/60s (≈16ms), using `seekTo(currentTime ± 0.0167)`
- All adjustments update that stream's stored offset value
- Every playback command applies offsets before executing

### Layer 2 — Server-Side Audio Fingerprinting
- Node.js backend uses ytdl-core to pull audio-only from each YouTube stream URL
- FFT extracts frequency peaks every ~1 second per stream
- Cross-correlation finds where peaks match between each stream and the anchor
- Calculated offsets are pushed to the viewer via WebSocket every few seconds
- Viewer applies offsets silently — no visible jump unless drift exceeds threshold
- Continuous drift correction throughout the session

### Suggest Sync Button
- Once the server has accumulated enough audio data to be confident, the Suggest Sync button becomes active
- Clicking it auto-applies server-calculated offsets as a starting point
- Host then fine-tunes with step controls if needed

### Master Controls
- Play All / Pause All — fires simultaneously on all streams with offsets applied
- Seek — master scrubber that moves all streams proportionally with offsets applied
- Go Live — snaps all streams to live edge with offsets applied (`seekTo(9999999 ± offset)`)
- Re-sync — re-runs the live snap to correct residual drift after going live

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
│           (currently active POV)                │
│                                                 │
└─────────────────────────────────────────────────┘
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ POV1 │ │ POV2 │ │ POV3 │ │ POV4 │ │ POV5 │   ← Filmstrip
└──────┘ └──────┘ └──────┘ └──────┘ └──────┘
[◀◀][◀][‹][⟨] — Name — [⟩][›][▶][▶▶]           ← Per-stream offset controls (host only)

[▶ Play All]  [⏸ Pause All]  [📡 Go Live]  [🔁 Re-sync]  [✦ Suggest Sync]
```

### Filmstrip Thumbnails
Each thumbnail shows:
- Live video preview
- Participant name label
- Status indicator cluster (see Section 10)
- Clicking brings that stream to main stage

### Session Setup Screen (Participant View)
- Display name field (pre-filled)
- YouTube URL input
- Submit button
- List of who has already joined with their status indicators

### Waiting State (Spectator, no streams yet)
- Empty filmstrip slots with pulsing placeholder
- "Waiting for streams to join..." message

---

## 10. Status Indicators

Displayed as small icon cluster on each filmstrip thumbnail:

| Indicator | Meaning |
|---|---|
| 🟢 Synced | Stream locked and within drift threshold |
| 🟡 Syncing | Audio fingerprinting still calculating for this stream |
| 🔴 Drifted | Beyond drift threshold, auto-correction in progress |
| ⚪ Waiting | URL submitted but stream not live yet |
| 🔵 Buffering | Stream stalled, waiting to resume |
| ⚓ Anchor | This stream is the current sync reference |
| 👑 Host | This participant has session control |
| 🎮 Control | Host has delegated control to this participant |

---

## 11. Host Controls

Host has exclusive access to:
- All sync controls (offset sliders, Suggest Sync, master controls)
- Go Live and Re-sync buttons
- Anchor promotion (promote any stream to anchor)
- Control delegation — hand full controls to one other participant at a time
- End Session button

### Control Delegation
```
Harrison (Host) ★
Friend 1        [Give Control]
Friend 2        [Give Control]
Friend 3        [Give Control]
Friend 4        [Give Control]
```
- Only one person holds control at a time
- Delegated person gets the full control set
- Host can reclaim at any time
- Indicated by 🎮 indicator on that participant's thumbnail

---

## 12. VOD Experience

### Access Points
- Via a participant's public profile → that participant's POV loads as main stage first
- Via session link or spectator link → anchor stream loads as main stage first

### Behaviour
- Autoplays from the beginning when opened
- Saved offsets from the live session are applied automatically — no recalibration needed
- All POVs available in filmstrip, fully switchable
- No sync controls shown to spectators
- Host controls available to session host viewing their own VOD

### Persistence
- Sessions persist indefinitely in Supabase
- Session link and spectator link never expire
- No account required to watch via spectator link

---

## 13. Database Schema (Supabase)

### `users`
| Column | Type |
|---|---|
| id | uuid (PK) |
| email | text |
| display_name | text |
| avatar_url | text |
| created_at | timestamp |

### `sessions`
| Column | Type |
|---|---|
| id | uuid (PK) |
| host_id | uuid (FK → users) |
| participant_link | text (unique) |
| spectator_link | text (unique) |
| status | enum: live, ended |
| anchor_stream_id | uuid (FK → streams) |
| created_at | timestamp |
| ended_at | timestamp |

### `streams`
| Column | Type |
|---|---|
| id | uuid (PK) |
| session_id | uuid (FK → sessions) |
| user_id | uuid (FK → users) |
| display_name | text |
| youtube_url | text |
| offset_seconds | float (default 0) |
| is_anchor | boolean (default false) |
| joined_at | timestamp |

---

## 14. Deployment

### Architecture
Everything runs on a single Render instance. The React frontend is built with `vite build` and Express serves the static output directly:
```javascript
app.use(express.static(path.join(__dirname, '../../client/dist')))
```
One deployment, one platform, one place to check logs, one free tier.

### Why Not Vercel + Render?
Vercel's serverless functions have a 10-second execution timeout on the free tier. The audio sync server needs persistent long-running processes — ytdl-core pulling audio continuously, WebSocket connections staying open for the whole session. Vercel fundamentally can't host that. Render handles both static serving and persistent processes on a single instance.

### Sleep Prevention (UptimeRobot)
Render's free tier spins down after 15 minutes of inactivity. UptimeRobot pings the server every 5 minutes to keep it awake.

Setup:
1. Create free account at [uptimerobot.com](https://uptimerobot.com)
2. Add new monitor → HTTP(S) type
3. Paste your Render server URL
4. Set interval to 5 minutes
5. Done

### Cost Summary
| Part | Tool | Cost |
|---|---|---|
| Frontend + Backend | Render | Free |
| Sleep Prevention | UptimeRobot | Free |
| Database + Auth + Realtime | Supabase | Free |
| **Total** | | **$0** |

---

## 15. Build Order

### Phase 1 — Foundation
- [ ] Supabase project setup (auth, schema, realtime)
- [ ] Google OAuth flow
- [ ] User profile creation on first login
- [ ] Basic routing (home, create session, join session, viewer, profile)

### Phase 2 — Session Management
- [ ] Session creation with host YouTube URL
- [ ] Participant and spectator link generation
- [ ] Participant join flow (link → name → YouTube URL → submit)
- [ ] Supabase Realtime — session state broadcasting
- [ ] Waiting state for spectators

### Phase 3 — Viewer UI
- [ ] YouTube IFrame Player API integration
- [ ] Main stage + filmstrip layout
- [ ] Click-to-swap POV
- [ ] Status indicators
- [ ] Waiting/empty state handling

### Phase 4 — Sync System (Manual)
- [ ] Per-stream offset state
- [ ] Step controls (30s / 5s / 1s / frame)
- [ ] Master play/pause/seek with offset application
- [ ] Go Live button with offset-adjusted snap
- [ ] Re-sync button

### Phase 5 — Sync System (Audio)
- [ ] Node.js backend with ytdl-core audio pulling
- [ ] FFT fingerprinting per stream
- [ ] Cross-correlation offset calculation
- [ ] WebSocket server pushing offsets to viewer
- [ ] Viewer consuming WebSocket offsets and applying silently
- [ ] Suggest Sync button activation on confidence threshold
- [ ] Anchor promotion + offset recalculation

### Phase 6 — VOD + Profiles
- [ ] Session end detection (polling + manual)
- [ ] VOD mode loading with saved offsets
- [ ] POV-first loading based on profile entry point
- [ ] Public profile page with session/VOD history
- [ ] Autoplay on VOD open

### Phase 7 — Polish
- [ ] Tutorial / setup guide section
- [ ] Ultra Low Latency YouTube setup walkthrough
- [ ] Mobile-responsive spectator view
- [ ] Error states (stream not found, session expired, etc.)

---

## 16. Out of Scope (MVP)

- Mobile participant/host view
- In-app chat
- Clip creation
- More than 10 streams
- Monetisation
- Non-YouTube stream sources
- Recording through the viewer

---

## 17. Open Questions / Future Considerations

- At what point does Render free tier become insufficient for audio processing at 10 streams?
- Should VODs ever be deletable by the host?
- Future: support for Twitch streams as an alternative source
- Future: accounts system for spectators who want to save sessions to their own history
