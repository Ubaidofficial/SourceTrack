# QA Report: Session 140P-D7 — Final UI Risk Sweep Before Browser Verification

## Audit Commands and Raw Findings

### 1. Suspicious Arbitrary Classes / One-off Tokens Scan
```bash
grep -RIn "\[#\|text-white/90\|text-white/80\|text-gray-500 dark:text-gray-500\|dark:text-gray-500\|opacity-40\|opacity-50" dashboard/src/pages dashboard/src/components --exclude-dir=node_modules || true
```
**Findings:**
* Valid arbitrary styles remain confined to non-SaaS marketing page / mockup components (e.g. `ComparisonTable.jsx`, `FAQSection.jsx`, `DashboardPreviewMock.jsx`, `OnboardingCard.jsx`, `FinalCTA.jsx`).
* Discovered old arbitrary borders in `Setup.jsx` (Card 2 and Card 4 border `border-[#E2E8F0]`) which were standardized to standard Tailwind borders.

### 2. Responsive Overflow Risk Scan
```bash
grep -RIn "w-screen\|min-w-\[\|max-w-\[\|overflow-hidden\|overflow-x-auto\|whitespace-nowrap\|flex-nowrap\|fixed right\|absolute right" dashboard/src/pages dashboard/src/components --exclude-dir=node_modules || true
```
**Findings:**
* No obvious static overflow blockers found from code review; deployed viewport verification remains pending.

### 3. Old Brand/Lime Color Usage Scan
```bash
grep -RIn "#d7f550\|#c4df45\|bg-\[#d7f550\]\|hover:bg-\[#c4df45\]" dashboard/src --exclude-dir=node_modules || true
```
**Findings:**
* Clean. 0 matches.

### 4. Invalid Tailwind Token Checker
```bash
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const colors = ['red','green','blue','orange','lime','gray','slate','zinc','neutral','stone','amber','purple','violet','fuchsia','pink','rose','emerald','teal','cyan','sky'];
const valid = new Set(['50','100','200','300','400','500','600','700','800','900','950']);
let bad = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (!['node_modules', '.git', 'dist'].includes(entry)) walk(full);
      continue;
    }
    if (!/\.(js|jsx|ts|tsx|css)$/.test(full)) continue;
    const lines = fs.readFileSync(full, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const regex = new RegExp(`\\b(?:${colors.join('|')})-([0-9]+)\\b`, 'g');
      let m;
      while ((m = regex.exec(lines[i])) !== null) {
        if (!valid.has(m[1])) bad.push(`${full}:${i + 1}: ${m[0]} :: ${lines[i].trim()}`);
      }
    }
  }
}
walk('dashboard/src');
if (bad.length) {
  console.log('INVALID TOKENS FOUND');
  console.log(bad.join('\n'));
  process.exit(1);
}
console.log('PASS: no invalid Tailwind color shade tokens found in dashboard/src');
NODE
```
**Findings:**
* PASS. No invalid Tailwind color shade tokens found.

---

## Exact Files Changed

* [Setup.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/Setup.jsx)
* [DevelopersApi.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/developers/DevelopersApi.jsx)
* [DevelopersCampaignCosts.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/developers/DevelopersCampaignCosts.jsx)
* [DevelopersConversions.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/developers/DevelopersConversions.jsx)
* [DevelopersIdentify.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/developers/DevelopersIdentify.jsx)
* [DevelopersOfflineConversions.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/developers/DevelopersOfflineConversions.jsx)
* [DevelopersTracker.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/developers/DevelopersTracker.jsx)
* [DevelopersWebhooks.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/developers/DevelopersWebhooks.jsx)
* [DocsTroubleshooting.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/docs/DocsTroubleshooting.jsx)

---

## Issue Categories Fixed

1. **Border Standardization:** Removed custom arbitrary border hex `border-[#E2E8F0]` on Setup setup-steps cards (Card 2 and Card 4) and replaced them with standard tokens matching system architecture (`border-gray-200 dark:border-[#2A2E2E]`).
2. **Developer Pages Green Color Harmonization:** Standardized arbitrary green parameter types/headers column `text-[#00AA57]` to Tailwind standard `text-green-600`.
3. **Troubleshooting Symptom Red Text Softening:** Replaced hardcoded red symptom headers `text-[#E54545]` with standard Tailwind `text-red-600`.

---

## Technical Confirmations

* **No Backend/API Changes:** Verified.
* **No Auth/Billing/Tracking/Database Changes:** Verified.
* **No New Dependencies:** Verified.

---

## Final Verdict

* **Verdict:** `PENDING BROWSER VERIFICATION`
* **Paid-Beta Readiness:** `NOT READY`
* **Combined QA Check Note:** Session changes for D5, D6, and D7 are consolidated in staging. They will require one single combined deployed browser verification check with staging screenshots before they can be marked `PASS`.
