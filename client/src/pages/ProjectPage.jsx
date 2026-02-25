// ──────────────────────────────────────────────
// ProjectPage — Full project detail view with
// items grid, dependency tree, activity feed,
// bottleneck highlights, contribution modal,
// optimistic updates, stats strip, demo mode,
// and robust error handling.
// ──────────────────────────────────────────────

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../contexts/AuthContext.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import ProjectHeader from "../components/ProjectHeader.jsx";
import ItemCard from "../components/ItemCard.jsx";
import ContributionModal from "../components/ContributionModal.jsx";
import ActivityFeed from "../components/ActivityFeed.jsx";
import DependencyTree from "../components/DependencyTree.jsx";
import MinecraftIcon from "../components/MinecraftIcon.jsx";
import Toast from "../components/Toast.jsx";
import RoleManager from "../components/RoleManager.jsx";
import SuggestedTasks from "../components/SuggestedTasks.jsx";
import PlanHistory from "../components/PlanHistory.jsx";
import demoData from "../data/demoProject.json";

export default function ProjectPage() {
  const { id } = useParams();
  const { user, authFetch } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [progress, setProgress] = useState(null);
  const [bottlenecks, setBottlenecks] = useState([]);
  const [contributionSummary, setContributionSummary] = useState([]);
  const [memberRoles, setMemberRoles] = useState([]);
  const [suggestedTasks, setSuggestedTasks] = useState([]);
  const [currentPlanVersion, setCurrentPlanVersion] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [networkError, setNetworkError] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Contribution modal state
  const [modalItem, setModalItem] = useState(null);

  // Reload key to force ActivityFeed refresh
  const [reloadKey, setReloadKey] = useState(0);

  // Optimistic update — snapshot for rollback
  const prevProjectRef = useRef(null);

  // Toast state
  const [toast, setToast] = useState({ visible: false, message: "" });

  // Track which item IDs just transitioned to completed
  const [justCompletedIds, setJustCompletedIds] = useState(new Set());

  // ── Quantity state (single source of truth) ──
  const [quantity, setQuantity] = useState(1);
  // Track the "base" multiplier that was used to create the project's items
  // so we can compute per-1 recipe amounts for re-scaling.
  const [savedQuantity, setSavedQuantity] = useState(1);
  const [showQtyConfirm, setShowQtyConfirm] = useState(false);
  const [savingQty, setSavingQty] = useState(false);

  // ── Delete project state ────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch project data ──────────────────────
  const fetchProject = useCallback(async () => {
    try {
      const res = await authFetch(`/api/projects/${id}`);

      if (res.status === 404 || res.status === 403) {
        const json = await res.json();
        setError(json.message || "Project not found or access denied.");
        setProject(null);
        return;
      }

      const json = await res.json();

      if (json.success) {
        setProject(json.data);
        setProgress(json.progress);
        setBottlenecks(json.bottlenecks || []);
        setContributionSummary(json.contributionSummary || []);
        setMemberRoles(json.memberRoles || []);
        setSuggestedTasks(json.suggestedTasks || []);
        setCurrentPlanVersion(json.currentPlanVersion || 1);
        setError(null);
        setNetworkError(false);
        setIsDemoMode(false);
      } else {
        setError(json.message || "Failed to load project.");
      }
    } catch {
      // ── Backend unreachable → Demo Safety Mode ──
      if (!project) {
        setProject(demoData.data);
        setProgress(demoData.progress);
        setBottlenecks(demoData.bottlenecks || []);
        setIsDemoMode(true);
        setError(null);
      }
      setNetworkError(true);
    } finally {
      setLoading(false);
    }
  }, [id, project, authFetch]);

  useEffect(() => {
    fetchProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Optimistic update handler ───────────────
  const handleOptimisticUpdate = useCallback(
    ({ itemName, quantity }) => {
      if (!project) return;

      // Store snapshot for rollback
      prevProjectRef.current = JSON.parse(JSON.stringify(project));

      // Optimistically update the item
      setProject((prev) => {
        if (!prev) return prev;
        const updatedItems = prev.items.map((item) => {
          if (item.name.toLowerCase().trim() === itemName.toLowerCase().trim()) {
            return {
              ...item,
              quantityCollected: Math.min(
                (item.quantityCollected || 0) + quantity,
                item.quantityRequired
              ),
            };
          }
          return item;
        });
        return { ...prev, items: updatedItems };
      });
    },
    [project]
  );

  // ── Rollback handler ────────────────────────
  const handleRollback = useCallback(() => {
    if (prevProjectRef.current) {
      setProject(prevProjectRef.current);
      prevProjectRef.current = null;
    }
  }, []);

  // ── Contribution success handler ────────────
  const handleContributeSuccess = useCallback(
    (serverResponse) => {
      prevProjectRef.current = null;

      // Use server data as source of truth
      if (serverResponse?.data) {
        const newProject = serverResponse.data;

        // Detect completion transitions
        if (project?.items && newProject.items) {
          const newlyCompletedIds = new Set();
          for (const newItem of newProject.items) {
            const oldItem = project.items.find(
              (o) =>
                (o._id || o.name) === (newItem._id || newItem.name)
            );
            if (
              oldItem &&
              oldItem.status !== "completed" &&
              newItem.status === "completed"
            ) {
              newlyCompletedIds.add(newItem._id || newItem.name);
              // Show toast for first completed item
              setToast({
                visible: true,
                message: `✨ ${newItem.name} Completed!`,
              });
            }
          }

          if (newlyCompletedIds.size > 0) {
            setJustCompletedIds(newlyCompletedIds);
            // Clear glow after animation
            setTimeout(() => setJustCompletedIds(new Set()), 400);
          }
        }

        setProject(newProject);
      }

      if (serverResponse?.progress) {
        setProgress(serverResponse.progress);
      }

      // Refresh activity feed
      setReloadKey((k) => k + 1);

      // Refresh full project to get updated bottlenecks
      fetchProject();
    },
    [project, fetchProject]
  );

  // ── Build bottleneck maps ───────────────────
  const bottleneckNames = new Set(
    bottlenecks.map((b) => b.name.toLowerCase().trim())
  );
  const bottleneckMap = {};
  for (const b of bottlenecks) {
    bottleneckMap[b.name.toLowerCase().trim()] = b;
  }

  // ── Compute stats from project items ────────
  const items = project?.items || [];

  // Scale quantityRequired by the crafting-tree quantity.
  // We derive base (per-1) amounts from the saved quantity.
  const scaledItems = useMemo(
    () =>
      items.map((item) => {
        const base = savedQuantity > 0 ? Math.round((item.quantityRequired || 0) / savedQuantity) : (item.quantityRequired || 0);
        return {
          ...item,
          quantityRequired: Math.max(1, base * quantity),
        };
      }),
    [items, quantity, savedQuantity]
  );

  const quantityChanged = quantity !== savedQuantity;

  // ── Apply quantity change handler ────────────
  const handleApplyQuantity = useCallback(async () => {
    if (!project || savingQty) return;
    setSavingQty(true);
    try {
      const newItems = items.map((item) => {
        const base = savedQuantity > 0 ? Math.round((item.quantityRequired || 0) / savedQuantity) : (item.quantityRequired || 0);
        return {
          name: item.name,
          quantityRequired: Math.max(1, base * quantity),
          dependencies: item.dependencies || [],
        };
      });
      const res = await authFetch(`/api/projects/${id}`, {
        method: "PUT",
        body: JSON.stringify({ items: newItems }),
      });
      const json = await res.json();
      if (json.success) {
        setSavedQuantity(quantity);
        setToast({ visible: true, message: `✅ Quantities updated to ×${quantity}` });
        fetchProject();
      } else {
        setToast({ visible: true, message: json.message || "Failed to update quantities." });
      }
    } catch {
      setToast({ visible: true, message: "Network error. Could not update quantities." });
    } finally {
      setSavingQty(false);
      setShowQtyConfirm(false);
    }
  }, [project, items, quantity, savedQuantity, id, authFetch, savingQty, fetchProject]);

  const totalItems = items.length;
  const completedCount = items.filter((i) => i.status === "completed").length;
  const blockedCount = items.filter((i) => i.status === "blocked").length;
  const pendingCount = items.filter(
    (i) => i.status === "pending"
  ).length;
  const overallPercent =
    totalItems > 0 ? ((completedCount / totalItems) * 100).toFixed(1) : "0.0";

  // ── Loading state ───────────────────────────
  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  // ── Project not found ───────────────────────
  if (error && !project) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🔍</div>
        <div className="empty-state-title">
          {error === "Project not found." ? "Project Not Found" : "Error"}
        </div>
        <div className="empty-state-text">
          {error === "Project not found."
            ? "This project doesn't exist or may have been deleted."
            : error}
        </div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="project-layout">
      {/* ── Network Error Banner ──────────────── */}
      {networkError && !isDemoMode && (
        <div className="network-error-banner" role="alert">
          ⚠ Network error. Please retry.
        </div>
      )}

      {/* ── Demo Mode Banner ─────────────────── */}
      {isDemoMode && (
        <div className="demo-banner" role="status">
          ⚠ Demo Mode — Backend Not Connected
        </div>
      )}

      {/* ── Main Content ─────────────────────── */}
      <div className="project-main">
        <ProjectHeader project={project} progress={progress} />

        {/* ── Project Info Bar ─────────────────── */}
        <div className="project-info-bar">
          {project.joinCode && (
            <span className="project-join-code">
              Join Code: <code>{project.joinCode}</code>
            </span>
          )}
          {user && project.createdBy && String(project.createdBy) === String(user.id) && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
            >
              🗑 Delete Project
            </button>
          )}
        </div>

        {/* ── Stats Strip ─────────────────────── */}
        <div className="stats-strip" aria-label="Project statistics">
          <div className="stat-item">
            <span className="stat-value">{totalItems}</span>
            <span className="stat-label">Total</span>
          </div>
          <div className="stat-item stat-completed">
            <span className="stat-value">{completedCount}</span>
            <span className="stat-label">Completed</span>
          </div>
          <div className="stat-item stat-blocked">
            <span className="stat-value">{blockedCount}</span>
            <span className="stat-label">Blocked</span>
          </div>
          <div className="stat-item stat-pending">
            <span className="stat-value">{pendingCount}</span>
            <span className="stat-label">Pending</span>
          </div>
          <div className="stat-item stat-percent">
            <span className="stat-value">{overallPercent}%</span>
            <span className="stat-label">Complete</span>
          </div>
          <div className="stats-message">
            {blockedCount > 0
              ? "⚠ Resolve bottlenecks to unlock progress."
              : "✓ All dependencies satisfied. Keep building."}
          </div>
        </div>

        {/* Suggested Tasks */}
        <SuggestedTasks
          tasks={suggestedTasks}
          onContribute={(itemName) => {
            const item = items.find(
              (i) => i.name.toLowerCase().trim() === itemName.toLowerCase().trim()
            );
            if (item) setModalItem(item);
          }}
        />

        {/* Items Grid */}
        <div className="section-title">Items Required{quantity > 1 ? ` (×${quantity})` : ""}</div>
        <div className="items-grid">
          {scaledItems.map((item) => {
            const key = item._id || item.name;
            const normName = item.name.toLowerCase().trim();
            return (
              <ItemCard
                key={key}
                item={item}
                isBottleneck={bottleneckNames.has(normName)}
                bottleneckInfo={bottleneckMap[normName] || null}
                justCompleted={justCompletedIds.has(key)}
                onContribute={(i) => setModalItem(i)}
              />
            );
          })}
        </div>

        {/* Dependency Tree */}
        <DependencyTree
          finalItem={project.finalItem}
          quantity={quantity}
          onQuantityChange={setQuantity}
        />

        {/* Apply Quantity Button */}
        {quantityChanged && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 16 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowQtyConfirm(true)}
              disabled={savingQty}
            >
              {savingQty ? "Saving..." : `💾 Apply ×${quantity} to Items`}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setQuantity(savedQuantity)}
              disabled={savingQty}
            >
              Cancel
            </button>
            <span style={{ fontSize: "0.82rem", color: "#ffaa00" }}>
              ⚠ Applying will reset all contributions to 0
            </span>
          </div>
        )}

        {/* Plan History */}
        <PlanHistory
          projectId={id}
          currentVersion={currentPlanVersion}
          isOwner={user && project.createdBy && String(project.createdBy) === String(user.id)}
          onRestore={(updatedProject) => {
            setProject(updatedProject);
            fetchProject();
          }}
        />
      </div>

      {/* ── Right Sidebar ────────────────────── */}
      <div className="project-right">
        {/* Role Manager */}
        <RoleManager
          projectId={id}
          memberRoles={memberRoles}
          isOwner={user && project.createdBy && String(project.createdBy) === String(user.id)}
          onRoleChanged={(updatedMembers) => {
            // Refresh member roles from updated members data
            fetchProject();
          }}
        />

        <ActivityFeed key={reloadKey} projectId={id} />

        {/* Team Contributions */}
        <div className="team-contrib-panel">
          <div className="activity-panel-title">👥 Team Contributions</div>
          {contributionSummary.length === 0 ? (
            <div className="team-contrib-empty">No contributions yet.</div>
          ) : (
            contributionSummary.map((m) => (
              <div key={m.userId} className="team-contrib-item">
                <div className="team-contrib-header">
                  <span className="team-contrib-name">{m.username}</span>
                  <span className="team-contrib-stat">
                    {m.totalContributed} · {m.percent}%
                  </span>
                </div>
                <div className="team-contrib-bar-bg">
                  <div
                    className="team-contrib-bar-fill"
                    style={{ width: `${m.percent}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bottleneck Highlights */}
        {bottlenecks.length > 0 && (
          <div className="bottleneck-panel">
            <div className="activity-panel-title">⚠ Bottlenecks</div>
            {bottlenecks.map((b) => (
              <div key={b.name} className="bottleneck-item">
                <div className="bottleneck-icon">
                  <MinecraftIcon name={b.name} size={24} />
                </div>
                <div className="bottleneck-info">
                  <div className="bottleneck-name">{b.name}</div>
                  <div className="bottleneck-detail">
                    Blocks {b.blockingCount} item{b.blockingCount !== 1 ? "s" : ""}
                    {" · "}
                    {b.remaining} remaining
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Contribution Modal ───────────────── */}
      {modalItem && (
        <ContributionModal
          item={modalItem}
          projectId={id}
          onClose={() => setModalItem(null)}
          onOptimisticUpdate={handleOptimisticUpdate}
          onRollback={handleRollback}
          onSuccess={handleContributeSuccess}
        />
      )}

      {/* ── Toast ────────────────────────────── */}
      <Toast
        message={toast.message}
        visible={toast.visible}
        onDone={() => setToast({ visible: false, message: "" })}
      />

      {/* ── Quantity Change Confirmation ────────── */}
      <ConfirmModal
        open={showQtyConfirm}
        title={`Apply ×${quantity} Quantity?`}
        message={`This will update all item quantities to ×${quantity} and reset all contributions to 0. This cannot be undone.`}
        confirmText={savingQty ? "Saving..." : "Apply Changes"}
        danger
        onConfirm={handleApplyQuantity}
        onCancel={() => setShowQtyConfirm(false)}
      />

      {/* ── Delete Project Confirmation ────────── */}
      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete Project?"
        message={`This will permanently delete "${project.name}" and all its data (items, contributions, history). This cannot be undone.`}
        confirmText={deleting ? "Deleting..." : "Delete Forever"}
        danger
        onConfirm={async () => {
          setDeleting(true);
          try {
            const res = await authFetch(`/api/projects/${id}`, { method: "DELETE" });
            const json = await res.json();
            if (json.success) {
              navigate("/dashboard");
            }
          } catch {
            // ignore
          } finally {
            setDeleting(false);
            setShowDeleteConfirm(false);
          }
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
