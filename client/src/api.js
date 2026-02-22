// ── API base URL configuration ──────────────────
// In development: defaults to "" (uses Vite proxy → localhost:4000)
// In production:  set VITE_API_URL in Vercel env vars
//                 e.g. https://craftchain-api.onrender.com
// ─────────────────────────────────────────────────

export const API_BASE = import.meta.env.VITE_API_URL || "";

/**
 * Build a full API URL.
 * api("/api/projects") → "https://craftchain-api.onrender.com/api/projects" (prod)
 *                       → "/api/projects" (dev, proxied by Vite)
 */
export function api(path) {
  return `${API_BASE}${path}`;
}
