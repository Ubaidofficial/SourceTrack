# QA Report — Attribution Model Deterministic Test Fixtures (Session 139N-2)

## 1. Files Inspected
* **[`api/lib/attribution-engine.js`](../../api/lib/attribution-engine.js)**: Holds the canonical logic for multi-touch models and single-touch properties.
* **[`api/lib/sessionization.js`](../../api/lib/sessionization.js)**: Handles session boundary separation rules.
* **[`api/lib/channel-classifier.js`](../../api/lib/channel-classifier.js)**: Implements UTM/domain classifications.
* **[`package.json`](../../package.json)**: Scripts block mapping command executions.

---

## 2. Actual Attribution Functions Found
* **`calculateAttribution(touchpoints, conversionValue)`**: Crucial server-side function exported by `api/lib/attribution-engine.js` which takes raw touchpoints and conversion values and outputs:
  - `first_touch`: First chronological touchpoint.
  - `last_touch`: Last chronological touchpoint.
  - `linear`: Equally-weighted shares.
  - `u_shaped`: 40/20/40 weighted shares.
  - `w_shaped`: 30/30/30/10 weighted shares.
  - `time_decay`: Exponential decay based on a 7-day half-life.

---

## 3. Test Runner Chosen and Why
* **Runner**: Node.js built-in `node:test` runner.
* **Rationale**: Extremely lightweight, executes in milliseconds, requires zero external npm dependencies, and is natively supported by Node.js v18+. This avoids introducing heavy testing infrastructure or test library bloating.

---

## 4. Fixture Scenarios Created
1. **Scenario 1: Single-touch conversion**: 1 touchpoint, 1 conversion. Asserts all models allocate 100% credit to the only touchpoint.
2. **Scenario 2: Two-touch conversion**: First & last touchpoints. Asserts single-touch models attribute 100% correctly, multi-touch models (Linear, U-shaped, W-shaped) split credit 50/50, and Time-decay attributes more to the last touchpoint.
3. **Scenario 3: Three-touch conversion**: First, middle, and last. Asserts Linear/W-shaped split 1/3 each (adjusted for rounding), U-shaped splits 40/20/40, and Time-decay favors later touches.
4. **Scenario 4: Four-plus-touch conversion (5 touches)**: Asserts Linear splits equally (20% each); U-shaped anchors first/last at 40% (adjusted last element); W-shaped anchors first/middle/last at 30% each (middle = index 2); and Time-decay scales monotonically.
5. **Scenario 5: Direct-source edge case**: Check behaviour of null/direct utm sources.
6. **Scenario 6: Revenue allocation**: Validates total credit conservation (sums exactly to value, e.g. `100.25`), no negative credits, and no `NaN` outputs.
7. **Scenario 7: Empty/no-touch case**: Asserts safe empty array outputs instead of crashing when touchpoint array is empty.
8. **Scenario 8: Same-timestamp or malformed input**: Verify safe parsing of same-timestamp touchpoints and malformed date strings.

---

## 5. Exact Expected Model Behavior
* **Rounding Adjustments**: The engine relies on `adjustReconciliation` which makes the last element absorb rounding discrepancies so that the sum of fractions is exactly `1.0` and the sum of attributed values is exactly `conversionValue`. This is verified dynamically in the test fixtures.
* **W-Shaped Middle Index**: For journeys with $>3$ touchpoints, the engine selects the middle anchor index as `Math.floor((touchpoints.length - 1) / 2)`.

---

## 6. Known Limitations
* Unit testing only validates the isolated JS calculations inside the `calculateAttribution` function.
* Does not verify ClickHouse/HogQL query correctness or real-world database ingestion latencies/identity linkage.

---

## 7. Release Gate Block Status
* **Checklist block status**: `PARTIAL` — deterministic `calculateAttribution` model math is covered by Node `node:test` unit tests. Real end-to-end revenue attribution remains blocked by staging schema, identity linkage, seeded journeys, and webhook/E2E verification.

---

## 8. Remaining Attribution Correctness Gaps
* **Ingestion click ID mapping**: Mapping click IDs (`gclid`, `fbclid`, etc.) to correct UTM properties on ingestion is not verified by this unit test suite alone.
* **Database layer isolation**: Tenant filtering logic at database query level must be validated separately.
* **Date Parsing Robustness**: The `time_decay` model has been hardened against malformed timestamps (e.g. "not-a-date") by safely falling back to equal weights when valid timestamps or ordering cannot be computed, preventing `NaN` propagation and ensuring credit conservation.

---

## 9. Validation Output
```
> trackiq@1.0.0 qa:attribution:unit
> node --test api/tests/attribution.test.js

▶ Deterministic Attribution Models Unit Tests
  ✔ Scenario 1: Single-touch conversion (1.430709ms)
  ✔ Scenario 2: Two-touch conversion (0.4965ms)
  ✔ Scenario 3: Three-touch conversion (0.262084ms)
  ✔ Scenario 4: Four-plus-touch conversion (5 touches) (0.37175ms)
  ✔ Scenario 5: Direct-source edge case (0.099541ms)
  ✔ Scenario 6: Revenue allocation (0.129667ms)
  ✔ Scenario 7: Empty/no-touch case (0.326583ms)
  ✔ Scenario 8: Same-timestamp or malformed input (0.154375ms)
✔ Deterministic Attribution Models Unit Tests (4.196ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 99.224875
```

---

## 10. Git Status
```
 M SESSION_HANDOFF.md
 M SESSION_LOG.md
 M SESSION_STATE.md
 M api/lib/attribution-engine.js
 M docs/ai_agent_workflow_rules.md
 M docs/development_workflow_master_plan.md
 M docs/release_checklist_gate.md
 M package.json
?? api/tests/
?? docs/qa/attribution_model_deterministic_tests_139N2.md
```
