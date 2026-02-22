// ──────────────────────────────────────────────
// ProgressBar — Reusable progress bar component
// ──────────────────────────────────────────────

export default function ProgressBar({
  percent = 0,
  height = 8,
  showLabel = false,
}) {
  const clamped = Math.min(100, Math.max(0, percent));

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
