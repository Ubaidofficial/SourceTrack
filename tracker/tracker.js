;(function () {
  'use strict'

  // ─── Do Not Track / Global Privacy Control ────────────────────────────────
  // Opt-out signaled by the browser/OS — abort before any storage or beacons.
  // Opt-in is still possible via the data-consent-required attribute (below).
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true) return

  // ─── Config ────────────────────────────────────────────────────────────────
  var sc = document.currentScript || document.querySelector('script[data-site-key]')
  var K  = (sc && sc.getAttribute('data-site-key')) || ''
  var B  = (sc && sc.src) ? new URL(sc.src).origin : location.origin

  // ─── Storage helpers ───────────────────────────────────────────────────────
  function ls(k, v) {
    try { return v !== undefined ? (localStorage.setItem(k, v), v) : localStorage.getItem(k) } catch (_) { return null }
  }
  function ss(k, v) {
    try { return v !== undefined ? (sessionStorage.setItem(k, v), v) : sessionStorage.getItem(k) } catch (_) { return null }
  }

  // ─── Identity ──────────────────────────────────────────────────────────────
  function uid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0
      return (c === 'x' ? r : r & 3 | 8).toString(16)
    })
  }
  var AID = ls('st_aid') || ls('st_aid', uid())   // anonymous_id — permanent
  var SID = ss('st_sid') || ss('st_sid', uid())   // session_id   — per-tab

  // ─── AI source detection ───────────────────────────────────────────────────
  // Compact encoding: "key Name" pairs separated by |
  // Keys without dots → UTM source match; keys with dots → referrer hostname match
  var _ai = {}
  'chatgpt.com ChatGPT|chat.openai.com ChatGPT|chatgpt ChatGPT|openai ChatGPT|claude.ai Claude|anthropic.com Claude|claude Claude|anthropic Claude|perplexity.ai Perplexity|perplexity Perplexity|gemini.google.com Gemini|bard.google.com Gemini|aistudio.google.com Gemini|gemini Gemini|bard Gemini|google-gemini Gemini|grok.com Grok|grok.x.com Grok|grok Grok|xai Grok|copilot.microsoft.com Copilot|copilot Copilot|bing-copilot Copilot|deepseek.com DeepSeek|deepseek DeepSeek|deep-seek DeepSeek|meta.ai Meta AI|meta-ai Meta AI|you.com You.com|phind.com Phind|mistral.ai Mistral|poe.com Poe|kagi.com Kagi'
    .split('|').forEach(function (e) { var i = e.indexOf(' '); _ai[e.slice(0, i)] = e.slice(i + 1) })

  function aiSrc(ref, utmSrc) {
    if (utmSrc && _ai[utmSrc.toLowerCase()]) return _ai[utmSrc.toLowerCase()]
    if (ref) try {
      var h = new URL(ref).hostname.replace('www.', '')
      if (h === 'bing.com' && ref.indexOf('/chat') > -1) return 'Copilot'
      if (h === 'x.com'    && ref.indexOf('/i/grok') > -1) return 'Grok'
      return _ai[h] || null
    } catch (_) {}
    return null
  }

  // ─── URL params ────────────────────────────────────────────────────────────
  // All 16 tracked params built from a single array split — no per-key repetition
  var _pk = 'utm_source,utm_medium,utm_campaign,utm_content,utm_term,ref,source,via,gclid,gbraid,wbraid,fbclid,msclkid,ttclid,li_fat_id,twclid'.split(',')
  function params() {
    var p = new URLSearchParams(location.search), r = {}
    _pk.forEach(function (k) { r[k] = p.get(k) })
    return r
  }

  // ─── First touch ───────────────────────────────────────────────────────────
  // Written once on very first visit, never overwritten — survives across sessions
  function storeFirstTouch(p, ref) {
    if (ls('st_ft_src')) return
    var src = p.utm_source || p.ref || p.source
      || (ref && (function () {
        try { var h = new URL(ref).hostname.replace('www.', ''); return h && h !== location.hostname ? h : null } catch (_) {}
      })())
      || 'direct'
    var med = p.utm_medium
      || (p.gclid || p.gbraid || p.wbraid || p.msclkid ? 'cpc' : null)
      || (p.fbclid || p.ttclid ? 'paid_social' : null)
      || 'none'
    ls('st_ft_src', src)
    ls('st_ft_med', med)
    ls('st_ft_cmp', p.utm_campaign || '')
    ls('st_ft_ts',  new Date().toISOString())
  }
  function getFT() {
    return { first_touch_source: ls('st_ft_src') || 'direct', first_touch_medium: ls('st_ft_med') || 'none', first_touch_campaign: ls('st_ft_cmp') || '' }
  }

  // ─── Shared UTM + click-id field builder ───────────────────────────────────
  // Used in both pageview and conversion payloads — defined once, no duplication
  function utmFields(p) {
    return {
      utm_source: p.utm_source, utm_medium: p.utm_medium, utm_campaign: p.utm_campaign,
      utm_content: p.utm_content, utm_term: p.utm_term,
      gclid: p.gclid, gbraid: p.gbraid, wbraid: p.wbraid,
      fbclid: p.fbclid, msclkid: p.msclkid, ttclid: p.ttclid,
      li_fat_id: p.li_fat_id, twclid: p.twclid
    }
  }

  // ─── Send ──────────────────────────────────────────────────────────────────
  function send(ep, data) {
    var b = JSON.stringify(data), u = B + ep
    try {
      navigator.sendBeacon
        ? navigator.sendBeacon(u, new Blob([b], { type: 'application/json' }))
        : fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: b, keepalive: true }).catch(function () {})
    } catch (_) {}
  }

  // ─── Pageview ──────────────────────────────────────────────────────────────
  function sendPageview() {
    var p = params(), ref = document.referrer || null
    storeFirstTouch(p, ref)
    var f = getFT(), u = utmFields(p)
    send('/api/track', Object.assign(
      { site_key: K, event: '$pageview', anonymous_id: AID, session_id: SID, page_url: location.href, referrer: ref },
      u,
      { ref_param: p.ref, source_param: p.source, via_param: p.via },
      f,
      { ai_source: aiSrc(ref, p.utm_source) }
    ))
  }

  // ─── SPA routing ───────────────────────────────────────────────────────────
  var _lastUrl = location.href, _ps = history.pushState
  history.pushState = function () {
    _ps.apply(this, arguments)
    if (location.href !== _lastUrl) { _lastUrl = location.href; sendPageview() }
  }
  addEventListener('popstate', function () {
    if (location.href !== _lastUrl) { _lastUrl = location.href; sendPageview() }
  })

  // ─── Consent management ───────────────────────────────────────────────────
  // When data-consent-required="true" is on the script tag, all tracking is
  // held until sourcetrack.consent(true) is called (opt-in mode).
  // Without that attribute, tracking fires immediately (opt-out model —
  // backward-compatible with all existing installs).
  //
  // Regardless of mode, sourcetrack.optOut() stops all future tracking
  // and sourcetrack.optIn() resumes it.
  var CONSENT_KEY = 'st_consent'
  var CONSENT_REQUIRED = sc && sc.getAttribute('data-consent-required') === 'true'
  var _queue = []
  var _consentGiven = null  // null = not yet decided, true/false = explicit decision

  // Check for persisted consent decision
  try {
    var stored = localStorage.getItem(CONSENT_KEY)
    if (stored === 'true')  _consentGiven = true
    if (stored === 'false') _consentGiven = false
  } catch (_) {}

  // Override send() to respect consent gate
  var _rawSend = send
  function sendGated(ep, data) {
    if (_consentGiven === false) return  // opted out
    if (CONSENT_REQUIRED && _consentGiven !== true) {
      _queue.push([ep, data])  // queue until consent(true)
      return
    }
    _rawSend(ep, data)
  }
  send = sendGated

  function _flushQueue() {
    var q = _queue.splice(0)
    for (var i = 0; i < q.length; i++) _rawSend(q[i][0], q[i][1])
  }

  // ─── Public API ────────────────────────────────────────────────────────────
  window.sourcetrack = {
    // sourcetrack.conversion({ value: 99, type: 'purchase', order_id: '123', properties: { plan: 'pro' } })
    conversion: function (opts) {
      opts = opts || {}
      var p = params(), ref = document.referrer || null
      send('/api/conversion', Object.assign(
        { site_key: K, anonymous_id: AID, session_id: SID, page_url: location.href, referrer: ref,
          conversion_value: opts.value || opts.conversion_value || 0,
          conversion_type:  opts.type  || opts.conversion_type  || 'conversion',
          order_id:         opts.order_id || opts.orderId        || null,
          properties:       opts.properties || null,
          ref_param:        p.ref || null,
          source_param:     p.source || null,
          via_param:        p.via || null },
        utmFields(p),
        getFT(),
        { ai_source: aiSrc(ref, p.utm_source) }
      ))
    },

    // sourcetrack.identify('user-123', { email: 'user@example.com' })  ← recommended
    // sourcetrack.identify({ email: 'user@example.com' })              ← backward-compat
    identify: function (userIdOrTraits, traits) {
      var userId = null
      if (typeof userIdOrTraits === 'string' && userIdOrTraits.length > 0) {
        userId = userIdOrTraits
        traits = traits || {}
      } else {
        traits = userIdOrTraits || {}
      }
      send('/api/identify', {
        site_key: K, anonymous_id: AID, session_id: SID,
        user_id: userId || traits.user_id || traits.userId || traits.id || null,
        email: traits.email || null, name: traits.name || null, traits: traits
      })
    },

    // sourcetrack.track('button_clicked', { button: 'signup' })
    track: function (event, properties) {
      send('/api/track', { site_key: K, event: event, anonymous_id: AID, session_id: SID, page_url: location.href, properties: properties || {} })
    },

    // ── Consent API ───────────────────────────────────────────────────────────
    // sourcetrack.consent(true)  — grant consent, flush queued events
    // sourcetrack.consent(false) — deny consent, clear queue, stop tracking
    consent: function (granted) {
      _consentGiven = !!granted
      try { localStorage.setItem(CONSENT_KEY, String(_consentGiven)) } catch (_) {}
      if (_consentGiven) {
        _flushQueue()
      } else {
        _queue.length = 0  // clear queued events — do not send
      }
    },

    // sourcetrack.optOut() — stop all tracking immediately (persisted)
    optOut: function () { window.sourcetrack.consent(false) },

    // sourcetrack.optIn()  — resume tracking (persisted)
    optIn:  function () { window.sourcetrack.consent(true) },

    // sourcetrack.hasConsent() — returns true/false/null
    hasConsent: function () { return _consentGiven }
  }

  sendPageview()
})()
