import { useState } from 'react';
import { Link } from 'react-router-dom';

const TOC = [
  { id: 'obs',       label: 'OBS Setup' },
  { id: 'youtube',   label: 'YouTube Setup' },
  { id: 'golive',    label: 'Go Live' },
  { id: 'create',    label: 'Create a Session' },
  { id: 'join',      label: 'Join a Session' },
  { id: 'syncing',   label: 'How Sync Works' },
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
        A complete, start-to-finish walkthrough — from installing OBS to
        streaming in perfect sync with your squad.
      </p>

      <div className="grid gap-3 sm:grid-cols-3 mb-8">
        <OverviewCard title="OBS" value="1080p60" detail="CBR, 2s keyframes, NVENC preferred" />
        <OverviewCard title="YouTube" value="Ultra Low Latency" detail="Public or Unlisted, DVR off" />
        <OverviewCard title="POV Sync" value="Rejoin anytime" detail="Live session resume works across pages" />
      </div>

      {/* ── Quick Start ────────────────────────────────────── */}
      <div className="bg-pov-accent/5 border border-pov-accent/20 rounded-xl p-4 sm:p-5 mb-8">
        <p className="text-xs font-mono text-pov-accent uppercase tracking-wider mb-3">⚡ Quick Start — the short version</p>
        <ol className="space-y-1.5 text-sm text-pov-muted">
          <li className="flex gap-2"><span className="text-pov-accent font-bold flex-shrink-0">1.</span> Download OBS, connect it to YouTube, and go live.</li>
              <li className="flex gap-2"><span className="text-pov-accent font-bold flex-shrink-0">2.</span> Copy your YouTube stream URL (it will look like <code className="text-pov-accent">youtube.com/watch?v=...</code>).</li>
              <li className="flex gap-2"><span className="text-pov-accent font-bold flex-shrink-0">3.</span> Host: create a session here and paste your URL. Share the participant link with your squad.</li>
              <li className="flex gap-2"><span className="text-pov-accent font-bold flex-shrink-0">4.</span> Squad: open the link, sign in, and paste your own YouTube URL.</li>
              <li className="flex gap-2"><span className="text-pov-accent font-bold flex-shrink-0">5.</span> Everyone’s POVs stay aligned automatically.
              </li>
        </ol>
        <p className="text-xs text-pov-muted/60 mt-3">Read the full guide below if you get stuck or want to understand the details.</p>
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
          the recommended (free) broadcasting software. If you don't have it yet,
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
          Not sure which encoder to pick? NVENC = NVIDIA graphics card, AMD HW = AMD graphics
          card, x264 = everything else (uses your CPU). NVENC and AMD are preferred as they
          don't impact your game's framerate.
        </Note>
        <Note>
          12000 Kbps requires roughly <strong>15 Mbps upload speed</strong>. Run a speed test
          at <ExternalLink href="https://fast.com">fast.com</ExternalLink> first. If your
          upload is under 15 Mbps, drop to 6000 Kbps (still looks great at 1080p60).
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
          If your PC struggles to maintain 60fps in OBS while gaming, switch to 30fps
          rather than lowering resolution — 1080p30 looks better than 720p60 for most games.
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
          Bitrate</strong> to <strong>160 Kbps</strong> — YouTube recommends 128 Kbps
          minimum; 160 gives a bit of headroom for voice clarity.
        </Note>

        <SubHeading>Adding Scenes & Sources</SubHeading>
        <Steps>
          <Step n="1">In the <strong>Scenes</strong> box, click <strong>+</strong> to add a new scene (e.g. "Gaming").</Step>
          <Step n="2">In <strong>Sources</strong>, click <strong>+</strong> → <strong>Game Capture</strong> for your game.</Step>
          <Step n="3">Choose <strong>Capture specific window</strong> and pick your game from the dropdown.</Step>
          <Step n="4">Add <strong>Audio Output Capture</strong> (game sound) and <strong>Audio Input Capture</strong> (your mic) if they're not already showing in the Audio Mixer.</Step>
          <Step n="5">Optional: add a <strong>Webcam</strong> (Video Capture Device) and resize/position it.</Step>
        </Steps>
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 2 — YOUTUBE LIVE SETUP
          ═══════════════════════════════════════════════════════ */}
      <Section id="youtube" step="2" title="YouTube Live Setup">
        <SubHeading>Prerequisites</SubHeading>
        <Steps>
          <Step n="1">You need a <ExternalLink href="https://www.youtube.com">YouTube</ExternalLink> account with <strong>live streaming enabled</strong>. If it's your first time, YouTube may require up to 24 hours to activate it.</Step>
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
            ['Title', 'Whatever you like — your squad will see this'],
            ['Visibility', 'Public or Unlisted (NOT Private — POV Sync can\'t access private streams)'],
            ['Latency', 'Ultra low-latency ⭐ (critical for sync accuracy — see below)'],
            ['Enable DVR', 'Off (automatically disabled with ultra low-latency)'],
            ['360° video', 'Off'],
          ]}
        />

        <Callout emoji="⚡" title="Why Ultra Low Latency?">
          <p>
            YouTube normally has a 20–30 second delay. Ultra low-latency cuts that to about
            2–5 seconds, which means everyone watching stays much closer to real time —
            and POV Sync can keep all your streams better aligned.
          </p>
          <p className="mt-2">
            The only downside is you can't rewind the stream while it's live. Stream quality
            is <strong>not</strong> affected.
          </p>
        </Callout>

        <SubHeading>Getting Your Stream Key</SubHeading>
        <Steps>
          <Step n="1">In YouTube Studio's Live Control Room, go to the <strong>Stream</strong> tab.</Step>
          <Step n="2">You'll see a <strong>Stream key</strong> field — click <strong>Copy</strong>.</Step>
          <Step n="3">Also copy the <strong>Stream URL</strong> (usually <code className="text-pov-accent">rtmp://a.rtmp.youtube.com/live2</code>).</Step>
        </Steps>

        <SubHeading>Connecting OBS to YouTube</SubHeading>
        <Steps>
          <Step n="1">In OBS, go to <Kbd>Settings → Stream</Kbd>.</Step>
          <Step n="2">Set <strong>Service</strong> to <strong>YouTube - RTMPS</strong>.</Step>
          <Step n="3">Paste your <strong>Stream Key</strong> into the Stream Key field.</Step>
          <Step n="4">Click <strong>Apply</strong>, then <strong>OK</strong>.</Step>
        </Steps>
        <Tip>
          Alternatively, you can use <strong>Connect Account</strong> in OBS to link your
          Google account directly — this lets you manage the stream from OBS without
          copy-pasting keys.
        </Tip>
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 3 — GOING LIVE
          ═══════════════════════════════════════════════════════ */}
      <Section id="golive" step="3" title="Going Live">
        <Steps>
          <Step n="1">Make sure your game or content is running and visible in OBS's preview.</Step>
          <Step n="2">In OBS, click <strong>Start Streaming</strong>.</Step>
          <Step n="3">Switch to YouTube Studio — after a few seconds you'll see a <strong>preview</strong> of your stream. Click <strong>Go Live</strong> in the top-right to make it public.</Step>
          <Step n="4">Your stream is now live! Copy the watch URL — it looks like:</Step>
        </Steps>
        <code className="block bg-pov-surface border border-pov-border rounded px-4 py-2.5 text-sm font-mono text-pov-muted my-3">
          https://www.youtube.com/watch?v=YOUR_STREAM_ID
        </code>
        <p>
          You'll paste this URL into POV Sync when creating or joining a session.
        </p>

        <SubHeading>Quick Checklist Before Going Live</SubHeading>
        <CheckList
          items={[
            'OBS scene is set up with game, mic, and optionally webcam',
            'Bitrate is 4500+ Kbps, keyframe interval is 2s',
            'YouTube stream is set to Public or Unlisted',
            'Ultra low-latency is enabled',
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
          The host creates the session and becomes the <strong>anchor stream</strong> — the
          reference point all other streams sync against.
        </p>
        <Steps>
          <Step n="1">Sign in to POV Sync with Google.</Step>
          <Step n="2">On the <Link to="/" className="text-pov-accent hover:underline">home page</Link>, click <strong>Create Session</strong>.</Step>
          <Step n="3">Paste your YouTube stream URL and click <strong>Go Live</strong>.</Step>
          <Step n="4">You'll land in the Viewer. Copy the two links:</Step>
        </Steps>
        <div className="space-y-2 my-3">
          <div className="bg-pov-surface border border-pov-border rounded-lg px-4 py-3 flex items-start gap-3">
            <span className="text-base flex-shrink-0">🔗</span>
            <div>
              <p className="text-pov-text font-medium text-sm">Participant Link</p>
              <p className="text-xs text-pov-muted mt-0.5">
                Send to your squad — they'll sign in and submit their own YouTube stream URL.
              </p>
            </div>
          </div>
          <div className="bg-pov-surface border border-pov-border rounded-lg px-4 py-3 flex items-start gap-3">
            <span className="text-base flex-shrink-0">👁</span>
            <div>
              <p className="text-pov-text font-medium text-sm">Spectator Link</p>
              <p className="text-xs text-pov-muted mt-0.5">
                Share with viewers — no account needed, read-only multi-POV experience.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 5 — JOIN A SESSION
          ═══════════════════════════════════════════════════════ */}
      <Section id="join" step="5" title="Join a Session">
        <Steps>
          <Step n="1">Open the participant link your host shared, or go to the home page and enter the join code.</Step>
          <Step n="2">Sign in with Google if you aren't already.</Step>
          <Step n="3">Make sure you're <strong>already live on YouTube</strong> before continuing.</Step>
          <Step n="4">Enter your display name and paste your YouTube stream URL.</Step>
          <Step n="5">Click <strong>Join Session</strong> — your stream appears in the filmstrip within seconds.</Step>
        </Steps>
        <Note>
          Up to 5 participants can join a single session. If you navigate away,
          you'll see a green <strong>"Return to Session"</strong> pill in the
          navbar that takes you right back.
        </Note>
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 6 — HOW SYNC WORKS
          ═══════════════════════════════════════════════════════ */}
      <Section id="syncing" step="6" title="How Sync Works">
        <p className="mb-4">
          You don't need to understand this to use POV Sync — but here's the plain-English version
          if you're curious.
        </p>
        <Steps>
          <Step n="1">When your YouTube stream loads, POV Sync quietly notes the exact time it started.</Step>
          <Step n="2">It does the same for every other stream in the session.</Step>
          <Step n="3">It works out how many seconds ahead or behind each stream is compared to the anchor (the host's stream).</Step>
          <Step n="4">It nudges each player forward or backward so they all line up. This repeats every few seconds to correct any drift.</Step>
        </Steps>
        <Note>
          Give it about 15–30 seconds after everyone joins before judging the sync — each player
          needs a moment to load before the system can calculate the offsets.
        </Note>
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 7 — CONTROLS & OFFSETS
          ═══════════════════════════════════════════════════════ */}
      <Section id="controls" step="7" title="Controls & Offsets">
        <SubHeading>Master Controls (Host)</SubHeading>
        <p className="mb-3">
          The host (or a delegated participant) has access to master controls:
        </p>
        <SettingsTable
          rows={[
            ['▶ Play All', 'Resume all streams simultaneously'],
            ['⏸ Pause All', 'Pause all streams simultaneously'],
            ['📡 Go Live', 'Snap all streams to their live edge'],
            ['🔁 Re-sync', 'Re-align all streams to the anchor'],
          ]}
        />

        <SubHeading>Per-Stream Offset Controls</SubHeading>
        <p className="mb-3">
          If a stream still looks off after auto-sync, you can nudge it manually using the
          buttons below each thumbnail. Start with bigger steps and work down to fine-tune:
        </p>
        <SettingsTable
          rows={[
            ['±30s', 'Big jump — useful if a stream is very far out'],
            ['±5s', 'Medium nudge'],
            ['±1s', 'Small nudge — use this for final tuning'],
            ['±1 frame', 'Tiny precise tweak — only needed if you\'re very picky'],
          ]}
        />

        <SubHeading>Anchor Stream</SubHeading>
        <p className="mb-2">
          The anchor (⚓) is the reference — its offset is always 0. All other
          streams are synced relative to it. The host can promote any stream to
          anchor using the ⚓ button below its thumbnail.
        </p>

        <SubHeading>Control Delegation</SubHeading>
        <p>
          The host can temporarily hand controls to another participant via the
          <strong> Control Delegation</strong> panel. The delegate gets full access
          to master controls and offset adjustments. The host can reclaim at any time.
        </p>
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 8 — SPECTATORS
          ═══════════════════════════════════════════════════════ */}
      <Section id="spectator" step="8" title="Spectators">
        <p>
          Share the <strong>Spectator Link</strong> with anyone who just wants to
          watch. No account required. Spectators see the same multi-POV layout
          with filmstrip switching, and new streams appear in real time as
          participants join. Spectators can't adjust offsets or controls.
        </p>
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 9 — VODS
          ═══════════════════════════════════════════════════════ */}
      <Section id="vod" step="9" title="VODs">
        <p className="mb-3">
          When the host ends a session, all streams and their computed offsets
          are saved permanently. Anyone with the session link can rewatch later —
          all POVs, fully synced, starting from the beginning.
        </p>
        <Note>
          Sync offsets are applied automatically when you watch a VOD — you don't need to
          do anything. You can still switch between POVs freely. YouTube automatically
          saves streams under 12 hours, so as long as your session isn't a marathon you're
          covered.
        </Note>
      </Section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 10 — TROUBLESHOOTING
          ═══════════════════════════════════════════════════════ */}
      <Section id="trouble" step="10" title="Troubleshooting">
        <TroubleshootItem
          q="My stream URL isn't working"
          a={<>
            Make sure the stream is <strong>Public</strong> or <strong>Unlisted</strong> (not Private).
            The URL should look like <code className="text-pov-accent">youtube.com/watch?v=...</code>.
            If you just started streaming, wait 10–15 seconds for YouTube to propagate the URL.
          </>}
        />
        <TroubleshootItem
          q="Streams look out of sync"
          a={<>
            Give it 15–30 seconds — the sync system needs each player to accumulate at least 10
            seconds of playback before computing offsets. If sync is still off, click{' '}
            <strong>🔁 Re-sync</strong> or <strong>📡 Go Live</strong> in the master controls.
            You can also fine-tune with the per-stream offset buttons.
          </>}
        />
        <TroubleshootItem
          q="OBS says 'Failed to connect to server'"
          a={<>
            Double-check your <strong>Stream Key</strong> in <Kbd>OBS → Settings → Stream</Kbd>.
            Make sure you selected <strong>YouTube - RTMPS</strong> as the service.
            Try resetting the stream key in YouTube Studio and pasting the new one.
          </>}
        />
        <TroubleshootItem
          q="YouTube says 'Live streaming not enabled'"
          a={<>
            First-time streamers need to enable live streaming in YouTube Studio. It can take up to
            24 hours for YouTube to verify your account. Make sure your phone number is verified.
          </>}
        />
        <TroubleshootItem
          q="A VOD is missing after the session ended"
          a={<>
            YouTube automatically archives streams under 12 hours. If the VOD is missing,
            the streamer may have manually deleted it, set it to Private, or their stream
            exceeded 12 hours. Check <strong>YouTube Studio → Content → Live</strong> to
            see if the archive is there but set to a restricted visibility.
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
            Yes! POV Sync only needs a YouTube stream URL. Any software that can stream to YouTube
            works — OBS is just what we recommend because it's free, open source, and widely used.
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
      <span className="flex-shrink-0">{isWarning ? '⚠️' : '💡'}</span>
      <span>{children}</span>
    </div>
  );
}

function Tip({ children }) {
  return (
    <div className="bg-pov-accent/5 border border-pov-accent/20 rounded-lg px-4 py-3 text-xs text-pov-muted flex gap-2 mt-3">
      <span className="flex-shrink-0">💎</span>
      <span>{children}</span>
    </div>
  );
}

function Callout({ emoji, title, children }) {
  return (
    <div className="bg-pov-surface border border-pov-border rounded-xl px-4 sm:px-5 py-4 mt-4">
      <p className="text-sm font-semibold text-pov-text flex items-center gap-2 mb-2">
        <span>{emoji}</span> {title}
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
      {children} ↗
    </a>
  );
}

function CheckList({ items }) {
  return (
    <ul className="space-y-1.5 mt-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-pov-muted">
          <span className="text-pov-success mt-0.5 flex-shrink-0">☐</span>
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
