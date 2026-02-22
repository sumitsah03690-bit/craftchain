// ──────────────────────────────────────────────
// Toast — Minimal auto-dismiss notification.
// Pure CSS animation, no external libraries.
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
      <div className="toast">{message}</div>
    </div>
  );
}
