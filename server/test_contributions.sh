#!/usr/bin/env bash
# ──────────────────────────────────────────────
# CraftChain — Contribution Endpoint Test Script
# ──────────────────────────────────────────────
# Runs 6 curl-based tests against the local server.
#
# Prerequisites:
#   1. Server running: npm run dev  (from project root)
#   2. MongoDB connected (MONGODB_URI in .env)
#
# Usage:
#   chmod +x server/test_contributions.sh
#   bash server/test_contributions.sh
# ──────────────────────────────────────────────

set -euo pipefail

BASE="http://localhost:4000/api"
TIMESTAMP=$(date +%s)
USERNAME="testuser_${TIMESTAMP}"
EMAIL="${USERNAME}@test.com"
PASSWORD="TestPass123!"

echo ""
echo "══════════════════════════════════════════"
echo "  CraftChain Contribution Tests"
echo "══════════════════════════════════════════"
echo ""

# ── Step 0: Register a test user & get token ──
echo "▸ Step 0: Registering test user (${USERNAME})..."
REGISTER_RESP=$(curl -s -X POST "${BASE}/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${USERNAME}\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")

TOKEN=$(echo "$REGISTER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "  ✘ Registration failed. Response:"
  echo "  $REGISTER_RESP"
  echo ""
  echo "  Trying login instead..."
  LOGIN_RESP=$(curl -s -X POST "${BASE}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")
  TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))" 2>/dev/null || echo "")
  if [ -z "$TOKEN" ]; then
    echo "  ✘ Login also failed. Cannot continue."
    exit 1
  fi
fi
echo "  ✔ Got token: ${TOKEN:0:20}..."
echo ""

AUTH="Authorization: Bearer ${TOKEN}"

# ── Step 1: Create a test project with dependencies ──
# Project: Diamond Pickaxe
#   - cobblestone (qty 3, no deps) — easy to contribute
#   - stick       (qty 2, no deps) — easy to contribute
#   - iron_ingot  (qty 3, deps: [cobblestone]) — blocked until cobblestone is done
#   - diamond     (qty 3, deps: [iron_ingot])  — blocked until iron_ingot is done
echo "▸ Step 1: Creating test project with dependency chain..."
PROJECT_RESP=$(curl -s -X POST "${BASE}/projects" \
  -H "Content-Type: application/json" \
  -H "${AUTH}" \
  -d '{
    "name": "Test Diamond Pickaxe",
    "finalItem": "diamond_pickaxe",
    "items": [
      { "name": "cobblestone", "quantityRequired": 3 },
      { "name": "stick",       "quantityRequired": 2 },
      { "name": "iron_ingot",  "quantityRequired": 3, "dependencies": ["cobblestone"] },
      { "name": "diamond",     "quantityRequired": 5, "dependencies": ["iron_ingot"] }
    ]
  }')

PROJECT_ID=$(echo "$PROJECT_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('_id',''))" 2>/dev/null || echo "")

if [ -z "$PROJECT_ID" ]; then
  echo "  ✘ Project creation failed. Response:"
  echo "  $PROJECT_RESP"
  exit 1
fi
echo "  ✔ Project created: ${PROJECT_ID}"
echo ""

# ─────────────────────────────────────────────
# TEST 1: Successful contribution
# ─────────────────────────────────────────────
# Expected: 200, acceptedQuantity=2, remaining=1
echo "═══════════════════════════════════════════"
echo "  TEST 1: Successful contribution"
echo "═══════════════════════════════════════════"
echo "  Contributing 2 cobblestone (out of 3 required)..."
RESP=$(curl -s -w "\n%{http_code}" -X POST "${BASE}/projects/${PROJECT_ID}/contribute" \
  -H "Content-Type: application/json" \
  -H "${AUTH}" \
  -d '{ "itemName": "cobblestone", "quantity": 2 }')
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "  HTTP Status: ${HTTP_CODE}"
echo "  Response (abbreviated):"
echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f\"    success: {d.get('success')}  acceptedQuantity: {d.get('acceptedQuantity')}  remaining: {d.get('remaining')}\")
" 2>/dev/null || echo "  $BODY"
echo ""

