# 🔗 CraftChain

**CraftChain** is a collaborative project-management platform built during a hackathon. It uses a **React** frontend (Vite) and a **Node.js / Express** backend connected to **MongoDB**. The entire repo is an npm-workspaces mono-repo so you can install everything and start both servers with a single command.

---

## Quick Start

```bash
# 1. Clone the repo
git clone <your-repo-url> craftchain
cd craftchain

# 2. Create your .env file (then edit it — see below)
cp .env.example .env

# 3. Install all dependencies (root + server + client)
npm install

# 4. Start both dev servers (API on :4000, React on :5173)
npm run dev
```

After running `npm run dev` you should see:

| Service      | URL                                                                  |
| ------------ | -------------------------------------------------------------------- |
| React client | [http://localhost:5173](http://localhost:5173)                       |
| API health   | [http://localhost:4000/api/health](http://localhost:4000/api/health) |

---

## How It Works

The root `package.json` declares two npm **workspaces**: `server/` and `client/`. When you run `npm install` at the root, npm resolves dependencies for both workspaces in one go. The `dev` script uses **concurrently** to start the Express server (via `nodemon`) and the Vite dev server in parallel — so you only need one terminal.

---

## MongoDB Setup

1. **Atlas (recommended for quick start):** Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas), get your connection string, and paste it into `.env` as `MONGODB_URI`.
2. **Local MongoDB:** Install MongoDB Community Server, start `mongod`, and set `MONGODB_URI=mongodb://localhost:27017/craftchain` in `.env`.

> The server will start even without a `MONGODB_URI` (the health route still works), but database-dependent features won't function until you add one.

---

## Folder Structure

```
CRAFTCHAIN/
├── client/                # Vite + React frontend
│   ├── src/
│   │   ├── main.jsx       # React entry — BrowserRouter wraps App
│   │   ├── App.jsx        # Nav + route definitions
│   │   └── pages/         # Placeholder page components
│   │       ├── Login.jsx
│   │       ├── Dashboard.jsx
│   │       └── Project.jsx
│   └── index.html
├── server/                # Express API backend
│   └── server.js          # Entry — Mongoose, health route
├── .env.example           # Template for environment variables
├── .gitignore
├── dev-setup.sh           # One-liner env setup script
├── package.json           # Root workspace config
└── README.md              # ← You are here
```

**Where to continue building:**

- **Auth:** Create `server/routes/auth.js` and add JWT login/register endpoints; mount them in `server.js`.
- **Models:** Add Mongoose models in `server/models/` (e.g., `User.js`, `Project.js`).
- **Frontend pages:** Replace the placeholder components in `client/src/pages/` with real forms and data fetching.

---

## Environment Variables

| Variable      | Description                                | Default                 |
| ------------- | ------------------------------------------ | ----------------------- |
| `MONGODB_URI` | MongoDB connection string                  | _(none)_                |
| `JWT_SECRET`  | Secret key for signing JWTs                | `change-me-...`         |
| `PORT`        | Express server port                        | `4000`                  |
| `CLIENT_URL`  | React client origin (for CORS / redirects) | `http://localhost:5173` |

---

## Available Scripts

| Command         | What it does                                       |
| --------------- | -------------------------------------------------- |
| `npm run dev`   | Starts **both** client and server in dev mode      |
| `npm run build` | Builds the React client for production (`dist/`)   |
| `npm run start` | Starts the Express server with `node` (production) |

---

## Tech Stack

- **Frontend:** React 19, Vite, React Router
- **Backend:** Node.js, Express
- **Database:** MongoDB + Mongoose
- **Auth (planned):** JWT (`jsonwebtoken` + `bcrypt`)

## Minecraft Auto-Fill (Optional)

CraftChain can auto-populate a project's items list from a Minecraft final item using the `minecraft-data` package.

### Installation

```bash
# Inside the server/ workspace
cd server && npm install minecraft-data
```

### Usage

```js
const { initMinecraft, buildDependencyList } = require("../utils/minecraft");

// Call once at startup (idempotent — safe to call multiple times)
await initMinecraft();

// Auto-fill items for a project
const items = await buildDependencyList("diamond_pickaxe", { depthLimit: 1 });
if (!items) {
  // Fallback: ask user to provide items manually
}
```

When creating a project via `POST /api/projects`, set `autoFillFromMinecraft: true` and the backend will attempt auto-fill automatically.

### Performance Notes

- `minecraft-data` loads a lot of JSON. `initMinecraft()` is called once and reused.
- `buildDependencyList` results are cached in-memory (5-minute TTL).
- Recursion is capped by `depthLimit` and `maxNodes` to avoid large trees.

---

## License

MIT — hack away! 🚀
