// ──────────────────────────────────────────────
// MinecraftIcon — Renders a Minecraft item icon
// with local assets → CDN → emoji fallback.
// ──────────────────────────────────────────────

import { useState } from "react";

/**
 * Alias map for common item-name variants that
 * don't normalise cleanly to their texture filename.
 */
const ITEM_ALIASES = {
  "diamond pick": "diamond_pickaxe",
  "diamond pickaxe": "diamond_pickaxe",
  "oak plank": "oak_planks",
  "oak planks": "oak_planks",
  "diamond block": "diamond_block",
  "ancient_debris": "ancient_debris",
};

/**
 * Normalize an item name for asset lookup.
 * Checks alias map first, then falls back to
 * lowercased underscore form with special chars stripped.
 */
function normalizeItemName(name) {
  const lower = (name || "unknown").trim().toLowerCase();
  if (ITEM_ALIASES[lower]) return ITEM_ALIASES[lower];
  return lower
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Get the local asset path for a Minecraft item icon.
 */
function getLocalIcon(itemName) {
  const normalized = normalizeItemName(itemName);
  return `/assets/items/${normalized}.png`;
}

/**
 * Get the CDN URL for a Minecraft item icon (fallback).
 */
function getCDNIcon(itemName, size = 32) {
  const normalized = normalizeItemName(itemName);
  return `https://mc-heads.net/item/${normalized}/${size}`;
}

/**
 * MinecraftIcon component — renders an item icon
 * with three-tier fallback: local → CDN → emoji.
 */
export default function MinecraftIcon({ name, size = 32, className = "" }) {
  // 0 = local, 1 = CDN, 2 = emoji
  const [tier, setTier] = useState(0);

  if (tier >= 2 || !name) {
    return (
      <div
        className={`mc-icon-fallback ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.5 }}
        title={name || "Unknown item"}
      >
        📦
      </div>
    );
  }

  const src = tier === 0 ? getLocalIcon(name) : getCDNIcon(name, size);

  return (
    <img
      className={`mc-icon ${className}`}
      src={src}
      alt={name}
      title={name}
      width={size}
      height={size}
      onError={() => setTier((t) => t + 1)}
      loading="lazy"
    />
  );
}
