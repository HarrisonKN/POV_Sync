import { Link } from 'react-router-dom';

function ContactCard({ icon, title, description, cta, href }) {
  return (
    <div className="glass-card rounded-xl px-5 py-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-pov-accent/10 flex items-center justify-center text-lg flex-shrink-0">
          {icon}
        </div>
        <h2 className="font-semibold font-mono text-pov-text text-sm">{title}</h2>
      </div>
      <p className="text-sm text-pov-muted leading-relaxed">{description}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-pov-accent hover:text-pov-accent/80 transition-colors mt-auto"
        >
          {cta} ↗
        </a>
      ) : (
        <span className="text-xs text-pov-muted/50 mt-auto italic">{cta}</span>
      )}
    </div>
  );
}

export default function Contact() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-mono text-pov-accent uppercase tracking-wider mb-2">Support</p>
        <h1 className="text-2xl sm:text-3xl font-bold font-mono mb-3">Contact & Support</h1>
        <p className="text-sm text-pov-muted leading-relaxed max-w-lg">
          Got a question, found a bug, or need to make a data request? Here's how to reach us.
        </p>
      </div>

      {/* Contact cards */}
      <div className="grid gap-4 sm:grid-cols-2 mb-10">
        <ContactCard
          icon="🐛"
          title="Bug Reports"
          description="Found something broken? Open an issue on GitHub with steps to reproduce, your browser, and what you expected to happen."
          cta="Open an issue on GitHub"
          href="https://github.com/HarrisonKN/POV_Sync/issues"
        />
        <ContactCard
          icon="💡"
          title="Feature Requests"
          description="Have an idea to make POVSync better? Start a discussion on GitHub — community feedback shapes what gets built next."
          cta="Start a discussion"
          href="https://github.com/HarrisonKN/POV_Sync/discussions"
        />
        <ContactCard
          icon="🔒"
          title="Privacy & Data Requests"
          description="To request a copy of your data, correct inaccuracies, or ask for deletion under GDPR/CCPA, contact us via GitHub or the email below."
          cta="See Privacy Policy"
          href="/privacy"
        />
        <ContactCard
          icon="📬"
          title="General Enquiries"
          description="For anything else — partnerships, press, or general questions — reach out via GitHub."
          cta="GitHub profile"
          href="https://github.com/HarrisonKN"
        />
      </div>

      {/* Setup help callout */}
      <div className="bg-pov-accent/5 border border-pov-accent/20 rounded-xl px-5 py-4 mb-8 flex items-start gap-4">
        <span className="text-xl flex-shrink-0 mt-0.5">📖</span>
        <div>
          <p className="text-sm font-semibold text-pov-text mb-1">Before you write in…</p>
          <p className="text-sm text-pov-muted leading-relaxed">
            Most setup questions are answered in the{' '}
            <Link to="/setup" className="text-pov-accent hover:underline">
              Setup Guide
            </Link>
            , including OBS settings, platform-specific streaming steps, and how sync offsets work.
          </p>
        </div>
      </div>

      {/* Response time note */}
      <div className="glass-panel rounded-xl px-5 py-4 text-sm text-pov-muted leading-relaxed">
        <p>
          <span className="text-pov-text font-medium">Response times:</span> POVSync is a small
          indie project. We aim to respond to issues within a few days but cannot guarantee SLAs.
          Critical security issues will be prioritised.
        </p>
      </div>

      {/* Footer nav */}
      <div className="flex gap-4 pt-6 mt-6 border-t border-pov-border/40">
        <Link to="/terms" className="text-xs text-pov-muted hover:text-pov-accent transition-colors">
          Terms of Service →
        </Link>
        <Link to="/privacy" className="text-xs text-pov-muted hover:text-pov-accent transition-colors">
          Privacy Policy →
        </Link>
      </div>
    </div>
  );
}
