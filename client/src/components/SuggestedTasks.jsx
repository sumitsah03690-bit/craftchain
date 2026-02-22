// ──────────────────────────────────────────────
// SuggestedTasks — Role-based task suggestions
// Shows personalized task cards based on user's
// role in the project.
// ──────────────────────────────────────────────

import MinecraftIcon from "./MinecraftIcon.jsx";

function formatName(name) {
  return (name || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SuggestedTasks({ tasks = [], onContribute }) {
  if (!tasks.length) {
    return (
      <div className="suggested-tasks">
        <div className="section-title">Suggested Tasks</div>
        <div className="suggested-tasks-empty">
          ✅ No tasks to suggest — all items are on track!
        </div>
      </div>
    );
  }

  return (
    <div className="suggested-tasks">
      <div className="section-title">Suggested Tasks</div>
      <div className="suggested-tasks-list">
        {tasks.map((task, i) => (
          <div key={`${task.itemName}-${i}`} className="suggested-task-card">
            <div className="suggested-task-info">
              <MinecraftIcon name={task.itemName} size={22} />
              <div className="suggested-task-text">
                <span className="suggested-task-name">
                  {formatName(task.itemName)}
                </span>
                <span className="suggested-task-reason">{task.reason}</span>
              </div>
            </div>
            <div className="suggested-task-actions">
              <span className="suggested-task-remaining">
                ×{task.remaining}
              </span>
              {onContribute && (
                <button
                  className="suggested-task-btn"
                  onClick={() => onContribute(task.itemName)}
                  title="Contribute"
                >
                  +
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
