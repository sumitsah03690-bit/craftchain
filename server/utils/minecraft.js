// /server/utils/minecraft.js
// ──────────────────────────────────────────────────────────────────────
// CraftChain — Minecraft-Data Helper (Optional Auto-Fill)
// ──────────────────────────────────────────────────────────────────────
//
// PURPOSE
//   Wraps the `minecraft-data` NPM package so that CraftChain can
//   auto-populate a project's items list from a Minecraft final item.
//   Designed for a hackathon environment: defensive against missing
//   data, fast (simple caching), limited recursion, and produces
//   normalised, frontend/backend-friendly output.
//
// INSTALLATION
//   npm i minecraft-data          (in the server/ workspace)
//
// USAGE (inside POST /api/projects or similar)
//   const { initMinecraft, buildDependencyList } = require('../utils/minecraft');
//   await initMinecraft();                         // safe to call multiple times
//   const items = await buildDependencyList(finalItem, { depthLimit: 1 });
//   if (!items) { /* fallback: ask user to provide items manually */ }
//
// RECIPE SELECTION POLICY
//   When an item has multiple recipes, the helper picks:
//     1. The first recipe that has an `inShape` array (shaped crafting).
//     2. If none are shaped, the first recipe in the array.
//   This gives the most intuitive, grid-based recipe representation.
//
// PERFORMANCE NOTE
//   `minecraft-data` loads a lot of JSON in memory. Call initMinecraft()
//   once at server startup and let the in-memory cache handle repeated
//   buildDependencyList calls. The cache has a 5-minute TTL and a max
//   of 500 entries to bound memory usage.
//
// ──────────────────────────────────────────────────────────────────────

// ── State ────────────────────────────────────────────────────────────
let mcData = null;       // The minecraft-data instance (set by initMinecraft)
let disabled = true;     // true until initMinecraft succeeds
let initialised = false; // gate to make initMinecraft idempotent

// ── Cache ────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minutes
const CACHE_MAX_ENTRIES = 500;
const cache = new Map(); // key: "finalItem|depthLimit" → { data, timestamp }

// ── Smithing Table Recipes ──────────────────────────────────────────
// minecraft-data only indexes crafting-table recipes.
// Netherite gear is made on a smithing table, so we hardcode those.
// Format: outputItem → [ { name, quantity } ]
const SMITHING_RECIPES = {
  netherite_sword:      [{ name: 'diamond_sword',      quantity: 1 }, { name: 'netherite_ingot', quantity: 1 }],
  netherite_pickaxe:    [{ name: 'diamond_pickaxe',    quantity: 1 }, { name: 'netherite_ingot', quantity: 1 }],
  netherite_axe:        [{ name: 'diamond_axe',        quantity: 1 }, { name: 'netherite_ingot', quantity: 1 }],
  netherite_shovel:     [{ name: 'diamond_shovel',     quantity: 1 }, { name: 'netherite_ingot', quantity: 1 }],
  netherite_hoe:        [{ name: 'diamond_hoe',        quantity: 1 }, { name: 'netherite_ingot', quantity: 1 }],
  netherite_helmet:     [{ name: 'diamond_helmet',     quantity: 1 }, { name: 'netherite_ingot', quantity: 1 }],
  netherite_chestplate: [{ name: 'diamond_chestplate', quantity: 1 }, { name: 'netherite_ingot', quantity: 1 }],
  netherite_leggings:   [{ name: 'diamond_leggings',   quantity: 1 }, { name: 'netherite_ingot', quantity: 1 }],
  netherite_boots:      [{ name: 'diamond_boots',      quantity: 1 }, { name: 'netherite_ingot', quantity: 1 }],
};

// =====================================================================
// initMinecraft(version?)
// =====================================================================
// Attempts to load minecraft-data for the given version.
// Returns true on success, false on failure. Idempotent — calling it
// again after a successful init is a no-op (returns true immediately).
// =====================================================================
async function initMinecraft(version = '1.19') {
  // Already initialised successfully — nothing to do.
  if (initialised && !disabled) {
    return true;
  }

  try {
    const minecraftData = require('minecraft-data');
    mcData = minecraftData(version);

    if (!mcData) {
      throw new Error(`minecraft-data returned falsy for version "${version}"`);
    }

    // Quick sanity check — items and recipes must exist
    if (!mcData.items || !mcData.recipes || !mcData.itemsByName) {
      throw new Error('minecraft-data loaded but items/recipes/itemsByName missing');
    }

    disabled = false;
    initialised = true;
    console.info(`[minecraft-helper] initMinecraft: OK — loaded v${version} `
      + `(${Object.keys(mcData.itemsByName).length} items)`);
    return true;
  } catch (err) {
    disabled = true;
    initialised = true; // mark as "attempted" so we don't retry every request
    console.warn(
      '[minecraft-helper] initMinecraft: FAILED — ' + err.message + '\n'
      + '  MINECRAFT_HELPER_DISABLED — all helper calls will return null.\n'
      + '  To fix: run `npm i minecraft-data` inside server/'
    );
    return false;
  }
}

