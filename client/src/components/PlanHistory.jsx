// ──────────────────────────────────────────────
// PlanHistory — Crafting plan version timeline
// Shows version history with restore capability
// for the project owner.
// ──────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";

export default function PlanHistory({ projectId, currentVersion, isOwner, onRestore }) {
  const { authFetch } = useAuth();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [restoring, setRestoring] = useState(null);

  useEffect(() => {
    if (!expanded || !projectId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await authFetch(`/api/projects/${projectId}/plan-history`);
        const json = await res.json();
        if (!cancelled && json.success) {
          setVersions(json.data || []);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [expanded, projectId, authFetch, currentVersion]);

  const handleRestore = async (version) => {
    if (!window.confirm(`Restore plan to v${version}? Current progress will be saved as a snapshot.`)) return;
    setRestoring(version);
    try {
      const res = await authFetch(`/api/projects/${projectId}/restore-plan/${version}`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success && onRestore) {
        onRestore(json.data);
      }
    } catch {
      // ignore
    } finally {
      setRestoring(null);
    }
  };

  const formatDate = (d) => {
    if (!d) return "";
    const date = new Date(d);
    return date.toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="plan-history">
      <div
        className="plan-history-header"
        onClick={() => setExpanded((e) => !e)}
        style={{ cursor: "pointer" }}
      >
        <div className="section-title">
          {expanded ? "▼" : "▶"} Plan History
          <span className="plan-history-version-badge">v{currentVersion || 1}</span>
        </div>
      </div>

      {expanded && (
        <div className="plan-history-body">
          {loading ? (
            <div className="plan-history-loading">Loading versions…</div>
          ) : versions.length === 0 ? (
            <div className="plan-history-empty">
              No previous versions — this is the original plan.
            </div>
          ) : (
            <div className="plan-history-timeline">
              {/* Current version */}
              <div className="plan-version-item plan-version-current">
                <div className="plan-version-dot current" />
                <div className="plan-version-info">
                  <span className="plan-version-label">
                    v{currentVersion || 1} — Current
                  </span>
                </div>
              </div>

              {/* Historical versions (newest first) */}
              {[...versions].reverse().map((v) => (
                <div key={v.version} className="plan-version-item">
                  <div className="plan-version-dot" />
                  <div className="plan-version-info">
                    <span className="plan-version-label">{v.label || `v${v.version}`}</span>
                    <span className="plan-version-meta">
                      {v.itemCount} items · {formatDate(v.createdAt)}
                    </span>
                  </div>
                  {isOwner && (
                    <button
                      className="plan-version-restore-btn"
                      onClick={() => handleRestore(v.version)}
                      disabled={restoring === v.version}
                    >
                      {restoring === v.version ? "…" : "Restore"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
