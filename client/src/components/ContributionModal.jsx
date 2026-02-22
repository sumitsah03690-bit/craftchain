// ──────────────────────────────────────────────
// ContributionModal — Modal for contributing
// items to a project. Handles optimistic updates,
// rollback, 409 unmet dependencies, success state.
// ──────────────────────────────────────────────

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import MinecraftIcon from "./MinecraftIcon.jsx";

export default function ContributionModal({
  item,
  projectId,
  onClose,
  onSuccess,
  onOptimisticUpdate,
  onRollback,
}) {
  const { authFetch } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unmetDeps, setUnmetDeps] = useState(null);
  const [success, setSuccess] = useState(false);

  if (!item) return null;

  const remaining = item.quantityRequired - (item.quantityCollected || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setUnmetDeps(null);

    const qty = Number(quantity);

    // ── Optimistic update: apply immediately ──
    if (onOptimisticUpdate) {
      onOptimisticUpdate({ itemName: item.name, quantity: qty });
    }

    try {
      const res = await authFetch(`/api/projects/${projectId}/contribute`, {
        method: "POST",
        body: JSON.stringify({
          itemName: item.name,
          quantity: qty,
        }),
      });

      const json = await res.json();

      if (json.success) {
        // ── Server confirmed — keep optimistic update ──
        setSuccess(true);
        setTimeout(() => {
          onSuccess && onSuccess(json);
          onClose();
        }, 800);
      } else if (json.unmetDependencies) {
        // ── 409: unmet dependencies — rollback ──
        if (onRollback) onRollback();
        setUnmetDeps(json.unmetDependencies);
      } else {
        // ── Other error — rollback ──
        if (onRollback) onRollback();
        setError(json.message || "Contribution failed.");
      }
    } catch {
      // ── Network error — rollback ──
      if (onRollback) onRollback();
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Contribute to ${item.name}`}
      >
        {/* ── Header ───────────────────────────── */}
        <div className="modal-header">
          <MinecraftIcon name={item.name} size={28} />
          <span className="modal-title">Contribute</span>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close contribution modal"
          >
            ✕
          </button>
        </div>

        {/* ── Body ─────────────────────────────── */}
        <div className="modal-body">
          {/* Item info */}
          <div className="modal-item-info">
            <MinecraftIcon name={item.name} size={40} />
            <div className="modal-item-details">
              <div className="modal-item-name">{item.name}</div>
              <div className="modal-item-progress">
                {item.quantityCollected || 0} / {item.quantityRequired}{" "}
                collected — {remaining} remaining
              </div>
            </div>
          </div>

          {/* Success state */}
          {success && (
            <div className="modal-success">
              ✓ Contribution successful!
            </div>
          )}

          {/* Unmet dependencies warning */}
          {unmetDeps && (
            <div className="modal-deps-warning">
              <div className="modal-deps-title">
                ⚠ Unmet Dependencies
              </div>
              <div className="modal-deps-message">
                You must complete these dependencies first.
              </div>
              <div className="modal-deps-list">
                {unmetDeps.map((dep) => (
                  <div key={dep} className="modal-dep-item">
                    <MinecraftIcon name={dep} size={16} />
                    <span>{dep}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && <div className="auth-error">{error}</div>}

          {/* Quantity input + submit */}
          {!success && (
            <form onSubmit={handleSubmit}>
              <div className="input-group" style={{ marginBottom: 16 }}>
                <label className="input-label" htmlFor="contribute-qty">
                  Quantity
                </label>
                <input
                  id="contribute-qty"
                  type="number"
                  className="input-field"
                  min={1}
                  max={remaining}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  aria-label={`Quantity to contribute (max ${remaining})`}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  disabled={loading}
                  aria-label="Cancel contribution"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || remaining <= 0}
                  aria-label={loading ? "Contributing..." : "Submit contribution"}
                >
                  {loading ? "Contributing..." : "⛏ Contribute"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
