# CraftChain Frontend — What Was Done

**Date:** February 21, 2026  
**Scope:** Built the entire React frontend for CraftChain from scratch.

---

## Summary

Built a complete Discord-style × Minecraft-themed React frontend for CraftChain, wired to the existing Express/MongoDB backend. The frontend uses a 3-panel layout (sidebar + main content + right panel), dark theme inspired by Discord, and Minecraft visual accents (pixel font headings, item icons from CDN, emerald/stone/red status colors).

---

## Tech Stack

- **Vite** — build tool and dev server
- **React 19** — UI framework
- **React Router v7** — client-side routing
- **Native fetch** — HTTP requests (no axios)
- **React Context** — auth state management
- **Vanilla CSS** — custom properties-based design system (no Tailwind, no UI libs)
- **Google Fonts** — "Press Start 2P" (pixel headings) + "Inter" (body text)

---

## Files Created / Modified (17 total)

### Foundation (4 modified)

| File             | What Changed                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`     | Added Google Fonts (Press Start 2P + Inter), pixel-art favicon, SEO meta tags                                                                                           |
| `vite.config.js` | Added `server.proxy` to forward `/api` → `localhost:4000`                                                                                                               |
| `src/index.css`  | Full CSS design system rewrite: Discord dark theme, Minecraft accent colors, 3-panel layout, all component styles, responsive breakpoints, custom scrollbar, animations |
| `src/main.jsx`   | Wrapped `<App>` with `<AuthProvider>`                                                                                                                                   |

### Auth Context (1 new)

| File                           | Purpose                                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/contexts/AuthContext.jsx` | JWT auth state: `login()`, `signup()`, `logout()`, `authFetch()`. Token in localStorage + React state. Validates token via `/api/me` on mount. |

### Components (8 new)

| File                                   | Purpose                                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/MinecraftIcon.jsx`     | Renders Minecraft item icons from `mc-heads.net` CDN. Normalizes names (lowercase + underscores). Falls back to 📦 emoji on error. |
| `src/components/Sidebar.jsx`           | Discord-style fixed left panel: logo, nav links, auto-fetched project list with icons, user info, logout button                    |
| `src/components/ProgressBar.jsx`       | Reusable horizontal progress bar with clamped percentage and optional label                                                        |
| `src/components/ItemCard.jsx`          | Minecraft item card: icon, quantity display, status badge (completed/pending/blocked), bottleneck badge, contribute button         |
| `src/components/ContributionModal.jsx` | Dark overlay modal for contributing items. Handles success, unmet dependencies (409), already-completed, and loading states.       |
| `src/components/ActivityFeed.jsx`      | Discord message-feed style: colored avatar circles, event messages, relative timestamps. Fetches from `/api/projects/:id/activity` |
| `src/components/DependencyTree.jsx`    | Indented tree visualization of item dependencies. Status-colored dots. Circular dependency protection.                             |
| `src/components/ProjectHeader.jsx`     | Large final-item icon, pixel-font project name, metadata, progress bar with percentage                                             |

### Pages (3 new, 1 modified, 1 deleted)

| File                        | Purpose                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/Login.jsx`       | Centered dark card with email/username + password fields, error handling, link to signup                                               |
| `src/pages/Signup.jsx`      | Username + email + password form. Auto-logins on success → redirects to dashboard                                                      |
| `src/pages/Dashboard.jsx`   | Project cards grid with Minecraft icons + progress bars. Inline project creation form (JSON items input). Empty state.                 |
| `src/pages/ProjectPage.jsx` | Full project detail: header, items grid, dependency tree, right sidebar with activity feed + bottleneck highlights, contribution modal |
| `src/pages/Project.jsx`     | **DELETED** — replaced by ProjectPage.jsx                                                                                              |

### Router (1 modified)

| File          | What Changed                                                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/App.jsx` | Complete rewrite: `ProtectedRoute` wrapper, `AppShell` with Sidebar, routes for `/login`, `/signup`, `/dashboard`, `/projects/:id`, default redirect to `/dashboard` |

---

## Design System

### Color Palette

| Token          | Value     | Usage                      |
| -------------- | --------- | -------------------------- |
| `--bg-darkest` | `#1E1F22` | Page background, sidebar   |
| `--bg-dark`    | `#2B2D31` | Cards, modals              |
| `--bg-medium`  | `#313338` | Hover states               |
| `--mc-green`   | `#5AA469` | Primary buttons, accents   |
| `--mc-emerald` | `#2ECC71` | Completed status           |
| `--mc-red`     | `#E74C3C` | Blocked status, errors     |
| `--mc-gold`    | `#F1C40F` | Bottleneck warnings        |
| `--mc-stone`   | `#6D6F78` | Pending status, muted text |

### Typography

- **Headings**: "Press Start 2P" (pixel font) — small sizes (9-16px) for readability
- **Body**: "Inter" — clean sans-serif for all other text

### Layout

- **Sidebar**: Fixed 240px left panel
- **Main content**: Flexible center
- **Right panel**: 300px for activity feed (project page only)
- **Responsive**: Right panel hides below 1024px, sidebar collapses to icons below 768px

---

## API Endpoints Wired

| Endpoint                            | Used By                        |
| ----------------------------------- | ------------------------------ |
| `POST /api/auth/login`              | Login page                     |
| `POST /api/auth/register`           | Signup page                    |
| `GET /api/me`                       | AuthContext (token validation) |
| `GET /api/projects`                 | Dashboard, Sidebar             |
| `GET /api/projects/:id`             | ProjectPage                    |
| `POST /api/projects`                | Dashboard (create form)        |
| `POST /api/projects/:id/contribute` | ContributionModal              |
| `GET /api/projects/:id/activity`    | ActivityFeed                   |

---

## Icon Strategy

- **CDN**: `https://mc-heads.net/item/{normalized_name}/{size}`
- **Normalization**: `"Iron Ingot"` → `iron_ingot`
- **Fallback**: 📦 emoji if CDN image fails
- **Component**: `<MinecraftIcon name="glass" size={32} />`

---

## Build Results

```
vite v7.3.1 — production build
✓ 54 modules transformed
  dist/index.html           1.10 kB
  dist/assets/index.css    16.66 kB (gzip: 3.54 kB)
  dist/assets/index.js    249.33 kB (gzip: 78.27 kB)
✓ zero errors
```

---

## How to Run

```bash
# From the project root
cd /Users/sumitsah_03690/Documents/CRAFTCHAIN

# Start both servers together
npm run dev

# Or individually:
cd server && node server.js     # Backend on :4000
cd client && npx vite           # Frontend on :5173
```

Frontend: http://localhost:5173  
Backend: http://localhost:4000

> Note: The Vite dev server proxies `/api` requests to the backend automatically.
