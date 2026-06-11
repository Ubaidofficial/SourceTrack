import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const REQUIRED_PARAMS = [
  'utm_id',
  'st_campaign_id',
  'st_adgroup_id',
  'st_ad_id',
  'st_target_id',
  'st_network',
  'st_device',
  'st_matchtype'
]

const CLICK_IDS = [
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'ttclid',
  'li_fat_id',
  'twclid'
]

function assertContains(filePath, textPattern) {
  const content = fs.readFileSync(filePath, 'utf8')
  if (textPattern instanceof RegExp) {
    if (!textPattern.test(content)) {
      console.error(`❌ QA Failed: ${filePath} does not match pattern ${textPattern}`)
      process.exit(1)
    }
  } else {
    if (!content.includes(textPattern)) {
      console.error(`❌ QA Failed: ${filePath} does not contain text "${textPattern}"`)
      process.exit(1)
    }
  }
  console.log(`✅ Passed: ${filePath} contains pattern/text`)
}

console.log('--- STARTING GOOGLE ADS SETUP STATIC QA ---')

// 1. Check trackers
const trackerPath = path.join(rootDir, 'tracker/tracker.js')
const cookielessTrackerPath = path.join(rootDir, 'tracker/tracker.cookieless.js')

REQUIRED_PARAMS.forEach(param => {
  assertContains(trackerPath, param)
  assertContains(cookielessTrackerPath, param)
})

// 2. Check backend ingestion routes
const trackRoutePath = path.join(rootDir, 'api/routes/track.js')
const conversionRoutePath = path.join(rootDir, 'api/routes/conversion.js')

REQUIRED_PARAMS.forEach(param => {
  assertContains(trackRoutePath, param)
  assertContains(conversionRoutePath, param)
})
assertContains(trackRoutePath, 'sanitizeValueTrack')
assertContains(conversionRoutePath, 'sanitizeValueTrack')

// 3. Check event debugger queries & views
const eventsRoutePath = path.join(rootDir, 'api/routes/events.js')
const eventDebuggerUiPath = path.join(rootDir, 'dashboard/src/pages/EventDebugger.jsx')

REQUIRED_PARAMS.forEach(param => {
  assertContains(eventsRoutePath, param)
  assertContains(eventDebuggerUiPath, param)
})

CLICK_IDS.forEach(id => {
  assertContains(eventsRoutePath, id)
  assertContains(eventDebuggerUiPath, id)
})

// 4. Check integrations API & UI
const integrationsRoutePath = path.join(rootDir, 'api/routes/integrations.js')
const integrationsUiPath = path.join(rootDir, 'dashboard/src/pages/Integrations.jsx')

assertContains(integrationsRoutePath, '/google-ads/checklist')
assertContains(integrationsRoutePath, 'google_ads_checklist')
assertContains(integrationsUiPath, 'google-ads-checklist')
assertContains(integrationsUiPath, 'gadsChecklistData')

// 5. Check docs pages
const docsPagePath = path.join(rootDir, 'dashboard/src/pages/docs/DocsGoogleAds.jsx')
assertContains(docsPagePath, 'utm_source=google')
assertContains(docsPagePath, 'st_campaign_id')
assertContains(docsPagePath, 'st_adgroup_id')
assertContains(docsPagePath, 'st_ad_id')

console.log('🎉 ALL GOOGLE ADS SETUP STATIC QA CHECKS PASSED SUCCESSFULLY!')
process.exit(0)
