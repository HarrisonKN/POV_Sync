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

export default function Terms() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-mono text-pov-accent uppercase tracking-wider mb-2">Legal</p>
        <h1 className="text-2xl sm:text-3xl font-bold font-mono mb-3">Terms of Service</h1>
        <p className="text-sm text-pov-muted">
          Last updated: <span className="text-pov-text">{LAST_UPDATED}</span>
        </p>
      </div>

      {/* Intro card */}
      <div className="glass-panel rounded-xl px-5 py-4 mb-8 text-sm text-pov-muted leading-relaxed">
        By accessing or using POVSync you agree to be bound by these Terms. If you do not agree,
        please do not use the service.
      </div>

      <Section title="1. Description of Service">
        <p>
          POVSync is a web-based tool that lets groups of streamers synchronise and watch
          each other's live or recorded streams from YouTube and Twitch in a shared session room.
        </p>
        <p>
          The service is provided free of charge and is intended for personal, non-commercial use
          among small groups.
        </p>
      </Section>

      <Section title="2. Eligibility">
        <p>
          You must be at least 13 years old to use POVSync. By creating an account you represent
          that you meet this requirement. If you are under 18, you must have the permission of a
          parent or legal guardian.
        </p>
      </Section>

      <Section title="3. Accounts">
        <p>
          POVSync uses Google OAuth for authentication. You are responsible for maintaining the
          security of your Google account and for all activities that occur under your POVSync
          profile.
        </p>
        <p>
          We reserve the right to suspend or terminate accounts that violate these Terms or engage
          in abusive behaviour toward other users.
        </p>
      </Section>

      <Section title="4. Acceptable Use">
        <p>You agree not to use POVSync to:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-1">
          <li>Share, stream, or link to content that is illegal, infringing, or harmful.</li>
          <li>Harass, threaten, or impersonate other users.</li>
          <li>Attempt to gain unauthorised access to other users' sessions or accounts.</li>
          <li>Use automated tools to scrape, crawl, or overload the service.</li>
          <li>Reverse-engineer or attempt to extract the source code of the platform.</li>
        </ul>
      </Section>

      <Section title="5. Third-Party Content">
        <p>
          POVSync embeds streams from YouTube and Twitch via their official embed APIs. Content
          displayed through these embeds remains subject to the respective platform's terms of
          service and copyright policies. POVSync does not host, store, or retransmit any stream
          data.
        </p>
        <p>
          You are solely responsible for ensuring you have the right to share the stream URLs you
          add to a session.
        </p>
      </Section>

      <Section title="6. Session Data & VODs">
        <p>
          Session metadata (participant names, stream URLs, timing offsets, session codes) is
          stored in our database to enable VOD replay. This data is retained until you delete your
          account or request removal. See our{' '}
          <Link to="/privacy" className="text-pov-accent hover:underline">Privacy Policy</Link> for
          full details.
        </p>
      </Section>

      <Section title="7. Intellectual Property">
        <p>
          The POVSync name, logo, and interface design are owned by the developers. You may not
          reproduce or use them without permission. User-generated content (display names,
          session titles) remains yours.
        </p>
      </Section>

      <Section title="8. Disclaimer of Warranties">
        <p>
          POVSync is provided "as is" without warranties of any kind, express or implied. We do
          not guarantee uninterrupted availability, perfect sync accuracy, or error-free operation.
        </p>
      </Section>

      <Section title="9. Limitation of Liability">
        <p>
          To the fullest extent permitted by law, POVSync and its developers shall not be liable
          for any indirect, incidental, or consequential damages arising from your use of the
          service.
        </p>
      </Section>

      <Section title="10. Changes to These Terms">
        <p>
          We may update these Terms from time to time. Continued use of POVSync after changes
          are posted constitutes acceptance of the new Terms. The "Last updated" date at the top
          of this page will reflect any changes.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          Questions about these Terms?{' '}
          <Link to="/contact" className="text-pov-accent hover:underline">Get in touch</Link>.
        </p>
      </Section>

      {/* Footer nav */}
      <div className="flex gap-4 pt-4 border-t border-pov-border/40">
        <Link to="/privacy" className="text-xs text-pov-muted hover:text-pov-accent transition-colors">
          Privacy Policy →
        </Link>
        <Link to="/contact" className="text-xs text-pov-muted hover:text-pov-accent transition-colors">
          Contact →
        </Link>
      </div>
    </div>
  );
}
