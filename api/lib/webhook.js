import { v4 as uuidv4 } from 'uuid'

const WEBHOOK_URL = process.env.WEBHOOK_URL || null
const WEBHOOK_TIMEOUT_MS = 5000

export function dispatchWebhook(eventType, properties) {
  if (!WEBHOOK_URL) return

  const payload = {
    event_id: uuidv4(),
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    source: 'sourcetrack',
    data: {}
  }

  if (properties.site_id) payload.data.site_id = properties.site_id
  if (properties.anonymous_id) payload.data.anonymous_id = properties.anonymous_id
  if (properties.user_id) payload.data.user_id = properties.user_id
  if (properties.conversion_type) payload.data.conversion_type = properties.conversion_type
  if (properties.conversion_value !== undefined) payload.data.conversion_value = properties.conversion_value
  if (properties.form_name) payload.data.form_name = properties.form_name
  if (properties.ingestion_method) payload.data.ingestion_method = properties.ingestion_method
  if (properties.external_id) payload.data.external_id = properties.external_id
  if (properties.source_system) payload.data.source_system = properties.source_system

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)

  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal
  })
    .then(() => { /* delivered — no action needed */ })
    .catch(err => {
      if (err.name === 'AbortError') {
        console.error('Webhook timed out after', WEBHOOK_TIMEOUT_MS, 'ms')
      } else {
        console.error('Webhook delivery failed:', err.message)
      }
    })
    .finally(() => clearTimeout(timer))
}
