# CraftChain Backend Auth — What Was Done

**Date:** 21 February 2026  
**Session goal:** Implement the backend skeleton + authentication system for the CraftChain project.

---

## 🏗️ What Was Built

A complete email/username authentication system inside the `/server` workspace, built on top of the existing Express + Mongoose scaffolding.

### Files Created (4 new files)

1. **`server/models/User.js`**  
   Mongoose schema for users with fields: `username` (unique, 3–30 chars), `email` (unique, regex-validated, stored lowercase), `passwordHash`, and `createdAt`. All fields have validation rules and helpful error messages.

2. **`server/middleware/authMiddleware.js`**  
   JWT verification middleware that reads the `Authorization: Bearer <token>` header, verifies the token with `jwt.verify`, and attaches `{ id, username }` to `req.user`. Returns a clear 401 JSON response if the token is missing, expired, or tampered with.

3. **`server/routes/auth.js`**  
   Two authentication endpoints:
   - **`POST /api/auth/register`** — Accepts `{ username, email, password }`, validates all inputs server-side, checks for duplicate users (email or username → 409), hashes the password with bcryptjs (saltRounds = 10), saves the user, and returns 201 with user info (never exposes the password hash).
   - **`POST /api/auth/login`** — Accepts `{ emailOrUsername, password }`, finds the user by email OR username, compares the password with bcrypt, and on success signs a JWT (7-day expiry) containing `{ id, username }`.

4. **`server/SECURITY_NOTES.md`**  
   Developer reference covering:
   - Where to store JWTs on the frontend (localStorage vs in-memory vs httpOnly cookie — pros, cons, recommendation)
   - How to handle `.env` and `JWT_SECRET` safely
   - bcrypt `saltRounds` tradeoff table
   - Common troubleshooting tips

### Files Modified (2 existing files)

5. **`server/package.json`**  
   Added two new dependencies:
   - `bcryptjs` (^2.4.3) — pure-JS bcrypt implementation (chose this over native `bcrypt` because it failed to compile on Node 24 / Apple Silicon)
   - `jsonwebtoken` (^9.0.2) — JWT signing and verification

6. **`server/server.js`**
   - Mounted the auth router: `app.use('/api/auth', require('./routes/auth'))`
   - Added a protected example route `GET /api/me` that uses `authMiddleware` to verify the JWT, then fetches and returns the authenticated user's profile from MongoDB (excluding the password hash)

---

## ✅ What Was Tested

Started the server with `npm run dev -w server` and ran 7 curl tests — **all passed**:

| #   | Test                                   | Expected             | Result  |
| --- | -------------------------------------- | -------------------- | ------- |
| 1   | `GET /api/health`                      | `{ "ok": true }`     | ✅ Pass |
| 2   | Register with short username (1 char)  | 400 validation error | ✅ Pass |
| 3   | Register with invalid email            | 400 validation error | ✅ Pass |
| 4   | Register with short password (2 chars) | 400 validation error | ✅ Pass |
| 5   | Login with empty body                  | 400 validation error | ✅ Pass |
| 6   | `GET /api/me` without token            | 401 access denied    | ✅ Pass |
| 7   | `GET /api/me` with fake token          | 401 invalid token    | ✅ Pass |

> **Note:** Full register → login → token flow requires a `MONGODB_URI` in `.env`. Without it, the server starts fine but DB operations will fail.

---

## 📂 Final Server File Structure

```
server/
├── middleware/
│   └── authMiddleware.js    ← NEW — JWT verification
├── models/
│   └── User.js              ← NEW — Mongoose User model
├── routes/
│   └── auth.js              ← NEW — Register + Login
├── package.json             ← MODIFIED — added bcryptjs, jsonwebtoken
├── server.js                ← MODIFIED — mounted auth + /api/me
├── SECURITY_NOTES.md        ← NEW — security reference
└── WHAT_WAS_DONE.md         ← NEW — this file
```

---

## 🔧 Tech Decisions

| Decision                                           | Reasoning                                                                                                                        |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **`bcryptjs`** instead of `bcrypt`                 | Native `bcrypt` failed to compile on Node 24 / arm64 macOS. `bcryptjs` is a pure-JS drop-in replacement with the exact same API. |
| **CommonJS (`require`)**                           | Consistent with the existing codebase; easier for first-year developers to follow.                                               |
| **Consistent error format**                        | All errors return `{ success: false, message: "..." }`, all successes return `{ success: true, data: {...} }`.                   |
| **Generic "Invalid credentials"** on login failure | Avoids leaking whether an account exists (security best practice).                                                               |

---

## 🚀 What's Next

- Set `MONGODB_URI` in `.env` to enable full auth flow
- Build project-specific routes (projects, contributions, etc.)
- Connect the React frontend to these auth endpoints
- Consider adding refresh tokens or httpOnly cookie auth for production