// =====================================================================
// getRecipeByItemName(itemName)
// =====================================================================
// Looks up the item by name (case-insensitive), finds the best recipe,
// and returns a normalised object:
//   { result: { id, name, count }, ingredients: [{ id, name, quantity }] }
// Returns null when disabled, item not found, or no recipe exists.
// =====================================================================
async function getRecipeByItemName(itemName) {
  if (disabled || !mcData) {
    return null;
  }

  try {
    const nameLower = String(itemName).toLowerCase().trim();
    const item = mcData.itemsByName[nameLower];
    if (!item) {
      return null; // unknown item
    }

    let recipes = mcData.recipes[item.id];

    // Fallback to smithing table recipes (netherite gear etc.)
    if ((!recipes || !Array.isArray(recipes) || recipes.length === 0) && SMITHING_RECIPES[nameLower]) {
      const smithing = SMITHING_RECIPES[nameLower];
      return {
        result: { id: item.id, name: item.name, count: 1 },
        ingredients: smithing.map(ing => {
          const ingItem = mcData.itemsByName[ing.name];
          return { id: ingItem ? ingItem.id : null, name: ing.name, quantity: ing.quantity };
        }),
      };
    }

    if (!recipes || !Array.isArray(recipes) || recipes.length === 0) {
      return null; // no recipe
    }

    // ── Pick the best recipe ───────────────────
    const recipe = pickBestRecipe(recipes);

    // ── Normalise ingredients ──────────────────
    const ingredients = normaliseIngredients(recipe);

    // ── Build result ───────────────────────────
    const resultCount = recipe.result ? (recipe.result.count || 1) : 1;
    return {
      result: {
        id: item.id,
        name: item.name,
        count: resultCount,
      },
      ingredients,
    };
  } catch (err) {
    console.error('[minecraft-helper] getRecipeByItemName error:', err.message);
    return null;
  }
}

// =====================================================================
// buildDependencyList(finalItem, options?)
// =====================================================================
// BFS traversal of the recipe tree.
//   options.depthLimit (default 1) — how many levels deep to expand
//     (0 = only the final item's immediate ingredients).
//   options.maxNodes (default 200) — cap on total ingredient nodes.
//
// Returns an array of:
//   { name, id, quantityRequired, raw, fromRecipeOf }
// or null when disabled / no recipe exists.
//
// When maxNodes is hit, the result array has a `truncated` property
// set to true (attached as an expando on the array).
// =====================================================================
async function buildDependencyList(finalItem, options = {}) {
  if (disabled || !mcData) {
    console.warn(
      '[minecraft-helper] buildDependencyList: MINECRAFT_HELPER_DISABLED — returning null.'
    );
    return null;
  }

  const depthLimit = Number.isFinite(options.depthLimit) ? options.depthLimit : 1;
  const maxNodes = Number.isFinite(options.maxNodes) ? options.maxNodes : 200;

  // ── Check cache ──────────────────────────────
  const cacheKey = `${String(finalItem).toLowerCase().trim()}|${depthLimit}`;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const finalNameLower = String(finalItem).toLowerCase().trim();

    // Verify the final item exists and has a recipe
    const finalItemObj = mcData.itemsByName[finalNameLower];
    if (!finalItemObj) {
      return null; // unknown item
    }

    const finalRecipes = mcData.recipes[finalItemObj.id];
    const hasSmithing = SMITHING_RECIPES[finalNameLower];

    if ((!finalRecipes || !Array.isArray(finalRecipes) || finalRecipes.length === 0) && !hasSmithing) {
      return null; // no recipe — autofill not available
    }

    // ── BFS ────────────────────────────────────
    // Each queue entry: { itemName, parentName, depth, multiplier }
    const queue = [];
    const aggregated = new Map(); // lowercase name → aggregated node
    let nodesVisited = 0;
    let truncated = false;

    // Seed the queue with the final item's recipe
    let seedIngredients;
    if (finalRecipes && Array.isArray(finalRecipes) && finalRecipes.length > 0) {
      const bestRecipe = pickBestRecipe(finalRecipes);
      seedIngredients = normaliseIngredients(bestRecipe);
    } else if (hasSmithing) {
      // Use smithing table fallback
      seedIngredients = hasSmithing.map(ing => {
        const ingItem = mcData.itemsByName[ing.name];
        return { id: ingItem ? ingItem.id : null, name: ing.name, quantity: ing.quantity };
      });
    } else {
      seedIngredients = [];
    }

    for (const ing of seedIngredients) {
      if (nodesVisited >= maxNodes) { truncated = true; break; }
      queue.push({
        id: ing.id,
        name: ing.name,
        quantity: ing.quantity,
        parentName: finalNameLower,
        depth: 0,
      });
    }

    while (queue.length > 0) {
      if (nodesVisited >= maxNodes) { truncated = true; break; }

      const node = queue.shift();
      nodesVisited++;

      const nodeNameLower = node.name ? node.name.toLowerCase() : null;
      const quantityInt = Math.max(1, Math.ceil(node.quantity || 1));

      // Check if this ingredient has a recipe (i.e., not a raw resource)
      let isRaw = true;
      let childRecipe = null;
      if (nodeNameLower && mcData.itemsByName[nodeNameLower]) {
        const nodeItem = mcData.itemsByName[nodeNameLower];
        const nodeRecipes = mcData.recipes[nodeItem.id];
        if (nodeRecipes && Array.isArray(nodeRecipes) && nodeRecipes.length > 0) {
          isRaw = false;
          childRecipe = pickBestRecipe(nodeRecipes);
        } else if (SMITHING_RECIPES[nodeNameLower]) {
          // Smithing table fallback — mark as not-raw but don't expand further
          isRaw = false;
        }
      }

      // Aggregate into result
      const aggKey = nodeNameLower || `id_${node.id}`;
      if (aggregated.has(aggKey)) {
        const existing = aggregated.get(aggKey);
        existing.quantityRequired += quantityInt;
        // Keep raw as false if ANY occurrence has a recipe
        if (!isRaw) existing.raw = false;
      } else {
        aggregated.set(aggKey, {
          name: node.name || null,
          id: node.id != null ? node.id : null,
          quantityRequired: quantityInt,
          raw: isRaw,
          fromRecipeOf: node.parentName || null,
        });
      }

      // Expand children if depth allows and node has a recipe
      if (!isRaw && childRecipe && node.depth < depthLimit) {
        const childIngredients = normaliseIngredients(childRecipe);
        for (const child of childIngredients) {
          if (nodesVisited >= maxNodes) { truncated = true; break; }
          queue.push({
            id: child.id,
            name: child.name,
            quantity: child.quantity * quantityInt,
            parentName: nodeNameLower,
            depth: node.depth + 1,
          });
        }
      }
    }

    // Build result array
    const result = Array.from(aggregated.values());

    // Attach truncated flag as metadata
    if (truncated) {
      result.truncated = true;
    }

    // ── Store in cache ────────────────────────
    if (cache.size >= CACHE_MAX_ENTRIES) {
      // Evict oldest entry
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  } catch (err) {
    console.error('[minecraft-helper] buildDependencyList error:', err.message);
    return null;
  }
}

