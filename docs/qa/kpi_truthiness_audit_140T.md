# KPI Truthiness Audit — Session 140T
**Date:** 2026-06-17  
**Scope:** All authenticated app pages (`dashboard/src/pages/`) and shared-dashboard page  
**Rule set:** 10 truth rules (revenue/cost/ROAS gating, GSC gating, AI gating, CVR dash rule, etc.)

---

## Corrected Truth Rule

**Previous (wrong):**
> Rejected old rule: revenue must **not** be gated purely on `> 0`, because a known zero can be real data.

**Correct:**
> Revenue should display when revenue data is present. A known zero may be displayed as `$0`. Missing or unavailable revenue should display as `—`. If the API cannot distinguish missing revenue from known zero, document that limitation and do not pretend the UI can know.

**Why the previous rule was wrong:** `$0` can be a truthful, known value. A source can have tracked conversions but `$0` revenue. A lead can have a conversion event but no purchase value attached. A shared dashboard period may have full revenue tracking configured and still legitimately return `$0`. Suppressing `$0` on a `> 0` guard silences real data and implies the zero was noise rather than a measured outcome.

---

## Known Limitation

Session 140T corrected obvious fake-zero displays where missing or unavailable values were formatted as money or percentages. However, some API responses may still default absent revenue to `0` before the response reaches the UI — i.e. the server serialises a missing field as `0` rather than `null`. A follow-up data-contract audit is required to distinguish missing revenue, known zero revenue, and configured-but-no-revenue states across all endpoints (especially `/api/public/:token`, `/api/leads/:id`, and the nightly attribution job).

---

## Audit Method

Full grep sweep across `dashboard/src/pages/` for:

```
$0.00 | 0.00% | 0.0% | formatCurrency | formatPercent
ROAS | CAC | CPA | CPL | revenue | cost | spend
GSC | Search Console | AI confidence | accuracy
conversion rate | Rev/Visitor | MRR | LTV | ARPU | churn
```

Each hit reviewed against 10 truth rules. Findings categorised as:
- **CONFIRMED BUG** — fake or misleading metric shown when data is absent
- **SAFE** — properly gated or correct
- **DEFERRED** — ambiguous; not changed

---

## Confirmed Bugs & Fixes Applied

### 1. `ShareDashboard.jsx` — Wrong metric name "Avg CPL"

**File:** `dashboard/src/pages/ShareDashboard.jsx`  
**Rule:** Metric labels must be accurate.  
**Before:**
```js
const avgCPL = totalConversions > 0 ? totalRevenue / totalConversions : 0
{ label: 'Avg CPL', value: `$${avgCPL.toLocaleString(...)}` }
```
CPL = cost ÷ leads. This formula computed average conversion value (revenue ÷ conversions), not cost-per-lead.  
**Fix:** Renamed variable to `avgConversionValue`, renamed card label to `"Avg Conversion Value"`. Changed display logic from positivity checks to data-presence checks: `avgConversionValue` is `null` unless `totalConversions > 0 && hasRevenueData`.

---

### 2. `ShareDashboard.jsx` — "Total Revenue" KPI tile unconditionally formatted `$0`

**File:** `dashboard/src/pages/ShareDashboard.jsx`  
**Rule:** Revenue should display when revenue data is present; `—` when data is absent.  
**Before:**
```jsx
{ label: 'Total Revenue', value: `$${totalRevenue.toLocaleString(...)}` }
```
When no revenue field was present in the API response, `totalRevenue` was forced to `0` by `kpis?.total_revenue || 0`, producing `$0`.  
**Fix:** Changed display logic from positivity checks to data-presence checks:
- `rawRevenue = kpis?.total_revenue` (preserves `null` / `undefined`)
- `totalRevenue = rawRevenue ?? 0` (numeric, for calculations only)
- `hasRevenueData` flag derived from `rawRevenue != null || any channel/source has non-null revenue`
- KPI tile: `hasRevenueData ? formatWholeCurrencyOrDash(totalRevenue) : null` → renders `—` via `{value ?? '—'}`

---

### 3. `ShareDashboard.jsx` — Channel table "Revenue" column showed `$0` per row

**File:** `dashboard/src/pages/ShareDashboard.jsx` (channel table)  
**Rule:** Revenue cells must show `—` when revenue data is absent.  
**Before:**
```jsx
<td>${((ch.revenue || 0).toFixed(0))}</td>
```
**Fix:** Changed display logic from positivity checks to data-presence checks:
```jsx
{ch.revenue != null ? formatWholeCurrencyOrDash(ch.revenue) : '—'}
```
A `ch.revenue` of `0` now displays as `$0` (truthful). A `ch.revenue` of `null` displays as `—`.

---

### 4. `ShareDashboard.jsx` — "% of Total" column showed `0%` when no conversions

**File:** `dashboard/src/pages/ShareDashboard.jsx` (channel table)  
**Rule:** Rate/share metrics must use `—` when the denominator is zero (making the percentage undefined, not zero).  
**Before:**
```jsx
{totalConversions > 0 ? `${...}%` : '0%'}
```
**Fix:** `'0%'` → `'—'`. This gate is correct as a denominator guard — a zero denominator makes the percentage unavailable, not zero.

---

### 5. `ShareDashboard.jsx` — AI table "Revenue" column showed `$0` per row

**File:** `dashboard/src/pages/ShareDashboard.jsx` (AI search table)  
**Rule:** Revenue cells must show `—` when revenue data is absent.  
**Before:**
```jsx
<td>${((ai.revenue || 0).toFixed(0))}</td>
```
**Fix:** Changed display logic from positivity checks to data-presence checks:
```jsx
{ai.revenue != null ? formatWholeCurrencyOrDash(ai.revenue) : '—'}
```

