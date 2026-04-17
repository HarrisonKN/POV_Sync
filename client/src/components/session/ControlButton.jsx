export default function ControlButton({ label, disabled = false, onClick, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="text-[10px] sm:text-xs font-mono bg-pov-bg border border-pov-border rounded px-3 py-2 sm:py-2 text-pov-text hover:border-pov-muted active:bg-pov-accent/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-[36px]"
    >
      {label}
    </button>
  );
}
