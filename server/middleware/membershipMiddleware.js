// /server/middleware/membershipMiddleware.js
// ──────────────────────────────────────────────
// Verifies that the authenticated user is a member
// of the requested project. Must run AFTER authMiddleware.
//
// Attaches to the request:
//   req.project    — the Mongoose document
//   req.memberRole — the user's role in the project
// ──────────────────────────────────────────────

const mongoose = require("mongoose");
const Project = require("../models/Project");

/**
 * Factory: returns middleware that loads the project
 * from req.params[paramName] and verifies membership.
 *
 * @param {string} [paramName="id"] — route param for project ID
 */
function membershipMiddleware(paramName = "id") {
  return async function (req, res, next) {
    try {
      const projectId = req.params[paramName];

      if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid project ID.",
        });
      }

      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({
          success: false,
          message: "Project not found.",
        });
      }

      // Check if the user is a member of this project
      const member = project.members.find(
        (m) => m.userId.toString() === req.user.id.toString()
      );

      if (!member) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You are not a member of this project.",
        });
      }

      // Attach to request for downstream handlers
      req.project = project;
      req.memberRole = member.role;

      next();
    } catch (err) {
      console.error("membershipMiddleware error:", err);
      return res.status(500).json({
        success: false,
        message: "Server error.",
      });
    }
  };
}

module.exports = membershipMiddleware;
