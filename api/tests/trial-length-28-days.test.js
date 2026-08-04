// Trial length = 28 days, in every place that states or computes it.
//
// WHY THIS TEST EXISTS AND NOT JUST A DIFF: the trial length is FOUR independent sources of
// truth — the DB column default, api/middleware/auth.js's TRIAL_DAYS fallback,
// dashboard/src/lib/billing.js's fallback (the number the customer reads on Settings), and
// the marketing copy. #500 proved they can disagree silently: copy said one thing while the
// system granted another, and nothing failed. Two of the four (billing.js, and the
// qa-billing-helper fixtures) were NOT in this task's stated scope and were found by
// grepping rather than by being told, which is precisely the argument for pinning all of
// them mechanically.
//
// The negative half is the load-bearing half: a NEW 14-day claim added anywhere later must
// fail here, not ship.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = join(__dirname, '..', '..')
const read = (p) => readFileSync(join(REPO, p), 'utf8')

// ── 1. The eight positive locations, each asserted by its own exact string ────────────
// Counted, not just "contains": sections/pricing.md carries TWO CTA labels (Starter and
// Growth). A single-occurrence check there would pass with one card left at 14.
const EXPECTED = [
  ['api/middleware/auth.js', 'const TRIAL_DAYS = 28', 1],
  ['api/middleware/tier-check.js', 'Your 28-day trial has ended.', 1],
  ['api/routes/analytics.js', 'Your 28-day trial has ended.', 1],
  ['api/tests/billing-middleware.test.js', 'Your 28-day trial has ended.', 1],
  ['dashboard/src/lib/billing.js', '28 * 24 * 60 * 60 * 1000', 1],
  ['marketing/src/content/homepage/-index.md', 'Start 28-day free trial', 1],
  ['marketing/src/content/sections/call-to-action.md', 'Start 28-day free trial', 1],
  ['marketing/src/content/sections/pricing.md', 'Start 28-day free trial', 2],
  // Moved out of solutions/saas.astro when that page's CTA became content-backed — the string
  // itself is unchanged, only its home.
  ['marketing/src/content/standalone/solutions/saas.md', 'Start 28-day free trial', 1],
  ['marketing/src/content/sections/faq.md', 'starts on a 28-day trial', 1]
]

for (const [file, needle, count] of EXPECTED) {
  test(`🟢 ${file} states the 28-day trial (${count}×)`, () => {
    const actual = read(file).split(needle).length - 1
    assert.strictEqual(actual, count, `expected ${count} occurrence(s) of "${needle}" in ${file}, found ${actual}`)
  })
}

test('🟢 the migration sets the DB default to 28 days', () => {
  const sql = read('supabase/migrations/20260730000000_trial_length_28_days.sql')
  assert.match(sql, /set default \(now\(\) \+ '28 days'::interval\)/)
  // Going-forward only: a back-fill would be an UPDATE against existing rows.
  assert.ok(!/^\s*update\s+public\.sites/im.test(sql), 'the migration must not back-fill existing trials')
})

// ── 2. The negative scan — no live 14-day trial claim survives anywhere ───────────────
// Walks real source trees. Every exclusion below is a NON-claim, justified inline; the
// point is that none of them is a statement about how long a trial lasts.
const SCAN_DIRS = ['api', 'dashboard/src', 'marketing/src', 'scripts', 'tracker']
const SCAN_EXT = /\.(js|jsx|ts|tsx|astro|md|mjs)$/
const SKIP_DIR = /node_modules|dist|\.astro|coverage/

// A "14-day trial claim" is 14 adjacent to day/days adjacent to trial-ish wording. Kept
// narrow on purpose: a broad /14/ would match hundreds of unrelated numbers and the test
// would rot into an ignore-list.
//
// THIS PROSE PATTERN IS NOT SUFFICIENT ON ITS OWN — see NUMERIC_CLAIM below.
const CLAIM = /(?:14[-\s]day|14\s+days?)[^.\n]{0,40}?(?:trial|free)|(?:trial|free)[^.\n]{0,40}?(?:14[-\s]day|14\s+days?)/i

