export default function Setup() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold font-mono mb-2">Setup Guide</h1>
      <p className="text-pov-muted text-sm mb-10">
        Everything you need to get your squad streaming in sync.
      </p>

      <Section step="1" title="Stream to YouTube">
        <p>
          Every participant needs to be live on YouTube before joining a session.
          POV Sync works with any YouTube stream URL — but for the best
          experience, enable <strong>Ultra Low Latency</strong> (see below).
        </p>
      </Section>

      <Section step="2" title="Ultra Low Latency (ULL) — Recommended">
        <p className="mb-4">
          Standard YouTube streams have 20–30 seconds of latency. Ultra Low
          Latency reduces that to 2–5 seconds, which makes the sync system far
          more accurate and reduces the manual offset needed.
        </p>
        <Steps>
          <Step n="1">Go to <ExternalLink href="https://studio.youtube.com">YouTube Studio</ExternalLink> and open your stream.</Step>
          <Step n="2">Click <strong>Edit</strong> on your stream (or create a new one).</Step>
          <Step n="3">Under <strong>Stream settings</strong>, open <strong>Latency</strong>.</Step>
          <Step n="4">Select <strong>Ultra low-latency</strong>.</Step>
          <Step n="5">Click <strong>Save</strong>. Done — your next stream will use ULL.</Step>
        </Steps>
        <Note>
          ULL disables DVR (rewind) and some playback quality options. It does
          not affect stream quality itself.
        </Note>
      </Section>

      <Section step="3" title="Create a Session (Host)">
        <Steps>
          <Step n="1">Sign in with Google and click <strong>Create Session</strong>.</Step>
          <Step n="2">Paste your own YouTube stream URL — this makes you the first participant and the anchor stream.</Step>
          <Step n="3">Copy the <strong>Participant Link</strong> and send it to your squad in Discord/chat.</Step>
          <Step n="4">Copy the <strong>Spectator Link</strong> for anyone who just wants to watch.</Step>
        </Steps>
      </Section>

      <Section step="4" title="Joining as a Participant">
        <Steps>
          <Step n="1">Click the participant link your host shared, or go to the home page and enter the join code.</Step>
          <Step n="2">Sign in with Google if you aren't already.</Step>
          <Step n="3">Enter your display name (pre-filled from your Google account).</Step>
          <Step n="4">Paste your own YouTube stream URL and click <strong>Join Session</strong>.</Step>
        </Steps>
        <Note>
          You must be live on YouTube before joining. If your stream isn't live yet,
          start it first, then come back and submit the URL.
        </Note>
      </Section>

      <Section step="5" title="Syncing Streams">
        <p className="mb-3">
          The server automatically fingerprints the audio of each stream and
          calculates how far ahead or behind each one is relative to the anchor.
          This takes about 30 seconds per stream after joining.
        </p>
        <p className="mb-3">
          Once confidence is high enough, the <strong>✦ Suggest Sync</strong>{' '}
          button activates. Click it to apply the server's calculated offsets
          all at once.
        </p>
        <p>
          You can also fine-tune any stream manually using the step buttons
          below each thumbnail — from ±30s coarse adjustment down to ±1 frame.
        </p>
      </Section>

      <Section step="6" title="Finding Your Stream URL">
        <p className="mb-3">
          Your YouTube stream URL is the same URL you'd share with viewers.
          It looks like:
        </p>
        <code className="block bg-pov-surface border border-pov-border rounded px-4 py-2.5 text-sm font-mono text-pov-muted mb-3">
          https://www.youtube.com/watch?v=xxxxxxxxxxx
        </code>
        <Steps>
          <Step n="1">Go to <ExternalLink href="https://studio.youtube.com">YouTube Studio</ExternalLink> → <strong>Go Live</strong>.</Step>
          <Step n="2">Under your stream, click <strong>Share</strong> or copy the link from the address bar.</Step>
          <Step n="3">Paste that URL into POV Sync.</Step>
        </Steps>
        <Note>
          The stream must be set to <strong>Public</strong> or <strong>Unlisted</strong> — 
          private streams cannot be accessed by POV Sync.
        </Note>
      </Section>

      <Section step="7" title="Spectators">
        <p>
          Share the <strong>Spectator Link</strong> with anyone who wants to
          watch. No account required. They'll see the same multi-POV layout
          in read-only mode, and new streams appear in real time as participants
          join.
        </p>
      </Section>

      <Section step="8" title="VODs">
        <p>
          When a session ends, it's automatically saved as a VOD. Anyone with
          the session link can watch it later — all POVs, fully synced, starting
          from the beginning. Saved offsets are applied automatically so no
          re-calibration is needed.
        </p>
      </Section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ step, title, children }) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-7 h-7 rounded-full bg-pov-accent/10 border border-pov-accent/30 text-pov-accent text-xs font-bold font-mono flex items-center justify-center flex-shrink-0">
          {step}
        </span>
        <h2 className="text-base font-semibold font-mono">{title}</h2>
      </div>
      <div className="text-sm text-pov-muted leading-relaxed pl-10">
        {children}
      </div>
    </div>
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

function Note({ children }) {
  return (
    <div className="bg-pov-surface border border-pov-border rounded px-4 py-3 text-xs text-pov-muted/80 flex gap-2">
      <span className="flex-shrink-0">💡</span>
      <span>{children}</span>
    </div>
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
