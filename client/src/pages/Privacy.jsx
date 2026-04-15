import { Link } from 'react-router-dom';

const LAST_UPDATED = 'April 15, 2026';

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold font-mono text-pov-text mb-3 pb-2 border-b border-pov-border/50">
        {title}
      </h2>
      <div className="space-y-3 text-sm text-pov-muted leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function DataRow({ label, value }) {
  return (
    <div className="flex gap-4 py-2 border-b border-pov-border/30 last:border-0">
      <span className="text-pov-text font-medium w-40 flex-shrink-0">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function Privacy() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-mono text-pov-accent uppercase tracking-wider mb-2">Legal</p>
        <h1 className="text-2xl sm:text-3xl font-bold font-mono mb-3">Privacy Policy</h1>
        <p className="text-sm text-pov-muted">
          Last updated: <span className="text-pov-text">{LAST_UPDATED}</span>
        </p>
      </div>

      {/* Intro */}
      <div className="glass-panel rounded-xl px-5 py-4 mb-8 text-sm text-pov-muted leading-relaxed">
        Your privacy matters. This policy explains what data we collect, why we collect it, and
        how you can control it. POVSync does not sell your data.
      </div>

      <Section title="1. Data We Collect">
        <p>When you use POVSync we may collect the following:</p>
        <div className="bg-pov-surface border border-pov-border rounded-xl px-4 py-1 mt-2">
          <DataRow label="Google profile" value="Name, email address, and profile picture — provided by Google OAuth on sign-in." />
          <DataRow label="Display name" value="The name you choose to show in session rooms." />
          <DataRow label="Stream URLs" value="YouTube and Twitch stream links you add to sessions. These are stored to enable VOD replay." />
          <DataRow label="Session metadata" value="Session title, join code, creation time, participant list, and sync offsets." />
          <DataRow label="Follow relationships" value="Which users you choose to follow on the platform." />
          <DataRow label="Usage data" value="Standard server logs (IP address, browser type, pages visited) for security and debugging." />
        </div>
      </Section>

      <Section title="2. How We Use Your Data">
        <p>We use the data we collect to:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-1">
          <li>Authenticate your account and display your profile.</li>
          <li>Create, manage, and replay session rooms.</li>
          <li>Show your sessions and activity on your profile page.</li>
          <li>Enable the follower/following social features.</li>
          <li>Diagnose errors and improve the service.</li>
        </ul>
        <p>We do <strong className="text-pov-text">not</strong> use your data for advertising,
        profiling, or any purpose beyond operating the service.</p>
      </Section>

      <Section title="3. Data Storage & Security">
        <p>
          POVSync uses <strong className="text-pov-text">Supabase</strong> (hosted on AWS) as its
          database and authentication provider. Data is stored in the EU/US region. Supabase
          enforces row-level security policies — each user can only access their own data unless
          explicitly shared (e.g. public profiles, session join codes).
        </p>
        <p>
          Connections are encrypted in transit via HTTPS. We do not store passwords — all
          authentication is delegated to Google OAuth.
        </p>
      </Section>

      <Section title="4. Cookies & Local Storage">
        <p>
          POVSync uses <code className="text-pov-accent text-xs">localStorage</code> to store your
          theme preference (<code className="text-pov-accent text-xs">pov-theme</code>) and your
          active session ID. No tracking cookies are set. No third-party analytics scripts are
          loaded.
        </p>
      </Section>

      <Section title="5. Third-Party Services">
        <p>POVSync integrates with the following third-party services:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-1">
          <li><strong className="text-pov-text">Google OAuth</strong> — for sign-in. Subject to Google's Privacy Policy.</li>
          <li><strong className="text-pov-text">YouTube Embed API</strong> — to display YouTube streams. Subject to Google's Privacy Policy.</li>
          <li><strong className="text-pov-text">Twitch Embed API</strong> — to display Twitch streams. Subject to Twitch's Privacy Policy.</li>
          <li><strong className="text-pov-text">Supabase</strong> — for database and real-time WebSocket. Subject to Supabase's Privacy Policy.</li>
        </ul>
        <p>
          When YouTube or Twitch embeds are loaded, those platforms may set their own cookies
          or collect data according to their own policies.
        </p>
      </Section>

      <Section title="6. Data Retention">
        <p>
          Session and profile data is retained until you delete your account. You can request
          deletion of your data at any time by{' '}
          <Link to="/contact" className="text-pov-accent hover:underline">contacting us</Link>.
          We will remove your data within 30 days of a verified request.
        </p>
      </Section>

      <Section title="7. Your Rights">
        <p>Depending on your location, you may have the right to:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-1">
          <li>Access a copy of the personal data we hold about you.</li>
          <li>Correct inaccurate data.</li>
          <li>Request deletion of your data ("right to be forgotten").</li>
          <li>Object to processing of your data.</li>
        </ul>
        <p>
          To exercise any of these rights,{' '}
          <Link to="/contact" className="text-pov-accent hover:underline">contact us</Link>.
        </p>
      </Section>

      <Section title="8. Children's Privacy">
        <p>
          POVSync is not directed at children under 13. We do not knowingly collect data from
          children under 13. If you believe a child has provided us with personal data, please
          contact us and we will remove it promptly.
        </p>
      </Section>

      <Section title="9. Changes to This Policy">
        <p>
          We may update this Privacy Policy periodically. The "Last updated" date will reflect
          any changes. Continued use of POVSync after updates constitutes acceptance of the
          revised policy.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          Privacy questions or data requests?{' '}
          <Link to="/contact" className="text-pov-accent hover:underline">Get in touch</Link>.
        </p>
      </Section>

      {/* Footer nav */}
      <div className="flex gap-4 pt-4 border-t border-pov-border/40">
        <Link to="/terms" className="text-xs text-pov-muted hover:text-pov-accent transition-colors">
          Terms of Service →
        </Link>
        <Link to="/contact" className="text-xs text-pov-muted hover:text-pov-accent transition-colors">
          Contact →
        </Link>
      </div>
    </div>
  );
}