// The gap this file was written to close, which it did not: a trial length expressed as a
// bare NUMBER rather than as prose. `api/routes/billing.js` granted a second, Stripe-side
// trial with
//
//     trial_period_days: site.plan === 'trial' ? 14 : undefined
//
// stacking 14 days on top of the product's own 28 (up to 42 before first charge). CLAIM
// above requires the literal words "14-day"/"14 days", so a bare `? 14 :` never matched,
// and billing.js was not in EXPECTED either — the one file that granted a trial was the
// one file this test did not look at. Both halves are fixed here.
//
// The rule: on a COMMENT-STRIPPED line, a trial-ish word together with a bare 14. Comments
// are stripped first because api/middleware/auth.js:4 legitimately records the history
// ("raised 14 -> 28"), and a historical note is not a live grant.
//
// Measured, not guessed: across 658 scanned files this matched EXACTLY ONE line on the
// unfixed tree — billing.js:478, the bug — and produced zero false positives. If that
// changes, tighten the rule; do not add ignore-list entries to keep it quiet.
const NUMERIC_CLAIM = (line) => /trial/i.test(line) && /\b14\b/.test(line)

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))

// Files where a bare "14 days" is a DATE-RANGE or SQL WINDOW, not a trial length.
const NOT_A_TRIAL_CLAIM = new Set([
  'dashboard/src/pages/ReportBuilder.jsx', // report date-range option: { value: '14', label: '14 days' }
  'dashboard/src/pages/Settings.jsx',      // attribution-window <option value={14}>14 days</option>
  'api/routes/alerts.js',                  // ClickHouse INTERVAL 14 DAY (week-over-week window)
  'api/routes/dashboard.js',               // same
  'api/routes/integrations.js'             // same
])

function walk (dir, out = []) {
  let entries
  try { entries = readdirSync(join(REPO, dir)) } catch { return out }
  for (const name of entries) {
    const rel = `${dir}/${name}`
    if (SKIP_DIR.test(rel)) continue
    const abs = join(REPO, rel)
    let st
    try { st = statSync(abs) } catch { continue }
    if (st.isDirectory()) walk(rel, out)
    else if (SCAN_EXT.test(name)) out.push(rel)
  }
  return out
}

const scanned = SCAN_DIRS.flatMap(d => walk(d))

test('🔴 the scan is not vacuous — it visited a real number of files', () => {
  // Guards the whole negative half: a broken walk() would make the next test pass by
  // examining nothing, which is exactly the silent-success class this repo keeps hitting.
  assert.ok(scanned.length > 300, `expected the scan to visit >300 files, it visited ${scanned.length}`)
  assert.ok(scanned.includes('marketing/src/content/sections/pricing.md'), 'the scan missed a file it must cover')
  assert.ok(scanned.includes('api/middleware/auth.js'), 'the scan missed a file it must cover')
})

test('🔴 NO live 14-day trial claim survives anywhere in the scanned tree', () => {
  const offenders = []
  for (const rel of scanned) {
    if (NOT_A_TRIAL_CLAIM.has(rel)) continue
    // This test file necessarily contains the pattern it hunts for.
    if (rel === 'api/tests/trial-length-28-days.test.js') continue
    const src = read(rel)
    for (const [i, line] of src.split('\n').entries()) {
      if (CLAIM.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 110)}`)
    }
  }
  assert.deepStrictEqual(offenders, [], `live 14-day trial claim(s) still present:\n  ${offenders.join('\n  ')}`)
})

test('🔴 NO live 14-day trial expressed as a bare NUMBER survives either', () => {
  // The half CLAIM cannot see. Kept as its own test rather than folded into the one above
  // so a failure names which shape reappeared — prose copy and a numeric grant are
  // different mistakes with different fixes.
  const offenders = []
  for (const rel of scanned) {
    if (NOT_A_TRIAL_CLAIM.has(rel)) continue
    if (rel === 'api/tests/trial-length-28-days.test.js') continue
    for (const [i, line] of stripComments(read(rel)).entries()) {
      if (NUMERIC_CLAIM(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 110)}`)
    }
  }
  assert.deepStrictEqual(offenders, [], `numeric 14-day trial grant(s) still present:\n  ${offenders.join('\n  ')}`)
})

