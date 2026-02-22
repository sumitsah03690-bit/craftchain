// /server/routes/users.js
// ──────────────────────────────────────────────
// User profile & account routes for CraftChain.
//
// Public profile:  GET /api/users/:id/profile
// Private account: GET /api/users/me/account
// Change password: PATCH /api/users/me/password
// ──────────────────────────────────────────────

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Project = require("../models/Project");
const Server = require("../models/Server");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// ═══════════════════════════════════════════════
// GET /api/users/me/account — Private account info
// ═══════════════════════════════════════════════
// Returns the caller's own account details including
// email. Password is NEVER returned.
router.get("/me/account", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("username email createdAt")
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    return res.json({
      success: true,
      data: {
        _id: user._id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("GET /api/users/me/account error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// PATCH /api/users/me/password — Change password
// ═══════════════════════════════════════════════
// Body: { "currentPassword": "...", "newPassword": "..." }
router.patch("/me/password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Both currentPassword and newPassword are required.",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters.",
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    // Hash and save new password
    const saltRounds = 10;
    user.passwordHash = await bcrypt.hash(newPassword, saltRounds);
    await user.save();

    return res.json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (err) {
    console.error("PATCH /api/users/me/password error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// GET /api/users/:id/profile — Public profile
// ═══════════════════════════════════════════════
// Returns public info only: username, join date,
// project count, server count.
// NEVER returns email or passwordHash.
router.get("/:id/profile", authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID." });
    }

    const user = await User.findById(req.params.id)
      .select("username createdAt")
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Count projects where user is a member
    const projectCount = await Project.countDocuments({
      "members.userId": user._id,
    });

    // Count servers where user is owner or member
    const serverCount = await Server.countDocuments({
      $or: [
        { owner: user._id },
        { members: user._id },
      ],
    });

    return res.json({
      success: true,
      data: {
        _id: user._id,
        username: user.username,
        createdAt: user.createdAt,
        projectCount,
        serverCount,
      },
    });
  } catch (err) {
    console.error("GET /api/users/:id/profile error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

module.exports = router;
