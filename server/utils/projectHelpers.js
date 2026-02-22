// /server/utils/projectHelpers.js
// ──────────────────────────────────────────────
// PURE helper functions for project-level
// computations.  These NEVER mutate their input.
// They clone data and return fresh objects.
//
// Kept separate so route handlers stay concise
// and the logic is easy to unit-test.
// ──────────────────────────────────────────────

// ─────────────────────────────────────────────────
// Internal utility: deep-clone a project's items
// so we never mutate the original document.
// Works for both Mongoose docs and lean objects.
// ─────────────────────────────────────────────────
function _cloneItems(items) {
  return (items || []).map((item) => {
    // If it's a Mongoose subdoc, convert to plain object first
    const plain = typeof item.toObject === "function" ? item.toObject() : { ...item };
    return {
      ...plain,
      // Ensure dependencies is always an array (defensive)
      dependencies: Array.isArray(plain.dependencies) ? [...plain.dependencies] : [],
    };
  });
}

// ═══════════════════════════════════════════════
// 1) computeItemStatuses(project)  — PURE
// ═══════════════════════════════════════════════
//
// Returns a CLONED project with updated item.status fields.
// Does NOT mutate the input.
//
// Status rules:
//   COMPLETED → quantityCollected >= quantityRequired
//   BLOCKED   → not completed AND at least one dependency
//               item is incomplete (case-insensitive match).
//               If a dependency name doesn't exist in the
//               project at all → treated as unmet → blocked.
//   PENDING   → not completed AND all dependencies met
//
function computeItemStatuses(project) {
  const clonedItems = _cloneItems(project.items);

  // Step 1: build a Set of completed item names (lowercase)
  const completedSet = new Set();
  for (const item of clonedItems) {
    if ((item.quantityCollected || 0) >= (item.quantityRequired || 0)) {
      completedSet.add(item.name.toLowerCase().trim());
    }
  }

  // Step 2: assign statuses
  for (const item of clonedItems) {
    const collected = item.quantityCollected || 0;
    const required = item.quantityRequired || 0;

    if (collected >= required) {
      item.status = "completed";
    } else if (
      item.dependencies.length > 0 &&
      item.dependencies.some(
        (dep) => !completedSet.has(dep.toLowerCase().trim())
      )
    ) {
      // At least one dependency is not complete (or doesn't exist) → blocked
      item.status = "blocked";
    } else {
      item.status = "pending";
    }
  }

  // Return a shallow clone of the project with the new items array.
  // If it's a Mongoose doc, convert to plain object first.
  const base =
    typeof project.toObject === "function"
      ? project.toObject()
      : { ...project };

  return { ...base, items: clonedItems };
}

// ═══════════════════════════════════════════════
// 2) computeProgress(project)  — PURE
// ═══════════════════════════════════════════════
//
// Returns:
// {
//   totalRequired,   – sum of all quantityRequired
//   totalCollected,  – sum of min(quantityCollected, quantityRequired)
//   percent          – 0–100, rounded to 1 decimal
// }
//
// Capping collected at required prevents over-
// counting if quantityCollected somehow exceeds
// quantityRequired.
//
function computeProgress(project) {
  const items = project.items || [];

  let totalRequired = 0;
  let totalCollected = 0;

  for (const item of items) {
    const req = item.quantityRequired || 0;
    const col = item.quantityCollected || 0;
    totalRequired += req;
    // Cap collected at required so we never exceed 100%
    totalCollected += Math.min(col, req);
  }

  const percent =
    totalRequired > 0
      ? Math.round((totalCollected / totalRequired) * 1000) / 10
      : 0;

  return { totalRequired, totalCollected, percent };
}

// ═══════════════════════════════════════════════
// 3) detectBottlenecks(project, topN=3)  — PURE
// ═══════════════════════════════════════════════
//
// A "bottleneck" is an INCOMPLETE item that blocks
// the most other items.  If item A appears in the
// dependencies list of items B and C, then A has
// blockingCount = 2.
//
// We only consider incomplete items (completed
// items don't block anything anymore).
//
// Returns an array (up to topN) sorted by:
//   1) blockingCount  (descending)
//   2) remaining      (descending — tie-breaker)
//
// Each entry: { name, blockingCount, remaining }
//
function detectBottlenecks(project, topN = 3) {
  const items = project.items || [];

  // Build a map: lowercase item name → how many other items depend on it
  const dependedOnBy = new Map();

  for (const item of items) {
    for (const dep of item.dependencies || []) {
      const key = dep.toLowerCase().trim();
      dependedOnBy.set(key, (dependedOnBy.get(key) || 0) + 1);
    }
  }

  // Collect incomplete items with their blocking count
  const candidates = [];

  for (const item of items) {
    const collected = item.quantityCollected || 0;
    const required = item.quantityRequired || 0;

    // Skip completed items — they don't block anything
    if (collected >= required) continue;

    const key = item.name.toLowerCase().trim();
    const blockingCount = dependedOnBy.get(key) || 0;
    const remaining = required - collected;

    candidates.push({
      name: item.name,
      blockingCount,
      remaining,
    });
  }

  // Sort: highest blockingCount first, then highest remaining
  candidates.sort((a, b) => {
    if (b.blockingCount !== a.blockingCount) {
      return b.blockingCount - a.blockingCount;
    }
    return b.remaining - a.remaining;
  });

  return candidates.slice(0, topN);
}

// ═══════════════════════════════════════════════
// 4) computeProjectState(project)  — PURE
// ═══════════════════════════════════════════════
//
// Convenience orchestrator that computes everything
// a route handler typically needs in one call.
//
// Returns:
// {
//   projectWithStatuses,  – cloned project with correct item statuses
//   progress,             – { totalRequired, totalCollected, percent }
//   bottlenecks           – top 3 bottleneck items
// }
//
function computeProjectState(project) {
  const projectWithStatuses = computeItemStatuses(project);
  const progress = computeProgress(projectWithStatuses);
  const bottlenecks = detectBottlenecks(projectWithStatuses);

  return { projectWithStatuses, progress, bottlenecks };
}

// ═══════════════════════════════════════════════
// 5) getUnmetDependencies(project, itemName)
// ═══════════════════════════════════════════════
//
// Given a project and an item name, returns an array
// of dependency names that are NOT yet completed.
// Returns [] if the item has no deps or all are met.
//
// Uses case-insensitive matching.  If a dependency
// name doesn't exist in the project → treated as unmet.
//
function getUnmetDependencies(project, itemName) {
  const items = project.items || [];
  const normalised = itemName.toLowerCase().trim();

  const target = items.find(
    (i) => i.name.toLowerCase().trim() === normalised
  );
  if (!target || !Array.isArray(target.dependencies) || target.dependencies.length === 0) {
    return [];
  }

  // Build completed set
  const completedSet = new Set();
  for (const item of items) {
    if ((item.quantityCollected || 0) >= (item.quantityRequired || 0)) {
      completedSet.add(item.name.toLowerCase().trim());
    }
  }

  return target.dependencies.filter(
    (dep) => !completedSet.has(dep.toLowerCase().trim())
  );
}

module.exports = {
  computeItemStatuses,
  computeProgress,
  detectBottlenecks,
  computeProjectState,
  getUnmetDependencies,
};
