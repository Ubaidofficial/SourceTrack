import { queryHogQL } from './api/lib/posthog.js'

const sql = `
  SELECT 
    typeof(properties.conversion_value) AS value_type,
    properties.conversion_value AS raw_value,
    toString(properties.conversion_value) AS string_value,
    toFloatOrZero(toString(properties.conversion_value)) AS float_value
  FROM events
  WHERE properties.site_id = 'a2cec48d-3eae-4c52-82d7-4919835eaf33'
    AND event = '$conversion'
    AND timestamp >= toDateTime('2026-05-14')
    AND timestamp <= toDateTime('2026-05-14 23:59:59')
  LIMIT 5
`
const rows = await queryHogQL(sql, 'test')
console.log(JSON.stringify(rows, null, 2))
