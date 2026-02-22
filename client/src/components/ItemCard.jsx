// ──────────────────────────────────────────────
// ItemCard — Displays a single Minecraft item
// with status, progress, and contribute button.
//
// Enhanced with:
// - Smart disable logic (blocked tooltip, completed badge)
// - Bottleneck highlight (red border + ⚠ badge)
// - Completion glow animation
// - Hover elevation
// - aria-labels
// ──────────────────────────────────────────────

import MinecraftIcon from "./MinecraftIcon.jsx";

export default function ItemCard({
  item,
  isBottleneck = false,
  bottleneckInfo = null,
  onContribute,
  justCompleted = false,
}) {
  const { name, quantityCollected, quantityRequired, status, raw, dependencies } = item;
  const isCompleted = status === "completed";
  const isBlocked = status === "blocked";
  const isRawMaterial = raw === true || ((!dependencies || dependencies.length === 0) && raw !== false);
  const noRecipeDefined = !raw && (!dependencies || dependencies.length === 0);

  // Build className list
  const classes = [
    "item-card",
    `status-${status}`,
    isBottleneck ? "is-bottleneck" : "",
    justCompleted ? "item-card-just-completed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Tooltip for bottleneck
  const bottleneckTooltip =
    isBottleneck && bottleneckInfo
      ? `Completing this unlocks ${bottleneckInfo.blockingCount} item${bottleneckInfo.blockingCount !== 1 ? "s" : ""}.`
      : "";

  return (
    <div
      className={classes}
      title={bottleneckTooltip || undefined}
      aria-label={`Item: ${name}, status: ${status}, ${quantityCollected || 0} of ${quantityRequired} collected`}
    >
      <div className="item-card-icon">
        <MinecraftIcon name={name} size={32} />
      </div>
      <div className="item-card-body">
        <div className="item-card-top">
          <span className="item-card-name">{name}</span>
          <div className="item-card-badges">
            {isBottleneck && (
              <span className="badge badge-bottleneck" aria-label="Bottleneck item">
                ⚠ Bottleneck
              </span>
            )}
            {isCompleted && (
              <span className="badge badge-completed" aria-label="Completed">
                ✓ Completed
              </span>
            )}
            {status === "pending" && (
              <span className="badge badge-pending">Pending</span>
            )}
            {isBlocked && (
              <span className="badge badge-blocked" aria-label="Blocked">
                🔒 Blocked
              </span>
            )}
            {isRawMaterial && !isCompleted && (
              <span className="badge badge-raw" aria-label="Raw Material">
                🪨 Raw Material
              </span>
            )}
            {noRecipeDefined && !isRawMaterial && !isCompleted && (
              <span className="badge badge-pending" aria-label="No recipe">
                No recipe defined.
              </span>
            )}
          </div>
        </div>
        <div className="item-card-quantity">
          <strong>{quantityCollected || 0}</strong> / {quantityRequired}
        </div>
        <div className="item-card-actions">
          {/* Hide button entirely when completed */}
          {!isCompleted && (
            <button
              className="btn btn-primary btn-sm"
              disabled={isBlocked}
              onClick={() => onContribute && onContribute(item)}
              title={
                isBlocked
                  ? "This item is blocked by unfinished dependencies."
                  : `Contribute to ${name}`
              }
              aria-label={
                isBlocked
                  ? `Cannot contribute to ${name} — blocked by unfinished dependencies`
                  : `Contribute to ${name}`
              }
            >
              {isBlocked ? "🔒 Blocked" : "⛏ Contribute"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
