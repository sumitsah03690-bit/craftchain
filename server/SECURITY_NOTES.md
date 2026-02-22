# CraftChain — Security & Auth Notes

Quick reference for the team on how the auth system works and common pitfalls.

---

## 1. Where to Store the JWT on the Frontend

| Approach               | Pros                                                      | Cons                                                                      |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| **`localStorage`**     | Easy to use, persists across tabs/refreshes               | Vulnerable to XSS — any injected script can steal the token               |
| **In-memory variable** | Can't be stolen via XSS once the page closes              | Lost on refresh; requires re-login or a refresh-token flow                |
| **`httpOnly` cookie**  | Browser manages it automatically; immune to XSS JS access | Requires CSRF protection; needs `SameSite` + `Secure` flags in production |

**Recommendation:** Use an **httpOnly cookie** for production (set `SameSite=Strict` and `Secure=true`). During hackathon/dev, **in-memory** (a React state variable) is the simplest safe option. Avoid `localStorage` for tokens if you can.

---

## 2. `.env` and `JWT_SECRET`

- **Never commit `.env`** to version control. The `.gitignore` already excludes it.
- `JWT_SECRET` should be a long, random string (≥ 32 characters). Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- If `JWT_SECRET` is weak or leaked, anyone can forge valid tokens for any user.

---

## 3. `saltRounds` Tradeoff (bcrypt)

`saltRounds` (we use **10**) controls how many times bcrypt re-hashes the password.

| saltRounds | Approx. Time per Hash | Security Level                          |
| ---------- | --------------------- | --------------------------------------- |
| 8          | ~40 ms                | Acceptable for low-risk apps            |
| **10**     | ~100 ms               | Good default — balances security and UX |
| 12         | ~250 ms               | High security; noticeable login delay   |
| 14+        | ~1 s+                 | Very high security; may frustrate users |

Higher rounds = harder to brute-force, but slower registration/login. **10 is the industry standard** for most web apps. Increase to 12 if handling sensitive data (banking, medical).

---

## 4. Quick Troubleshooting

| Problem                                  | Fix                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `jwt must be provided`                   | You're calling `jwt.sign` without a secret. Make sure `JWT_SECRET` is set in `.env`.                               |
| `MongoServerError: E11000 duplicate key` | A user with that email or username already exists. The register route checks for this and returns 409.             |
| `MONGODB_URI not set` warning            | Add your MongoDB connection string to `.env`. The server still starts, but auth routes will fail on DB operations. |
| `bcrypt` install fails on M1 Mac         | Run `npm rebuild bcrypt` or use `bcryptjs` (pure JS fallback, same API) as a drop-in replacement.                  |
