import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { label: 'Terms',   to: '/terms'   },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Contact', to: '/contact' },
  { label: 'Setup Guide', to: '/setup' },
];

// Session-immersion pages — footer is hidden here
const HIDDEN_PREFIXES = ['/session/', '/watch/'];

export default function Footer() {
  const { pathname } = useLocation();
  const isHidden = HIDDEN_PREFIXES.some(p => pathname.startsWith(p));
  if (isHidden) return null;

  return (
    <footer className="border-t border-pov-border/40 bg-pov-bg/60 backdrop-blur-sm mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Brand + copyright */}
        <p className="text-xs text-pov-muted/70 font-mono order-2 sm:order-1">
          © {new Date().getFullYear()}{' '}
          <Link to="/" className="hover:text-pov-accent transition-colors">
            POVSync
          </Link>
          . All rights reserved.
        </p>

        {/* Nav links */}
        <nav className="flex items-center gap-4 order-1 sm:order-2" aria-label="Footer navigation">
          {LINKS.map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              className="text-xs text-pov-muted hover:text-pov-text transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
