export default function FollowButton({ isFollowing, busy = false, onClick, compact = false }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-lg border font-mono transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        isFollowing
          ? 'border-pov-border bg-pov-bg text-pov-text hover:border-pov-muted'
          : 'border-pov-accent/30 bg-pov-accent text-white hover:bg-pov-accent/90'
      } ${compact ? 'px-2.5 py-1.5 text-[10px] sm:text-xs' : 'px-3.5 py-2 text-xs sm:text-sm'}`}
    >
      {busy ? 'Saving…' : isFollowing ? 'Following' : 'Follow'}
    </button>
  );
}