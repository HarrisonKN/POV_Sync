export default function InfoPill({ label, value }) {
  return (
    <div className="rounded-xl border border-pov-border/60 bg-pov-bg/60 px-3 py-2 min-w-0">
      <p className="text-[9px] font-mono uppercase tracking-wider text-pov-muted">{label}</p>
      <p className="text-xs sm:text-sm font-medium text-pov-text truncate mt-0.5">{value}</p>
    </div>
  );
}
