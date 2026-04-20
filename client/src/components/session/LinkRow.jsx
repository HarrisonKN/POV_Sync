import { useState, useRef } from 'react';

export default function LinkRow({ label, url }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <span className="text-[10px] sm:text-xs font-mono text-pov-muted w-16 sm:w-24 flex-shrink-0">{label}</span>
      <code className="text-[10px] sm:text-xs text-pov-text bg-pov-bg border border-pov-border rounded px-2 sm:px-3 py-1.5 flex-1 truncate min-w-0">
        {url}
      </code>
      <button
        onClick={handleCopy}
        className={`text-[10px] sm:text-xs font-mono border rounded px-2 sm:px-3 py-1.5 transition-all flex-shrink-0 ${
          copied
            ? 'border-pov-success/50 text-pov-success bg-pov-success/10'
            : 'border-pov-border text-pov-muted hover:text-pov-text hover:border-pov-muted'
        }`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
