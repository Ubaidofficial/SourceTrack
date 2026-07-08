#!/usr/bin/env node
// SourceTrack — A/B diff verification of the 4 touch-model reads. READ-ONLY.
//
// REQUIREMENT: Token-free code. All credentials read from env at runtime.
// EXECUTION IS FOUNDER-RUN.

import 'dotenv/config';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Harness module-load guard ───────────────────────────────────────────────
// Match the exact pattern in run_phase4_diff.mjs: BEFORE importing
// attribution-engine.js, set a dummy process.env.POSTHOG_API_KEY if unset.
if (!process.env.POSTHOG_API_KEY) {
  process.env.POSTHOG_API_KEY = 'mock-unused-by-diff-capture-client';
}

// ── Check required environment variables ──────────────────────────────────
const REQUIRED_ENV = [
  'POSTHOG_HOST',
  'POSTHOG_PROJECT_ID',
  'POSTHOG_PERSONAL_API_KEY',
  'TINYBIRD_HOST',
  'TINYBIRD_READ_TOKEN'
];

const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`[touch-ab-diff] MISSING env: ${missing.join(', ')} — cannot run.`);
  process.exit(2);
}

if (process.env.POSTHOG_PROJECT_ID !== '469905') {
  console.error(`[touch-ab-diff] REFUSING: POSTHOG_PROJECT_ID=${process.env.POSTHOG_PROJECT_ID}, expected 469905 (staging reference). Set it explicitly.`);
  process.exit(2);
}

// ── Config from env/args with defaults ─────────────────────────────────────────
let argsSiteId = null;
let argsDateFrom = null;
let argsDateTo = null;

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--site-id=')) {
    argsSiteId = arg.split('=')[1];
  } else if (arg.startsWith('--date-from=')) {
    argsDateFrom = arg.split('=')[1];
  } else if (arg.startsWith('--date-to=')) {
    argsDateTo = arg.split('=')[1];
  }
}

const SITE_ID = argsSiteId || process.env.SITE_ID || '13777fda-3d1e-48eb-a1d3-6b3bdb18f609';
const DATE_FROM = argsDateFrom || process.env.DATE_FROM || '2026-06-01';
const DATE_TO = argsDateTo || process.env.DATE_TO || '2026-06-29';

// ── Sort helper (order-independent comparison) ──────────────────────────────
function sortResults(arr) {
  if (!Array.isArray(arr)) return [];
  return [...arr].sort((a, b) => {
    const aSrc = a.source ?? '';
    const bSrc = b.source ?? '';
    if (aSrc !== bSrc) return aSrc.localeCompare(bSrc);

    const aMed = a.medium ?? '';
    const bMed = b.medium ?? '';
    if (aMed !== bMed) return aMed.localeCompare(bMed);

    const aCam = a.campaign ?? '';
    const bCam = b.campaign ?? '';
    return aCam.localeCompare(bCam);
  });
}

// ── Canonicalizer — judge revenue parity at 2-decimal (cent) precision ──────
// HogQL and Tinybird sum floats in different orders, so raw revenue can differ
// (414.40999999999997 vs 414.41) while being equal to the cent. Comparing the
// canonicalized rows removes that benign float artifact; money parity is a
// cents question, not a raw-float one.
const canon = r => ({
  source: r.source ?? null,
  medium: r.medium ?? null,
  campaign: r.campaign ?? null,
  conversions: Number(r.conversions) || 0,
  revenue: Math.round((Number(r.revenue) || 0) * 100) / 100   // cents
});

// Bucket identity key for actual-diff reporting.
const bucketKey = r => `${r.source ?? null}|${r.medium ?? null}|${r.campaign ?? null}`;

