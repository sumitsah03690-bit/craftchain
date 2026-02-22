// ──────────────────────────────────────────────
// ProfilePage — Public profile view for any user.
// Shows username, join date, project/server counts.
// No email or sensitive data exposed.
// ──────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";

export default function ProfilePage() {
  const { id } = useParams();
  const { authFetch, user: currentUser } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/users/${id}/profile`);
        const json = await res.json();
        if (!cancelled) {
          if (json.success) {
            setProfile(json.data);
          } else {
            setError(json.message || "Failed to load profile.");
          }
        }
      } catch {
        if (!cancelled) setError("Network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authFetch, id]);

  // If viewing own profile, redirect to account page
  useEffect(() => {
    if (currentUser && id === currentUser.id) {
      navigate("/account", { replace: true });
    }
  }, [currentUser, id, navigate]);

  if (loading) {
    return (
      <div className="main-content">
        <div className="loading-container"><div className="spinner" /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <div className="profile-page">
        <div className="profile-card">
          <div className="profile-avatar-large">
            {profile.username ? profile.username[0].toUpperCase() : "?"}
          </div>
          <h1 className="profile-username">{profile.username}</h1>
          <div className="profile-meta">
            <div className="profile-meta-item">
              <span className="profile-meta-label">Joined</span>
              <span className="profile-meta-value">
                {new Date(profile.createdAt).toLocaleDateString("en-US", {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </span>
            </div>
            <div className="profile-meta-item">
              <span className="profile-meta-label">Projects</span>
              <span className="profile-meta-value">{profile.projectCount}</span>
            </div>
            <div className="profile-meta-item">
              <span className="profile-meta-label">Servers</span>
              <span className="profile-meta-value">{profile.serverCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
