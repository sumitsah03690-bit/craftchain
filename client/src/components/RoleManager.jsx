// ──────────────────────────────────────────────
// RoleManager — Member role management panel
// Shows each member with a color-coded role badge.
// Owner can reassign roles via dropdown.
// ──────────────────────────────────────────────

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import MinecraftIcon from "./MinecraftIcon.jsx";

const ROLE_CONFIG = {
  owner:   { label: "👑 Owner",   className: "role-owner" },
  miner:   { label: "⛏ Miner",   className: "role-miner" },
  builder: { label: "🧱 Builder", className: "role-builder" },
  planner: { label: "📋 Planner", className: "role-planner" },
  member:  { label: "👤 Member",  className: "role-member" },
};

const ASSIGNABLE_ROLES = ["member", "miner", "builder", "planner"];

export default function RoleManager({ projectId, memberRoles = [], isOwner, onRoleChanged }) {
  const { authFetch } = useAuth();
  const [updating, setUpdating] = useState(null); // userId being updated

  const handleRoleChange = async (userId, newRole) => {
    setUpdating(userId);
    try {
      const res = await authFetch(`/api/projects/${projectId}/members/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json();
      if (json.success && onRoleChanged) {
        onRoleChanged(json.data.members);
      }
    } catch {
      // silently fail
    } finally {
      setUpdating(null);
    }
  };

  if (!memberRoles.length) return null;

  return (
    <div className="role-manager">
      <div className="section-title">Team Roles</div>
      <div className="role-member-list">
        {memberRoles.map((m) => {
          const cfg = ROLE_CONFIG[m.role] || ROLE_CONFIG.member;
          return (
            <div key={m.userId} className="role-member-row">
              <div className="role-member-info">
                <div className="role-avatar">
                  {m.username ? m.username[0].toUpperCase() : "?"}
                </div>
                <span className="role-member-name">{m.username}</span>
              </div>

              {isOwner && m.role !== "owner" ? (
                <select
                  className="role-select"
                  value={m.role}
                  disabled={updating === m.userId}
                  onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_CONFIG[r]?.label || r}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`role-badge ${cfg.className}`}>
                  {cfg.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
