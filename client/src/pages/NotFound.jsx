import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      {/* Decorative background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-pov-accent/5 blur-3xl" />
      </div>

      <div className="relative text-center max-w-md w-full">
        {/* Glass card */}
        <div className="glass-panel rounded-2xl px-8 py-12">
          {/* Large 404 */}
          <p className="text-8xl font-bold font-mono text-pov-accent/30 leading-none select-none mb-2">
            404
          </p>

          {/* Divider */}
          <div className="w-12 h-px bg-pov-border mx-auto my-6" />

          {/* Heading */}
          <h1 className="text-xl font-bold font-mono text-pov-text mb-3">
            Page not found
          </h1>

          {/* Message */}
          <p className="text-sm text-pov-muted leading-relaxed mb-8">
            The page you're looking for doesn't exist or may have been moved.
            Double-check the URL, or head back to the home page.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/"
              className="bg-pov-accent hover:bg-pov-accent/80 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors w-full sm:w-auto text-center"
            >
              ← Back to Home
            </Link>
            <Link
              to="/setup"
              className="border border-pov-border hover:border-pov-muted text-pov-muted hover:text-pov-text rounded-lg px-6 py-2.5 text-sm transition-colors w-full sm:w-auto text-center"
            >
              Setup Guide
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
