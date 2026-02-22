// ──────────────────────────────────────────────
// ServerListPage — List of user's servers with
// create/join functionality.
// ──────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import JoinByCodeModal from "../components/JoinByCodeModal.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";

export default function ServerListPage() {
  const { authFetch, user } = useAuth();
  const navigate = useNavigate();

  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Join modal
  const [showJoin, setShowJoin] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState("");

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchServers = useCallback(async () => {
    try {
      const res = await authFetch("/api/servers");
      const json = await res.json();
      if (json.success) {
        setServers(json.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createName.trim() || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await authFetch("/api/servers", {
        method: "POST",
        body: JSON.stringify({ name: createName.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setShowCreate(false);
        setCreateName("");
        setCreateError("");
        fetchServers();
      } else {
        setCreateError(json.message || "Failed to create server.");
      }
    } catch {
      setCreateError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (code) => {
    setJoinLoading(true);
    setJoinError("");
    try {
      const res = await authFetch("/api/servers/join-by-code", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (json.success) {
        setShowJoin(false);
        fetchServers();
      } else {
        setJoinError(json.message || "Failed to join.");
      }
    } catch {
      setJoinError("Network error.");
    } finally {
      setJoinLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/servers/${deleteTarget._id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        setDeleteTarget(null);
        fetchServers();
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="server-list-page">
      <div className="server-list-header">
        <h1>⛏ Your Servers</h1>
        <div className="server-list-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowCreate(true);
              setCreateError("");
            }}
          >
            + Create Server
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowJoin(true)}
          >
            🔗 Join by Code
          </button>
        </div>
      </div>

      {servers.length === 0 ? (
        <div className="empty-state">
          <p>No servers yet. Create one or join with a code!</p>
        </div>
      ) : (
        <div className="server-cards-grid">
          {servers.map((s) => (
            <div
              key={s._id}
              className="server-card"
              onClick={() => navigate(`/servers/${s._id}`)}
            >
              <div className="server-card-icon">
                {s.name ? s.name[0].toUpperCase() : "S"}
              </div>
              <div className="server-card-info">
                <h3>{s.name}</h3>
                <div className="server-card-meta">
                  <span>📁 {s.projectCount} projects</span>
                  <span>👥 {s.memberCount} members</span>
                </div>
                <div className="server-card-code">
                  Code: <code>{s.joinCode}</code>
                </div>
              </div>
              {user && s.owner === user.id && (
                <button
                  className="server-card-delete"
                  title="Delete server"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(s);
                  }}
                >
                  🗑
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Server Modal */}
      {showCreate && (
        <div
          className="confirm-modal-overlay"
          onClick={(e) => {
            if (e.target.className === "confirm-modal-overlay")
              setShowCreate(false);
          }}
        >
          <div className="confirm-modal-box">
            <h3 className="confirm-modal-title">Create a Server</h3>
            <form onSubmit={handleCreate}>
              <input
                type="text"
                className="join-code-input"
                placeholder="Server name..."
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                maxLength={50}
                autoFocus
              />
              {createError && (
                <div className="auth-error" style={{ marginTop: 8, marginBottom: 4 }}>
                  {createError}
                </div>
              )}
              <div className="confirm-modal-actions">
                <button
                  type="button"
                  className="confirm-modal-btn confirm-modal-cancel"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="confirm-modal-btn confirm-modal-confirm"
                  disabled={!createName.trim() || creating}
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join by Code Modal */}
      <JoinByCodeModal
        open={showJoin}
        onClose={() => {
          setShowJoin(false);
          setJoinError("");
        }}
        onJoin={handleJoin}
        title="Join a Server"
        placeholder="Enter server invite code..."
        loading={joinLoading}
        error={joinError}
      />

      {/* Delete Confirmation */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Server?"
        message={`This will permanently delete "${deleteTarget?.name}" and ALL its projects. This cannot be undone.`}
        confirmText={deleting ? "Deleting..." : "Delete Forever"}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
