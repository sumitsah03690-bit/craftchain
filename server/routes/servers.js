// /server/routes/servers.js
// ──────────────────────────────────────────────
// CRUD routes for CraftChain Servers.
// A server is a container for multiple projects.
// ──────────────────────────────────────────────

const express = require("express");
const mongoose = require("mongoose");
const Server = require("../models/Server");
const Project = require("../models/Project");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const generateJoinCode = require("../utils/joinCode");

const router = express.Router();

// ═══════════════════════════════════════════════
// POST /api/servers — Create a new server
// ═══════════════════════════════════════════════
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Server name is required.",
      });
    }

    const server = new Server({
      name: name.trim(),
      owner: req.user.id,
      members: [req.user.id],
      moderators: [],
      joinCode: generateJoinCode(),
    });

    await server.save();

    return res.status(201).json({ success: true, data: server });
  } catch (err) {
    console.error("POST /api/servers error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// GET /api/servers — List servers for current user
// ═══════════════════════════════════════════════
router.get("/", authMiddleware, async (req, res) => {
  try {
    const servers = await Server.find({
      $or: [
        { owner: req.user.id },
        { members: req.user.id },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    // For each server, count its projects
    const serverIds = servers.map((s) => s._id);
    const projectCounts = await Project.aggregate([
      { $match: { serverId: { $in: serverIds } } },
      { $group: { _id: "$serverId", count: { $sum: 1 } } },
    ]);
    const countMap = {};
    for (const pc of projectCounts) {
      countMap[String(pc._id)] = pc.count;
    }

    const data = servers.map((s) => ({
      _id: s._id,
      name: s.name,
      owner: s.owner,
      joinCode: s.joinCode,
      memberCount: (s.members || []).length,
      projectCount: countMap[String(s._id)] || 0,
      createdAt: s.createdAt,
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error("GET /api/servers error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// GET /api/servers/:id — Server detail + projects
// ═══════════════════════════════════════════════
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid server ID." });
    }

    const server = await Server.findById(req.params.id).lean();
    if (!server) {
      return res.status(404).json({ success: false, message: "Server not found." });
    }

    // Verify membership
    const userId = req.user.id.toString();
    const isMember = server.owner.toString() === userId ||
      (server.members || []).some((m) => m.toString() === userId);

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a member of this server.",
      });
    }

    // Get projects belonging to this server
    const projects = await Project.find({ serverId: server._id })
      .select("name finalItem createdBy createdAt joinCode")
      .sort({ createdAt: -1 })
      .lean();

    // Determine caller's role
    let callerRole = "member";
    if (server.owner.toString() === userId) {
      callerRole = "owner";
    } else if ((server.moderators || []).some((m) => m.toString() === userId)) {
      callerRole = "moderator";
    }

    // ── Build populated members list ──────────
    // Collect all unique user IDs (owner + members)
    const allMemberIds = new Set();
    allMemberIds.add(server.owner.toString());
    for (const m of server.members || []) {
      allMemberIds.add(m.toString());
    }

    const users = await User.find({ _id: { $in: [...allMemberIds] } })
      .select("_id username createdAt")
      .lean();

    const userMap = {};
    for (const u of users) {
      userMap[u._id.toString()] = u;
    }

    const moderatorSet = new Set(
      (server.moderators || []).map((m) => m.toString())
    );

    const membersList = [...allMemberIds].map((uid) => {
      const u = userMap[uid];
      let role = "member";
      if (uid === server.owner.toString()) role = "owner";
      else if (moderatorSet.has(uid)) role = "moderator";

      // Minecraft self-assigned role (from memberRoles map)
      const rolesMap = server.memberRoles || {};
      const mcRole = (rolesMap instanceof Map ? rolesMap.get(uid) : rolesMap[uid]) || "member";

      return {
        _id: uid,
        username: u ? u.username : "Unknown",
        role,
        mcRole,
      };
    });

    // Sort: owner first, then moderators, then members
    const roleOrder = { owner: 0, moderator: 1, member: 2 };
    membersList.sort((a, b) => (roleOrder[a.role] || 2) - (roleOrder[b.role] || 2));

    return res.json({
      success: true,
      data: {
        ...server,
        callerRole,
        projects,
        membersList,
        discordLink: server.discordLink || "",
      },
    });
  } catch (err) {
    console.error("GET /api/servers/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// DELETE /api/servers/:id — Delete server + projects
// ═══════════════════════════════════════════════
// Owner only. Deletes the server and all its projects.
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid server ID." });
    }

    const server = await Server.findById(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, message: "Server not found." });
    }

    if (server.owner.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the server owner can delete this server.",
      });
    }

    // Delete all projects belonging to this server
    await Project.deleteMany({ serverId: server._id });

    // Delete the server itself
    await Server.findByIdAndDelete(req.params.id);

    return res.json({ success: true, message: "Server and all its projects deleted." });
  } catch (err) {
    console.error("DELETE /api/servers/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// POST /api/servers/join-by-code — Join via code
// ═══════════════════════════════════════════════
router.post("/join-by-code", authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || typeof code !== "string" || code.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Join code is required.",
      });
    }

    const server = await Server.findOne({ joinCode: code.trim() });
    if (!server) {
      return res.status(404).json({
        success: false,
        message: "Invalid join code. No server found.",
      });
    }

    const userId = req.user.id.toString();
    const alreadyMember = (server.members || []).some(
      (m) => m.toString() === userId
    );

    if (alreadyMember || server.owner.toString() === userId) {
      return res.status(409).json({
        success: false,
        message: "You are already a member of this server.",
      });
    }

    server.members.push(req.user.id);
    await server.save();

    return res.json({
      success: true,
      message: `Joined server "${server.name}" successfully.`,
      data: { serverId: server._id, name: server.name },
    });
  } catch (err) {
    console.error("POST /api/servers/join-by-code error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// PATCH /api/servers/:id/members/:userId
// ═══════════════════════════════════════════════
// Promote/demote a member. Owner only.
// Body: { "role": "moderator" | "member" }
router.patch("/:id/members/:userId", authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid server ID." });
    }

    const server = await Server.findById(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, message: "Server not found." });
    }

    if (server.owner.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the server owner can change member roles.",
      });
    }

    const { role } = req.body;
    if (!role || !["moderator", "member"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be 'moderator' or 'member'.",
      });
    }

    const targetId = req.params.userId;

    if (targetId === server.owner.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot change the owner's role.",
      });
    }

    // Check target is a member
    const isMember = (server.members || []).some(
      (m) => m.toString() === targetId
    );
    if (!isMember) {
      return res.status(404).json({
        success: false,
        message: "User is not a member of this server.",
      });
    }

    if (role === "moderator") {
      // Add to moderators if not already
      if (!(server.moderators || []).some((m) => m.toString() === targetId)) {
        server.moderators.push(targetId);
      }
    } else {
      // Remove from moderators
      server.moderators = (server.moderators || []).filter(
        (m) => m.toString() !== targetId
      );
    }

    await server.save();

    return res.json({
      success: true,
      message: `Role updated to ${role}.`,
      data: { members: server.members, moderators: server.moderators },
    });
  } catch (err) {
    console.error("PATCH server members error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// PATCH /api/servers/:id/my-role — Self-assign
// Minecraft role (farmer, miner, builder, etc.)
// ═══════════════════════════════════════════════
const VALID_MC_ROLES = [
  "member", "miner", "builder", "farmer",
  "nether_specialist", "redstoner", "enchanter",
];

router.patch("/:id/my-role", authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid server ID." });
    }

    const { role } = req.body;
    if (!role || !VALID_MC_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${VALID_MC_ROLES.join(", ")}`,
      });
    }

    const server = await Server.findById(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, message: "Server not found." });
    }

    const userId = req.user.id.toString();
    const isMember =
      server.owner.toString() === userId ||
      (server.members || []).some((m) => m.toString() === userId);

    if (!isMember) {
      return res.status(403).json({ success: false, message: "Not a member." });
    }

    // Set the role in memberRoles map
    if (!server.memberRoles) server.memberRoles = new Map();
    server.memberRoles.set(userId, role);
    server.markModified("memberRoles");
    await server.save();

    return res.json({
      success: true,
      message: `Your role is now ${role}.`,
      data: { role },
    });
  } catch (err) {
    console.error("PATCH /my-role error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// PATCH /api/servers/:id/discord-link
// Owner-only: set or clear the Discord link
// ═══════════════════════════════════════════════
router.patch("/:id/discord-link", authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid server ID." });
    }

    const server = await Server.findById(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, message: "Server not found." });
    }

    if (server.owner.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: "Owner only." });
    }

    const { discordLink } = req.body;
    server.discordLink = (discordLink || "").trim().slice(0, 200);
    await server.save();

    return res.json({
      success: true,
      message: "Discord link updated.",
      data: { discordLink: server.discordLink },
    });
  } catch (err) {
    console.error("PATCH /discord-link error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// GET /api/servers/:id/activity
// Aggregate recent events from all server projects
// ═══════════════════════════════════════════════
router.get("/:id/activity", authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid server ID." });
    }

    const server = await Server.findById(req.params.id).lean();
    if (!server) {
      return res.status(404).json({ success: false, message: "Server not found." });
    }

    // Verify membership
    const userId = req.user.id.toString();
    const isMember =
      server.owner.toString() === userId ||
      (server.members || []).some((m) => m.toString() === userId);

    if (!isMember) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    // Get all projects for this server, only fetching events + name
    const projects = await Project.find({ serverId: server._id })
      .select("name events")
      .lean();

    // Aggregate and flatten events across all projects
    let allEvents = [];
    for (const p of projects) {
      for (const ev of p.events || []) {
        allEvents.push({
          ...ev,
          projectName: p.name,
          projectId: p._id,
        });
      }
    }

    // Sort by timestamp desc, limit 30
    allEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    allEvents = allEvents.slice(0, 30);

    return res.json({ success: true, data: allEvents });
  } catch (err) {
    console.error("GET /activity error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

module.exports = router;