// ── 3. The trial-GRANTING file, which EXPECTED never covered ─────────────────────────
// EXPECTED lists files that STATE the trial length. billing.js states nothing — it used to
// GRANT one, which is why a "does this file say 28?" list could never have caught it. The
// assertion it needs is therefore a negative: Stripe must add no trial of any length.
test('🔴 api/routes/billing.js grants NO Stripe-side trial', () => {
  // Comment-stripped: billing.js deliberately DOCUMENTS why this key must never return,
  // naming it to do so. That prose must not trip the guard — only real code may.
  const src = stripComments(read('api/routes/billing.js')).join('\n')
  assert.ok(!/trial_period_days/.test(src),
    'billing.js must not set trial_period_days — the product\'s 28-day trial is the ONLY trial. ' +
    'Re-adding this key stacks a second trial on top of it, which is the 42-day bug regardless ' +
    'of the number used.')
  assert.ok(!/trial_settings/.test(src),
    'trial_settings is another route to the same stacking bug')
})

test('🔴 trial_period_days appears NOWHERE in the repo', () => {
  // Repo-wide, not just billing.js: the next Checkout/Subscription call site would otherwise
  // be free to reintroduce it. There is currently exactly ONE Stripe session-creation call
  // (billing.js), and this keeps a second one from quietly shipping a trial grant.
  const offenders = []
  for (const rel of scanned) {
    if (rel === 'api/tests/trial-length-28-days.test.js') continue
    for (const [i, line] of stripComments(read(rel)).entries()) {
      if (/trial_period_days/.test(line)) offenders.push(`${rel}:${i + 1}`)
    }
  }
  assert.deepStrictEqual(offenders, [], `trial_period_days reintroduced at:\n  ${offenders.join('\n  ')}`)
})

test('🔴 every NOT_A_TRIAL_CLAIM exclusion still exists and still matches (no stale ignores)', () => {
  // Same discipline as test-registration-guard.test.js: an exclusion that no longer applies
  // is an ignore-list entry quietly widening over time.
  for (const rel of NOT_A_TRIAL_CLAIM) {
    let src
    assert.doesNotThrow(() => { src = read(rel) }, `excluded file ${rel} no longer exists`)
    assert.ok(/14/.test(src), `${rel} no longer contains "14" — drop it from the exclusion list`)
  }
})

// The migration is history, not a live claim — it is allowed to say 14, and does.
test('🟢 the migration may still reference 14 as history', () => {
  const sql = read('supabase/migrations/20260730000000_trial_length_28_days.sql')
  assert.match(sql, /14/, 'the migration should record what the default was')
})

