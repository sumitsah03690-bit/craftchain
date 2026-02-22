// /server/config/db.js
// ──────────────────────────────────────────────
// Dedicated MongoDB connection module.
//
// Exports a single async function connectDB()
// that MUST be awaited before starting Express.
// If the connection fails, the process exits
// with code 1 — the server should never run
// without a working database.
// ──────────────────────────────────────────────

const mongoose = require("mongoose");

// ── Mongoose Connection Event Listeners ─────────
// These fire throughout the application lifecycle,
// not just at startup.  Useful for monitoring and
// debugging connection issues in production.

mongoose.connection.on("connected", () => {
  console.log("📗 Mongoose connected to MongoDB");
});

mongoose.connection.on("error", (err) => {
  console.error("📕 Mongoose connection error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.log("📙 Mongoose disconnected from MongoDB");
});

// ── ReadyState Map ──────────────────────────────
// mongoose.connection.readyState values:
//   0 = disconnected
//   1 = connected
//   2 = connecting
//   3 = disconnecting
const READY_STATE_MAP = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

/**
 * Get a human-readable string for the current
 * Mongoose connection state.
 */
function getReadyStateLabel() {
  return READY_STATE_MAP[mongoose.connection.readyState] || "unknown";
}

/**
 * Connect to MongoDB.
 *
 * - Validates MONGODB_URI is set
 * - Attempts connection with a 10-second timeout
 * - Exits the process on failure (fail-fast)
 *
 * Must be called and awaited BEFORE app.listen().
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;

  // ── Guard: URI must be set ──────────────────
  if (!uri || uri.trim() === "") {
    console.error("❌ MONGODB_URI is not set in environment variables.");
    console.error("   Add it to .env:  MONGODB_URI=mongodb://localhost:27017/craftchain");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, {
      autoIndex: true,       // Build indexes on startup (disable in large production DBs)
      serverSelectionTimeoutMS: 10000, // Fail after 10s if MongoDB is unreachable
    });

    console.log("✅ MongoDB connected successfully");
    console.log(`   Database: ${mongoose.connection.db.databaseName}`);
    console.log(`   Host:     ${mongoose.connection.host}:${mongoose.connection.port}`);
  } catch (err) {
    console.error("❌ MongoDB connection failed:");
    console.error(`   ${err.message}`);
    console.error("   Check that MongoDB is running and MONGODB_URI is correct.");
    process.exit(1);
  }
}

module.exports = { connectDB, getReadyStateLabel };
