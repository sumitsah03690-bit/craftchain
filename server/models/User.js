// /server/models/User.js
// ──────────────────────────────────────────────
// Mongoose schema & model for a CraftChain user.
// Stores credentials and a creation timestamp.
// Password hashing is NOT done here — it happens
// in the auth route so the flow is easier to follow.
// ──────────────────────────────────────────────

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  // ── username ────────────────────────────────
  // Must be unique so two people can't claim the
  // same handle.  3–30 chars keeps it sane.
  username: {
    type: String,
    required: [true, "Username is required"],
    unique: true,
    trim: true,
    minlength: [3, "Username must be at least 3 characters"],
    maxlength: [30, "Username must be at most 30 characters"],
  },

  // ── email ───────────────────────────────────
  // Also unique. We use a simple regex here; for
  // production you'd want a proper email library.
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    trim: true,
    lowercase: true, // store all emails lowercase to avoid duplicates
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      "Please provide a valid email address",
    ],
  },

  // ── passwordHash ────────────────────────────
  // We never store the raw password — only the
  // bcrypt hash.  The field name makes that obvious.
  passwordHash: {
    type: String,
    required: [true, "Password hash is required"],
  },

  // ── createdAt ───────────────────────────────
  // Defaults to "now" so we don't need to set it
  // manually on every registration.
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("User", userSchema);
