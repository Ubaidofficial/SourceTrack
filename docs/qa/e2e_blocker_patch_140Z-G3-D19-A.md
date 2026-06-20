# QA Report: E2E Blocker Patch (140Z-G3-D19-A)

## 1. Issues Fixed
- **Settings shared dashboard link path bug**: User-facing shared dashboard links generated in `Settings.jsx` incorrectly used the `/public/:token` path instead of `/share/:token`.
- **Scheduled email report eligibility bug**: The `api/jobs/email-reports.js` job included free, inactive, and archived sites due to a loose negative check (`plan !== 'trial'`).
- **dotenv job bootstrap ordering**: Both `api/jobs/email-reports.js` and `api/jobs/health-agent.js` used an outdated `dotenv` initialization pattern that could fail to load env vars prior to static imports.

## 2. Files Changed
- `dashboard/src/pages/Settings.jsx`
- `api/jobs/email-reports.js`
- `api/jobs/health-agent.js`

## 3. Why /share/:token changes are frontend-only
The `/share/:token` path is the React Router frontend route defined in `App.jsx` for rendering the `ShareDashboard.jsx` component. The `/api/public/:token` path remains untouched because it is the backend API endpoint `ShareDashboard.jsx` fetches data from. Modifying the backend API path would unnecessarily break backward compatibility for existing data fetch requests without providing any functional benefit.

## 4. Email report eligibility
**Before:**
```javascript
const isActive = site.plan !== 'trial' ||
  (site.trial_ends_at && new Date(site.trial_ends_at) > new Date())
```
*(This allowed all non-trial plans, including 'free', 'inactive', and 'archived', to receive scheduled reports).*

**After:**
```javascript
// Conservative eligibility:
// - Free, inactive, and archived sites must not receive scheduled reports.
// - Explicitly allow only active trials and known paid tiers.
const isPaidPlan = ['starter', 'growth', 'scale', 'business'].includes(site.plan)
const isActiveTrial = site.plan === 'trial' && site.trial_ends_at && new Date(site.trial_ends_at) > new Date()
const isActive = isPaidPlan || isActiveTrial
```

## 5. Dotenv Bootstrap
**Before:**
```javascript
import WebSocket from 'ws'
import dotenv from 'dotenv'
import { getSupabase } from '../lib/supabase.js'
dotenv.config()
```
**After:**
```javascript
import 'dotenv/config'
import WebSocket from 'ws'
import { getSupabase } from '../lib/supabase.js'
```

## Final Status
**PARTIAL PASS / LOCAL ONLY**
Paid beta remains NOT READY.
Note that the D18H-E deployed browser retest remains separate/pending.