// ── Main Run ─────────────────────────────────────────────────────────────────
async function run() {
  console.log('================================================================');
  console.log('    Touch Model Read Parity Verification A/B Diff (Phase 9)     ');
  console.log('================================================================');
  console.log(`Window:  [${DATE_FROM} .. ${DATE_TO}]`);
  console.log(`Site ID: ${SITE_ID}`);
  console.log('────────────────────────────────────────────────────────────────\n');

  // Dynamic import of attribution engine
  const enginePath = path.resolve(__dirname, '../../api/lib/attribution-engine.js');
  const engine = await import(enginePath);

  // Model maps
  // expectedPipes: every pipe a model's ON read MUST hit (per-pipe gate below).
  // ai_platforms is N+1 and multi-pipe: aiplatform_conversions_by_site (once) +
  // pageviews_by_visitors (many — one per visitor-batch page). Its return shape is
  // {source, conversions, revenue}; `canon` supplies medium/campaign as null.
  const models = [
    { key: 'first_touch', name: 'firstTouchAttribution', expectedPipes: ['first_touch_by_site'] },
    { key: 'last_touch', name: 'lastTouchAttribution', expectedPipes: ['last_touch_by_site_agg'] },
    { key: 'first_touch_non_direct', name: 'firstTouchNonDirectAttribution', expectedPipes: ['first_touch_non_direct_by_site'] },
    { key: 'last_touch_non_direct', name: 'lastTouchNonDirectAttribution', expectedPipes: ['last_touch_non_direct_by_site'] },
    { key: 'ai_platforms', name: 'aiPlatformAttribution', expectedPipes: ['aiplatform_conversions_by_site', 'pageviews_by_visitors'] }
  ];

  // Intercept/Spy on queryTinybirdPipe
  let pipeCalls = [];
  const spyQueryTinybird = async (pipeName, params) => {
    // Import queryTinybirdPipe dynamically from tinybird-read.js to make sure we use the real function
    const { queryTinybirdPipe } = await import(path.resolve(__dirname, '../../api/lib/tinybird-read.js'));
    const result = await queryTinybirdPipe(pipeName, params);
    pipeCalls.push({
      pipeName,
      params,
      success: result !== null,
      rowCount: result ? result.length : 0
    });
    return result;
  };

  // Wire the spy dependency into the attribution engine
  engine.__setAttributionReadDeps({ queryTinybird: spyQueryTinybird });

  // 1. OFF PASS (HogQL only)
  console.log('--- RUNNING OFF PASS (HogQL path) ---');
  // Disable Tinybird reads
  delete process.env.TINYBIRD_READ_ENABLED;
  delete process.env.TINYBIRD_READ_PIPES;

  const offResults = {};
  for (const model of models) {
    pipeCalls = []; // reset spy log
    try {
      const raw = await engine[model.name](SITE_ID, DATE_FROM, DATE_TO);
      offResults[model.key] = sortResults(raw);
      console.log(`  ${model.key}: collected ${offResults[model.key].length} rows`);
    } catch (err) {
      console.error(`  ${model.key} OFF run failed:`, err.message);
      process.exit(1);
    }
  }

  console.log('\n--- RUNNING ON PASS (Tinybird path) ---');
  // Enable Tinybird reads for the UNION of every model's expected pipes (both
  // ai_platforms pipes alongside the 4 touch pipes).
  process.env.TINYBIRD_READ_ENABLED = 'true';
  process.env.TINYBIRD_READ_PIPES = [...new Set(models.flatMap(m => m.expectedPipes))].join(',');

  const onResults = {};
  const pipeHits = {};
  for (const model of models) {
    pipeCalls = []; // reset spy log
    try {
      const raw = await engine[model.name](SITE_ID, DATE_FROM, DATE_TO);
      onResults[model.key] = sortResults(raw);

      // Per-pipe hit aggregation over ALL spy calls this model produced. A model
      // may call one pipe many times (ai_platforms' pageviews_by_visitors N+1);
      // the gate (below) is PER PIPE: >=1 success AND zero fallbacks.
      const perPipe = {};
      for (const p of model.expectedPipes) perPipe[p] = { success: 0, fallback: 0 };
      for (const c of pipeCalls) {
        if (!perPipe[c.pipeName]) continue; // ignore any pipe not expected for this model
        if (c.success) perPipe[c.pipeName].success++;
        else perPipe[c.pipeName].fallback++;
      }
      pipeHits[model.key] = perPipe;

      const summary = model.expectedPipes
        .map(p => `${p}: ${perPipe[p].success} ok / ${perPipe[p].fallback} fallback`)
        .join('  |  ');
      console.log(`  ${model.key}: collected ${onResults[model.key].length} rows | ${summary}`);
    } catch (err) {
      console.error(`  ${model.key} ON run failed:`, err.message);
      process.exit(1);
    }
  }

  // Restore the original attribution dependency
  engine.__resetAttributionReadDeps();

  console.log('\n--- COMPARISON & PARITY ANALYSIS ---');
  let allIdentical = true;
  let allNonEmpty = true;
  let allHitPipe = true;

  for (const model of models) {
    const offArr = offResults[model.key];
    const onArr = onResults[model.key];
    const perPipe = pipeHits[model.key] || {};

    console.log(`\n[Model: ${model.key}]`);
    console.log(`  OFF rows: ${offArr.length} | ON rows: ${onArr.length}`);

    // Compare at CENT precision (canonicalized). Both arrays are already sorted.
    const offCanon = offArr.map(canon);
    const onCanon = onArr.map(canon);
    const identical = JSON.stringify(offCanon) === JSON.stringify(onCanon);

    // Keyed maps (raw rows kept for the float-only diagnostic).
    const offByKey = new Map(offArr.map(r => [bucketKey(r), r]));
    const onByKey = new Map(onArr.map(r => [bucketKey(r), r]));

    // Diagnostic (NOT a pass/fail gate): buckets that matched ONLY after cent
    // rounding — equal at cent precision but different at raw-float precision.
    let floatOnlyDiffs = 0;
    for (const [k, offRow] of offByKey) {
      const onRow = onByKey.get(k);
      if (!onRow) continue;
      const oc = canon(offRow), nc = canon(onRow);
      if (JSON.stringify(oc) === JSON.stringify(nc)
        && (Number(offRow.revenue) || 0) !== (Number(onRow.revenue) || 0)) {
        floatOnlyDiffs++;
      }
    }

    if (identical) {
      console.log('  Parity: 🟢 IDENTICAL (cent precision)');
    } else {
      console.log('  Parity: 🔴 MISMATCH (cent precision)');
      allIdentical = false;

      // Actual differences keyed by source|medium|campaign — not just first-5 rows.
      const onlyOff = [];
      const onlyOn = [];
      const valueDiffs = [];
      for (const [k, offRow] of offByKey) {
        const onRow = onByKey.get(k);
        if (!onRow) { onlyOff.push({ key: k, off: canon(offRow) }); continue; }
        const oc = canon(offRow), nc = canon(onRow);
        if (oc.conversions !== nc.conversions || oc.revenue !== nc.revenue) {
          valueDiffs.push({
            key: k,
            off: { conversions: oc.conversions, revenue: oc.revenue },
            on: { conversions: nc.conversions, revenue: nc.revenue },
            deltaConversions: nc.conversions - oc.conversions,
            deltaRevenue: Math.round((nc.revenue - oc.revenue) * 100) / 100
          });
        }
      }
      for (const [k, onRow] of onByKey) {
        if (!offByKey.has(k)) onlyOn.push({ key: k, on: canon(onRow) });
      }

      const printCapped = (label, arr) => {
        console.log(`  ${label}: ${arr.length}`);
        for (const d of arr.slice(0, 20)) console.log('    ' + JSON.stringify(d));
        if (arr.length > 20) console.log(`    … and ${arr.length - 20} more`);
      };
      printCapped('buckets only in OFF (HogQL)', onlyOff);
      printCapped('buckets only in ON (Tinybird)', onlyOn);
      printCapped('buckets in BOTH with conversions/revenue diff (cents)', valueDiffs);
    }

    // Diagnostic line always printed (benign float artifact visibility).
    console.log(`  float-only diffs (benign, matched only after cent rounding): ${floatOnlyDiffs}`);

    // False-Green: Check if empty
    if (offArr.length === 0 && onArr.length === 0) {
      console.warn(`  ⚠️  WARNING: Zero-row window is not valid parity proof! Adjust DATE_FROM/DATE_TO.`);
      allNonEmpty = false;
    }

    // Multi-pipe hit gate: EVERY expected pipe must have >=1 success AND ZERO
    // fallbacks. Guards the false green where results match only because a pipe
    // silently fell back to HogQL (identical-by-fallback).
    for (const p of model.expectedPipes) {
      const h = perPipe[p] || { success: 0, fallback: 0 };
      console.log(`  Pipe '${p}': ${h.success} success, ${h.fallback} fallback`);
      if (h.success < 1) {
        console.warn(`  ⚠️  WARNING: pipe '${p}' had ZERO successful Tinybird reads in ON pass.`);
        allHitPipe = false;
      }
      if (h.fallback > 0) {
        console.warn(`  ⚠️  WARNING: pipe '${p}' fell back to HogQL ${h.fallback}x in ON pass (identical-by-fallback is a false green).`);
        allHitPipe = false;
      }
    }
  }

  console.log('\n================================================================');
  console.log('                        SUMMARY VERDICT                         ');
  console.log('================================================================');

  if (!allIdentical) {
    console.error('❌ FAIL: Mismatches found between HogQL and Tinybird paths.');
    process.exit(1);
  }
  if (!allNonEmpty) {
    console.error('❌ FAIL: Empty datasets found. Please check data presence.');
    process.exit(1);
  }
  if (!allHitPipe) {
    console.error('❌ FAIL: Tinybird pipe reads fell back to HogQL in ON pass.');
    process.exit(1);
  }

  console.log('✅ PASS: All 5 models have exact cross-store parity with valid pipe reads (every expected pipe hit, zero fallbacks).');
  process.exit(0);
}

run().catch(err => {
  console.error('[touch-ab-diff] Unexpected error:', err);
  process.exit(1);
});