# ─────────────────────────────────────────────
# TEST 2: Contribution to blocked item → 409
# ─────────────────────────────────────────────
# iron_ingot depends on cobblestone, which is not yet completed (1 remaining).
# Expected: 409 with unmetDependencies: ["cobblestone"]
echo "═══════════════════════════════════════════"
echo "  TEST 2: Contribute to blocked item (409)"
echo "═══════════════════════════════════════════"
echo "  Trying to contribute 1 iron_ingot (blocked by cobblestone)..."
RESP=$(curl -s -w "\n%{http_code}" -X POST "${BASE}/projects/${PROJECT_ID}/contribute" \
  -H "Content-Type: application/json" \
  -H "${AUTH}" \
  -d '{ "itemName": "iron_ingot", "quantity": 1 }')
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "  HTTP Status: ${HTTP_CODE}"
echo "  Response:"
echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f\"    success: {d.get('success')}  message: {d.get('message')}  unmetDependencies: {d.get('unmetDependencies')}\")
" 2>/dev/null || echo "  $BODY"
echo ""

# Complete cobblestone first (contribute remaining 1)
echo "  → Completing cobblestone (contributing remaining 1)..."
curl -s -X POST "${BASE}/projects/${PROJECT_ID}/contribute" \
  -H "Content-Type: application/json" \
  -H "${AUTH}" \
  -d '{ "itemName": "cobblestone", "quantity": 1 }' > /dev/null
echo "  ✔ cobblestone completed"
echo ""

# ─────────────────────────────────────────────
# TEST 3: Contribution when remaining < requested
# ─────────────────────────────────────────────
# stick has quantityRequired=2. Contribute 5 → should accept 2, remainder 3.
# Expected: 200, acceptedQuantity=2, remainderRequested=3, remaining=0
echo "═══════════════════════════════════════════"
echo "  TEST 3: Partial accept (remaining < requested)"
echo "═══════════════════════════════════════════"
echo "  Contributing 5 sticks (only 2 required)..."
RESP=$(curl -s -w "\n%{http_code}" -X POST "${BASE}/projects/${PROJECT_ID}/contribute" \
  -H "Content-Type: application/json" \
  -H "${AUTH}" \
  -d '{ "itemName": "stick", "quantity": 5 }')
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "  HTTP Status: ${HTTP_CODE}"
echo "  Response (abbreviated):"
echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f\"    success: {d.get('success')}  acceptedQuantity: {d.get('acceptedQuantity')}  remainderRequested: {d.get('remainderRequested')}  remaining: {d.get('remaining')}\")
" 2>/dev/null || echo "  $BODY"
echo ""

# ─────────────────────────────────────────────
# TEST 4: Contribution to already completed item → 409
# ─────────────────────────────────────────────
# cobblestone is now completed (3/3).
# Expected: 409, message "Item already fully collected."
echo "═══════════════════════════════════════════"
echo "  TEST 4: Contribute to completed item (409)"
echo "═══════════════════════════════════════════"
echo "  Trying to contribute 1 cobblestone (already 3/3)..."
RESP=$(curl -s -w "\n%{http_code}" -X POST "${BASE}/projects/${PROJECT_ID}/contribute" \
  -H "Content-Type: application/json" \
  -H "${AUTH}" \
  -d '{ "itemName": "cobblestone", "quantity": 1 }')
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "  HTTP Status: ${HTTP_CODE}"
echo "  Response:"
echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f\"    success: {d.get('success')}  message: {d.get('message')}  acceptedQuantity: {d.get('acceptedQuantity')}\")
" 2>/dev/null || echo "  $BODY"
echo ""

