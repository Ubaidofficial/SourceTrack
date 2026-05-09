import { ph } from '../lib/posthog.js'

export async function identify(req, res) {
  try {
    const { anonymous_id, traits } = req.body

    ph.capture({
      distinctId: anonymous_id,
      event: '$identify',
      properties: {
        site_id: req.site.id,
        $set: traits || {}
      }
    })

    await ph.shutdown()

    res.status(200).json({ success: true, data: { received: true }, error: null })
  } catch (_err) {
    res.status(500).json({ success: false, data: null, error: 'Identify failed' })
  }
}
