import { useState } from 'react';
import { Link } from 'react-router-dom';

const TOC = [
  { id: 'obs',       label: 'OBS Setup' },
  { id: 'youtube',   label: 'YouTube Setup' },
  { id: 'twitch',    label: 'Twitch Setup' },
  { id: 'golive',    label: 'Go Live' },
  { id: 'create',    label: 'Create a Session' },
  { id: 'join',      label: 'Join a Session' },
  { id: 'syncing',   label: 'Room Sync' },
  { id: 'controls',  label: 'Controls & Offsets' },
  { id: 'spectator', label: 'Spectator View' },
  { id: 'vod',       label: 'VOD Replay' },
  { id: 'trouble',   label: 'Troubleshooting' },
];

export default function Setup() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <h1 className="text-2xl sm:text-3xl font-bold font-mono mb-2">Setup Guide</h1>
      <p className="text-pov-muted text-sm mb-8 sm:mb-10 max-w-lg">
        A simple guide to get from OBS setup to a synced stream with your squad.
      </p>

      <div className="grid gap-3 sm:grid-cols-3 mb-8">
        <OverviewCard title="OBS" value="1080p60" detail="Use CBR, 2s keyframes, and NVENC if available" />
        <OverviewCard title="YouTube / Twitch" value="Live Ready" detail="Use Ultra Low Latency on YouTube, then copy your live stream URL" />
        <OverviewCard title="POV Sync" value="Invite Link" detail="Share one invite link, or let people join with a code or participant link" />
      </div>

      {/* ── Quick Start ────────────────────────────────────── */}
      <div className="bg-pov-accent/5 border border-pov-accent/20 rounded-xl p-4 sm:p-5 mb-8">
        <p className="text-xs font-mono text-pov-accent uppercase tracking-wider mb-3">Quick Start</p>
        <ol className="space-y-1.5 text-sm text-pov-muted">
          <li className="flex gap-2"><span className="text-pov-accent font-bold flex-shrink-0">1.</span> Set up OBS, connect it to YouTube or Twitch, and start your stream.</li>
          <li className="flex gap-2"><span className="text-pov-accent font-bold flex-shrink-0">2.</span> Copy your stream URL. YouTube looks like <code className="text-pov-accent">youtube.com/watch?v=...</code>; Twitch looks like <code className="text-pov-accent">twitch.tv/yourchannel</code>.</li>
          <li className="flex gap-2"><span className="text-pov-accent font-bold flex-shrink-0">3.</span> If you are the host, create a session, enter your stream URL, and copy the invite link from the room header.</li>
          <li className="flex gap-2"><span className="text-pov-accent font-bold flex-shrink-0">4.</span> Everyone else opens the invite link and chooses whether to watch or join as a participant.</li>
          <li className="flex gap-2"><span className="text-pov-accent font-bold flex-shrink-0">5.</span> POV Sync lines the streams up for you.</li>
        </ol>
        <p className="text-xs text-pov-muted/60 mt-3">Need more detail? The full guide is below.</p>
      </div>

      {/* ── Table of contents ──────────────────────────────── */}
      <nav className="bg-pov-surface border border-pov-border rounded-xl p-4 sm:p-5 mb-10 sm:mb-12">
        <p className="text-[10px] font-mono text-pov-muted uppercase tracking-wider mb-3">
          Jump to section
        </p>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {TOC.map(({ id, label }, i) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="text-sm text-pov-muted hover:text-pov-accent transition-colors flex items-center gap-2 py-0.5"
              >
                <span className="text-pov-accent/60 font-mono text-xs w-5">{i + 1}.</span>
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ═══════════════════════════════════════════════════════
          SECTION 1 — OBS STUDIO SETUP
          ═══════════════════════════════════════════════════════ */}
      <Section id="obs" step="1" title="OBS Studio Setup">
        <p className="mb-4">
          <ExternalLink href="https://obsproject.com">OBS Studio</ExternalLink> is
          our recommended free streaming app. If you do not have it yet,
          download and install it first.
        </p>

        <SubHeading>Recommended OBS Settings</SubHeading>
        <p className="mb-3">
          Go to <Kbd>Settings → Output</Kbd> and switch <strong>Output Mode</strong> to
          {' '}<strong>Advanced</strong>. Then configure the <strong>Streaming</strong> tab:
        </p>

        <SettingsTable
          rows={[
            ['Encoder', 'NVIDIA NVENC H.264 (NVIDIA GPU) · AMD HW H.264 (AMD GPU) · x264 (no GPU)'],
            ['Rate Control', 'CBR — keeps your stream quality consistent'],
            ['Bitrate', '12000 Kbps (YouTube\'s recommended for 1080p60)'],
            ['Keyframe Interval', '2 — required by YouTube, don\'t change this'],
            ['Preset', 'Quality or P5 (NVENC) · Balanced (AMD) · veryfast (x264)'],
            ['Profile', 'High'],
            ['B-frames', '2 (NVENC/AMD) — improves quality at no extra bitrate cost'],
          ]}
        />

        <Note>
          Not sure which encoder to use? Pick NVENC for NVIDIA, AMD HW for AMD,
          and x264 if you do not have either. NVENC and AMD HW are usually best
          because they put less load on your CPU.
        </Note>
        <Note>
          12000 Kbps needs about <strong>15 Mbps upload speed</strong>. Test your upload at
          <ExternalLink href="https://fast.com">fast.com</ExternalLink>. If you are below
          15 Mbps, try 6000 Kbps instead.
        </Note>

        <SubHeading>Video Settings</SubHeading>
        <p className="mb-3">
          Go to <Kbd>Settings → Video</Kbd>:
        </p>
        <SettingsTable
          rows={[
            ['Base (Canvas) Resolution', 'Match your monitor — usually 1920×1080'],
            ['Output (Scaled) Resolution', '1920×1080'],
            ['Downscale Filter', 'Lanczos (best quality) · Bicubic if OBS feels slow'],
            ['FPS', '60'],
          ]}
        />
        <Note>
          If OBS struggles to hold 60fps while you play, switch to 30fps before lowering
          the resolution. For most games, 1080p30 still looks good.
        </Note>

        <SubHeading>Audio Settings</SubHeading>
        <p className="mb-3">
          Go to <Kbd>Settings → Audio</Kbd>:
        </p>
        <SettingsTable
          rows={[
            ['Sample Rate', '44.1 kHz (YouTube\'s recommended for stereo)'],
            ['Channels', 'Stereo'],
            ['Desktop Audio', 'Your speakers or headphones (so game audio is captured)'],
            ['Mic/Auxiliary', 'Your microphone'],
          ]}
        />
        <Note>
          Also go to <Kbd>Settings → Output → Audio</Kbd> and set <strong>Audio
          Bitrate</strong> to <strong>160 Kbps</strong>. YouTube recommends at least
          128 Kbps, and 160 Kbps gives your voice a little more room to sound clear.
        </Note>

        <SubHeading>Adding Scenes & Sources</SubHeading>
        <Steps>
          <Step n="1">In the <strong>Scenes</strong> box, click <strong>+</strong> to add a new scene (e.g. "Gaming").</Step>
          <Step n="2">In <strong>Sources</strong>, click <strong>+</strong> and add <strong>Game Capture</strong> for your game, or <strong>Display Capture</strong> if you want to capture your whole screen.</Step>
          <Step n="3">If you use <strong>Game Capture</strong>, choose <strong>Capture specific window</strong> and pick your game from the dropdown.</Step>
          <Step n="4">Add <strong>Audio Output Capture</strong> for game sound and <strong>Audio Input Capture</strong> for your mic if they are not already in the Audio Mixer.</Step>
          <Step n="5">Optional: add a <strong>Webcam</strong> (Video Capture Device) and resize/position it.</Step>
        </Steps>
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 2 — YOUTUBE LIVE SETUP
          ═══════════════════════════════════════════════════════ */}
      <Section id="youtube" step="2" title="YouTube Live Setup">
        <SubHeading>Prerequisites</SubHeading>
        <Steps>
          <Step n="1">You need a <ExternalLink href="https://www.youtube.com">YouTube</ExternalLink> account with <strong>live streaming enabled</strong>. If this is your first stream, activation can take up to 24 hours.</Step>
          <Step n="2">Go to <ExternalLink href="https://studio.youtube.com">YouTube Studio</ExternalLink> → click <strong>Create</strong> (camera icon) → <strong>Go live</strong>.</Step>
          <Step n="3">If prompted, verify your phone number to unlock live streaming.</Step>
        </Steps>

        <SubHeading>Stream Settings in YouTube Studio</SubHeading>
        <p className="mb-3">
          In YouTube Studio's Live Control Room, click <strong>Edit</strong> on your
          upcoming stream (or configure before going live):
        </p>

        <SettingsTable
          rows={[
            ['Title', 'Anything you like — your squad will see it'],
            ['Visibility', 'Public or Unlisted (not Private — POV Sync cannot read private streams)'],
            ['Latency', 'Ultra low-latency (best for sync)'],
            ['Enable DVR', 'Off (automatically disabled with ultra low-latency)'],
            ['360° video', 'Off'],
          ]}
        />

        <Callout emoji="Note" title="Why Ultra Low Latency?">
          <p>
            YouTube usually adds a big delay. Ultra low-latency cuts that down to roughly
            2–5 seconds, so everyone stays much closer to live and the room stays easier to sync.
          </p>
          <p className="mt-2">
            The tradeoff is simple: viewers cannot rewind while the stream is live. Stream quality stays the same.
          </p>
        </Callout>

        <SubHeading>Getting Your Stream Key</SubHeading>
        <Steps>
          <Step n="1">In YouTube Studio's Live Control Room, go to the <strong>Stream</strong> tab.</Step>
          <Step n="2">You'll see a <strong>Stream key</strong> field — click <strong>Copy</strong>.</Step>
          <Step n="3">Copy the <strong>Stream URL</strong> too if you want it for OBS. It usually looks like <code className="text-pov-accent">rtmp://a.rtmp.youtube.com/live2</code>.</Step>
        </Steps>

        <SubHeading>Connecting OBS to YouTube</SubHeading>
        <Steps>
          <Step n="1">In OBS, go to <Kbd>Settings → Stream</Kbd>.</Step>
          <Step n="2">Set <strong>Service</strong> to <strong>YouTube - RTMPS</strong>.</Step>
          <Step n="3">Paste your <strong>Stream Key</strong> into the Stream Key field.</Step>
          <Step n="4">Click <strong>Apply</strong>, then <strong>OK</strong>.</Step>
        </Steps>
        <Tip>
          You can also use <strong>Connect Account</strong> in OBS to link your Google account directly.
          That saves you from copying and pasting stream keys.
        </Tip>

        <div id="twitch" className="mt-8 pt-6 border-t border-pov-border/60 scroll-mt-20">
          <SubHeading>Twitch Live Setup</SubHeading>
          <Steps>
            <Step n="1">You need a <ExternalLink href="https://www.twitch.tv">Twitch</ExternalLink> account with live streaming enabled.</Step>
            <Step n="2">Open <ExternalLink href="https://dashboard.twitch.tv">Twitch Creator Dashboard</ExternalLink> and go to <strong>Settings → Stream</strong>.</Step>
            <Step n="3">Copy your <strong>Primary Stream Key</strong> and keep it private.</Step>
          </Steps>

          <SubHeading>Connecting OBS to Twitch</SubHeading>
          <Steps>
            <Step n="1">In OBS, go to <Kbd>Settings → Stream</Kbd>.</Step>
            <Step n="2">Set <strong>Service</strong> to <strong>Twitch</strong>.</Step>
            <Step n="3">Paste your Twitch <strong>Stream Key</strong> into the Stream Key field.</Step>
            <Step n="4">Click <strong>Apply</strong>, then <strong>OK</strong>.</Step>
          </Steps>

          <Note>
            Twitch works best once the channel is already live. Paste your channel URL and POV Sync will load it in the room.
          </Note>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 3 — GOING LIVE
          ═══════════════════════════════════════════════════════ */}
      <Section id="golive" step="3" title="Going Live">
        <Steps>
          <Step n="1">Make sure your game or content is running and visible in OBS's preview.</Step>
          <Step n="2">In OBS, click <strong>Start Streaming</strong>.</Step>
          <Step n="3">If you are using YouTube, open YouTube Studio. Once you see the <strong>preview</strong>, click <strong>Go Live</strong> in the top right.</Step>
          <Step n="4">If you're on Twitch, confirm your channel goes live in the Twitch dashboard.</Step>
          <Step n="5">Copy your stream URL — it looks like one of these:</Step>
        </Steps>
        <code className="block bg-pov-surface border border-pov-border rounded px-4 py-2.5 text-sm font-mono text-pov-muted my-3">
          https://www.youtube.com/watch?v=YOUR_STREAM_ID  or  https://www.twitch.tv/YOUR_CHANNEL
        </code>
        <p>
          You will paste this URL into POV Sync when you create or join a session.
        </p>

        <SubHeading>Quick Checklist Before Going Live</SubHeading>
        <CheckList
          items={[
            'OBS scene is set up with game, mic, and optionally webcam',
            'Bitrate is 4500+ Kbps, keyframe interval is 2s',
            'Your stream is live on YouTube or Twitch',
            'YouTube has Ultra low-latency enabled, if you are using YouTube',
            'Audio levels look good in OBS mixer (green/yellow, not red)',
            'You can hear game audio and your mic isn\'t muted',
          ]}
        />
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 4 — CREATE A SESSION
          ═══════════════════════════════════════════════════════ */}
      <Section id="create" step="4" title="Create a Session (Host)">
        <p className="mb-4">
          The host creates the session and becomes the <strong>anchor stream</strong>.
          Everyone else syncs to that stream.
        </p>
        <Steps>
          <Step n="1">Sign in to POV Sync with Google.</Step>
          <Step n="2">On the <Link to="/" className="text-pov-accent hover:underline">home page</Link>, open the <strong>Create Session</strong> panel.</Step>
          <Step n="3">Paste your YouTube or Twitch stream URL, add an optional session title, and click <strong>Go Live</strong>.</Step>
          <Step n="4">Once you enter the room, expand the header and click <strong>Show invite link</strong>.</Step>
          <Step n="5">Copy the invite link and share it with your squad.</Step>
        </Steps>
        <div className="space-y-2 my-3">
          <div className="bg-pov-surface border border-pov-border rounded-lg px-4 py-3 flex items-start gap-3">
            <span className="text-xs font-mono text-pov-accent flex-shrink-0">Link</span>
            <div>
              <p className="text-pov-text font-medium text-sm">Invite Link</p>
              <p className="text-xs text-pov-muted mt-0.5">
                This opens the room chooser at <code className="text-pov-accent">/room/...</code>, where people can watch or join as a participant.
              </p>
            </div>
          </div>
          <div className="bg-pov-surface border border-pov-border rounded-lg px-4 py-3 flex items-start gap-3">
            <span className="text-xs font-mono text-pov-accent flex-shrink-0">Join</span>
            <div>
              <p className="text-pov-text font-medium text-sm">Direct Join Options</p>
              <p className="text-xs text-pov-muted mt-0.5">
                Participants can also paste a join code or a direct participant link into the join page if you send one in chat or Discord.
              </p>
            </div>
          </div>
        </div>
        <Note>
          The main flow is now the invite link. It is the easiest option because people can choose <strong>Watch</strong> or <strong>Join as Participant</strong> from the same page.
        </Note>
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 5 — JOIN A SESSION
          ═══════════════════════════════════════════════════════ */}
      <Section id="join" step="5" title="Join a Session">
        <Steps>
          <Step n="1">Open the host's invite link and choose <strong>Join as Participant</strong>, or paste a join code / participant link into the join page.</Step>
          <Step n="2">Sign in with Google if needed. POV Sync will bring you back to the right room after sign-in.</Step>
          <Step n="3">Make sure you are <strong>already live on YouTube or Twitch</strong> before you continue.</Step>
          <Step n="4">Enter your display name if needed, then paste your stream URL.</Step>
          <Step n="5">Click <strong>Join Session</strong>. Your POV should appear in the room within a few seconds.</Step>
        </Steps>
        <Note>
          Up to 5 participants can join one live room. If you leave the page, use the green <strong>"Return to Session"</strong> pill or the session resume card to jump back in.
        </Note>
      </Section>

        {/* ═══════════════════════════════════════════════════════
          SECTION 6 — ROOM SYNC
          ═══════════════════════════════════════════════════════ */}
      <Section id="syncing" step="6" title="Room Sync">
        <p className="mb-4">
          You do not need the technical details to use POV Sync. This is the part that actually matters in practice.
        </p>
        <Steps>
          <Step n="1">The host's POV starts as the room anchor, and the rest of the room lines up to it.</Step>
          <Step n="2">If the host gives control to someone else, that person can run the same room sync actions.</Step>
          <Step n="3">Use <strong>Go Live</strong> to snap the room back to the live edge, or <strong>Re-sync</strong> if the room just needs another alignment pass.</Step>
          <Step n="4">For YouTube POVs, POV Sync can confirm and save UTC start times. That makes VOD handoff more reliable when the room ends.</Step>
        </Steps>
        <Note>
          Give the room 15–30 seconds after everyone joins before judging the sync. If one POV still looks off, use the per-POV offset buttons under that stream.
        </Note>
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 7 — CONTROLS & OFFSETS
          ═══════════════════════════════════════════════════════ */}
      <Section id="controls" step="7" title="Controls & Offsets">
        <SubHeading>Room Bar</SubHeading>
        <p className="mb-3">
          The room toolbar is the main control area. It includes view mode, playback, sync, and quality controls.
        </p>
        <SettingsTable
          rows={[
            ['Stage / Wall', 'Switch between a main-stage layout and a wall of POVs'],
            ['Play All', 'Play the current room view'],
            ['Pause All', 'Pause the current room view'],
            ['Go Live', 'Jump back to the live edge'],
            ['Re-sync', 'Run another sync pass for the room'],
            ['Quality', 'Choose Highest, High, Low, or Auto quality'],
          ]}
        />

        <SubHeading>View & Layout</SubHeading>
        <p className="mb-3">
          On desktop, you can resize the main view and switch the POV strip between a vertical sidebar and a horizontal strip. On mobile, the room is simplified into a more touch-friendly layout.
        </p>

        <SubHeading>Main POV Nudge</SubHeading>
        <p className="mb-3">
          The nudge controls in the room act on the POV you are currently focused on. They are useful when you want to fine-tune what you are watching locally.
        </p>
        <SettingsTable
          rows={[
            ['-5s / -1s / +1s / +5s', 'Quick local nudges for the POV you have selected'],
            ['-1f / +1f', 'Small frame-level nudges for precise adjustment'],
          ]}
        />

        <SubHeading>Per-Stream Offset Controls</SubHeading>
        <p className="mb-3">
          Hosts and delegated controllers also get offset controls below each POV tile. These are the room-level sync controls for individual streams.
        </p>
        <SettingsTable
          rows={[
            ['-5s / -1s', 'Move that stream back'],
            ['+1s / +5s', 'Move that stream forward'],
            ['-1f / +1f', 'Frame-level adjustment for that stream'],
            ['Anchor', 'Promote that POV to be the new anchor'],
          ]}
        />

        <SubHeading>Anchor Stream</SubHeading>
        <p className="mb-2">
          The anchor is the reference stream, so its offset always stays at 0.
          All other streams sync to it. The host or current controller can make any stream the anchor with the anchor button.
        </p>

        <SubHeading>Host-Only Tools</SubHeading>
        <p className="mb-3">
          Hosts have a few extra tools that do not appear for normal participants.
        </p>
        <SettingsTable
          rows={[
            ['Add POV', 'Add another YouTube or Twitch stream directly from the room'],
            ['Control Delegation', 'Temporarily give full room controls to one participant'],
            ['Participants', 'See who is in the room and remove someone if needed'],
            ['Sync Readiness', 'Check which YouTube POVs have confirmed UTC start times for VOD handoff'],
          ]}
        />
        <p>
          The host can temporarily hand controls to another participant with the
          <strong> Control Delegation</strong> panel. That person gets the same room controls until the host takes them back.
        </p>
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 8 — SPECTATORS
          ═══════════════════════════════════════════════════════ */}
      <Section id="spectator" step="8" title="Spectators">
        <p>
          The easiest way to bring in viewers is the shared <strong>invite link</strong>. From there, they can choose <strong>Watch</strong> and enter the room without an account.
          Spectators can switch POVs and use the room layout locally, but they cannot change room sync, offsets, or host controls.
        </p>
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 9 — VODS
          ═══════════════════════════════════════════════════════ */}
      <Section id="vod" step="9" title="VODs">
        <p className="mb-3">
          When the host ends a session, the streams and offsets are saved.
          Anyone with the session link can come back later and watch from the start.
        </p>
        <Note>
          Sync offsets are applied automatically when you watch a VOD, so there is nothing extra to set up. For the best handoff, let the host check the <strong>Sync Readiness</strong> panel before ending the room. YouTube usually saves streams under 12 hours. Twitch replay support depends on that channel's archive settings.
        </Note>
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 10 — TROUBLESHOOTING
          ═══════════════════════════════════════════════════════ */}
      <Section id="trouble" step="10" title="Troubleshooting">
        <TroubleshootItem
          q="My stream URL isn't working"
          a={<>
            Make sure the stream is live and the URL matches your platform.
            YouTube URLs look like <code className="text-pov-accent">youtube.com/watch?v=...</code>,
            and Twitch URLs look like <code className="text-pov-accent">twitch.tv/yourchannel</code>.
            If you just started streaming, wait 10–15 seconds for the platform to propagate the URL.
          </>}
        />
        <TroubleshootItem
          q="Streams look out of sync"
          a={<>
            Give it 15–30 seconds so the room has time to settle. If things still look off, use{' '}
            <strong>Re-sync</strong> or <strong>Go Live</strong> in the room bar. Hosts and delegated controllers can also fine-tune a specific POV with the offset buttons under that stream.
          </>}
        />
        <TroubleshootItem
          q="OBS says 'Failed to connect to server'"
          a={<>
            Double-check your <strong>Stream Key</strong> in <Kbd>OBS → Settings → Stream</Kbd>.
            Make sure you selected the correct service (<strong>YouTube - RTMPS</strong> or <strong>Twitch</strong>).
            Try resetting the stream key in your platform dashboard and pasting the new one.
          </>}
        />
        <TroubleshootItem
          q="My platform says 'Live streaming not enabled'"
          a={<>
            First-time streamers need to enable live streaming in their platform dashboard. YouTube can take up to
            24 hours to verify your account. Twitch may also ask for extra verification.
          </>}
        />
        <TroubleshootItem
          q="A VOD is missing after the session ended"
          a={<>
            YouTube automatically archives streams under 12 hours. If the VOD is missing,
            the streamer may have manually deleted it, set it to Private, or their stream
            exceeded 12 hours. Twitch archives depend on the channel's VOD settings. Check your
            platform's live archive page to confirm the replay is available.
          </>}
        />
        <TroubleshootItem
          q="Stream is laggy or dropping frames"
          a={<>
            Lower your bitrate in <Kbd>OBS → Settings → Output</Kbd>. For 720p, try 3000 Kbps.
            Switch the encoder preset to <strong>Performance</strong> (NVENC) or{' '}
            <strong>veryfast</strong> (x264). Close other programs using your GPU or CPU.
          </>}
        />
        <TroubleshootItem
          q="I left the session page — how do I get back?"
          a={<>
            Look for the green <strong>"Return to Session"</strong> pill in the top navbar —
            it appears on any page while you have an active live session. You can also go to your{' '}
            <Link to="/profile" className="text-pov-accent hover:underline">Profile</Link> and
            click the live session card.
          </>}
        />
        <TroubleshootItem
          q="Can I use Streamlabs, XSplit, or another app instead of OBS?"
          a={<>
            Yes. POV Sync only needs a YouTube or Twitch stream URL. Any app that can stream to
            either platform should work. We recommend OBS because it is free and widely used.
          </>}
        />
      </Section>

      {/* Back to top */}
      <div className="text-center mt-12 mb-4">
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          className="text-xs font-mono text-pov-muted hover:text-pov-accent transition-colors"
        >
          ↑ Back to top
        </a>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ id, step, title, children }) {
  return (
    <section id={id} className="mb-10 sm:mb-12 scroll-mt-20">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-7 h-7 rounded-full bg-pov-accent/10 border border-pov-accent/30 text-pov-accent text-xs font-bold font-mono flex items-center justify-center flex-shrink-0">
          {step}
        </span>
        <h2 className="text-base sm:text-lg font-semibold font-mono">{title}</h2>
      </div>
      <div className="text-sm text-pov-muted leading-relaxed pl-0 sm:pl-10">
        {children}
      </div>
    </section>
  );
}

