const express = require("express");
const mongoose = require("mongoose");
const Project = require("../models/Project");
const User = require("../models/User");
const Server = require("../models/Server");
const authMiddleware = require("../middleware/authMiddleware");
const membershipMiddleware = require("../middleware/membershipMiddleware");
const generateJoinCode = require("../utils/joinCode");
const {
  computeItemStatuses,
  computeProgress,
  computeProjectState,
  getUnmetDependencies,
} = require("../utils/projectHelpers");

const router = express.Router();

// Valid assignable roles (owner excluded — can't be assigned)
const ASSIGNABLE_ROLES = ["moderator", "member", "miner", "builder", "planner"];

// ─────────────────────────────────────────────────
// Helper: optionally parse auth but don't reject
// if missing.  Used on public endpoints that behave
// differently when the caller IS logged in.
// ─────────────────────────────────────────────────
function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const jwt = require("jsonwebtoken");
    try {
      const decoded = jwt.verify(
        authHeader.split(" ")[1],
        process.env.JWT_SECRET
      );
      req.user = { id: decoded.id, username: decoded.username };
    } catch (_err) {
      // Token invalid — treat as anonymous
    }
  }
  next();
}

// ─────────────────────────────────────────────────
// Helper: validate & sanitize an incoming items array.
// Returns { items, error }.  On error, `items` is null.
// ─────────────────────────────────────────────────
function sanitizeItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { items: null, error: "Items must be a non-empty array." };
  }

  const cleaned = [];
  for (let i = 0; i < rawItems.length; i++) {
    const raw = rawItems[i];

    if (!raw.name || typeof raw.name !== "string" || raw.name.trim() === "") {
      return { items: null, error: `items[${i}].name is required and must be a non-empty string.` };
    }

    const qtyReq = Number(raw.quantityRequired);
    if (!Number.isFinite(qtyReq) || qtyReq < 1 || !Number.isInteger(qtyReq)) {
      return { items: null, error: `items[${i}].quantityRequired must be a positive integer.` };
    }

    cleaned.push({
      itemId: raw.itemId || null,
      name: raw.name.trim(),
      quantityRequired: qtyReq,
      quantityCollected: 0,
      dependencies: Array.isArray(raw.dependencies) ? raw.dependencies : [],
      status: "pending",
    });
  }

  return { items: cleaned, error: null };
}

// ─────────────────────────────────────────────────
// Helper: push an event to a project's events array.
// Caps the array at 200 entries by removing the
// oldest events (FIFO) when the limit is exceeded.
//
// This mutates the Mongoose document in memory —
// the caller is responsible for calling project.save().
// ─────────────────────────────────────────────────
const EVENT_CAP = 200;

function pushEvent(project, event) {
  // Ensure defaults
  const fullEvent = {
    timestamp: new Date(),
    ...event,
  };

  project.events.push(fullEvent);

  // Cap: remove oldest events if we've exceeded the limit.
  // We shift from the front (oldest) until we're at the cap.
  while (project.events.length > EVENT_CAP) {
    project.events.shift();
  }
}

