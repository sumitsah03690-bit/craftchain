#!/usr/bin/env node
// /server/utils/minecraft_test.js
// ──────────────────────────────────────────────────────────────────────
// Quick CLI smoke test for the minecraft-data helper.
//
// Run:
//   cd server && node utils/minecraft_test.js
//
// Expected output:
//   - initMinecraft: OK  (or FAILED if package not installed)
//   - JSON results for beacon recipe, beacon deps, diamond_pickaxe deps
//   - No uncaught exceptions
// ──────────────────────────────────────────────────────────────────────

const {
  initMinecraft,
  getRecipeByItemName,
  buildDependencyList,
  clearCache,
} = require('./minecraft');

(async () => {
  console.log('═══════════════════════════════════════════');
  console.log('  CraftChain — Minecraft Helper Test');
  console.log('═══════════════════════════════════════════\n');

  // ── 1. Init ──────────────────────────────────
  const ok = await initMinecraft();
  console.log(`initMinecraft: ${ok ? 'OK' : 'FAILED'}\n`);

  if (!ok) {
    console.log('minecraft-data not available — skipping further tests.');
    console.log('Install it with:  npm i minecraft-data');
    process.exit(0);
  }

  // ── 2. Recipe lookup — beacon ────────────────
  console.log('── getRecipeByItemName("beacon") ──');
  const beaconRecipe = await getRecipeByItemName('beacon');
  console.log(JSON.stringify(beaconRecipe, null, 2));
  console.log();

  // ── 3. Dependency list — beacon (depth 1) ────
  console.log('── buildDependencyList("beacon", { depthLimit: 1 }) ──');
  const beaconDeps = await buildDependencyList('beacon', { depthLimit: 1 });
  console.log(JSON.stringify(beaconDeps, null, 2));
  console.log();

  // ── 4. Dependency list — diamond_pickaxe (depth 2) ──
  console.log('── buildDependencyList("diamond_pickaxe", { depthLimit: 2 }) ──');
  const pickaxeDeps = await buildDependencyList('diamond_pickaxe', { depthLimit: 2 });
  console.log(JSON.stringify(pickaxeDeps, null, 2));
  console.log();

  // ── 5. Cache clear test ──────────────────────
  clearCache();
  console.log('clearCache(): OK\n');

  console.log('═══════════════════════════════════════════');
  console.log('  All tests passed — no uncaught exceptions');
  console.log('═══════════════════════════════════════════');
  process.exit(0);
})();