# ─────────────────────────────────────────────
# TEST 5: Unauthorized contribution (no token) → 401
# ─────────────────────────────────────────────
echo "═══════════════════════════════════════════"
echo "  TEST 5: Unauthorized (no token) → 401"
echo "═══════════════════════════════════════════"
echo "  Posting without Authorization header..."
RESP=$(curl -s -w "\n%{http_code}" -X POST "${BASE}/projects/${PROJECT_ID}/contribute" \
  -H "Content-Type: application/json" \
  -d '{ "itemName": "iron_ingot", "quantity": 1 }')
HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "  HTTP Status: ${HTTP_CODE}"
echo "  Response:"
echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f\"    success: {d.get('success')}  message: {d.get('message')}\")
" 2>/dev/null || echo "  $BODY"
echo ""

# ─────────────────────────────────────────────
# TEST 6: Concurrency simulation
# ─────────────────────────────────────────────
# iron_ingot now has deps met (cobblestone completed).
# quantityRequired=3. Fire 10 parallel requests each
# contributing 1. Expected final: quantityCollected=3
# (not 10). Some will succeed, others will get 409.
echo "═══════════════════════════════════════════"
echo "  TEST 6: Concurrency simulation"
echo "═══════════════════════════════════════════"
echo "  Firing 10 parallel requests to contribute 1 iron_ingot each..."
echo "  (quantityRequired=3, so max 3 should succeed)"
echo ""

PIDS=()
TMPDIR_CONC=$(mktemp -d)

for i in $(seq 1 10); do
  (
    RESULT=$(curl -s -w "\n%{http_code}" -X POST "${BASE}/projects/${PROJECT_ID}/contribute" \
      -H "Content-Type: application/json" \
      -H "${AUTH}" \
      -d '{ "itemName": "iron_ingot", "quantity": 1 }')
    echo "$RESULT" > "${TMPDIR_CONC}/result_${i}.txt"
  ) &
  PIDS+=($!)
done

# Wait for all background processes
for pid in "${PIDS[@]}"; do
  wait "$pid" 2>/dev/null || true
done

# Count successes and failures
SUCCESS_COUNT=0
FAIL_COUNT=0
for i in $(seq 1 10); do
  F="${TMPDIR_CONC}/result_${i}.txt"
  if [ -f "$F" ]; then
    CODE=$(tail -1 "$F")
    if [ "$CODE" = "200" ]; then
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  fi
done

echo "  Results: ${SUCCESS_COUNT} succeeded (200), ${FAIL_COUNT} rejected (409/other)"

# Verify final state
echo ""
echo "  Verifying final iron_ingot state..."
VERIFY=$(curl -s "${BASE}/projects/${PROJECT_ID}")
echo "$VERIFY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items=d.get('data',{}).get('items',[])
for item in items:
    if item.get('name','').lower() == 'iron_ingot':
        qc = item.get('quantityCollected',0)
        qr = item.get('quantityRequired',0)
        ok = '✔' if qc <= qr else '✘ OVERFLOW!'
        print(f\"    iron_ingot: {qc}/{qr} {ok}\")
        break
" 2>/dev/null

# Clean up temp dir
rm -rf "$TMPDIR_CONC"

echo ""
echo "══════════════════════════════════════════"
echo "  All tests complete!"
echo "══════════════════════════════════════════"
echo ""
echo "Troubleshooting:"
echo "  • If transactions fail, your MongoDB is probably"
echo "    a single node. The fallback (findOneAndUpdate)"
echo "    is used automatically. To enable transactions,"
echo "    start mongod as a single-node replica set:"
echo ""
echo "    mongod --replSet rs0 --dbpath /data/db"
echo "    mongosh --eval 'rs.initiate()'"
echo ""
echo "  • If all tests return 500, check your .env file"
echo "    and make sure MONGODB_URI is correct."
echo ""
echo "  • If TEST 6 shows quantityCollected > 3, there"
echo "    may be a bug in the atomicity logic."
echo ""
