import { queryHogQL } from './api/lib/posthog.js'

const sql = `
  SELECT 
    properties.first_touch_source,
    properties.conversion_value,
    toFloatOrZero(toString(properties.conversion_value)) AS parsed_value,
    SUM(toFloatOrZero(toString(properties.conversion_value))) AS total_revenue
  FROM events
  WHERE properties.site_id = 'a2cec48d-3eae-4c52-82d7-4919835eaf33'
    AND event = '$conversion'
    AND timestamp >= toDateTime('2026-05-13')
    AND timestamp <= toDateTime('2026-05-14 23:59:59')
  GROUP BY properties.first_touch_source, properties.conversion_value
  LIMIT 10
`
const rows = await queryHogQL(sql, 'test')
console.log(JSON.stringify(rows, null, 2))
