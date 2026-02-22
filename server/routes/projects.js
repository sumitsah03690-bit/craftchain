// /server/routes/projects.js
// ──────────────────────────────────────────────
// CRUD + contribution + activity routes for
// CraftChain projects.
//
// Mounted at /api/projects (see server.js), so:
//   POST   /api/projects                – create
//   GET    /api/projects                – list (paginated)
//   GET    /api/projects/:id            – detail (computed state)
//   PUT    /api/projects/:id            – update
//   POST   /api/projects/:id/join       – join project
//   POST   /api/projects/:id/contribute – contribute items
//   GET    /api/projects/:id/activity   – activity feed
//   DELETE /api/projects/:id            – delete
//
// Response format (consistent with auth routes):
//   Success → { success: true,  data: { ... } }
//   Error   → { success: false, message: "..." }
// ──────────────────────────────────────────────

const express = require("express");
const mongoose = require("mongoose");
const Project = require("../models/Project");
const authMiddleware = require("../middleware/authMiddleware");
const {
  computeItemStatuses,
  computeProgress,
  computeProjectState,
  getUnmetDependencies,
} = require("../utils/projectHelpers");

const router = express.Router();

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

// ═══════════════════════════════════════════════
// POST /api/projects — Create a new project
// ═══════════════════════════════════════════════
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, finalItem, items: rawItems, autoFillFromMinecraft } = req.body;

    // ── Validate required fields ──────────────
    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ success: false, message: "Project name is required." });
    }
    if (!finalItem || typeof finalItem !== "string" || finalItem.trim() === "") {
      return res.status(400).json({ success: false, message: "finalItem is required." });
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
      members: [{ userId: req.user.id, role: "owner" }],
      items,
      contributions: [],
      events: [],
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
router.get("/", optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    const mineOnly = req.query.mineOnly === "true";

    let filter = {};

    if (mineOnly) {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required for mineOnly filter.",
        });
      }
      filter = {
        $or: [
          { createdBy: req.user.id },
          { "members.userId": req.user.id },
        ],
      };
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
// Uses computeProjectState() for computed statuses,
// progress, and bottlenecks.  Also returns an
// activityPreview (last 10 events, newest first).
router.get("/:id", async (req, res) => {
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

    return res.json({
      success: true,
      data: state.projectWithStatuses,
      progress: state.progress,
      bottlenecks: state.bottlenecks,
      contributionSummary,
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
router.put("/:id", authMiddleware, async (req, res) => {
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

    const role = req.body.role || "member";
    project.members.push({ userId: req.user.id, role });

    // ── Push "join" event ─────────────────────
    pushEvent(project, {
      type: "join",
      actor: { id: req.user.id, username: req.user.username },
      message: `${req.user.username} joined the project`,
    });

    await project.save();

    return res.json({ success: true, data: { members: project.members } });
  } catch (err) {
    console.error("POST /api/projects/:id/join error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ═══════════════════════════════════════════════
// DELETE /api/projects/:id — Delete project
// ═══════════════════════════════════════════════
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

    await Project.findByIdAndDelete(req.params.id);

    return res.json({ success: true, message: "Deleted" });
  } catch (err) {
    console.error("DELETE /api/projects/:id error:", err);
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
router.post("/:id/contribute", authMiddleware, async (req, res) => {
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
    // Used later to detect the completion transition for the
    // "item_completed" auto-event.
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
    // We always push a "contribution" event.
    // If the item transitions to completed, we also
    // push an "item_completed" event.
    const eventsToAdd = [
      {
        type: "contribution",
        actor: { id: req.user.id, username: req.user.username },
        meta: { itemName: targetItem.name, quantity: acceptedQuantity },
        message: `${req.user.username} contributed ${acceptedQuantity} ${targetItem.name}`,
        timestamp: new Date(),
      },
    ];

    // Will the item be completed after this update?
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

        // Update contribution event's quantity to match fresh data
        eventsToAdd[0].meta.quantity = freshAccepted;
        eventsToAdd[0].message = `${req.user.username} contributed ${freshAccepted} ${targetItem.name}`;

        // Recheck completion transition with fresh data
        const freshWillComplete =
          (freshItem.quantityCollected + freshAccepted) >= freshItem.quantityRequired;
        const freshWasComplete =
          freshItem.quantityCollected >= freshItem.quantityRequired;

        // Remove or add item_completed event based on fresh data
        if (freshWasComplete || !freshWillComplete) {
          // Remove item_completed event if it was added
          const idx = eventsToAdd.findIndex((e) => e.type === "item_completed");
          if (idx !== -1) eventsToAdd.splice(idx, 1);
        } else if (!freshWasComplete && freshWillComplete) {
          // Ensure item_completed event exists
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

        // Build the $push for events — push all events at once
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

        // Re-read and cap events if needed
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

      // Cap events after fallback update
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
// Returns the most recent events, newest first.
// Query params:
//   ?limit=20 – max events to return (default 20)
//
// No auth required for now.
router.get("/:id/activity", async (req, res) => {
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

    // Return newest first, limited
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