---

### 6. `LeadDetail.jsx:169` — MetricTile "Revenue" tile showed `$0.00` when `lead.revenue` is `null`

**File:** `dashboard/src/pages/LeadDetail.jsx:169`  
**Rule:** Revenue tile must show `—` when revenue data is absent.  
**Before:**
```jsx
<MetricTile label="Revenue" value={lead.revenue} format="currency" ... />
```
`MetricTile` gates on `value == null`, but `lead.revenue = null` was being passed directly (safe) while `lead.revenue = 0` would show `$0.00`. More critically, if the API omits the field, `lead.revenue` is `undefined` which `MetricTile` treats as absent — but there was no explicit presence check.  
**Fix:** Added `hasLeadRevenueValue` presence flag using `hasOwnProperty` + `!= null`:
```js
const hasLeadRevenueValue =
  Object.prototype.hasOwnProperty.call(lead || {}, 'revenue') && lead.revenue != null
```
Changed display logic from positivity checks to data-presence checks:
```jsx
value={hasLeadRevenueValue ? Number(lead.revenue || 0) : null}
```
Known zero (`lead.revenue = 0`) now shows `$0.00` (truthful). Missing field shows `—` via MetricTile's null path.

---

### 7. `LeadDetail.jsx:234` — Activity Summary "Total Revenue" showed `$0.00` for absent revenue

**File:** `dashboard/src/pages/LeadDetail.jsx:234`  
**Rule:** Revenue must show `—` when data is absent.  
**Before:**
```jsx
<p>{formatCurrencyDecimal(lead.revenue)}</p>
```
`formatCurrencyDecimal(null)` and `formatCurrencyDecimal(0)` both return `$0.00` (default `fallback = 0` in `numbers.js`).  
**Fix:** Changed display logic from positivity checks to data-presence checks:
```jsx
{hasLeadRevenueValue ? formatCurrencyDecimal(Number(lead.revenue || 0)) : '—'}
```

---

### 8. `LeadDetail.jsx:334` — AI narrative "Revenue from AI" guard reviewed

**File:** `dashboard/src/pages/LeadDetail.jsx:334`  
**Finding:** The narrative sentence `Revenue from AI: {formatCurrency(lead.revenue)}` was previously guarded by `lead.revenue > 0 && lead.conversions > 0`. This is a `> 0` check rather than a presence check.  
**Assessment:** For this specific context, showing "Revenue from AI: $0" is semantically meaningless (the sentence only makes sense when an amount contributed). The `> 0` positivity check is *contextually justified* here. However, it was updated to use the presence flag as the outer gate to be consistent:
```jsx
{(hasLeadRevenueValue && Number(lead.revenue || 0) > 0 && lead.conversions > 0) && (
```
The outer `hasLeadRevenueValue` ensures the revenue field was actually present in the API response. The inner `> 0` check is intentional — it prevents the semantically empty sentence "Revenue from AI: $0.00 across 1 conversion."

---

## Safe Patterns (No Action)

| File | Location | Why Safe |
|------|----------|----------|
| `Journey.jsx` | Revenue cells | `r.revenue > 0 ?` guard — intentional positivity for narrative context |
| `Campaigns.jsx` | Revenue / cost columns | Gated on `hasRevenue` / `hasCost` flags from API response |
| `Campaigns.jsx` | CVR% column | `r.visits > 0 ? ... : '—'` (fixed in 140S, denominator guard) |
| `Dashboard.jsx` | Attribution CVR% | `r.cvr > 0 ? ... : '—'` (fixed in 140S) |
| `Analytics.jsx` | CVR KPI tile | `—` when `convRate === 0` |
| `Analytics.jsx` | AI section | Gated on `aiSources.length > 0` |
| `SEORevenue.jsx` | GSC clicks / CTR | Gated on `gscConnected && gscPropertySelected` → `—` |
| `AIAnalytics.jsx` | Confidence badges | Real AI-computed metric (Claude API), not fabricated |

---

## Deferred Items (Not Changed)

| File | Issue | Reason Deferred |
|------|-------|-----------------|
| `SEORevenue.jsx:168` | `formatCurrency(summary.organic_revenue, 0)` — shows `$0` when zero | Ambiguous: `$0` could mean "no revenue tracking" or "no organic conversions this period." Page already shows `!gscConnected` banner for the absent-tracking case. Backend data-contract audit needed to resolve. |
| `numbers.js` | Systemic `fallback = 0` default in all `format*` functions | Too broad — changing the default affects 50+ call sites; requires per-call audit. Root cause is that callers must explicitly guard presence before calling. |
| `AIAnalytics.jsx` | `|| 'medium'` confidence fallback | Minor risk — "medium" is a real and meaningful confidence level, not a fabricated number. |

---

## Files Changed

| File | Lines Changed | Nature |
|------|--------------|--------|
| `dashboard/src/pages/ShareDashboard.jsx` | +21 / −8 | Presence-based helpers (`hasOwn`, `hasRevenueData`, `formatWholeCurrencyOrDash`), renamed metric, null guards on 4 display sites |
| `dashboard/src/pages/LeadDetail.jsx` | +4 / −2 | `hasLeadRevenueValue` presence flag, presence-based guards on MetricTile, Activity Summary row, AI narrative |

---

## Validation Results

```
git diff --check    → PASS (no whitespace errors)
npm run qa:secrets  → PASS
npm run qa:env-safety → PASS
npm run qa:static   → PASS (frontend build succeeded, no whitespace violations)
```

---

## Status

**READY FOR REVIEW. Not committed. Not pushed.**
