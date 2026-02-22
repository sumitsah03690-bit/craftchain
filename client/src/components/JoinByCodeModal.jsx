// ──────────────────────────────────────────────
// JoinByCodeModal — Enter a join code to join
// a server or project.
// ──────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";

export default function JoinByCodeModal({
  open,
  onClose,
  onJoin,
  title = "Join by Code",
  placeholder = "Enter join code...",
  loading = false,
  error = "",
}) {
  const [code, setCode] = useState("");
  const inputRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (open) {
      setCode("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (code.trim()) {
      onJoin(code.trim());
    }
  };

  return (
    <div
      className="confirm-modal-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose?.();
      }}
    >
      <div className="confirm-modal-box">
        <h3 className="confirm-modal-title">{title}</h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="join-code-input"
            placeholder={placeholder}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={10}
            disabled={loading}
            autoComplete="off"
            spellCheck="false"
          />
          {error && <p className="join-code-error">{error}</p>}
          <div className="confirm-modal-actions">
            <button
              type="button"
              className="confirm-modal-btn confirm-modal-cancel"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="confirm-modal-btn confirm-modal-confirm"
              disabled={!code.trim() || loading}
            >
              {loading ? "Joining..." : "Join"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
