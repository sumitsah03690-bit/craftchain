// /server/models/Project.js
// ──────────────────────────────────────────────
// Mongoose schema & model for a CraftChain project.
//
// A Project tracks:
//   - what the group is building (name, finalItem)
//   - who created it & who joined (members)
//   - the sub-items needed and their collection status
//   - an append-only log of contributions
//   - an event activity feed (capped at 200)
// ──────────────────────────────────────────────

const mongoose = require("mongoose");

// ── Item sub-schema ─────────────────────────────
// Each item represents one material the project needs.
// `dependencies` stores names of other items this one
// depends on — kept as plain strings for simplicity.
const ItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: String,
      default: null, // optional — used if wiring minecraft-data later
    },
    name: {
      type: String,
      required: [true, "Item name is required"],
      trim: true,
    },
    quantityRequired: {
      type: Number,
      required: [true, "quantityRequired must be provided"],
      min: [1, "quantityRequired must be at least 1"],
    },
    quantityCollected: {
      type: Number,
      default: 0,
      min: [0, "quantityCollected cannot be negative"],
    },
    dependencies: {
      type: [String], // e.g. ["cobblestone", "iron_ingot"]
      default: [],
    },
    status: {
      type: String,
      enum: ["pending", "blocked", "completed"],
      default: "pending",
    },
  },
  { _id: true } // each item gets its own _id for easy targeting
);

// ── Contribution sub-schema ─────────────────────
// Append-only log of who contributed what and when.
// `username` is denormalized so the front-end can
// display it without an extra User lookup.
const ContributionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    itemName: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Contribution quantity must be at least 1"],
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

// ── Member sub-schema ───────────────────────────
const VALID_ROLES = ["owner", "member", "miner", "builder", "planner"];

const MemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: VALID_ROLES,
      default: "member",
    },
  },
  { _id: false }
);

// ── Event sub-schema ────────────────────────────
// Activity feed events — capped at 200 per project.
// Tracks project creation, member joins, contributions,
// and item completion milestones.
const EventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["create", "join", "contribution", "item_completed", "role_change", "plan_update"],
      required: true,
    },
    actor: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      username: { type: String },
    },
    meta: {
      itemName: { type: String },
      quantity: { type: Number },
    },
    message: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

// ── Plan Version sub-schema ─────────────────────
// Append-only snapshot of the items array whenever
// the crafting plan is updated.
const PlanVersionSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    label: { type: String, default: "" },
    items: { type: [ItemSchema], required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// ── Project schema ──────────────────────────────
const ProjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Project name is required"],
    trim: true,
  },
  finalItem: {
    type: String,
    required: [true, "Final item is required"],
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  members: {
    type: [MemberSchema],
    default: [],
  },
  items: {
    type: [ItemSchema],
    default: [],
  },
  contributions: {
    type: [ContributionSchema],
    default: [],
  },
  events: {
    type: [EventSchema],
    default: [],
  },
  planVersions: {
    type: [PlanVersionSchema],
    default: [],
  },
  currentPlanVersion: {
    type: Number,
    default: 1,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Project", ProjectSchema);
