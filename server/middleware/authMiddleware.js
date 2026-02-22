// /server/middleware/authMiddleware.js
// ──────────────────────────────────────────────
// JWT verification middleware.
//
// HOW IT WORKS:
//   1. Client sends:  Authorization: Bearer <token>
//   2. We extract the token string after "Bearer ".
//   3. jwt.verify() checks the signature + expiry.
//   4. If valid → attach { id, username } to req.user
//      so downstream handlers know who's calling.
//   5. If invalid / missing → 401 JSON response.
// ──────────────────────────────────────────────

const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  // ── 1. Grab the header ──────────────────────
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Access denied. No token provided. Send: Authorization: Bearer <token>",
    });
  }

  // ── 2. Extract token (everything after "Bearer ") ──
  const token = authHeader.split(" ")[1];

  try {
    // ── 3. Verify signature & expiry ────────────
    // jwt.verify throws if the token is tampered
    // with or expired — the catch block handles that.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ── 4. Attach user info to the request ──────
    // We only put id & username in the token payload
    // (see auth.js login route), so that's all we get.
    req.user = { id: decoded.id, username: decoded.username };

    next(); // ✅ Proceed to the protected route handler
  } catch (err) {
    // Common reasons: token expired, bad signature,
    // or someone manually tampered with the string.
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token. Please log in again.",
    });
  }
}

module.exports = authMiddleware;
