import { getFlexibleReport } from './api/lib/attribution-engine.js'

const siteId = 'a2cec48d-3eae-4c52-82d7-4919835eaf33'
const result = await getFlexibleReport(siteId, 'first_touch', '2026-05-13', '2026-05-14', 'source', 'revenue', {})
console.log(JSON.stringify(result, null, 2))
