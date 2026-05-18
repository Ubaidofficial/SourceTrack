;(function () {
  'use strict'

  // ─── Config ──────────────────────────────────────────────────────────────────
  var script = document.currentScript || document.querySelector('script[data-site-key]')
  var SITE_KEY = (script && script.getAttribute('data-site-key')) || ''
  var API_BASE = (script && script.src)
    ? new URL(script.src).origin
    : window.location.origin

  // Storage keys
  var KEY_AID        = 'st_aid'        // anonymous_id — persists forever
  var KEY_FT_SOURCE  = 'st_ft_src'     // first touch source — never overwritten
  var KEY_FT_MEDIUM  = 'st_ft_med'
  var KEY_FT_CAMPAIGN= 'st_ft_cmp'
  var KEY_FT_TS      = 'st_ft_ts'
  var KEY_SESSION    = 'st_sid'        // session id — sessionStorage

  // ─── Identity ─────────────────────────────────────────────────────────────────
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    })
  }

  function ls(key, val) {
    try {
      if (val !== undefined) { localStorage.setItem(key, val); return val }
      return localStorage.getItem(key)
    } catch (_e) { return null }
  }

  function ss(key, val) {
    try {
      if (val !== undefined) { sessionStorage.setItem(key, val); return val }
      return sessionStorage.getItem(key)
    } catch (_e) { return null }
  }

  // anonymous_id: localStorage, survives across sessions
  var anonymousId = ls(KEY_AID)
  if (!anonymousId) { anonymousId = uuid(); ls(KEY_AID, anonymousId) }

  // session_id: sessionStorage, new per tab/session
  var sessionId = ss(KEY_SESSION)
  if (!sessionId) { sessionId = uuid(); ss(KEY_SESSION, sessionId) }

  // ─── URL Params ───────────────────────────────────────────────────────────────
  function getParams() {
    var p = new URLSearchParams(window.location.search)
    return {
      utm_source:   p.get('utm_source')   || null,
      utm_medium:   p.get('utm_medium')   || null,
      utm_campaign: p.get('utm_campaign') || null,
      utm_content:  p.get('utm_content')  || null,
      utm_term:     p.get('utm_term')     || null,
      ref:          p.get('ref')          || p.get('ref_param') || null,
      source:       p.get('source')       || null,
      via:          p.get('via')          || null,
      gclid:        p.get('gclid')        || null,
      gbraid:       p.get('gbraid')       || null,
      wbraid:       p.get('wbraid')       || null,
      fbclid:       p.get('fbclid')       || null,
      msclkid:      p.get('msclkid')      || null,
      ttclid:       p.get('ttclid')       || null,
      li_fat_id:    p.get('li_fat_id')    || null,
      twclid:       p.get('twclid')       || null
    }
  }

  // ─── AI Source Detection ──────────────────────────────────────────────────────
  var AI_HOSTS = {
    'chat.openai.com': 'ChatGPT', 'chatgpt.com': 'ChatGPT',
    'claude.ai': 'Claude', 'anthropic.com': 'Claude',
    'perplexity.ai': 'Perplexity',
    'gemini.google.com': 'Gemini', 'bard.google.com': 'Gemini',
    'aistudio.google.com': 'Gemini',
    'grok.com': 'Grok', 'grok.x.com': 'Grok',
    'copilot.microsoft.com': 'Copilot',
    'deepseek.com': 'DeepSeek',
    'meta.ai': 'Meta AI',
    'you.com': 'You.com', 'phind.com': 'Phind',
    'mistral.ai': 'Mistral', 'poe.com': 'Poe',
    'kagi.com': 'Kagi'
  }

  var AI_UTM_SOURCES = {
    'chatgpt': 'ChatGPT', 'chat.openai.com': 'ChatGPT', 'openai': 'ChatGPT',
    'claude': 'Claude', 'claude.ai': 'Claude', 'anthropic': 'Claude',
    'perplexity': 'Perplexity', 'perplexity.ai': 'Perplexity',
    'gemini': 'Gemini', 'bard': 'Gemini', 'google-gemini': 'Gemini',
    'grok': 'Grok', 'xai': 'Grok',
    'copilot': 'Copilot', 'bing-copilot': 'Copilot',
    'deepseek': 'DeepSeek', 'deep-seek': 'DeepSeek',
    'meta-ai': 'Meta AI', 'meta.ai': 'Meta AI'
  }

  function detectAISource(referrer, utmSource) {
    // 1. Check utm_source first (explicit tagging)
    if (utmSource && AI_UTM_SOURCES[utmSource.toLowerCase()]) {
      return AI_UTM_SOURCES[utmSource.toLowerCase()]
    }
    // 2. Check referrer
    if (referrer) {
      try {
        var host = new URL(referrer).hostname.replace('www.', '')
        if (host === 'bing.com') {
          // Bing Chat / Copilot
          if (referrer.includes('/chat')) return 'Copilot'
        }
        if (host === 'x.com' && referrer.includes('/i/grok')) return 'Grok'
        if (AI_HOSTS[host]) return AI_HOSTS[host]
      } catch (_e) {}
    }
    return null
  }

  // ─── Source from Referrer ─────────────────────────────────────────────────────
  function getSourceFromReferrer(referrer) {
    if (!referrer) return null
    try {
      var host = new URL(referrer).hostname.replace('www.', '')
      if (!host || host === window.location.hostname) return null
      return host
    } catch (_e) { return null }
  }

  // ─── First Touch Storage ──────────────────────────────────────────────────────
  // Stored ONCE on first ever visit, never overwritten
  function storeFirstTouchIfNew(params, referrer) {
    if (ls(KEY_FT_SOURCE)) return // already have first touch — never overwrite

    var source = params.utm_source
      || params.ref
      || params.source
      || getSourceFromReferrer(referrer)
      || 'direct'

    var medium = params.utm_medium
      || (params.gclid  ? 'cpc'     : null)
      || (params.fbclid ? 'paid_social' : null)
      || (params.msclkid? 'cpc'     : null)
      || (params.ttclid ? 'paid_social' : null)
      || 'none'

    ls(KEY_FT_SOURCE,   source)
    ls(KEY_FT_MEDIUM,   medium)
    ls(KEY_FT_CAMPAIGN, params.utm_campaign || '')
    ls(KEY_FT_TS,       new Date().toISOString())
  }

  function getFirstTouch() {
    return {
      first_touch_source:   ls(KEY_FT_SOURCE)   || 'direct',
      first_touch_medium:   ls(KEY_FT_MEDIUM)   || 'none',
      first_touch_campaign: ls(KEY_FT_CAMPAIGN) || ''
    }
  }

  // ─── Send ─────────────────────────────────────────────────────────────────────
  function send(endpoint, payload) {
    var body = JSON.stringify(payload)
    var url  = API_BASE + endpoint
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true
        }).catch(function () {})
      }
    } catch (_e) {}
  }

  // ─── Pageview ─────────────────────────────────────────────────────────────────
  function sendPageview() {
    var params   = getParams()
    var referrer = document.referrer || null
    var aiSource = detectAISource(referrer, params.utm_source)

    // Store first touch before sending (so it exists for the conversion call)
    storeFirstTouchIfNew(params, referrer)

    var ft = getFirstTouch()

    send('/api/track', {
      site_key:      SITE_KEY,
      event:         '$pageview',
      anonymous_id:  anonymousId,
      session_id:    sessionId,
      page_url:      window.location.href,
      referrer:      referrer,

      // Current page UTMs
      utm_source:    params.utm_source,
      utm_medium:    params.utm_medium,
      utm_campaign:  params.utm_campaign,
      utm_content:   params.utm_content,
      utm_term:      params.utm_term,
      ref_param:     params.ref,
      source_param:  params.source,
      via_param:     params.via,

      // Click IDs
      gclid:         params.gclid,
      gbraid:        params.gbraid,
      wbraid:        params.wbraid,
      fbclid:        params.fbclid,
      msclkid:       params.msclkid,
      ttclid:        params.ttclid,
      li_fat_id:     params.li_fat_id,
      twclid:        params.twclid,

      // First touch (from localStorage)
      first_touch_source:   ft.first_touch_source,
      first_touch_medium:   ft.first_touch_medium,
      first_touch_campaign: ft.first_touch_campaign,

      // AI source
      ai_source: aiSource
    })
  }

  // ─── SPA Support ─────────────────────────────────────────────────────────────
  var lastUrl = window.location.href
  var _pushState = history.pushState
  history.pushState = function () {
    _pushState.apply(this, arguments)
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      sendPageview()
    }
  }
  window.addEventListener('popstate', function () {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      sendPageview()
    }
  })

  // ─── Public API ───────────────────────────────────────────────────────────────
  window.sourcetrack = {

    // sourcetrack.conversion({ value: 99, type: 'purchase', order_id: '123' })
    conversion: function (opts) {
      opts = opts || {}
      var params   = getParams()
      var referrer = document.referrer || null
      var aiSource = detectAISource(referrer, params.utm_source)
      var ft       = getFirstTouch()

      send('/api/conversion', {
        site_key:         SITE_KEY,
        anonymous_id:     anonymousId,
        session_id:       sessionId,
        page_url:         window.location.href,
        referrer:         referrer,
        conversion_value: opts.value    || opts.conversion_value || 0,
        conversion_type:  opts.type     || opts.conversion_type  || 'conversion',
        order_id:         opts.order_id || opts.orderId          || null,

        // Current page UTMs (last touch signals)
        utm_source:    params.utm_source,
        utm_medium:    params.utm_medium,
        utm_campaign:  params.utm_campaign,
        utm_content:   params.utm_content,
        utm_term:      params.utm_term,

        // Click IDs
        gclid:    params.gclid,
        gbraid:   params.gbraid,
        wbraid:   params.wbraid,
        fbclid:   params.fbclid,
        msclkid:  params.msclkid,
        ttclid:   params.ttclid,
        li_fat_id:params.li_fat_id,
        twclid:   params.twclid,

        // First touch (the important one — stored from very first visit)
        first_touch_source:   ft.first_touch_source,
        first_touch_medium:   ft.first_touch_medium,
        first_touch_campaign: ft.first_touch_campaign,

        // AI source
        ai_source: aiSource
      })
    },

    // sourcetrack.identify({ email: 'user@example.com', name: 'John' })
    identify: function (traits) {
      traits = traits || {}
      send('/api/identify', {
        site_key:     SITE_KEY,
        anonymous_id: anonymousId,
        session_id:   sessionId,
        email:        traits.email || null,
        name:         traits.name  || null,
        traits:       traits
      })
    },

    // sourcetrack.track('button_clicked', { button: 'signup' })
    track: function (eventName, properties) {
      send('/api/track', {
        site_key:     SITE_KEY,
        event:        eventName,
        anonymous_id: anonymousId,
        session_id:   sessionId,
        page_url:     window.location.href,
        properties:   properties || {}
      })
    }
  }

  // ─── Initial pageview ────────────────────────────────────────────────────────
  sendPageview()

})()
