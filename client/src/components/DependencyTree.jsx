// ──────────────────────────────────────────────
// DependencyTree — Recursive crafting tree with
// expand/collapse, guide lines, quantity input,
// and scaled computedRequired display.
// ──────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import MinecraftIcon from "./MinecraftIcon.jsx";
import { api } from "../api";

/**
 * Format item name for display:
 * "diamond_sword" → "Diamond Sword"
 */
function formatName(name) {
  return (name || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Recursive Tree Node ──────────────────────────
function TreeNode({ node, depth = 0, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!node) return null;

  const hasChildren = node.children && node.children.length > 0;
  const isRaw = node.raw && !hasChildren;

  return (
    <div className="dep-tree-branch">
      {/* Node row */}
      <div
        className={`dep-tree-node depth-${Math.min(depth, 4)}`}
        onClick={() => hasChildren && setExpanded((e) => !e)}
        style={{ cursor: hasChildren ? "pointer" : "default" }}
      >
        {/* Expand/collapse toggle */}
        <span className="dep-tree-toggle">
          {hasChildren ? (expanded ? "▼" : "▶") : "─"}
        </span>

        {/* Item icon */}
        <MinecraftIcon name={node.name} size={20} />

        {/* Name + scaled quantity */}
        <span className="dep-tree-name">{formatName(node.name)}</span>
        <span className="dep-tree-qty">×{node.computedRequired || node.quantity || 1}</span>

        {/* Badge */}
        {isRaw && (
          <span className="badge badge-raw dep-tree-badge">🪨 Raw</span>
        )}
        {!isRaw && hasChildren && (
          <span className="badge badge-pending dep-tree-badge">⚒ Crafted</span>
        )}
      </div>

      {/* Children (recursive) */}
      {hasChildren && expanded && (
        <div className="dep-tree-children">
          {node.children.map((child, i) => (
            <TreeNode
              key={`${child.name}-${i}`}
              node={child}
              depth={depth + 1}
              defaultExpanded={depth < 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main DependencyTree ──────────────────────────
export default function DependencyTree({ finalItem }) {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);

  const fetchTree = useCallback(() => {
    if (!finalItem) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const qty = Math.max(1, Math.floor(quantity));
    fetch(api(`/api/recipes/tree?item=${encodeURIComponent(finalItem)}&qty=${qty}`))
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && json.data) {
          setTree(json.data);
        } else {
          setTree(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load recipe tree.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [finalItem, quantity]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  if (!finalItem) return null;

  return (
    <div className="dep-tree">
      <div className="dep-tree-header">
        <div className="section-title">Crafting Tree</div>
        <div className="dep-tree-qty-control">
          <label className="dep-tree-qty-label">Quantity:</label>
          <button
            className="dep-tree-qty-btn"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
          >
            −
          </button>
          <input
            type="number"
            className="dep-tree-qty-input"
            value={quantity}
            min={1}
            max={999}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v > 0 && v <= 999) setQuantity(v);
            }}
          />
          <button
            className="dep-tree-qty-btn"
            onClick={() => setQuantity((q) => Math.min(999, q + 1))}
          >
            +
          </button>
        </div>
      </div>

      {loading ? (
        <div className="dep-tree-loading">Loading recipe tree…</div>
      ) : error || !tree ? null : (
        <div className="dep-tree-root">
          <TreeNode node={tree} depth={0} defaultExpanded={true} />
        </div>
      )}
    </div>
  );
}
