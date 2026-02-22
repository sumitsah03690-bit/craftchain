// ──────────────────────────────────────────────
// AccountPage — Private account page for the
// logged-in user. Shows username, email, join
// date, and a change password form.
// ──────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";

export default function AccountPage() {
  const { authFetch, user: currentUser } = useAuth();

  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Change password state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState({ type: "", text: "" });

  const fetchAccount = useCallback(async () => {
    try {
      const res = await authFetch("/api/users/me/account");
      const json = await res.json();
      if (json.success) {
        setAccount(json.data);
      } else {
        setError(json.message || "Failed to load account.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwMsg({ type: "", text: "" });

    if (newPw.length < 6) {
      setPwMsg({ type: "error", text: "New password must be at least 6 characters." });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: "error", text: "Passwords do not match." });
      return;
    }

    setPwLoading(true);
    try {
      const res = await authFetch("/api/users/me/password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: currentPw,
          newPassword: newPw,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setPwMsg({ type: "success", text: "Password changed successfully!" });
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
      } else {
        setPwMsg({ type: "error", text: json.message || "Failed to change password." });
      }
    } catch {
      setPwMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setPwLoading(false);
    }
  };

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
        <div className="empty-state"><p>{error}</p></div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <div className="account-page">
        <h1>⚙ Account Settings</h1>

        {/* Account Info Card */}
        <div className="account-card">
          <div className="account-header">
            <div className="profile-avatar-large">
              {account.username ? account.username[0].toUpperCase() : "?"}
            </div>
            <div>
              <h2>{account.username}</h2>
              <p className="account-email">{account.email}</p>
            </div>
          </div>
          <div className="profile-meta">
            <div className="profile-meta-item">
              <span className="profile-meta-label">Joined</span>
              <span className="profile-meta-value">
                {new Date(account.createdAt).toLocaleDateString("en-US", {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="account-card">
          <h3>🔒 Change Password</h3>
          <form onSubmit={handleChangePassword} className="password-form">
            <div className="input-group">
              <label className="input-label">Current Password</label>
              <input
                type="password"
                className="input-field"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="input-group">
              <label className="input-label">New Password</label>
              <input
                type="password"
                className="input-field"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div className="input-group">
              <label className="input-label">Confirm New Password</label>
              <input
                type="password"
                className="input-field"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            {pwMsg.text && (
              <div className={pwMsg.type === "success" ? "auth-success" : "auth-error"}>
                {pwMsg.text}
              </div>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={pwLoading || !currentPw || !newPw || !confirmPw}
            >
              {pwLoading ? "Changing..." : "Change Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
