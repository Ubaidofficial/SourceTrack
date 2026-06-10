# Session 132D — Digital Marketer Product Acceptance Test Plan

This test plan is designed for manual product acceptance testing of **AI Journey Attribution** (`ai_platforms` model) in the TrackIQ dashboard, ensuring it behaves correctly from a digital marketer's perspective.

> [!NOTE]
> Run this test plan *after* verifying that the automated QA script passes:
> `node scripts/qa-ai-journey-attribution.js`

---

## Prerequisites
- A test website with the TrackIQ pixel installed (or running locally on `http://localhost:8080/sourcetrack-test.html`).
- A test site ID with captured conversion events and pageviews.
- Access to the TrackIQ dashboard at `http://localhost:5173`.

---

## Test Scenario 1: Model Labeling and Copy Check

### Steps
1. Navigate to the main **Dashboard** (`/`).
2. Open the attribution model selector dropdown (default: "Last Touch").
3. Verify that the label for the AI model is renamed to **"AI journey influence"** (formerly "AI conversion source").
4. Navigate to the **Report Builder** page (`/reports/new`).
5. Open the "Attribution Model" dropdown.
6. Verify that the label here also reads **"AI journey influence"**.

---

## Test Scenario 2: Verification of Journey-Based Credit

### Steps
1. Simulate a visitor journey with an AI referral:
   - Visitor clicks a link on **ChatGPT** (with `utm_source=chatgpt` or referrer `https://chatgpt.com`) landing on your site.
   - Visitor browses 1-2 pages (generating standard pageviews).
   - Visitor closes the tab.
   - 10 minutes later, the visitor returns **directly** (no UTMs, direct referrer) and performs a **conversion** (e.g., a purchase or signup).
2. Open the **Dashboard** or **Report Builder** and select the **AI journey influence** model.
3. Verify that the conversion and its full revenue are attributed to **ChatGPT** under this model, even though the conversion event itself was direct.
4. Switch to the **Last Touch** model. Verify that the conversion is attributed to **direct** (or whatever the last touch was).

---

## Test Scenario 3: Conversion Explanation Modal Drilldown

### Steps
1. In the dashboard or conversions list, locate the conversion generated in **Scenario 2**.
2. Click **"Explain Conversion"** (or view the conversion explanation modal).
3. Select the **"AI journey influence"** model from the model selector dropdown in the modal.
4. Verify the explanation matches the journey:
   - It should state: `Most recent AI platform touchpoint in journey: ChatGPT (pageview)`
   - The type should be identified as a **journey touchpoint**.
   - The description text should state: *"AI journey influence credits the most recent AI touchpoint detected in the visitor journey before conversion..."*
5. Locate or simulate a conversion where:
   - There was **no prior AI visit** in the lookback window.
   - The conversion event itself carried `properties.ai_source = 'Gemini'` (e.g., via a direct landing page integration or server-side conversion tag).
6. Open the explanation modal for this second conversion and select **"AI journey influence"**.
7. Verify the explanation states:
   - `AI platform detected on the conversion event itself (fallback)`
   - The type should be identified as a **conversion event fallback**.

---

## Test Scenario 4: Report Builder Flexible Grouping Compatibility

### Steps
1. Go to the **Report Builder**.
2. Select **"AI journey influence"** as the attribution model.
3. Test the following groupings and verify they render correctly without errors:
   - **Group by Source** / **AI Source**: Returns a breakdown of credited AI platforms (e.g., `ChatGPT`, `Claude`, `Gemini`, `Perplexity`).
   - **Group by Channel**: Aggregates all credited AI platform conversions under the **"AI Search"** channel.
   - **Group by Device** / **Country**: Renders standard device/country groups with correct corresponding conversion counts.
4. Try grouping by an incompatible dimension (e.g., **Campaign**, **Medium**, or **Ad Content**).
5. Verify that:
   - The query does **not** throw an error or crash.
   - The report displays **"—"** or **"unknown"** as the dimension value columns while still listing the total conversions and revenue.

---

## Test Scenario 5: Live/Nightly Consistency and No Double-Counting

### Steps
1. Look at the dashboard card when the **AI journey influence** model is selected.
2. Verify that there is **no "Nightly calculation pending" warning banner** displayed for this card (the model runs via live-query calculations, not nightly aggregations).
3. Verify that the total conversions and revenue sum up correctly:
   - Look at a conversion that had multiple ChatGPT clicks before converting once.
   - Verify that this conversion only registers as **1 conversion** and counts its revenue **exactly once** (no double-counting from multiple touches).