function OverviewCard({ title, value, detail }) {
  return (
    <div className="bg-pov-surface border border-pov-border rounded-xl p-4">
      <p className="text-[10px] font-mono text-pov-muted uppercase tracking-wider">{title}</p>
      <p className="text-lg font-semibold text-pov-text mt-1">{value}</p>
      <p className="text-xs text-pov-muted mt-1.5 leading-relaxed">{detail}</p>
    </div>
  );
}

function SubHeading({ children }) {
  return (
    <h3 className="text-sm font-semibold text-pov-text mt-5 mb-2 flex items-center gap-2">
      <span className="w-1 h-4 bg-pov-accent/40 rounded-full" />
      {children}
    </h3>
  );
}

function Steps({ children }) {
  return <ol className="space-y-2 mb-3">{children}</ol>;
}

function Step({ n, children }) {
  return (
    <li className="flex gap-2">
      <span className="text-pov-accent font-mono font-bold flex-shrink-0">{n}.</span>
      <span>{children}</span>
    </li>
  );
}

function Note({ children, type }) {
  const isWarning = type === 'warning';
  return (
    <div className={`rounded-lg px-4 py-3 text-xs flex gap-2 mt-3 ${
      isWarning
        ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-300/80'
        : 'bg-pov-surface border border-pov-border text-pov-muted/80'
    }`}>
      <span className="flex-shrink-0 font-mono">{isWarning ? 'Warning' : 'Note'}</span>
      <span>{children}</span>
    </div>
  );
}