// ─────────────────────────────────────────────────
// Helper: compute role-based task suggestions
// ─────────────────────────────────────────────────
function computeSuggestedTasks(project, role) {
  const items = project.items || [];
  const suggestions = [];

  // Get pending/incomplete items with remaining quantities
  const incomplete = items
    .filter((i) => (i.quantityCollected || 0) < i.quantityRequired)
    .map((i) => ({
      itemName: i.name,
      remaining: i.quantityRequired - (i.quantityCollected || 0),
      status: i.status,
      raw: !i.dependencies || i.dependencies.length === 0,
      deps: i.dependencies || [],
    }));

  switch (role) {
    case "miner":
      // Raw materials — items with no dependencies
      for (const item of incomplete) {
        if (item.raw) {
          suggestions.push({
            itemName: item.itemName,
            remaining: item.remaining,
            reason: "🪨 Raw material — mine/gather this",
          });
        }
      }
      suggestions.sort((a, b) => b.remaining - a.remaining);
      break;

    case "builder":
      // Craftable items with all dependencies met
      for (const item of incomplete) {
        if (!item.raw && item.status !== "blocked") {
          suggestions.push({
            itemName: item.itemName,
            remaining: item.remaining,
            reason: "⚒ Craftable — all materials ready",
          });
        }
      }
      suggestions.sort((a, b) => b.remaining - a.remaining);
      break;

    case "planner": {
      // Bottleneck items — items that are blocking others
      const depCounts = {};
      for (const item of items) {
        for (const dep of item.dependencies || []) {
          const key = dep.toLowerCase().trim();
          depCounts[key] = (depCounts[key] || 0) + 1;
        }
      }
      for (const item of incomplete) {
        const key = item.itemName.toLowerCase().trim();
        const blocking = depCounts[key] || 0;
        if (blocking > 0 || item.status === "blocked") {
          suggestions.push({
            itemName: item.itemName,
            remaining: item.remaining,
            reason: blocking > 0
              ? `📋 Blocks ${blocking} item${blocking > 1 ? "s" : ""} — prioritize`
              : "⚠ Blocked — resolve dependencies",
          });
        }
      }
      suggestions.sort((a, b) => b.remaining - a.remaining);
      break;
    }

    default:
      // Owner / member — top items by remaining
      for (const item of incomplete) {
        suggestions.push({
          itemName: item.itemName,
          remaining: item.remaining,
          reason: item.raw ? "🪨 Raw material" : "⚒ Craftable item",
        });
      }
      suggestions.sort((a, b) => b.remaining - a.remaining);
      break;
  }

  return suggestions.slice(0, 5);
}

