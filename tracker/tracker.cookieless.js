;(function () {
  'use strict'

  // ─── Config ────────────────────────────────────────────────────────────────
  var sc = document.currentScript || document.querySelector('script[data-site-key]')
  var K  = (sc && sc.getAttribute('data-site-key')) || ''
  var B  = (sc && sc.src) ? new URL(sc.src).origin : location.origin

  // No localStorage, no sessionStorage, no cookies.
  // visitor_id and session_id are fetched from the server on each page load.
  // They rotate daily (visitor) and hourly (session) via a salted SHA-256 hash.
  var AID = null   // filled async from /api/tracker/id
  var SID = null
  var _q  = []     // events buffered until IDs arrive

  // ─── AI source detection ───────────────────────────────────────────────────
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
  var _pk = 'utm_source,utm_medium,utm_campaign,utm_content,utm_term,ref,source,via,gclid,gbraid,wbraid,fbclid,msclkid,ttclid,li_fat_id,twclid'.split(',')
  function params() {
    var p = new URLSearchParams(location.search), r = {}
    _pk.forEach(function (k) { r[k] = p.get(k) })
    return r
  }

  // ─── First-touch derivation (in-memory only — no persistent storage) ───────
  // Cookieless trade-off: first-touch is session-scoped, not cross-session.
  function deriveFirstTouch(p, ref) {
    var src = p.utm_source || p.ref || p.source
      || (ref && (function () {
        try { var h = new URL(ref).hostname.replace('www.', ''); return h && h !== location.hostname ? h : null } catch (_) {}
      })())
      || 'direct'
    var med = p.utm_medium
      || (p.gclid || p.gbraid || p.wbraid || p.msclkid ? 'cpc' : null)
      || (p.fbclid || p.ttclid ? 'paid_social' : null)
      || 'none'
    return { first_touch_source: src, first_touch_medium: med, first_touch_campaign: p.utm_campaign || '' }
  }

  // ─── Shared UTM + click-id field builder ───────────────────────────────────
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

  // ─── Flush queued events once IDs arrive ───────────────────────────────────
  function flush() {
    var q = _q.splice(0)
    for (var i = 0; i < q.length; i++) {
      q[i].data.anonymous_id = AID
      q[i].data.session_id   = SID
      send(q[i].ep, q[i].data)
    }
  }

  // ─── Fetch server-generated visitor ID ─────────────────────────────────────
  function fetchId() {
    fetch(B + '/api/tracker/id?site_key=' + encodeURIComponent(K), { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (j) {
        AID = (j && j.visitor_id) || 'cl-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
        SID = (j && j.session_id) || AID
        flush()
      })
      .catch(function () {
        AID = 'cl-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
        SID = AID
        flush()
      })
  }

  // ─── Pageview ──────────────────────────────────────────────────────────────
  function sendPageview() {
    var p = params(), ref = document.referrer || null
    var data = Object.assign(
      { site_key: K, event: '$pageview', anonymous_id: AID, session_id: SID,
        page_url: location.href, referrer: ref, cookieless: true },
      utmFields(p),
      { ref_param: p.ref, source_param: p.source, via_param: p.via },
      deriveFirstTouch(p, ref),
      { ai_source: aiSrc(ref, p.utm_source) }
    )
    AID ? send('/api/track', data) : _q.push({ ep: '/api/track', data: data })
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

  // ─── Public API ────────────────────────────────────────────────────────────
  window.sourcetrack = {
    conversion: function (opts) {
      opts = opts || {}
      var p = params(), ref = document.referrer || null
      var data = Object.assign(
        { site_key: K, anonymous_id: AID, session_id: SID, page_url: location.href, referrer: ref, cookieless: true,
          conversion_value: opts.value || opts.conversion_value || 0,
          conversion_type:  opts.type  || opts.conversion_type  || 'conversion',
          order_id:         opts.order_id || opts.orderId        || null },
        utmFields(p),
        deriveFirstTouch(p, ref),
        { ai_source: aiSrc(ref, p.utm_source) }
      )
      AID ? send('/api/conversion', data) : _q.push({ ep: '/api/conversion', data: data })
    },

    identify: function (traits) {
      traits = traits || {}
      var data = { site_key: K, anonymous_id: AID, session_id: SID, email: traits.email || null, name: traits.name || null, traits: traits }
      AID ? send('/api/identify', data) : _q.push({ ep: '/api/identify', data: data })
    },

    track: function (event, properties) {
      var data = { site_key: K, event: event, anonymous_id: AID, session_id: SID, page_url: location.href, properties: properties || {} }
      AID ? send('/api/track', data) : _q.push({ ep: '/api/track', data: data })
    }
  }

  // ─── Outbound Link Tracking ────────────────────────────────────────────────
  function trackOutbound(e) {
    if (e.type === 'auxclick' && e.button !== 1) return

    var a = e.target
    while (a && a.nodeName !== 'A') a = a.parentNode
    if (!a) return

    var href = a.getAttribute('href')
    if (!href || href.indexOf('#') === 0) return

    try {
      var url = new URL(href, location.href)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      if (url.hostname === location.hostname) return

      if (window.sourcetrack) {
        window.sourcetrack.track('outbound_click', {
          destination_domain: url.hostname,
          destination_url: url.origin + url.pathname
        })
      }
    } catch (_) {}
  }
  addEventListener('click', trackOutbound)
  addEventListener('auxclick', trackOutbound)

  sendPageview()  // queued until fetchId() resolves
  fetchId()
})()
