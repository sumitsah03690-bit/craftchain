# Contribution Endpoint — What Was Done

**Date:** 2026-02-21  
**Endpoint:** `POST /api/projects/:id/contribute`

---

## Files Modified

### 1. `server/utils/projectHelpers.js`

- **`computeItemStatuses(project)`** — upgraded to support the `blocked` status. Items with unmet dependencies now get `status: "blocked"` instead of always being `"pending"`. Uses case-insensitive matching on dependency names.
- **`getUnmetDependencies(project, itemName)`** — new helper that returns an array of dependency names that are NOT yet completed for a given item. Returns `[]` if the item has no dependencies or all are met.

### 2. `server/routes/projects.js`

Added the `POST /:id/contribute` route (~200 lines). Full behavior:

- **Validation:** `itemName` must be a non-empty string, `quantity` must be an integer >= 1.
- **Item lookup:** Case-insensitive (`toLowerCase().trim()`).
- **Dependency check:** If the target item has unmet dependencies, returns `409` with an `unmetDependencies` array.
- **Quantity capping:** `acceptedQuantity = min(requested, remaining)`. If item is already full → `409`.
- **Atomicity (dual strategy):**
  - **Primary:** Mongoose transactions (sessions) — re-reads inside the transaction, uses `$inc` + `$push`, commits. Requires MongoDB replica set.
  - **Fallback:** `findOneAndUpdate` with positional `$` operator — works on single-node MongoDB. Filter ensures `quantityCollected < quantityRequired`.
- **Response:** Returns `{ success, data, acceptedQuantity, remainderRequested, remaining, progress }`.

## New File

### 3. `server/test_contributions.sh`

Bash script with 6 curl tests:

1. Successful contribution (200, acceptedQuantity > 0)
2. Contribution to blocked item (409, unmetDependencies list)
3. Partial accept when remaining < requested (200, shows acceptedQuantity and remainderRequested)
4. Contribution to already completed item (409)
5. Unauthorized request with no token (401)
6. Concurrency simulation — 10 parallel curls, verifies quantityCollected never exceeds quantityRequired

Run with: `bash server/test_contributions.sh`

---

## Response Shapes

**Success (200):**

```json
{
  "success": true,
  "data": {
    /* updated project */
  },
  "acceptedQuantity": 2,
  "remainderRequested": 1,
  "remaining": 1,
  "progress": { "totalRequired": 10, "totalCollected": 5, "percent": 50 }
}
```

**Validation error (400):**

```json
{
  "success": false,
  "message": "itemName is required and must be a non-empty string."
}
```

**Conflict — unmet dependencies (409):**

```json
{
  "success": false,
  "message": "Cannot contribute — item has unmet dependencies.",
  "unmetDependencies": ["cobblestone"]
}
```

**Conflict — already completed (409):**

```json
{
  "success": false,
  "message": "Item already fully collected.",
  "acceptedQuantity": 0,
  "remaining": 0
}
```

---

## Troubleshooting

| Problem                                    | Fix                                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Transactions fail                          | MongoDB is single-node. Fallback activates automatically. For transactions: `mongod --replSet rs0` then `mongosh --eval 'rs.initiate()'` |
| Registration returns 500                   | Check `.env` `MONGODB_URI` — ensure DB is reachable                                                                                      |
| quantityCollected exceeds quantityRequired | Should never happen — both strategies cap contributions                                                                                  |
