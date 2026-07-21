// ANTI-DRIFT BINDING for the Campaigns dimension tabs (KI-53).
//
// dashboard/src/lib/campaignDimensions.js holds a STATIC list of the breakdowns the Campaigns page
// offers. A static list is only safe while something proves it still matches the server. That is
// this file: it re-derives the servable set from the LIVE gate (servedByDeployedBackend) using the
// route's real argument shape and asserts EXACT equality. Deploy a new pipe, or lose one, and this
// goes red until the list is corrected.
//
// Why a static list at all: dashboard/ cannot import api/ — that resolves from the repo root and
// then fails the real Railway dashboard build (#252, guarded by dashboard-build-root.test.js).
// The test runs under api/, so it CAN reach into dashboard/ (the safe direction, the same one
// report-picker-gating.test.js uses).
import test from 'node:test'
import assert from 'node:assert/strict'
import { servedByDeployedBackend } from '../lib/report-config-validation.js'
import { PREAGG_CONVERSION_METRICS, PREAGG_MULTITOUCH_METRICS } from '../lib/attribution-engine.js'
import { CAMPAIGN_DIMENSIONS, servableCampaignDimensions } from '../../dashboard/src/lib/campaignDimensions.js'

// Mirrors api/routes/campaigns.js: ALLOWED_DIMS, the metric loop, and the fixed call shape.
// (model is `req.query.model || 'last_touch'`; the page never sends one, so last_touch is the
// shape that actually runs. viaRoutePreAgg:false + hasAttributionWindow:false because this route
// calls getFlexibleReport DIRECTLY and passes no attribution_window.)
const ROUTE_DIMS = ['source', 'medium', 'campaign', 'ai_source']
const ROUTE_METRICS = ['revenue', 'conversions', 'sessions', 'leads']
const ROUTE_MODEL = 'last_touch'

/** The route's own accept test: EVERY looped metric must back, else it throws 422 gated_dead_store. */
function routeWouldServe (dimension, tz) {
  return ROUTE_METRICS.every(m => servedByDeployedBackend({
    model: ROUTE_MODEL,
    group_by: dimension,
    group_by2: null,
    metric: m,
    preAggConversionMetric: PREAGG_CONVERSION_METRICS.has(m),
    preAggMultiTouchMetric: PREAGG_MULTITOUCH_METRICS.has(m),
    viaRoutePreAgg: false,
    hasAttributionWindow: false,
    tz
  }))
}

const gateServable = (tz) => ROUTE_DIMS.filter(d => routeWouldServe(d, tz))

test('the static tab list EXACTLY equals the gate verdict at tz=UTC', () => {
  assert.deepEqual(
    CAMPAIGN_DIMENSIONS.map(d => d.key).sort(),
    gateServable('UTC').sort(),
    'CAMPAIGN_DIMENSIONS has drifted from servedByDeployedBackend — a tab here either 422s for ' +
    'every user, or a newly-servable breakdown is being hidden. Correct the list, do not weaken this test.'
  )
})

test('servableCampaignDimensions agrees with the gate on UTC and non-UTC sites', () => {
  for (const tz of ['UTC', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo']) {
    assert.deepEqual(
      servableCampaignDimensions(tz).map(d => d.key).sort(),
      gateServable(tz).sort(),
      `servableCampaignDimensions('${tz}') disagrees with the live gate`
    )
  }
})

test('a non-UTC site has ZERO servable breakdowns (the flex pipes require tz===UTC)', () => {
  // The premise of the zero-servable empty state on the page. If this ever goes green-with-tabs,
  // the flex pipes learned timezones and the page should render them.
  assert.deepEqual(gateServable('Europe/Paris'), [], 'gate now serves a non-UTC breakdown')
  assert.deepEqual(servableCampaignDimensions('Europe/Paris'), [])
})

test('an absent/undefined timezone is treated as UTC, matching the route default', () => {
  // api/routes/campaigns.js: `isValidTimezone(req.site?.timezone) ? req.site.timezone : 'UTC'`
  assert.deepEqual(servableCampaignDimensions(undefined), servableCampaignDimensions('UTC'))
  assert.deepEqual(servableCampaignDimensions(null), servableCampaignDimensions('UTC'))
})

test('every listed dimension is one the route actually accepts', () => {
  // Guards the other direction: a typo'd key would be a 400 from ALLOWED_DIMS, not a 422.
  for (const d of CAMPAIGN_DIMENSIONS) {
    assert.ok(ROUTE_DIMS.includes(d.key), `"${d.key}" is not in the route's ALLOWED_DIMS`)
    assert.ok(d.label && typeof d.label === 'string', `"${d.key}" needs a label to render`)
  }
})
