// ──────────────────────────────────────────────
// ActivityFeed — Discord-style event feed
// for project activity with neutral empty state.
// ──────────────────────────────────────────────

import { useEffect, useState } from "react";
import { api } from "../api";

/**
 * Returns a human-friendly relative time string.
 */
function relativeTime(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(dateStr).toLocaleDateString();
}

export default function ActivityFeed({ projectId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(api(`/api/projects/${projectId}/activity?limit=30`));
        const json = await res.json();
        if (!cancelled && json.success) {
          setEvents(json.data || []);
        }
      } catch {
        // ignore — handled at page level
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <div className="activity-panel" aria-label="Activity feed">
      <div className="activity-panel-title">Activity Feed</div>
      {loading ? (
        <div className="loading-container">
          <div className="spinner" />
        </div>
      ) : events.length === 0 ? (
        <div className="activity-empty-state">
          <div className="activity-empty-icon">📋</div>
          <div className="activity-empty-text">
            No activity yet. Contributions will appear here.
          </div>
        </div>
      ) : (
        <div className="activity-list">
          {events.map((evt, i) => (
            <div key={evt._id || i} className="activity-item">
              <div className={`activity-avatar type-${evt.type}`}>
                {evt.actor?.username ? evt.actor.username[0].toUpperCase() : "?"}
              </div>
              <div className="activity-body">
                <div className="activity-message">{evt.message}</div>
                <div className="activity-time">
                  {relativeTime(evt.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
