// /server/utils/joinCode.js
// ──────────────────────────────────────────────
// Generates cryptographically random join codes
// for Servers and Projects.
// ──────────────────────────────────────────────

const crypto = require("crypto");

// Alphanumeric charset (no ambiguous chars: 0/O, 1/l/I)
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/**
 * Generate a random join code.
 * @param {number} [length=7] — code length (6–8)
 * @returns {string} alphanumeric code
 */
function generateJoinCode(length = 7) {
  const bytes = crypto.randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARSET[bytes[i] % CHARSET.length];
  }
  return code;
}

module.exports = generateJoinCode;