// =====================================================================
// clearCache()
// =====================================================================
// Synchronous helper to wipe the internal result cache. Useful for tests.
// =====================================================================
function clearCache() {
  cache.clear();
}

// ═════════════════════════════════════════════════════════════════════
// Internal helpers (not exported)
// ═════════════════════════════════════════════════════════════════════

/**
 * pickBestRecipe(recipes)
 *
 * Given an array of recipe objects from minecraft-data, return the
 * "best" one:
 *   1. Prefer shaped recipes (those with an `inShape` array).
 *   2. Among shaped, take the first.
 *   3. If none are shaped, take the first recipe in the array.
 */
function pickBestRecipe(recipes) {
  const shaped = recipes.find(r => r && r.inShape && Array.isArray(r.inShape));
  return shaped || recipes[0];
}

/**
 * normaliseIngredients(recipe)
 *
 * Converts a recipe object into an array of { id, name, quantity }.
 *
 * Handles three shapes of recipe data from minecraft-data:
 *   - recipe.inShape  (2D array of ingredient ids / objects)
 *   - recipe.ingredients (flat array — shapeless)
 *   - neither (edge case — return empty array)
 *
 * Aggregates duplicate ids so each ingredient appears once with a
 * summed quantity.
 */
function normaliseIngredients(recipe) {
  if (!recipe) return [];

  const counts = new Map(); // id → count

  if (recipe.inShape && Array.isArray(recipe.inShape)) {
    // Shaped recipe — 2D grid
    for (const row of recipe.inShape) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        const id = extractIngredientId(cell);
        if (id == null || id < 0) continue; // empty slot
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
  } else if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
    // Shapeless recipe — flat array
    for (const ing of recipe.ingredients) {
      const id = extractIngredientId(ing);
      if (id == null || id < 0) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }

  // Convert to output array with name lookups
  const result = [];
  for (const [id, qty] of counts.entries()) {
    let name = null;
    try {
      if (mcData && mcData.items && mcData.items[id]) {
        name = mcData.items[id].name;
      }
    } catch (_err) {
      // id has no mapping — leave name as null
    }

    result.push({
      id,
      name,
      quantity: Math.max(1, Math.ceil(qty)),
    });
  }

  return result;
}

