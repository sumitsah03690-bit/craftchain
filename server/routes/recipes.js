// ──────────────────────────────────────────────
// Recipe Lookup Routes
// ──────────────────────────────────────────────
// GET /api/recipes/lookup?item=diamond_pickaxe
// GET /api/recipes/search?q=diamond
// ──────────────────────────────────────────────

const express = require("express");
const router = express.Router();
const mc = require("../utils/minecraft");

// Init minecraft-data on module load
mc.initMinecraft();

// ── GET /api/recipes/search?q=dia ────────────
// Returns item names matching the query (for search autocomplete)
router.get("/search", (req, res) => {
  const q = (req.query.q || "").toLowerCase().trim();
  if (!q || q.length < 2) {
    return res.json({ success: true, data: [] });
  }

  try {
    const mcData = require("minecraft-data")("1.19");
    const matches = [];

    // Smithing table items (netherite gear) that minecraft-data doesn't index
    const SMITHING_ITEMS = new Set([
      'netherite_sword', 'netherite_pickaxe', 'netherite_axe',
      'netherite_shovel', 'netherite_hoe', 'netherite_helmet',
      'netherite_chestplate', 'netherite_leggings', 'netherite_boots',
    ]);

    // Token-based AND: every search token must appear in the item name
    const tokens = q.split(/\s+/).filter(Boolean);

    for (const [name, item] of Object.entries(mcData.itemsByName)) {
      const nameWithSpaces = name.replace(/_/g, " ");
      const match = tokens.every(
        (t) => name.includes(t) || nameWithSpaces.includes(t)
      );
      if (match) {
        // Check if item has a recipe (crafting table OR smithing table)
        const recipes = mcData.recipes[item.id];
        const hasRecipe = (recipes && Array.isArray(recipes) && recipes.length > 0)
          || SMITHING_ITEMS.has(name);

        matches.push({
          name: item.name,
          displayName: item.displayName,
          id: item.id,
          hasRecipe,
        });
      }
      if (matches.length >= 20) break;
    }

    // Sort: items with recipes first, then alphabetically
    matches.sort((a, b) => {
      if (a.hasRecipe !== b.hasRecipe) return b.hasRecipe ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    return res.json({ success: true, data: matches });
  } catch (err) {
    console.error("Recipe search error:", err);
    return res.json({ success: true, data: [] });
  }
});

// ── GET /api/recipes/lookup?item=diamond_pickaxe ──
// Returns full dependency list for the given item
router.get("/lookup", async (req, res) => {
  const itemName = (req.query.item || "").toLowerCase().trim();

  if (!itemName) {
    return res.status(400).json({
      success: false,
      message: "Missing ?item= parameter.",
    });
  }

  try {
    // Get the recipe with depth=2 (expand all sub-ingredients)
    // so every material appears as a contributable project item
    const deps = await mc.buildDependencyList(itemName, { depthLimit: 2 });

    if (!deps || !Array.isArray(deps) || deps.length === 0) {
      return res.json({
        success: true,
        data: {
          finalItem: itemName,
          items: [],
          message: "No recipe found. You can add items manually.",
        },
      });
    }

    // Build items array in the format the Project schema expects
    const items = deps.map((dep) => ({
      name: dep.name,
      quantityRequired: dep.quantityRequired,
      dependencies: dep.fromRecipeOf && dep.fromRecipeOf !== itemName
        ? [dep.fromRecipeOf]
        : [],
      raw: dep.raw,
    }));

    return res.json({
      success: true,
      data: {
        finalItem: itemName,
        items,
        truncated: !!deps.truncated,
      },
    });
  } catch (err) {
    console.error("Recipe lookup error:", err);
    return res.status(500).json({
      success: false,
      message: "Recipe lookup failed.",
    });
  }
});

// ── GET /api/recipes/tree?item=diamond_sword ──
// Returns hierarchical recipe tree for visualization
router.get("/tree", async (req, res) => {
  const itemName = (req.query.item || "").toLowerCase().trim();

  if (!itemName) {
    return res.status(400).json({
      success: false,
      message: "Missing ?item= parameter.",
    });
  }

  try {
    const tree = await mc.buildRecipeTree(itemName, {
      depthLimit: 3,
      rootQuantity: parseInt(req.query.qty, 10) || 1,
    });

    if (!tree) {
      return res.json({
        success: true,
        data: null,
        message: "No recipe tree available.",
      });
    }

    return res.json({ success: true, data: tree });
  } catch (err) {
    console.error("Recipe tree error:", err);
    return res.status(500).json({
      success: false,
      message: "Recipe tree lookup failed.",
    });
  }
});

module.exports = router;
