// ──────────────────────────────────────────────
// Dashboard Page — Search for a Minecraft item,
// auto-resolve its recipe, and create a project.
// ──────────────────────────────────────────────

import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import { api } from "../api";
import MinecraftIcon from "../components/MinecraftIcon.jsx";
import ProgressBar from "../components/ProgressBar.jsx";

export default function Dashboard() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Search + Create state ─────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [resolvedItems, setResolvedItems] = useState([]);
  const [resolving, setResolving] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [createError, setCreateError] = useState(null);
  const [creating, setCreating] = useState(false);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  // ── Fetch projects ────────────────────────────
  const fetchProjects = useCallback(async () => {
    try {
      const res = await authFetch("/api/projects?limit=50");
      const json = await res.json();
      if (json.success) {
        setProjects(json.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // ── Search autocomplete (debounced) ───────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          api(`/api/recipes/search?q=${encodeURIComponent(searchQuery)}`)
        );
        const json = await res.json();
        if (json.success) {
          setSuggestions(json.data || []);
          setShowSuggestions(true);
        }
      } catch {
        // ignore
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // ── Select item from suggestions → resolve recipe ─
  const handleSelectItem = async (item) => {
    setSelectedItem(item);
    setSearchQuery(item.displayName || item.name);
    setProjectName(formatItemName(item.name) + " Build");
    setShowSuggestions(false);
    setSuggestions([]);
    setResolvedItems([]);
    setCreateError(null);

    if (!item.hasRecipe) {
      setCreateError(
        "This item has no crafting recipe. You can still create a project and add items manually."
      );
      return;
    }

    // Resolve recipe from backend
    setResolving(true);
    try {
      const res = await fetch(
        api(`/api/recipes/lookup?item=${encodeURIComponent(item.name)}`)
      );
      const json = await res.json();
      if (json.success && json.data.items?.length > 0) {
        setResolvedItems(json.data.items);
      } else {
        setCreateError(
          json.data?.message || "No recipe found. Add items manually."
        );
      }
    } catch {
      setCreateError("Failed to look up recipe.");
    } finally {
      setResolving(false);
    }
  };

  // ── Create project with resolved items ────────
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!selectedItem) return;
    setCreateError(null);
    setCreating(true);

    try {
      const items =
        resolvedItems.length > 0
          ? resolvedItems.map((i) => ({
              name: i.name,
              quantityRequired: i.quantityRequired,
              dependencies: i.dependencies || [],
            }))
          : [];

      const res = await authFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: projectName || formatItemName(selectedItem.name) + " Build",
          finalItem: selectedItem.name,
          items,
        }),
      });

      const json = await res.json();

      if (json.success) {
        // Navigate to the new project
        const newId = json.data._id || json.data.id;
        if (newId) {
          navigate(`/projects/${newId}`);
        } else {
          resetCreate();
          fetchProjects();
        }
      } else {
        setCreateError(json.message || "Failed to create project.");
      }
    } catch {
      setCreateError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const resetCreate = () => {
    setShowCreate(false);
    setSearchQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedItem(null);
    setResolvedItems([]);
    setResolving(false);
    setProjectName("");
    setCreateError(null);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div>
      {/* ── Header ──────────────────────────────── */}
      <div className="dashboard-header">
        <h1>⛏ Dashboard</h1>
        <p>Search for any Minecraft item to start a crafting project.</p>
      </div>

      {/* ── Create Project ──────────────────────── */}
      <div className="create-project-section">
        {!showCreate ? (
          <button
            className="btn btn-primary"
            onClick={() => setShowCreate(true)}
          >
            + New Project
          </button>
        ) : (
          <div className="create-project-form">
            {/* ── Search Bar ──────────────────── */}
            <div className="search-container" ref={searchRef}>
              <div className="input-group">
                <label className="input-label">
                  🔍 Search Minecraft Item
                </label>
                <input
                  type="text"
                  className="input-field search-input"
                  placeholder="Type an item name... e.g. diamond pickaxe"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedItem(null);
                    setResolvedItems([]);
                    setCreateError(null);
                  }}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  autoFocus
                />
              </div>

              {/* ── Autocomplete Dropdown ──────── */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="search-dropdown">
                  {suggestions.map((s) => (
                    <div
                      key={s.id}
                      className="search-dropdown-item"
                      onClick={() => handleSelectItem(s)}
                    >
                      <MinecraftIcon name={s.name} size={24} />
                      <div className="search-dropdown-info">
                        <span className="search-dropdown-name">
                          {s.displayName || formatItemName(s.name)}
                        </span>
                        {s.hasRecipe ? (
                          <span className="search-dropdown-tag craftable">
                            Craftable
                          </span>
                        ) : (
                          <span className="search-dropdown-tag raw">
                            Raw / No Recipe
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Resolved Recipe Preview ──────── */}
            {resolving && (
              <div className="recipe-preview">
                <div className="loading-container">
                  <div className="spinner" />
                  <span style={{ marginLeft: 8 }}>
                    Looking up recipe...
                  </span>
                </div>
              </div>
            )}

            {selectedItem && resolvedItems.length > 0 && (
              <div className="recipe-preview">
                <div className="recipe-header">
                  <MinecraftIcon name={selectedItem.name} size={36} />
                  <div>
                    <div className="recipe-title">
                      {selectedItem.displayName || formatItemName(selectedItem.name)}
                    </div>
                    <div className="recipe-subtitle">
                      {resolvedItems.length} materials needed
                    </div>
                  </div>
                </div>
                <div className="recipe-items-grid">
                  {resolvedItems.map((item, i) => (
                    <div key={i} className="recipe-item-chip">
                      <MinecraftIcon name={item.name} size={20} />
                      <span className="recipe-item-name">
                        {formatItemName(item.name)}
                      </span>
                      <span className="recipe-item-qty">
                        ×{item.quantityRequired}
                      </span>
                      {item.raw && (
                        <span className="recipe-item-raw">RAW</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Project name + submit */}
                <form onSubmit={handleCreate}>
                  <div className="input-group" style={{ marginTop: 16 }}>
                    <label className="input-label">Project Name</label>
                    <input
                      type="text"
                      className="input-field"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      required
                    />
                  </div>
                  {createError && (
                    <div className="auth-error">{createError}</div>
                  )}
                  <div className="create-form-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={resetCreate}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={creating}
                    >
                      {creating
                        ? "Creating..."
                        : `⛏ Create Project (${resolvedItems.length} items)`}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Error without resolved items */}
            {createError && resolvedItems.length === 0 && !resolving && (
              <div className="auth-error" style={{ marginTop: 12 }}>
                {createError}
              </div>
            )}

            {/* Cancel button when nothing resolved yet */}
            {!selectedItem && !resolving && (
              <div className="create-form-actions" style={{ marginTop: 12 }}>
                <button
                  className="btn btn-secondary"
                  onClick={resetCreate}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Project Grid ────────────────────────── */}
      {loading ? (
        <div className="loading-container">
          <div className="spinner" />
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏗</div>
          <div className="empty-state-title">No Projects Yet</div>
          <div className="empty-state-text">
            Search for a Minecraft item above to auto-generate your first
            crafting project!
          </div>
        </div>
      ) : (
        <div className="dashboard-grid">
          {projects.map((p) => (
            <div
              key={p._id}
              className="card card-clickable project-card"
              onClick={() => navigate(`/projects/${p._id}`)}
            >
              <div className="project-card-header">
                <MinecraftIcon name={p.finalItem} size={40} />
                <div className="project-card-info">
                  <div className="project-card-name">{p.name}</div>
                  <div className="project-card-item">
                    Final: {formatItemName(p.finalItem)}
                  </div>
                </div>
              </div>
              <div className="project-card-progress">
                <ProgressBar percent={p.progressPercent || 0} height={6} />
                <span className="project-card-percent">
                  {(p.progressPercent || 0).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────
function formatItemName(name) {
  return (name || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