/**
 * extractIngredientId(cell)
 *
 * minecraft-data recipe cells can be:
 *   - a plain number (the item id)
 *   - an object with an `id` property
 *   - null / undefined (empty slot)
 *
 * Returns the numeric id or null.
 */
function extractIngredientId(cell) {
  if (cell == null) return null;
  if (typeof cell === 'number') return cell;
  if (typeof cell === 'object' && cell.id != null) return cell.id;
  return null;
}

// =====================================================================
// buildRecipeTree(itemName, options?)
// =====================================================================
// DFS traversal that produces a TREE structure (not flat list).
// Returns:
//   { name, quantity, computedRequired, raw, children: [...] }
// or null when disabled / no recipe exists.
//
// options.depthLimit  (default 3) — how deep to expand.
// options.rootQuantity (default 1) — how many of the root item needed.
//   Quantities propagate: computedRequired = parentScaled * childPerRecipe
// Cycle protection via visited set.
// Decomposition-recipe guard: skips recipes with 1 ingredient → count>1.
// =====================================================================
async function buildRecipeTree(itemName, options = {}) {
  if (disabled || !mcData) return null;

  const depthLimit = Number.isFinite(options.depthLimit) ? options.depthLimit : 3;
  const rootQuantity = Number.isFinite(options.rootQuantity) ? options.rootQuantity : 1;
  const nameLower = String(itemName).toLowerCase().trim();

  // Verify the item exists
  const itemObj = mcData.itemsByName[nameLower];
  if (!itemObj) return null;

  /**
   * Pick a crafting recipe, filtering out decomposition recipes.
   * A decomposition recipe: single ingredient + result.count > 1
   * (e.g. diamond_block → 9 diamonds). We want the BUILD recipe.
   */
  function pickCraftingRecipe(recipes) {
    if (!recipes || recipes.length === 0) return null;

    // Filter out decomposition recipes
    const crafting = recipes.filter(r => {
      const count = r.result?.count || 1;
      // If result count > 1, it's likely a decomposition recipe (block → items)
      if (count > 1) return false;
      return true;
    });

    // If we filtered everything out, the item only has decomposition recipes
    // — treat as raw material
    if (crafting.length === 0) return null;

    return pickBestRecipe(crafting);
  }

  function expand(name, perRecipeQty, parentScaled, depth, visited) {
    const key = name.toLowerCase().trim();
    // computedRequired = how many of THIS item the user actually needs
    const computedRequired = parentScaled * perRecipeQty;

    // Cycle protection
    if (visited.has(key)) {
      return { name, quantity: perRecipeQty, computedRequired, raw: true, children: [] };
    }

    const nextVisited = new Set(visited);
    nextVisited.add(key);

    const item = mcData.itemsByName[key];
    if (!item) {
      return { name, quantity: perRecipeQty, computedRequired, raw: true, children: [] };
    }

    // Try crafting table recipes first (with decomposition guard)
    let ingredients = null;
    const recipes = mcData.recipes[item.id];
    const bestRecipe = pickCraftingRecipe(recipes);
    if (bestRecipe) {
      ingredients = normaliseIngredients(bestRecipe);
    } else if (SMITHING_RECIPES[key]) {
      // Smithing table fallback
      ingredients = SMITHING_RECIPES[key].map(ing => {
        const ingItem = mcData.itemsByName[ing.name];
        return { id: ingItem ? ingItem.id : null, name: ing.name, quantity: ing.quantity };
      });
    }

    if (!ingredients || ingredients.length === 0) {
      return { name, quantity: perRecipeQty, computedRequired, raw: true, children: [] };
    }

    // At depth limit, show children but don't expand further
    if (depth >= depthLimit) {
      return {
        name, quantity: perRecipeQty, computedRequired, raw: false,
        children: ingredients.map(ing => ({
          name: ing.name || `item_${ing.id}`,
          quantity: ing.quantity,
          computedRequired: computedRequired * ing.quantity,
          raw: true,
          children: [],
        })),
      };
    }

    // Expand children — pass computedRequired as the parent scale
    const children = ingredients.map(ing => {
      const childName = ing.name || `item_${ing.id}`;
      return expand(childName, ing.quantity, computedRequired, depth + 1, nextVisited);
    });

    return { name, quantity: perRecipeQty, computedRequired, raw: false, children };
  }

  try {
    const tree = expand(nameLower, rootQuantity, 1, 0, new Set());
    return tree;
  } catch (err) {
    console.error('[minecraft-helper] buildRecipeTree error:', err.message);
    return null;
  }
}

// ── Exports ──────────────────────────────────────────────────────────
module.exports = {
  initMinecraft,
  getRecipeByItemName,
  buildDependencyList,
  buildRecipeTree,
  clearCache,
};
