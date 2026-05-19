;(function () {
  'use strict'

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

  // ─── Public API ────────────────────────────────────────────────────────────
  window.sourcetrack = {
    // sourcetrack.conversion({ value: 99, type: 'purchase', order_id: '123' })
    conversion: function (opts) {
      opts = opts || {}
      var p = params(), ref = document.referrer || null
      send('/api/conversion', Object.assign(
        { site_key: K, anonymous_id: AID, session_id: SID, page_url: location.href, referrer: ref,
          conversion_value: opts.value || opts.conversion_value || 0,
          conversion_type:  opts.type  || opts.conversion_type  || 'conversion',
          order_id:         opts.order_id || opts.orderId        || null },
        utmFields(p),
        getFT(),
        { ai_source: aiSrc(ref, p.utm_source) }
      ))
    },

    // sourcetrack.identify({ email: 'user@example.com', name: 'John' })
    identify: function (traits) {
      traits = traits || {}
      send('/api/identify', { site_key: K, anonymous_id: AID, session_id: SID, email: traits.email || null, name: traits.name || null, traits: traits })
    },

    // sourcetrack.track('button_clicked', { button: 'signup' })
    track: function (event, properties) {
      send('/api/track', { site_key: K, event: event, anonymous_id: AID, session_id: SID, page_url: location.href, properties: properties || {} })
    }
  }

  sendPageview()
})()