function Tip({ children }) {
  return (
    <div className="bg-pov-accent/5 border border-pov-accent/20 rounded-lg px-4 py-3 text-xs text-pov-muted flex gap-2 mt-3">
      <span className="flex-shrink-0 font-mono">Tip</span>
      <span>{children}</span>
    </div>
  );
}

function Callout({ emoji, title, children }) {
  return (
    <div className="bg-pov-surface border border-pov-border rounded-xl px-4 sm:px-5 py-4 mt-4">
      <p className="text-sm font-semibold text-pov-text flex items-center gap-2 mb-2">
        <span className="font-mono text-sm">{emoji}</span> {title}
      </p>
      <div className="text-xs text-pov-muted leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd className="bg-pov-bg border border-pov-border rounded px-1.5 py-0.5 text-[11px] font-mono text-pov-text">
      {children}
    </kbd>
  );
}

function ExternalLink({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-pov-accent hover:underline"
    >
      {children}
    </a>
  );
}

function CheckList({ items }) {
  return (
    <ul className="space-y-1.5 mt-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-pov-muted">
          <span className="text-pov-success mt-0.5 flex-shrink-0">-</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SettingsTable({ rows }) {
  return (
    <div className="overflow-x-auto mt-2 mb-3">
      <table className="w-full text-xs font-mono border border-pov-border rounded-lg overflow-hidden">
        <tbody>
          {rows.map(([setting, value], i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-pov-surface/50' : 'bg-pov-bg/50'}>
              <td className="px-3 py-2 text-pov-text font-medium whitespace-nowrap border-r border-pov-border/50 w-1/3">
                {setting}
              </td>
              <td className="px-3 py-2 text-pov-muted">
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TroubleshootItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-pov-border/40 last:border-b-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-3 text-left gap-3 hover:text-pov-accent transition-colors"
      >
        <span className="text-sm text-pov-text font-medium">{q}</span>
        <span className="text-pov-muted/50 flex-shrink-0 text-xs">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="text-xs text-pov-muted leading-relaxed pb-3 animate-in">
          {a}
        </div>
      )}
    </div>
  );
}
