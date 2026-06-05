import { queryHogQL } from '../lib/posthog.js'
import { esc } from '../lib/utils.js'

export async function journey(req, res) {
  try {
    const { visitorId } = req.params
    const posthogSiteId = String(req.site.id)
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 500, 1), 500)

    if (!visitorId) {
      return res.status(400).json({ success: false, data: null, error: 'visitorId is required' })
    }

    const sql = `
      SELECT
        event,
        timestamp,
        properties.page_url,
        properties.referrer,
        properties.utm_source,
        properties.utm_medium,
        properties.utm_campaign,
        properties.ai_source,
        properties.is_conversion,
        properties.conversion_value,
        properties.conversion_type,
        properties.device_type,
        properties.browser_name,
        properties.browser_version,
        properties.os_name,
        properties.os_version,
        properties.country,
        properties.user_id,
        properties.order_id,
        properties.destination_domain,
        properties.destination_url
      FROM events
      WHERE properties.site_id = '${esc(posthogSiteId)}'
        AND distinct_id = '${esc(visitorId)}'
      ORDER BY timestamp ASC
      LIMIT ${limit}
    `

    const rows = await queryHogQL(sql, 'journey')

    const events = rows.map(([
      event, timestamp, pageUrl, referrer,
      utmSource, utmMedium, utmCampaign,
      aiSource, isConversion, conversionValue,
      conversionType, deviceType, browserName, browserVersion,
      osName, osVersion, country, userId,
      orderId, destinationDomain, destinationUrl
    ]) => ({
      event,
      timestamp,
      page_url: pageUrl || null,
      referrer: referrer || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      ai_source: aiSource || null,
      is_conversion: isConversion === true || isConversion === 'true' || isConversion === 1,
      conversion_value: conversionValue ? Number(conversionValue) || 0 : null,
      conversion_type: conversionType || null,
      device_type: deviceType || null,
      browser_name: browserName || null,
      browser_version: browserVersion || null,
      os_name: osName || null,
      os_version: osVersion || null,
      country: country || null,
      user_id: userId || null,
      order_id: orderId || null,
      destination_domain: destinationDomain || null,
      destination_url: destinationUrl || null
    }))
    const userId = events.find(e => e.user_id)?.user_id || null

    let person = null
    try {
      const host = process.env.POSTHOG_HOST.replace(/\/$/, '')
      const projectId = process.env.POSTHOG_PROJECT_ID
      const url = `${host}/api/projects/${projectId}/persons/${visitorId}/`

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`
        }
      })

      if (res.ok) {
        person = await res.json()
      }
    } catch (_err) {
      /* person data is best-effort */
    }

    res.status(200).json({
      success: true,
      data: {
        visitor_id: visitorId,
        user_id: userId,
        person,
        events,
        event_count: events.length
      },
      error: null
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, data: null, error: 'Journey query failed' })
  }
}
