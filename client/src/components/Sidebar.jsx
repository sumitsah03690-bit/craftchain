// ──────────────────────────────────────────────
// Sidebar — Discord-style left navigation with
// server → project hierarchy.
// ──────────────────────────────────────────────

import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useEffect, useState } from "react";
import MinecraftIcon from "./MinecraftIcon.jsx";

export default function Sidebar() {
  const { user, logout, authFetch } = useAuth();
  const navigate = useNavigate();
  const [servers, setServers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [expandedServers, setExpandedServers] = useState({});

  // Fetch servers + projects for sidebar
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch servers
        const sRes = await authFetch("/api/servers");
        const sJson = await sRes.json();
        if (!cancelled && sJson.success) {
          setServers(sJson.data || []);
          // Auto-expand all servers initially
          const expanded = {};
          for (const s of sJson.data || []) {
            expanded[s._id] = true;
          }
          setExpandedServers(expanded);
        }

        // Fetch all user's projects
        const pRes = await authFetch("/api/projects?limit=50");
        const pJson = await pRes.json();
        if (!cancelled && pJson.success) {
          setProjects(pJson.data || []);
        }
      } catch {
        // silently ignore
      }
    })();
    return () => { cancelled = true; };
  }, [authFetch]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const toggleServer = (serverId) => {
    setExpandedServers((prev) => ({
      ...prev,
      [serverId]: !prev[serverId],
    }));
  };

  // Group projects by server
  const projectsByServer = {};
  const orphanProjects = [];
  for (const p of projects) {
    if (p.serverId) {
      if (!projectsByServer[p.serverId]) projectsByServer[p.serverId] = [];
      projectsByServer[p.serverId].push(p);
    } else {
      orphanProjects.push(p);
    }
  }

  return (
    <aside className="sidebar">
      {/* ── Logo ──────────────────────────────── */}
      <div className="sidebar-logo">
        <span className="sidebar-logo-icon">⛏</span>
        <span className="sidebar-logo-text">CraftChain</span>
      </div>

      {/* ── Navigation ────────────────────────── */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Navigate</div>
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? "active" : ""}`
          }
        >
          <span className="sidebar-link-icon">🏠</span>
          <span>Dashboard</span>
        </NavLink>
        <NavLink
          to="/servers"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? "active" : ""}`
          }
        >
          <span className="sidebar-link-icon">🌐</span>
          <span>Servers</span>
        </NavLink>

        {/* ── Server → Project hierarchy ────── */}
        {servers.length > 0 && (
          <>
            <div className="sidebar-section-label">Your Servers</div>
            <div className="sidebar-servers-list">
              {servers.map((s) => (
                <div key={s._id} className="sidebar-server-group">
                  <div
                    className="sidebar-server-header"
                    onClick={() => toggleServer(s._id)}
                  >
                    <span className="sidebar-server-chevron">
                      {expandedServers[s._id] ? "▾" : "▸"}
                    </span>
                    <span className="sidebar-server-icon">
                      {s.name ? s.name[0].toUpperCase() : "S"}
                    </span>
                    <span className="sidebar-server-name">{s.name}</span>
                  </div>
                  <div className={`sidebar-server-projects ${expandedServers[s._id] ? "expanded" : ""}`}>
                    {(projectsByServer[s._id] || []).map((p) => (
                      <NavLink
                        key={p._id}
                        to={`/projects/${p._id}`}
                        className={({ isActive }) =>
                          `sidebar-project-link ${isActive ? "active" : ""}`
                        }
                      >
                        <MinecraftIcon name={p.finalItem} size={18} />
                        <span className="sidebar-project-name">{p.name}</span>
                      </NavLink>
                    ))}
                    {(!projectsByServer[s._id] || projectsByServer[s._id].length === 0) && (
                      <div className="sidebar-empty-hint">No projects</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Ungrouped projects (legacy) ───── */}
        {orphanProjects.length > 0 && (
          <>
            <div className="sidebar-section-label">Projects</div>
            <div className="sidebar-projects-list">
              {orphanProjects.map((p) => (
                <NavLink
                  key={p._id}
                  to={`/projects/${p._id}`}
                  className={({ isActive }) =>
                    `sidebar-project-link ${isActive ? "active" : ""}`
                  }
                >
                  <MinecraftIcon name={p.finalItem} size={20} />
                  <span className="sidebar-project-name">{p.name}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}
      </nav>

      {/* ── Footer ────────────────────────────── */}
      <div className="sidebar-footer">
        {user && (
          <div 
            className="sidebar-user-info card-clickable" 
            onClick={() => navigate("/account")}
            style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", padding: "8px", borderRadius: "8px", flex: 1 }}
            title="View Account"
          >
            <div className="sidebar-avatar">
              {user.username ? user.username[0].toUpperCase() : "?"}
            </div>
            <span className="sidebar-username">{user.username}</span>
          </div>
        )}
        <button className="sidebar-logout-btn" onClick={handleLogout}>
          <span>⏻</span> <span>Log Out</span>
        </button>
      </div>
    </aside>
  );
}
