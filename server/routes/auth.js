// /server/routes/auth.js
// ──────────────────────────────────────────────
// Authentication routes: register & login.
//
// Mounted at /api/auth (see server.js), so:
//   POST /api/auth/register
//   POST /api/auth/login
//
// Response format (consistent everywhere):
//   Success → { success: true,  data: { ... } }
//   Error   → { success: false, message: "..." }
// ──────────────────────────────────────────────

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

// ═══════════════════════════════════════════════
// POST /api/auth/register
// ═══════════════════════════════════════════════
// Accepts: { username, email, password }
// Returns: 201 with the new user (no password!)
// ═══════════════════════════════════════════════
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // ── Input validation ──────────────────────
    // We check here (in addition to Mongoose) so
    // we can return friendly, specific messages.
    if (!username || username.length < 3 || username.length > 30) {
      return res.status(400).json({
        success: false,
        message: "Username is required and must be 3–30 characters.",
      });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email address is required.",
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password is required and must be at least 6 characters.",
      });
    }

    // ── Check for existing user ───────────────
    // We check both email AND username so we can
    // tell the caller exactly what's taken.
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username },
      ],
    });

    if (existingUser) {
      // Figure out which field caused the conflict
      const field =
        existingUser.email === email.toLowerCase() ? "Email" : "Username";
      return res.status(409).json({
        success: false,
        message: `${field} is already taken.`,
      });
    }

    // ── Hash the password ─────────────────────
    // saltRounds = 10 is a good balance between
    // security and speed (~100 ms on modern hardware).
    // Higher = more secure but slower logins.
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // ── Create & save the user ────────────────
    const user = await User.create({
      username,
      email: email.toLowerCase(),
      passwordHash,
    });

    // ── Respond (never expose the hash!) ──────
    return res.status(201).json({
      success: true,
      data: {
        message: "User created",
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
        },
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
});

// ═══════════════════════════════════════════════
// POST /api/auth/login
// ═══════════════════════════════════════════════
// Accepts: { emailOrUsername, password }
// Returns: JWT token + user info
// ═══════════════════════════════════════════════
router.post("/login", async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;

    // ── Basic check ───────────────────────────
    if (!emailOrUsername || !password) {
      return res.status(400).json({
        success: false,
        message: "emailOrUsername and password are required.",
      });
    }

    // ── Find user by email OR username ────────
    // We lowercase the input so email lookup is
    // case-insensitive (emails are stored lowercase).
    const user = await User.findOne({
      $or: [
        { email: emailOrUsername.toLowerCase() },
        { username: emailOrUsername },
      ],
    });

    if (!user) {
      // Generic message to avoid leaking whether
      // the account exists (security best practice).
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    // ── Compare password ──────────────────────
    // bcrypt.compare hashes the attempt with the
    // same salt that was used originally, then
    // checks if the results match.
    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    // ── Sign a JWT ────────────────────────────
    // Payload: just the user's id and username.
    // Keep payloads small — avoid putting secrets
    // or large objects in the token.
    // expiresIn: '7d' means the user stays logged
    // in for a week before needing to log in again.
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
        },
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
});

module.exports = router;
