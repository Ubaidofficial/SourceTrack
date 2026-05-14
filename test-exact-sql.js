import { queryHogQL } from './api/lib/posthog.js'

const sql = `
SELECT
  COALESCE(NULLIF(properties.first_touch_source, ''), 'direct') AS dim_value,
  SUM(toFloatOrZero(toString(properties.conversion_value))) AS metric_value
FROM events
WHERE properties.site_id = 'a2cec48d-3eae-4c52-82d7-4919835eaf33'
  AND timestamp >= toDateTime('2026-05-14')
  AND timestamp <= toDateTime('2026-05-14 23:59:59')
  AND event = '$conversion'
GROUP BY dim_value
ORDER BY metric_value DESC
LIMIT 50000
`
const rows = await queryHogQL(sql, 'test')
console.log(JSON.stringify(rows, null, 2))
