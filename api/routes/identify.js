import { ph } from '../lib/posthog.js'

export async function identify(req, res) {
  try {
    const { anonymous_id, user_id, traits } = req.body

    const setProps = traits || {}
    const setOnceProps = {}

    if (typeof req.body.source_system === 'string') {
      const ss = req.body.source_system.trim()
      if (ss.length > 0) setProps.source_system = ss
    }
    if (typeof req.body.external_id === 'string') {
      const ext = req.body.external_id.trim()
      if (ext.length > 0) setProps.external_id = ext
    }
    if (typeof req.body.contact_email === 'string') {
      const em = req.body.contact_email.trim()
      if (em.length > 0) setProps.contact_email = em
    }

    if (req.body.first_touch_source) {
      setOnceProps.first_touch_source = req.body.first_touch_source
    }
    if (req.body.first_touch_medium) {
      setOnceProps.first_touch_medium = req.body.first_touch_medium
    }
    if (req.body.first_touch_campaign) {
      setOnceProps.first_touch_campaign = req.body.first_touch_campaign
    }

    ph.capture({
      distinctId: anonymous_id,
      event: '$identify',
      properties: {
        site_id: req.site.id,
        $set: setProps,
        ...(Object.keys(setOnceProps).length > 0 ? { $set_once: setOnceProps } : {})
      }
    })

    if (user_id && anonymous_id && user_id !== anonymous_id) {
      ph.alias({
        distinctId: user_id,
        alias: anonymous_id
      })
    }

    await ph.shutdown()

    res.status(200).json({ success: true, data: { received: true }, error: null })
  } catch (_err) {
    console.error(_err)
    res.status(500).json({ success: false, data: null, error: 'Identify failed' })
  }
}