// ── 4. The WIRE payload — the only assertion that proves what Stripe actually receives ──
// Every check above reads source text. Source text cannot answer the question that actually
// matters: what does the SDK put on the wire? An `undefined` value could in principle be
// serialized as an empty string or a literal "undefined", in which case deleting the key and
// setting it to undefined would NOT be equivalent.
//
// So this drives the REAL /create-checkout handler with a capturing HTTP client swapped onto
// the exact Stripe instance billing.js uses, and asserts on the raw form-encoded body.
//
// Measured on the unfixed tree, this is what the bug looked like on the wire:
//   plan=trial  -> ...&allow_promotion_codes=true&subscription_data[trial_period_days]=14
//   plan=growth -> ...&allow_promotion_codes=true
// The SDK does drop `undefined` and does drop the resulting empty subscription_data{} — so
// non-trial checkouts never sent it. That is why removing the block is a no-op for them, and
// why the three plans below must now produce IDENTICAL bodies.
test('🔴 a trial-plan checkout sends NO trial_period_days on the wire', async (t) => {
  const { createRequire } = await import('node:module')
  const requireFromRepo = createRequire(join(REPO, 'package.json'))
  const Stripe = requireFromRepo('stripe')

  process.env.STRIPE_SECRET_KEY ||= 'sk_test_dummy'
  process.env.STRIPE_PRICE_ID_GROWTH ||= 'price_growth_test'

  const billing = await import('../routes/billing.js')

  let captured = null
  const capturingFetch = async (url, init) => {
    captured = init?.body != null ? String(init.body) : ''
    return new Response(
      JSON.stringify({ id: 'cs_test_1', object: 'checkout.session', url: 'https://checkout.stripe.com/x' }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Request-Id': 'req_test' } }
    )
  }
  const prevClient = billing.stripe.getApiField('httpClient')
  billing.stripe._setApiField('httpClient', Stripe.createFetchHttpClient(capturingFetch))
  t.after(() => { if (prevClient) billing.stripe._setApiField('httpClient', prevClient) })

  // Reach the handler behind requireUserAuth/validateSiteKey/requireSiteMembership.
  const layer = billing.billingRouter.stack.find((l) => l.route?.path === '/create-checkout')
  assert.ok(layer, 'the /create-checkout route must exist for this test to mean anything')
  const handler = layer.route.stack[layer.route.stack.length - 1].handle

  async function checkoutBodyFor (plan) {
    captured = null
    const req = {
      body: {
        plan: 'growth',
        accepted_terms: true,
        successUrl: 'https://app.sourcetrack.ai/ok',
        cancelUrl: 'https://app.sourcetrack.ai/no'
      },
      headers: { origin: 'https://app.sourcetrack.ai' },
      user: { id: 'u1' },
      site: { id: 'site-1', site_key: 'sk-test', plan, owner_id: 'u1', stripe_customer_id: null }
    }
    const res = { _status: 200, status (s) { this._status = s; return this }, json (b) { this._body = b; return this } }
    await handler(req, res)
    assert.strictEqual(res._status, 200, `checkout should succeed for plan=${plan}, got ${res._status}: ${JSON.stringify(res._body)}`)
    assert.ok(captured !== null, `no HTTP request was captured for plan=${plan} — the test would assert nothing`)
    return captured
  }

  await t.test('trial plan: neither trial_period_days nor subscription_data reaches Stripe', async () => {
    const body = await checkoutBodyFor('trial')
    assert.ok(!/trial_period_days/.test(body), `trial_period_days is on the wire: ${body}`)
    assert.ok(!/subscription_data/.test(body), `subscription_data is on the wire: ${body}`)
    // Positive control: the request is real and carries the fields it should, so the two
    // negatives above cannot pass merely because the body was empty or malformed.
    const params = new URLSearchParams(body)
    assert.strictEqual(params.get('mode'), 'subscription')
    assert.strictEqual(params.get('line_items[0][price]'), process.env.STRIPE_PRICE_ID_GROWTH)
    assert.strictEqual(params.get('client_reference_id'), 'site-1')
  })

  await t.test('a trial-plan checkout is now byte-identical to a paid-plan checkout', async () => {
    const trialBody = await checkoutBodyFor('trial')
    const freeBody = await checkoutBodyFor('free')
    const growthBody = await checkoutBodyFor('growth')
    assert.strictEqual(trialBody, growthBody,
      'site.plan must no longer change the Stripe request at all')
    assert.strictEqual(trialBody, freeBody,
      'site.plan must no longer change the Stripe request at all')
  })
})
