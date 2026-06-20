# Session 140Z-G3-D18H-F: Admin Preview Audit Log ReferenceError

## Bug Context
In `api/routes/admin.js`, the `GET /api/admin/preview/:siteKeyOrId` endpoint correctly captures `req.params.siteKeyOrId` as `keyOrId`. However, later in the function execution, it attempts to log the preview action using `logAction('preview_dashboard_view', 'site', siteKey, { site_name: site.name })`. Because `siteKey` is undefined in this scope, a `ReferenceError` is thrown, breaking the route.

## Fix Implementation
**Route Affected:** `GET /api/admin/preview/:siteKeyOrId` in `api/routes/admin.js`

**Before:**
```javascript
logAction('preview_dashboard_view', 'site', siteKey, { site_name: site.name })
```

**After:**
```javascript
logAction('preview_dashboard_view', 'site', site.site_key || keyOrId, { site_name: site.name })
```

The undefined `siteKey` variable was replaced with `site.site_key || keyOrId` to ensure a safe and accurate target identifier is passed to the audit logger.

## Validation Outputs
```
--- A. Git Cleanliness & Log ---
 M api/routes/admin.js
?? docs/qa/admin_preview_audit_log_reference_140Z-G3-D18H-F.md

--- B. Backend Syntax Checks ---
✅ All backend files syntax passed.

--- C. Frontend Build ---
Running frontend production build...
✅ Frontend build succeeded.

--- D. Whitespace Check ---
✅ No whitespace violations.

==================================================
PASS — static launch QA passed
api/routes/admin.js:263:// GET /api/admin/preview/:siteKeyOrId — aggregated dashboard data for support-mode preview
api/routes/admin.js:265:router.get('/preview/:siteKeyOrId', async (req, res) => {
api/routes/admin.js:268:    const keyOrId = req.params.siteKeyOrId
api/routes/admin.js:269:    if (!keyOrId) {
api/routes/admin.js:279:    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyOrId)) {
api/routes/admin.js:280:      siteQuery = siteQuery.eq('id', keyOrId)
api/routes/admin.js:282:      siteQuery = siteQuery.eq('site_key', keyOrId)
api/routes/admin.js:361:    logAction('preview_dashboard_view', 'site', site.site_key || keyOrId, { site_name: site.name })
api/routes/admin.js:389:    const siteKeyOrId = req.query.site_key
api/routes/admin.js:390:    if (!siteKeyOrId) {
api/routes/admin.js:399:    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteKeyOrId)) {
api/routes/admin.js:400:      siteQuery = siteQuery.eq('id', siteKeyOrId)
api/routes/admin.js:402:      siteQuery = siteQuery.eq('site_key', siteKeyOrId)
 api/routes/admin.js | 3 +--
 1 file changed, 1 insertion(+), 2 deletions(-)
```

## Final Status
**PARTIAL PASS / LOCAL ONLY**
The bug is fixed and validation passes locally.
Paid beta remains NOT READY.
