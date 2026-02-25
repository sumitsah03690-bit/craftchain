// ──────────────────────────────────────────────
// Toast — Minecraft achievement-style notification
// with "[Achievement Get!]" pixel-font header.
// ──────────────────────────────────────────────

import { useEffect } from "react";

export default function Toast({ message, visible, onDone, duration = 3000 }) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => onDone && onDone(), duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onDone]);

  if (!visible) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      <div className="toast">
        <div className="toast-header">★ Achievement Get! ★</div>
        {message}
      </div>
    </div>
  );
}
