// ──────────────────────────────────────────────
// ProgressBar — Reusable progress bar component
// with optional XP-style variant (Minecraft feel)
// ──────────────────────────────────────────────

export default function ProgressBar({
  percent = 0,
  height = 8,
  showLabel = false,
  variant = "default",
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const isXP = variant === "xp";
  const isHigh = clamped >= 75;

  if (isXP) {
    return (
      <div>
        <div
          className={`progress-bar-track xp-bar${isHigh ? " xp-high" : ""}`}
          style={{ height }}
        >
          <div
            className="progress-bar-fill xp-fill"
            style={{ width: `${clamped}%` }}
          />
        </div>
        {showLabel && (
          <div className="xp-bar-label">{clamped.toFixed(1)}%</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="progress-bar-track" style={{ height }}>
        <div
          className="progress-bar-fill"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <div className="progress-bar-label">{clamped.toFixed(1)}% complete</div>
      )}
    </div>
  );
}
