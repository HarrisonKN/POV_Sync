/**
 * Full-page error state component.
 *
 * Props:
 *  - icon:    short text or character shown large (default '!')
 *  - title:   bold heading
 *  - message: explanatory text
 *  - helper: optional short next-step hint
 *  - action:  { label: string, onClick: fn } optional CTA button
 *  - secondary: { label: string, to: string } optional react-router Link
 */
import { Link } from 'react-router-dom';

export default function ErrorState({
  icon = '!',
  title = 'Something went wrong',
  message,
  helper,
  action,
  secondary,
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4 select-none">{icon}</div>
        <h1 className="text-xl font-bold font-mono mb-2">{title}</h1>
        {message && (
          <p className="text-sm text-pov-muted mb-8 leading-relaxed">{message}</p>
        )}
        {helper && (
          <p className="text-xs text-pov-muted/70 mb-6 leading-relaxed bg-pov-surface border border-pov-border rounded-lg px-4 py-3 text-left">
            {helper}
          </p>
        )}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {action && (
            <button
              onClick={action.onClick}
              className="bg-pov-accent hover:bg-pov-accent/80 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors w-full sm:w-auto"
            >
              {action.label}
            </button>
          )}
          {secondary && (
            <Link
              to={secondary.to}
              className="border border-pov-border hover:border-pov-muted text-pov-muted hover:text-pov-text rounded-lg px-6 py-2.5 text-sm transition-colors w-full sm:w-auto text-center"
            >
              {secondary.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
