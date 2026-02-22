// ──────────────────────────────────────────────
// Sidebar — Discord-style left navigation
// ──────────────────────────────────────────────

import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { useEffect, useState } from "react";
import MinecraftIcon from "./MinecraftIcon.jsx";

export default function Sidebar() {
  const { user, logout, authFetch } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);

  // Fetch project list for sidebar
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/projects?limit=20");
        const json = await res.json();
        if (!cancelled && json.success) {
          setProjects(json.data || []);
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

        {/* ── Projects list ──────────────────── */}
        <div className="sidebar-section-label">Projects</div>
        <div className="sidebar-projects-list">
          {projects.length === 0 && (
            <div style={{ padding: "4px 10px", fontSize: 12, color: "var(--text-muted)" }}>
              No projects yet
            </div>
          )}
          {projects.map((p) => (
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
      </nav>

      {/* ── Footer ────────────────────────────── */}
      <div className="sidebar-footer">
        {user && (
          <div className="sidebar-user-info">
            <div className="sidebar-avatar">
              {user.username ? user.username[0] : "?"}
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
