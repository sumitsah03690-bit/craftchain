// ──────────────────────────────────────────────
// CraftChain — Express API Server
// ──────────────────────────────────────────────
// Main entry point.
// 1. Loads env vars
// 2. Connects to MongoDB (fail-fast)
// 3. Mounts routes
// 4. Starts Express
// 5. Handles graceful shutdown
// ──────────────────────────────────────────────

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// Load environment variables from the root .env file
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

// ── Database connection module ──────────────────
const { connectDB, getReadyStateLabel } = require("./config/db");

// ── Create Express app ──────────────────────────
const app = express();

// ── Middleware ───────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",  // Set CORS_ORIGIN to your Vercel URL in production
  credentials: true,
}));
app.use(express.json());      // Parse incoming JSON bodies

// ── Routes ──────────────────────────────────────

// Health-check endpoint — now includes DB state.
// Try it: curl http://localhost:4000/api/health
app.get("/api/health", (_req, res) => {
  const readyState = mongoose.connection.readyState;
  res.json({
    status: "ok",
    dbState: readyState,
    dbStateLabel: getReadyStateLabel(),
  });
});

// ── Auth routes ─────────────────────────────────
app.use("/api/auth", require("./routes/auth"));

// ── Project CRUD routes ─────────────────────────
app.use("/api/projects", require("./routes/projects"));

// ── Server (group) routes ───────────────────────
app.use("/api/servers", require("./routes/servers"));

// ── Recipe lookup routes ────────────────────
app.use("/api/recipes", require("./routes/recipes"));

// ── User profile routes ────────────────────
app.use("/api/users", require("./routes/users"));

// ── Protected /api/me route ─────────────────────
const authMiddleware = require("./middleware/authMiddleware");
const User = require("./models/User");

app.get("/api/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    return res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          createdAt: user.createdAt,
        },
      },
    });
  } catch (err) {
    console.error("GET /api/me error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ── Server Startup ──────────────────────────────
const PORT = process.env.PORT || 4000;

async function startServer() {
  // 1. Connect to MongoDB — exits process on failure
  await connectDB();

  // 2. Start Express ONLY after DB is connected
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`   Health check → http://localhost:${PORT}/api/health`);
  });

  // ── Graceful Shutdown ─────────────────────────
  // On SIGINT (Ctrl+C) or SIGTERM (process manager),
  // close the DB connection cleanly before exiting.
  // This prevents zombie connections and data corruption.

  function gracefulShutdown(signal) {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);

    server.close(() => {
      console.log("   HTTP server closed.");

      mongoose.connection.close(false).then(() => {
        console.log("   MongoDB connection closed.");
        console.log("   Goodbye! 👋");
        process.exit(0);
      });
    });

    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
      console.error("   ⚠ Forced shutdown after timeout.");
      process.exit(1);
    }, 10000);
  }

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

startServer();