// ═══════════════════════════════════════════════
// POST /api/projects — Create a new project
// ═══════════════════════════════════════════════
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, finalItem, items: rawItems, autoFillFromMinecraft, serverId } = req.body;

    // ── Validate required fields ──────────────
    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ success: false, message: "Project name is required." });
    }
    if (!finalItem || typeof finalItem !== "string" || finalItem.trim() === "") {
      return res.status(400).json({ success: false, message: "finalItem is required." });
    }

    // ── Validate serverId if provided ─────────
    let validServerId = null;
    if (serverId) {
      if (!mongoose.Types.ObjectId.isValid(serverId)) {
        return res.status(400).json({ success: false, message: "Invalid server ID." });
      }
      const server = await Server.findById(serverId);
      if (!server) {
        return res.status(404).json({ success: false, message: "Server not found." });
      }
      // Verify caller is a member of the server
      const isServerMember = server.owner.toString() === req.user.id.toString() ||
        (server.members || []).some((m) => m.toString() === req.user.id.toString());
      if (!isServerMember) {
        return res.status(403).json({
          success: false,
          message: "You must be a member of the server to create a project in it.",
        });
      }
      validServerId = server._id;
    }

    // ── Resolve items (autofill or manual) ────
    let items = null;

    if (autoFillFromMinecraft === true) {
      try {
        const mc = require("../utils/minecraft");
        if (typeof mc.initMinecraft === "function" && typeof mc.buildDependencyList === "function") {
          await mc.initMinecraft();
          const depList = await mc.buildDependencyList(finalItem.trim(), { depthLimit: 1 });
          if (depList && Array.isArray(depList) && depList.length > 0) {
            const mapped = depList.map((dep) => ({
              name: dep.name,
              quantityRequired: dep.quantityRequired || 1,
            }));
            const sanitized = sanitizeItems(mapped);
            if (sanitized.error) {
              return res.status(400).json({ success: false, message: `Autofill returned bad data: ${sanitized.error}` });
            }
            items = sanitized.items;
          }
        }
      } catch (_err) {
        // Helper not found or failed — handled below
      }

      if (!items) {
        if (rawItems) {
          const sanitized = sanitizeItems(rawItems);
          if (sanitized.error) {
            return res.status(400).json({ success: false, message: sanitized.error });
          }
          items = sanitized.items;
        } else {
          return res.status(400).json({
            success: false,
            message: "Autofill helper not available — provide items manually.",
          });
        }
      }
    } else if (rawItems) {
      const sanitized = sanitizeItems(rawItems);
      if (sanitized.error) {
        return res.status(400).json({ success: false, message: sanitized.error });
      }
      items = sanitized.items;
    } else {
      return res.status(400).json({
        success: false,
        message: "You must provide an items array or set autoFillFromMinecraft to true.",
      });
    }

    // ── Build & save the project ──────────────
    const project = new Project({
      name: name.trim(),
      finalItem: finalItem.trim(),
      createdBy: req.user.id,
      serverId: validServerId,
      joinCode: generateJoinCode(),
      visibility: "private",
      members: [{ userId: req.user.id, role: "owner" }],
      items,
      contributions: [],
      events: [],
      planVersions: [],
      currentPlanVersion: 1,
      createdAt: new Date(),
    });

    // Set initial statuses using the pure helper.
    // computeItemStatuses returns a new object, so we
    // copy the statuses back onto the Mongoose doc items.
    const computed = computeItemStatuses(project);
    for (let i = 0; i < project.items.length; i++) {
      project.items[i].status = computed.items[i].status;
    }

    // ── Push "create" event ───────────────────
    pushEvent(project, {
      type: "create",
      actor: { id: req.user.id, username: req.user.username },
      message: `${req.user.username} created the project`,
    });

    await project.save();

    return res.status(201).json({ success: true, data: project });
  } catch (err) {
    console.error("POST /api/projects error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// GET /api/projects — List projects (paginated)
// ═══════════════════════════════════════════════
router.get("/", authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    const serverId = req.query.serverId || null;

    // Only return projects the user is a member of
    let filter = {
      $or: [
        { createdBy: req.user.id },
        { "members.userId": req.user.id },
      ],
    };

    // Optionally filter by server
    if (serverId && mongoose.Types.ObjectId.isValid(serverId)) {
      filter.serverId = serverId;
    }

    const [projects, total] = await Promise.all([
      Project.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Project.countDocuments(filter),
    ]);

    const data = projects.map((p) => {
      const progress = computeProgress(p);
      return {
        _id: p._id,
        name: p.name,
        finalItem: p.finalItem,
        createdBy: p.createdBy,
        serverId: p.serverId || null,
        joinCode: p.joinCode || null,
        progressPercent: progress.percent,
      };
    });

    return res.json({ success: true, data, total });
  } catch (err) {
    console.error("GET /api/projects error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// GET /api/projects/:id — Full project detail
// ═══════════════════════════════════════════════
// Enhanced with memberRoles + suggestedTasks.
router.get("/:id", authMiddleware, membershipMiddleware(), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }

    const project = await Project.findById(req.params.id).lean();
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    // ── Compute full state ────────────────────
    const state = computeProjectState(project);

    // ── Activity preview: last 10 events, newest first ──
    const allEvents = project.events || [];
    const activityPreview = allEvents
      .slice(-10)
      .reverse();

    // ── Build contribution summary per member ──
    const contribMap = {};
    for (const c of project.contributions || []) {
      const uid = String(c.userId);
      if (!contribMap[uid]) {
        contribMap[uid] = { userId: uid, username: c.username, totalContributed: 0 };
      }
      contribMap[uid].totalContributed += c.quantity || 0;
    }
    const contribList = Object.values(contribMap);
    const grandTotal = contribList.reduce((s, m) => s + m.totalContributed, 0);
    const contributionSummary = contribList
      .map((m) => ({
        ...m,
        percent: grandTotal > 0 ? Math.round((m.totalContributed / grandTotal) * 100) : 0,
      }))
      .sort((a, b) => b.totalContributed - a.totalContributed);

    // ── Build memberRoles list ────────────────
    const memberIds = (project.members || []).map((m) => m.userId);
    const users = await User.find({ _id: { $in: memberIds } })
      .select("_id username")
      .lean();
    const userMap = {};
    for (const u of users) {
      userMap[String(u._id)] = u.username;
    }
    const memberRoles = (project.members || []).map((m) => ({
      userId: String(m.userId),
      username: userMap[String(m.userId)] || "Unknown",
      role: m.role || "member",
    }));

    // ── Compute suggested tasks for current user ──
    let suggestedTasks = [];
    if (req.user) {
      const callerMember = (project.members || []).find(
        (m) => String(m.userId) === String(req.user.id)
      );
      const callerRole = callerMember ? callerMember.role : "member";
      suggestedTasks = computeSuggestedTasks(state.projectWithStatuses, callerRole);
    }

    return res.json({
      success: true,
      data: state.projectWithStatuses,
      progress: state.progress,
      bottlenecks: state.bottlenecks,
      contributionSummary,
      memberRoles,
      suggestedTasks,
      currentPlanVersion: project.currentPlanVersion || 1,
      activityPreview,
    });
  } catch (err) {
    console.error("GET /api/projects/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// PUT /api/projects/:id — Update project
// ═══════════════════════════════════════════════
router.put("/:id", authMiddleware, membershipMiddleware(), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    const userId = req.user.id.toString();
    const isCreator = project.createdBy.toString() === userId;
    const isMember = project.members.some(
      (m) => m.userId.toString() === userId
    );

    if (!isCreator && !isMember) {
      return res.status(403).json({
        success: false,
        message: "You must be the project creator or a member to update this project.",
      });
    }

    const { name, finalItem, items: rawItems } = req.body;

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim() === "") {
        return res.status(400).json({ success: false, message: "Name must be a non-empty string." });
      }
      project.name = name.trim();
    }

    if (finalItem !== undefined) {
      if (typeof finalItem !== "string" || finalItem.trim() === "") {
        return res.status(400).json({ success: false, message: "finalItem must be a non-empty string." });
      }
      project.finalItem = finalItem.trim();
    }

    if (rawItems !== undefined) {
      const sanitized = sanitizeItems(rawItems);
      if (sanitized.error) {
        return res.status(400).json({ success: false, message: sanitized.error });
      }
      project.items = sanitized.items;
    }

    // Recompute statuses using pure helper
    const computed = computeItemStatuses(project);
    for (let i = 0; i < project.items.length; i++) {
      project.items[i].status = computed.items[i].status;
    }

    await project.save();

    return res.json({ success: true, data: project });
  } catch (err) {
    console.error("PUT /api/projects/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// POST /api/projects/:id/join — Join a project
// ═══════════════════════════════════════════════
router.post("/:id/join", authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    const userId = req.user.id.toString();
    const alreadyMember = project.members.some(
      (m) => m.userId.toString() === userId
    );

    if (alreadyMember) {
      return res.status(409).json({
        success: false,
        message: "You are already a member of this project.",
      });
    }

    // Validate role if provided
    const role = req.body.role || "member";
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${ASSIGNABLE_ROLES.join(", ")}`,
      });
    }

    project.members.push({ userId: req.user.id, role });

    // ── Push "join" event ─────────────────────
    pushEvent(project, {
      type: "join",
      actor: { id: req.user.id, username: req.user.username },
      message: `${req.user.username} joined as ${role}`,
    });

    await project.save();

    return res.json({ success: true, data: { members: project.members } });
  } catch (err) {
    console.error("POST /api/projects/:id/join error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// PATCH /api/projects/:id/members/:userId/role
// ═══════════════════════════════════════════════
// Assign a role to a member. Owner only.
// Body: { "role": "miner" }
router.patch("/:id/members/:userId/role", authMiddleware, membershipMiddleware(), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    // Only owner can assign roles
    const callerMember = project.members.find(
      (m) => m.userId.toString() === req.user.id.toString()
    );
    if (!callerMember || callerMember.role !== "owner") {
      return res.status(403).json({
        success: false,
        message: "Only the project owner can assign roles.",
      });
    }

    const { role } = req.body;
    if (!role || !ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${ASSIGNABLE_ROLES.join(", ")}`,
      });
    }

    // Find target member
    const targetMember = project.members.find(
      (m) => m.userId.toString() === req.params.userId
    );
    if (!targetMember) {
      return res.status(404).json({
        success: false,
        message: "Member not found in this project.",
      });
    }

    // Can't change the owner's role
    if (targetMember.role === "owner") {
      return res.status(400).json({
        success: false,
        message: "Cannot change the owner's role.",
      });
    }

    const oldRole = targetMember.role;
    targetMember.role = role;

    // Look up the target user's username for the event
    const targetUser = await User.findById(req.params.userId).select("username").lean();
    const targetUsername = targetUser ? targetUser.username : "Unknown";

    pushEvent(project, {
      type: "role_change",
      actor: { id: req.user.id, username: req.user.username },
      meta: { itemName: targetUsername },
      message: `${req.user.username} changed ${targetUsername}'s role from ${oldRole} to ${role}`,
    });

    await project.save();

    return res.json({
      success: true,
      data: { members: project.members },
      message: `Role updated to ${role}`,
    });
  } catch (err) {
    console.error("PATCH role error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// POST /api/projects/:id/update-plan
// ═══════════════════════════════════════════════
// Update the crafting plan (items) with versioning.
// Snapshots the current items before replacing.
// Auth required, owner or planner only.
// Body: { "items": [...], "label": "v2 — added nether materials" }
router.post("/:id/update-plan", authMiddleware, membershipMiddleware(), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    // Only owner or planner can update the plan
    const callerMember = project.members.find(
      (m) => m.userId.toString() === req.user.id.toString()
    );
    if (!callerMember || !["owner", "planner"].includes(callerMember.role)) {
      return res.status(403).json({
        success: false,
        message: "Only the project owner or a planner can update the crafting plan.",
      });
    }

    const { items: rawItems, label } = req.body;
    if (!rawItems) {
      return res.status(400).json({
        success: false,
        message: "items array is required.",
      });
    }

    const sanitized = sanitizeItems(rawItems);
    if (sanitized.error) {
      return res.status(400).json({ success: false, message: sanitized.error });
    }

    // Snapshot current items into planVersions
    const currentVersion = project.currentPlanVersion || 1;
    project.planVersions.push({
      version: currentVersion,
      label: `v${currentVersion}`,
      items: project.items.map((i) => i.toObject ? i.toObject() : { ...i }),
      createdBy: req.user.id,
      createdAt: new Date(),
    });

    // Replace items with new plan
    project.items = sanitized.items;
    project.currentPlanVersion = currentVersion + 1;

    // Recompute statuses
    const computed = computeItemStatuses(project);
    for (let i = 0; i < project.items.length; i++) {
      project.items[i].status = computed.items[i].status;
    }

    pushEvent(project, {
      type: "plan_update",
      actor: { id: req.user.id, username: req.user.username },
      message: `${req.user.username} updated the crafting plan to v${currentVersion + 1}${label ? ` — ${label}` : ""}`,
    });

    await project.save();

    return res.json({
      success: true,
      data: project,
      currentPlanVersion: project.currentPlanVersion,
      message: `Plan updated to v${project.currentPlanVersion}`,
    });
  } catch (err) {
    console.error("POST update-plan error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// GET /api/projects/:id/plan-history
// ═══════════════════════════════════════════════
// Returns the plan version history.
router.get("/:id/plan-history", authMiddleware, membershipMiddleware(), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }

    const project = await Project.findById(req.params.id)
      .select("planVersions currentPlanVersion")
      .lean();

    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    const versions = (project.planVersions || []).map((v) => ({
      version: v.version,
      label: v.label,
      itemCount: (v.items || []).length,
      createdBy: v.createdBy,
      createdAt: v.createdAt,
    }));

    return res.json({
      success: true,
      data: versions,
      currentPlanVersion: project.currentPlanVersion || 1,
    });
  } catch (err) {
    console.error("GET plan-history error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// POST /api/projects/:id/restore-plan/:version
// ═══════════════════════════════════════════════
// Restore items from a previous plan version.
// Owner only. Snapshots current plan first.
router.post("/:id/restore-plan/:version", authMiddleware, membershipMiddleware(), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    // Owner only
    const callerMember = project.members.find(
      (m) => m.userId.toString() === req.user.id.toString()
    );
    if (!callerMember || callerMember.role !== "owner") {
      return res.status(403).json({
        success: false,
        message: "Only the project owner can restore a plan version.",
      });
    }

    const targetVersion = parseInt(req.params.version, 10);
    const snapshot = (project.planVersions || []).find(
      (v) => v.version === targetVersion
    );
    if (!snapshot) {
      return res.status(404).json({
        success: false,
        message: `Plan version ${targetVersion} not found.`,
      });
    }

    // Snapshot current plan before restoring
    const currentVersion = project.currentPlanVersion || 1;
    project.planVersions.push({
      version: currentVersion,
      label: `v${currentVersion} (before restore)`,
      items: project.items.map((i) => i.toObject ? i.toObject() : { ...i }),
      createdBy: req.user.id,
      createdAt: new Date(),
    });

    // Restore items from snapshot
    project.items = snapshot.items.map((i) => ({
      itemId: i.itemId || null,
      name: i.name,
      quantityRequired: i.quantityRequired,
      quantityCollected: 0,
      dependencies: i.dependencies || [],
      status: "pending",
    }));
    project.currentPlanVersion = currentVersion + 1;

    // Recompute statuses
    const computed = computeItemStatuses(project);
    for (let i = 0; i < project.items.length; i++) {
      project.items[i].status = computed.items[i].status;
    }

    pushEvent(project, {
      type: "plan_update",
      actor: { id: req.user.id, username: req.user.username },
      message: `${req.user.username} restored plan to v${targetVersion}`,
    });

    await project.save();

    return res.json({
      success: true,
      data: project,
      currentPlanVersion: project.currentPlanVersion,
      message: `Restored to v${targetVersion}`,
    });
  } catch (err) {
    console.error("POST restore-plan error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// DELETE /api/projects/:id — Delete project
// ═══════════════════════════════════════════════
// Owner only. Safely deletes project + cleans up
// related data. No orphan data will remain.
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    if (project.createdBy.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Only the project creator can delete this project.",
      });
    }

    // Delete the project
    await Project.findByIdAndDelete(req.params.id);

    return res.json({
      success: true,
      message: "Project and all related data deleted successfully.",
      deletedProjectId: req.params.id,
    });
  } catch (err) {
    console.error("DELETE /api/projects/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// POST /api/projects/join-by-code — Join via code
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

    const project = await Project.findOne({ joinCode: code.trim() });
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Invalid join code. No project found.",
      });
    }

    const userId = req.user.id.toString();
    const alreadyMember = project.members.some(
      (m) => m.userId.toString() === userId
    );

    if (alreadyMember) {
      return res.status(409).json({
        success: false,
        message: "You are already a member of this project.",
      });
    }

    project.members.push({ userId: req.user.id, role: "member" });

    // Push "join" event
    pushEvent(project, {
      type: "join",
      actor: { id: req.user.id, username: req.user.username },
      message: `${req.user.username} joined via invite code`,
    });

    await project.save();

    return res.json({
      success: true,
      message: `Joined project "${project.name}" successfully.`,
      data: {
        projectId: project._id,
        name: project.name,
        members: project.members,
      },
    });
  } catch (err) {
    console.error("POST /api/projects/join-by-code error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// POST /api/projects/:id/contribute — Contribute
// items to a project
// ═══════════════════════════════════════════════
// Body: { "itemName": "glass", "quantity": 3 }
//
// ATOMICITY STRATEGY:
// -------------------
//  1. PRIMARY — Mongoose transactions (sessions).
//     Requires a MongoDB replica set (or Atlas).
//
//  2. FALLBACK — Atomic findOneAndUpdate.
//     For single-node MongoDB without replica set.
// -------------------
router.post("/:id/contribute", authMiddleware, membershipMiddleware(), async (req, res) => {
  try {
    // ── 1. Validate request body ─────────────────
    const { itemName, quantity } = req.body;

    if (!itemName || typeof itemName !== "string" || itemName.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "itemName is required and must be a non-empty string.",
      });
    }

    const parsedQty = Number(quantity);
    if (!Number.isFinite(parsedQty) || parsedQty < 1 || !Number.isInteger(parsedQty)) {
      return res.status(400).json({
        success: false,
        message: "quantity must be an integer >= 1.",
      });
    }

    // ── 2. Validate project ID ───────────────────
    const projectId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }

    // ── 3. Load project (initial read) ───────────
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    // ── 4. Find target item (case-insensitive) ───
    const normalisedName = itemName.trim().toLowerCase();
    const targetItem = project.items.find(
      (i) => i.name.toLowerCase().trim() === normalisedName
    );

    if (!targetItem) {
      return res.status(400).json({
        success: false,
        message: `Item "${itemName.trim()}" not found in this project.`,
      });
    }

    // ── 5. Check dependency constraints ──────────
    const unmet = getUnmetDependencies(project, targetItem.name);
    if (unmet.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Cannot contribute — item has unmet dependencies.",
        unmetDependencies: unmet,
      });
    }

    // ── 6. Compute accepted quantity ─────────────
    const remaining = targetItem.quantityRequired - targetItem.quantityCollected;
    if (remaining <= 0) {
      return res.status(409).json({
        success: false,
        message: "Item already fully collected.",
        acceptedQuantity: 0,
        remaining: 0,
      });
    }

    const acceptedQuantity = Math.min(parsedQty, remaining);

    // ── 7. Snapshot: was this item complete BEFORE the update? ──
    const wasCompletedBefore = targetItem.quantityCollected >= targetItem.quantityRequired;

    // ── 8. Build contribution record ─────────────
    const contribution = {
      userId: req.user.id,
      username: req.user.username,
      itemName: targetItem.name,
      quantity: acceptedQuantity,
      timestamp: new Date(),
    };

    // ── 9. Build events to push ──────────────────
    const eventsToAdd = [
      {
        type: "contribution",
        actor: { id: req.user.id, username: req.user.username },
        meta: { itemName: targetItem.name, quantity: acceptedQuantity },
        message: `${req.user.username} contributed ${acceptedQuantity} ${targetItem.name}`,
        timestamp: new Date(),
      },
    ];

    const willBeCompleted =
      (targetItem.quantityCollected + acceptedQuantity) >= targetItem.quantityRequired;

    if (!wasCompletedBefore && willBeCompleted) {
      eventsToAdd.push({
        type: "item_completed",
        actor: { id: req.user.id, username: req.user.username },
        meta: { itemName: targetItem.name },
        message: `${targetItem.name} is now fully collected!`,
        timestamp: new Date(),
      });
    }

    // ── 10. Attempt atomic update ────────────────
    let updatedProject = null;
    let usedTransaction = false;

    try {
      // --- 10a. Transaction-based approach ---
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const freshProject = await Project.findById(projectId)
          .session(session)
          .exec();

        if (!freshProject) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({ success: false, message: "Project not found." });
        }

        const freshItem = freshProject.items.find(
          (i) => i.name.toLowerCase().trim() === normalisedName
        );

        if (!freshItem) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Item "${itemName.trim()}" not found in this project.`,
          });
        }

        const freshRemaining = freshItem.quantityRequired - freshItem.quantityCollected;
        if (freshRemaining <= 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(409).json({
            success: false,
            message: "Item already fully collected.",
            acceptedQuantity: 0,
            remaining: 0,
          });
        }

        const freshAccepted = Math.min(parsedQty, freshRemaining);
        contribution.quantity = freshAccepted;

        eventsToAdd[0].meta.quantity = freshAccepted;
        eventsToAdd[0].message = `${req.user.username} contributed ${freshAccepted} ${targetItem.name}`;

        const freshWillComplete =
          (freshItem.quantityCollected + freshAccepted) >= freshItem.quantityRequired;
        const freshWasComplete =
          freshItem.quantityCollected >= freshItem.quantityRequired;

        if (freshWasComplete || !freshWillComplete) {
          const idx = eventsToAdd.findIndex((e) => e.type === "item_completed");
          if (idx !== -1) eventsToAdd.splice(idx, 1);
        } else if (!freshWasComplete && freshWillComplete) {
          if (!eventsToAdd.some((e) => e.type === "item_completed")) {
            eventsToAdd.push({
              type: "item_completed",
              actor: { id: req.user.id, username: req.user.username },
              meta: { itemName: targetItem.name },
              message: `${targetItem.name} is now fully collected!`,
              timestamp: new Date(),
            });
          }
        }

        const updateOps = {
          $inc: { "items.$.quantityCollected": freshAccepted },
          $push: {
            contributions: contribution,
            events: { $each: eventsToAdd },
          },
        };

        const result = await Project.updateOne(
          { _id: projectId, "items._id": freshItem._id },
          updateOps,
          { session }
        );

        if (result.modifiedCount === 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(500).json({
            success: false,
            message: "Failed to update — please try again.",
          });
        }

        await session.commitTransaction();
        session.endSession();
        usedTransaction = true;

        updatedProject = await Project.findById(projectId);
        if (updatedProject && updatedProject.events.length > EVENT_CAP) {
          updatedProject.events = updatedProject.events.slice(-EVENT_CAP);
          await updatedProject.save();
        }
        updatedProject = updatedProject ? updatedProject.toObject() : null;

      } catch (txErr) {
        try { await session.abortTransaction(); } catch (_) { /* ignore */ }
        session.endSession();
        throw txErr;
      }
    } catch (sessionErr) {
      // --- 10b. Fallback: atomic findOneAndUpdate ---
      if (usedTransaction) {
        console.error("POST /:id/contribute — post-commit read failed:", sessionErr);
        return res.status(500).json({ success: false, message: "Server error." });
      }

      console.log(
        "POST /:id/contribute — transactions not available, using atomic fallback.",
        sessionErr.message || sessionErr
      );

      contribution.quantity = acceptedQuantity;
      eventsToAdd[0].meta.quantity = acceptedQuantity;
      eventsToAdd[0].message = `${req.user.username} contributed ${acceptedQuantity} ${targetItem.name}`;

      updatedProject = await Project.findOneAndUpdate(
        {
          _id: projectId,
          "items._id": targetItem._id,
          "items.quantityCollected": { $lt: targetItem.quantityRequired },
        },
        {
          $inc: { "items.$.quantityCollected": acceptedQuantity },
          $push: {
            contributions: contribution,
            events: { $each: eventsToAdd },
          },
        },
        { new: true }
      );

      if (!updatedProject) {
        const recheck = await Project.findById(projectId).lean();
        if (!recheck) {
          return res.status(404).json({ success: false, message: "Project not found." });
        }
        const recheckItem = recheck.items.find(
          (i) => i.name.toLowerCase().trim() === normalisedName
        );
        if (recheckItem && recheckItem.quantityCollected >= recheckItem.quantityRequired) {
          return res.status(409).json({
            success: false,
            message: "Item already fully collected (concurrent update).",
            acceptedQuantity: 0,
            remaining: 0,
          });
        }
        return res.status(500).json({
          success: false,
          message: "Failed to update — please try again.",
        });
      }

      if (updatedProject.events && updatedProject.events.length > EVENT_CAP) {
        updatedProject.events = updatedProject.events.slice(-EVENT_CAP);
        await updatedProject.save();
      }
      updatedProject = typeof updatedProject.toObject === "function"
        ? updatedProject.toObject()
        : updatedProject;
    }

    // ── 11. Recompute statuses & progress ────────
    const state = computeProjectState(updatedProject);

    const finalItem = state.projectWithStatuses.items.find(
      (i) => i.name.toLowerCase().trim() === normalisedName
    );
    const finalRemaining = finalItem
      ? finalItem.quantityRequired - finalItem.quantityCollected
      : 0;
    const finalAccepted = contribution.quantity;

    // ── 12. Respond ──────────────────────────────
    return res.json({
      success: true,
      data: state.projectWithStatuses,
      acceptedQuantity: finalAccepted,
      remainderRequested: parsedQty - finalAccepted,
      remaining: finalRemaining,
      progress: state.progress,
    });
  } catch (err) {
    console.error("POST /api/projects/:id/contribute error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// GET /api/projects/:id/activity — Activity feed
// ═══════════════════════════════════════════════
router.get("/:id/activity", authMiddleware, membershipMiddleware(), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }

    const project = await Project.findById(req.params.id)
      .select("events")
      .lean();

    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found." });
    }

    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      200
    );

    const events = (project.events || [])
      .slice(-limit)
      .reverse();

    return res.json({ success: true, data: events });
  } catch (err) {
    console.error("GET /api/projects/:id/activity error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

module.exports = router;
