// ──────────────────────────────────────────────
// ServerPage — Server detail view with projects,
// member management, and server info.
// ──────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import MinecraftIcon from "../components/MinecraftIcon.jsx";
import ProgressBar from "../components/ProgressBar.jsx";

export default function ServerPage() {
  const { id } = useParams();
  const { authFetch, user } = useAuth();
  const navigate = useNavigate();

  const [server, setServer] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Delete server modal
  const [showDeleteServer, setShowDeleteServer] = useState(false);
  const [deletingServer, setDeletingServer] = useState(false);

  // Create project modal
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectItem, setProjectItem] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [createProjectError, setCreateProjectError] = useState("");

  const fetchServer = useCallback(async () => {
    try {
      const res = await authFetch(`/api/servers/${id}`);
      const json = await res.json();
      if (json.success) {
        setServer(json.data);
        setProjects(json.data.projects || []);
      } else {
        setError(json.message || "Failed to load server.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [authFetch, id]);

  useEffect(() => {
    fetchServer();
  }, [fetchServer]);

  const handleDeleteServer = async () => {
    if (deletingServer) return;
    setDeletingServer(true);
    try {
      const res = await authFetch(`/api/servers/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        navigate("/servers");
      }
    } catch {
      // ignore
    } finally {
      setDeletingServer(false);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!projectName.trim() || !projectItem.trim() || creatingProject) return;
    setCreatingProject(true);
    setCreateProjectError("");
    try {
      const res = await authFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: projectName.trim(),
          finalItem: projectItem.trim(),
          serverId: id,
          autoFillFromMinecraft: true,
          items: [{ name: projectItem.trim(), quantityRequired: 1 }],
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowCreateProject(false);
        setProjectName("");
        setProjectItem("");
        setCreateProjectError("");
        navigate(`/projects/${json.data._id}`);
      } else {
        setCreateProjectError(json.message || "Failed to create project.");
      }
    } catch {
      setCreateProjectError("Network error. Please try again.");
    } finally {
      setCreatingProject(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate("/servers")}>
            ← Back to Servers
          </button>
        </div>
      </div>
    );
  }

  const isOwner = server?.callerRole === "owner";

  return (
    <div className="main-content server-page">
      {/* Server Header */}
      <div className="server-page-header">
        <div className="server-page-title-row">
          <div className="server-card-icon large">
            {server?.name ? server.name[0].toUpperCase() : "S"}
          </div>
          <div>
            <h1>{server?.name}</h1>
            <div className="server-page-meta">
              <span>Join Code: <code>{server?.joinCode}</code></span>
              <span>👥 {(server?.members || []).length} members</span>
              <span>Your role: <strong>{server?.callerRole}</strong></span>
            </div>
          </div>
        </div>
        <div className="server-page-actions">
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateProject(true)}
          >
            + New Project
          </button>
          {isOwner && (
            <button
              className="btn btn-danger"
              onClick={() => setShowDeleteServer(true)}
            >
              🗑 Delete Server
            </button>
          )}
        </div>
      </div>

      {/* Projects Grid */}
      <h2 className="section-heading">Projects</h2>
      {projects.length === 0 ? (
        <div className="empty-state">
          <p>No projects in this server yet. Create one to get started!</p>
        </div>
      ) : (
        <div className="project-cards-grid">
          {projects.map((p) => (
            <div
              key={p._id}
              className="project-card"
              onClick={() => navigate(`/projects/${p._id}`)}
            >
              <div className="project-card-header">
                <MinecraftIcon name={p.finalItem} size={28} />
                <h3>{p.name}</h3>
              </div>
              <div className="project-card-meta">
                <span>Final: {p.finalItem}</span>
                {p.joinCode && <span>Code: <code>{p.joinCode}</code></span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Members List */}
      <h2 className="section-heading" style={{ marginTop: "32px" }}>Members ({server?.membersList?.length || 0})</h2>
      {(!server?.membersList || server.membersList.length === 0) ? (
        <div className="empty-state"><p>No members found.</p></div>
      ) : (
        <div className="members-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "16px" }}>
          {server.membersList.map((m) => (
            <div
              key={m._id}
              className="card card-clickable"
              onClick={() => navigate(`/profile/${m._id}`)}
              style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px" }}
              title={`View ${m.username}'s profile`}
            >
              <div className="profile-avatar-small" style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: "#333", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", fontWeight: "bold" }}>
                {m.username[0].toUpperCase()}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{m.username}</span>
                <span style={{ fontSize: "0.85rem", color: m.role === "owner" ? "#ffaa00" : m.role === "moderator" ? "#55ffff" : "#aaa", textTransform: "capitalize" }}>
                  {m.role}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateProject && (
        <div
          className="confirm-modal-overlay"
          onClick={(e) => {
            if (e.target.className === "confirm-modal-overlay")
              setShowCreateProject(false);
          }}
        >
          <div className="confirm-modal-box">
            <h3 className="confirm-modal-title">Create Project in {server?.name}</h3>
            <form onSubmit={handleCreateProject}>
              <input
                type="text"
                className="join-code-input"
                placeholder="Project name..."
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                maxLength={50}
                autoFocus
                style={{ marginBottom: 8 }}
              />
              <input
                type="text"
                className="join-code-input"
                placeholder="Final item (e.g. diamond_sword)..."
                value={projectItem}
                onChange={(e) => setProjectItem(e.target.value)}
                maxLength={50}
              />
              {createProjectError && (
                <div className="auth-error" style={{ marginTop: 12, marginBottom: 8 }}>
                  {createProjectError}
                </div>
              )}
              <div className="confirm-modal-actions">
                <button
                  type="button"
                  className="confirm-modal-btn confirm-modal-cancel"
                  onClick={() => setShowCreateProject(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="confirm-modal-btn confirm-modal-confirm"
                  disabled={!projectName.trim() || !projectItem.trim() || creatingProject}
                >
                  {creatingProject ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Server Confirmation */}
      <ConfirmModal
        open={showDeleteServer}
        title="Delete Server?"
        message={`This will permanently delete "${server?.name}" and ALL ${projects.length} project(s). This cannot be undone.`}
        confirmText={deletingServer ? "Deleting..." : "Delete Forever"}
        danger
        onConfirm={handleDeleteServer}
        onCancel={() => setShowDeleteServer(false)}
      />
    </div>
  );
}
