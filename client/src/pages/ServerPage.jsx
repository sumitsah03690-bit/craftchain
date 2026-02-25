// ──────────────────────────────────────────────
// ServerPage — Server detail view with projects,
// member list with self-assignable Minecraft roles,
// Discord link, and server-wide activity feed.
// ──────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { api } from "../api";
import ProgressBar from "../components/ProgressBar.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import JoinByCodeModal from "../components/JoinByCodeModal.jsx";
import MinecraftIcon from "../components/MinecraftIcon.jsx";

const MC_ROLES = [
  { value: "member", label: "Member", icon: "👤" },
  { value: "miner", label: "Miner", icon: "⛏" },
  { value: "builder", label: "Builder", icon: "🏗️" },
  { value: "farmer", label: "Farmer", icon: "🌾" },
  { value: "nether_specialist", label: "Nether Specialist", icon: "🔥" },
  { value: "redstoner", label: "Redstoner", icon: "🔴" },
  { value: "enchanter", label: "Enchanter", icon: "✨" },
];

const ROLE_ICON_MAP = {};
for (const r of MC_ROLES) ROLE_ICON_MAP[r.value] = r.icon;

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

export default function ServerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, authFetch } = useAuth();

  const [server, setServer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create project modal
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectItem, setProjectItem] = useState("");
  const [projectTargetQty, setProjectTargetQty] = useState(1);
  const [creatingProject, setCreatingProject] = useState(false);
  const [createProjectError, setCreateProjectError] = useState("");

  // Delete modal
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Activity feed
  const [activity, setActivity] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Discord link editing
  const [editingDiscord, setEditingDiscord] = useState(false);
  const [discordInput, setDiscordInput] = useState("");

  const fetchServer = useCallback(async () => {
    try {
      const res = await authFetch(`/api/servers/${id}`);
      const json = await res.json();
      if (json.success) {
        setServer(json.data);
        setDiscordInput(json.data.discordLink || "");
      } else {
        setError(json.message || "Failed to load server.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [id, authFetch]);

  const fetchActivity = useCallback(async () => {
    setLoadingActivity(true);
    try {
      const res = await authFetch(`/api/servers/${id}/activity`);
      const json = await res.json();
      if (json.success) setActivity(json.data || []);
    } catch {
      // ignore
    } finally {
      setLoadingActivity(false);
    }
  }, [id, authFetch]);

  useEffect(() => {
    fetchServer();
    fetchActivity();
  }, [fetchServer, fetchActivity]);

  // Create project handler
  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!projectName.trim() || !projectItem.trim()) {
      setCreateProjectError("Name and item are required.");
      return;
    }
    setCreatingProject(true);
    setCreateProjectError("");
    try {
      const qty = Math.max(1, Math.floor(projectTargetQty));
      const res = await authFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: projectName.trim(),
          finalItem: projectItem.trim(),
          serverId: id,
          autoFillFromMinecraft: true,
          items: [{ name: projectItem.trim(), quantityRequired: 1 * qty }],
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowCreateProject(false);
        setProjectName("");
        setProjectItem("");
        setProjectTargetQty(1);
        setCreateProjectError("");
        navigate(`/projects/${json.data._id}`);
      } else {
        setCreateProjectError(json.message || "Failed.");
      }
    } catch {
      setCreateProjectError("Network error.");
    } finally {
      setCreatingProject(false);
    }
  };

  // Delete server handler
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await authFetch(`/api/servers/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) navigate("/servers");
    } catch {
      // ignore
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  };

  // Self-assign MC role
  const handleRoleChange = async (role) => {
    try {
      await authFetch(`/api/servers/${id}/my-role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      fetchServer(); // reload to show updated roles
    } catch {
      // ignore
    }
  };

  // Save Discord link
  const handleSaveDiscord = async () => {
    try {
      await authFetch(`/api/servers/${id}/discord-link`, {
        method: "PATCH",
        body: JSON.stringify({ discordLink: discordInput }),
      });
      setEditingDiscord(false);
      fetchServer();
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="main-content">
        <div className="loading-container"><div className="spinner" /></div>
      </div>
    );
  }

  if (error || !server) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <div className="empty-state-icon">❌</div>
          <div className="empty-state-title">{error || "Not found"}</div>
        </div>
      </div>
    );
  }

  const isOwner = server.callerRole === "owner";
  const myMcRole = (server.membersList || []).find(
    (m) => m._id === user?._id || m._id === user?.id
  )?.mcRole || "member";

  return (
    <div className="main-content">
      {/* ── Header ──────────────────────────────── */}
      <div className="server-page-header">
        <div>
          <div className="server-page-title-row">
            <div className="server-card-icon large">
              {server.name ? server.name[0].toUpperCase() : "S"}
            </div>
            <div>
              <h1>{server.name}</h1>
              <div className="server-page-meta">
                <span>👥 {(server.membersList || []).length} members</span>
                <span>📁 {(server.projects || []).length} projects</span>
                <span>Code: <code>{server.joinCode}</code></span>
              </div>
            </div>
          </div>
        </div>
        <div className="server-page-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowCreateProject(true)}
          >
            + New Project
          </button>
          {isOwner && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setShowDelete(true)}
            >
              🗑 Delete
            </button>
          )}
        </div>
      </div>

      {/* ── Discord Link ────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        {server.discordLink && !editingDiscord ? (
          <a
            href={server.discordLink}
            target="_blank"
            rel="noopener noreferrer"
            className="server-discord-link"
          >
            💬 Discord: {server.discordLink.length > 40 ? server.discordLink.slice(0, 40) + "..." : server.discordLink}
          </a>
        ) : null}
        {isOwner && (
          <span style={{ marginLeft: 8 }}>
            {editingDiscord ? (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="text"
                  className="join-code-input"
                  style={{ maxWidth: 260, fontSize: 13, textAlign: "left", letterSpacing: 0 }}
                  placeholder="https://discord.gg/..."
                  value={discordInput}
                  onChange={(e) => setDiscordInput(e.target.value)}
                />
                <button className="btn btn-primary btn-sm" onClick={handleSaveDiscord}>Save</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingDiscord(false)}>Cancel</button>
              </span>
            ) : (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setEditingDiscord(true)}
              >
                {server.discordLink ? "✏️ Edit" : "💬 Add Discord Link"}
              </button>
            )}
          </span>
        )}
      </div>

      {/* ── Projects ────────────────────────────── */}
      <div className="section-heading">Projects</div>
      {(server.projects || []).length === 0 ? (
        <div className="empty-state" style={{ padding: "32px 24px" }}>
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-text">No projects yet. Create one above!</div>
        </div>
      ) : (
        <div className="project-cards-grid">
          {(server.projects || []).map((p) => (
            <div
              key={p._id}
              className="card project-card card-clickable"
              onClick={() => navigate(`/projects/${p._id}`)}
            >
              <div className="project-card-header">
                <MinecraftIcon name={p.finalItem} size={36} />
                <div className="project-card-info">
                  <div className="project-card-name">{p.name}</div>
                  <div className="project-card-item">{p.finalItem}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Members with Role Picker ─────────────── */}
      <div className="server-members-section">
        <div className="section-heading">Members & Roles</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(server.membersList || []).map((m) => {
            const isMe = m._id === user?._id || m._id === user?.id;
            return (
              <div key={m._id} className="server-member-row">
                <div className="server-member-info">
                  <div className="server-member-avatar">
                    {m.username ? m.username[0].toUpperCase() : "?"}
                  </div>
                  <span className="server-member-name">
                    {m.username}
                    {m.role === "owner" && <span className="owner-crown"> 👑</span>}
                  </span>
                  <span className={`role-badge role-${m.role}`}>{m.role}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className={`role-badge role-${m.mcRole || "member"}`}>
                    {ROLE_ICON_MAP[m.mcRole] || "👤"} {(MC_ROLES.find((r) => r.value === m.mcRole) || MC_ROLES[0]).label}
                  </span>
                  {isMe && (
                    <select
                      className="role-select"
                      value={myMcRole}
                      onChange={(e) => handleRoleChange(e.target.value)}
                      title="Choose your Minecraft role"
                    >
                      {MC_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.icon} {r.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Server Activity Feed ────────────────── */}
      <div className="server-activity-section">
        <div className="section-heading">Server Activity</div>
        {loadingActivity ? (
          <div className="loading-container"><div className="spinner" /></div>
        ) : activity.length === 0 ? (
          <div className="server-activity-empty">No activity yet — create a project and start contributing!</div>
        ) : (
          <div className="server-activity-list">
            {activity.map((ev, i) => {
              const typeClass = `type-${ev.type || "create"}`;
              return (
                <div key={i} className="activity-item">
                  <div className={`activity-avatar ${typeClass}`}>
                    {ev.type === "contribution" ? "📦" : ev.type === "join" ? "👋" : ev.type === "item_completed" ? "✅" : "⚡"}
                  </div>
                  <div className="activity-body">
                    <div className="activity-message">
                      <strong style={{ color: "var(--mc-diamond)", fontSize: 11 }}>[{ev.projectName}]</strong>{" "}
                      {ev.message}
                    </div>
                    <div className="activity-time">{formatTime(ev.timestamp)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create Project Modal ─────────────────── */}
      <ConfirmModal
        open={showCreateProject}
        title="Create Project"
        message=""
        confirmText={creatingProject ? "Creating..." : "Create"}
        onConfirm={handleCreateProject}
        onCancel={() => {
          setShowCreateProject(false);
          setCreateProjectError("");
        }}
      >
        <form onSubmit={handleCreateProject}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="text"
              className="join-code-input"
              placeholder="Project name..."
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              maxLength={50}
            />
            <input
              type="text"
              className="join-code-input"
              placeholder="Final item (e.g. diamond_sword)..."
              value={projectItem}
              onChange={(e) => setProjectItem(e.target.value)}
              maxLength={50}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: "0.9rem", color: "#ccc", whiteSpace: "nowrap" }}>Target Qty:</label>
              <input
                type="number"
                className="join-code-input"
                min={1}
                max={999}
                value={projectTargetQty}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v > 0 && v <= 999) setProjectTargetQty(v);
                  else if (e.target.value === "") setProjectTargetQty(1);
                }}
                style={{ maxWidth: 80 }}
              />
            </div>
            {createProjectError && (
              <div className="auth-error" style={{ marginTop: 0 }}>
                {createProjectError}
              </div>
            )}
          </div>
        </form>
      </ConfirmModal>

      {/* ── Delete Server Modal ──────────────────── */}
      <ConfirmModal
        open={showDelete}
        title="Delete Server?"
        message={`This will permanently delete "${server.name}" and all its projects. This cannot be undone.`}
        confirmText={deleting ? "Deleting..." : "Delete Forever"}
        danger
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}
