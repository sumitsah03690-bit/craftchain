// /server/models/Server.js
// ──────────────────────────────────────────────
// Mongoose schema & model for a CraftChain server.
//
// A Server is a container for multiple projects,
// similar to a Discord server. It has an owner,
// moderators, members, and a unique join code.
// ──────────────────────────────────────────────

const mongoose = require("mongoose");
const generateJoinCode = require("../utils/joinCode");

const ServerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Server name is required"],
    trim: true,
    minlength: [1, "Server name must be at least 1 character"],
    maxlength: [50, "Server name must be at most 50 characters"],
  },

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  moderators: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],

  members: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],

  joinCode: {
    type: String,
    unique: true,
    default: generateJoinCode,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for fast join-code lookups
ServerSchema.index({ joinCode: 1 });

module.exports = mongoose.model("Server", ServerSchema);
