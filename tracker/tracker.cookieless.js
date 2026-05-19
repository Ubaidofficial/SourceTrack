;(function () {
  'use strict'

  // ─── Config ──────────────────────────────────────────────────────────────────
  var script = document.currentScript || document.querySelector('script[data-site-key]')
  var SITE_KEY = (script && script.getAttribute('data-site-key')) || ''
  var API_BASE = (script && script.src)
    ? new URL(script.src).origin
    : window.location.origin

  // No localStorage, no sessionStorage, no cookies.
  // Identity is derived server-side from IP + UA with a daily rotating salt.
  // The visitor_id rotates every 24 h. The session_id rotates every 1 h.

  var anonymousId = null  // filled async from /api/tracker/id
  var sessionId   = null
  var _queue      = []    // events buffered until IDs arrive

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
    if (utmSource && AI_UTM_SOURCES[utmSource.toLowerCase()]) {
      return AI_UTM_SOURCES[utmSource.toLowerCase()]
    }
    if (referrer) {
      try {
        var host = new URL(referrer).hostname.replace('www.', '')
        if (host === 'bing.com' && referrer.includes('/chat')) return 'Copilot'
        if (host === 'x.com' && referrer.includes('/i/grok')) return 'Grok'
        if (AI_HOSTS[host]) return AI_HOSTS[host]
      } catch (_e) {}
    }
    return null
  }

  function getSourceFromReferrer(referrer) {
    if (!referrer) return null
    try {
      var host = new URL(referrer).hostname.replace('www.', '')
      if (!host || host === window.location.hostname) return null
      return host
    } catch (_e) { return null }
  }

  // ─── First-touch derivation (in-memory only, no storage) ─────────────────────
  // We compute first-touch from the *current page* URL params + referrer.
  // Since there is no persistent storage, every new "session" restarts first-touch.
  // This is the cookieless trade-off: first-touch accuracy requires a conversion
  // on the same session. Multi-session first-touch requires the standard tracker.
  function deriveFirstTouch(params, referrer) {
    var source = params.utm_source
      || params.ref
      || params.source
      || getSourceFromReferrer(referrer)
      || 'direct'

    var medium = params.utm_medium
      || (params.gclid   ? 'cpc'         : null)
      || (params.fbclid  ? 'paid_social'  : null)
      || (params.msclkid ? 'cpc'          : null)
      || (params.ttclid  ? 'paid_social'  : null)
      || 'none'

    return {
      first_touch_source:   source,
      first_touch_medium:   medium,
      first_touch_campaign: params.utm_campaign || ''
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

  // ─── Flush queued events once IDs arrive ────────────────────────────────────
  function flush() {
    var q = _queue.slice()
    _queue = []
    for (var i = 0; i < q.length; i++) {
      send(q[i].endpoint, Object.assign({}, q[i].payload, {
        anonymous_id: anonymousId,
        session_id:   sessionId
      }))
    }
  }

  // ─── Fetch server-side ID ─────────────────────────────────────────────────────
  function fetchId(cb) {
    fetch(API_BASE + '/api/tracker/id?site_key=' + encodeURIComponent(SITE_KEY), {
      method: 'GET',
      credentials: 'omit'
    })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (json) {
        if (json && json.visitor_id) {
          anonymousId = json.visitor_id
          sessionId   = json.session_id || json.visitor_id
        } else {
          // Fallback: use a random ID if server call fails
          anonymousId = 'cl-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
          sessionId   = anonymousId
        }
        if (cb) cb()
        flush()
      })
      .catch(function () {
        anonymousId = 'cl-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
        sessionId   = anonymousId
        if (cb) cb()
        flush()
      })
  }

  // ─── Pageview ─────────────────────────────────────────────────────────────────
  function buildPageviewPayload() {
    var params   = getParams()
    var referrer = document.referrer || null
    var aiSource = detectAISource(referrer, params.utm_source)
    var ft       = deriveFirstTouch(params, referrer)

    return {
      site_key:      SITE_KEY,
      event:         '$pageview',
      anonymous_id:  anonymousId,   // may be null — flush() fills it later
      session_id:    sessionId,
      page_url:      window.location.href,
      referrer:      referrer,
      cookieless:    true,

      utm_source:    params.utm_source,
      utm_medium:    params.utm_medium,
      utm_campaign:  params.utm_campaign,
      utm_content:   params.utm_content,
      utm_term:      params.utm_term,
      ref_param:     params.ref,
      source_param:  params.source,
      via_param:     params.via,

      gclid:         params.gclid,
      gbraid:        params.gbraid,
      wbraid:        params.wbraid,
      fbclid:        params.fbclid,
      msclkid:       params.msclkid,
      ttclid:        params.ttclid,
      li_fat_id:     params.li_fat_id,
      twclid:        params.twclid,

      first_touch_source:   ft.first_touch_source,
      first_touch_medium:   ft.first_touch_medium,
      first_touch_campaign: ft.first_touch_campaign,

      ai_source: aiSource
    }
  }

  function sendPageview() {
    var payload = buildPageviewPayload()
    if (anonymousId) {
      send('/api/track', payload)
    } else {
      _queue.push({ endpoint: '/api/track', payload: payload })
    }
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

    conversion: function (opts) {
      opts = opts || {}
      var params   = getParams()
      var referrer = document.referrer || null
      var aiSource = detectAISource(referrer, params.utm_source)
      var ft       = deriveFirstTouch(params, referrer)

      var payload = {
        site_key:         SITE_KEY,
        anonymous_id:     anonymousId,
        session_id:       sessionId,
        page_url:         window.location.href,
        referrer:         referrer,
        cookieless:       true,
        conversion_value: opts.value    || opts.conversion_value || 0,
        conversion_type:  opts.type     || opts.conversion_type  || 'conversion',
        order_id:         opts.order_id || opts.orderId          || null,

        utm_source:    params.utm_source,
        utm_medium:    params.utm_medium,
        utm_campaign:  params.utm_campaign,
        utm_content:   params.utm_content,
        utm_term:      params.utm_term,

        gclid:    params.gclid,
        gbraid:   params.gbraid,
        wbraid:   params.wbraid,
        fbclid:   params.fbclid,
        msclkid:  params.msclkid,
        ttclid:   params.ttclid,
        li_fat_id:params.li_fat_id,
        twclid:   params.twclid,

        first_touch_source:   ft.first_touch_source,
        first_touch_medium:   ft.first_touch_medium,
        first_touch_campaign: ft.first_touch_campaign,

        ai_source: aiSource
      }

      if (anonymousId) {
        send('/api/conversion', payload)
      } else {
        _queue.push({ endpoint: '/api/conversion', payload: payload })
      }
    },

    identify: function (traits) {
      traits = traits || {}
      var payload = {
        site_key:     SITE_KEY,
        anonymous_id: anonymousId,
        session_id:   sessionId,
        email:        traits.email || null,
        name:         traits.name  || null,
        traits:       traits
      }
      if (anonymousId) {
        send('/api/identify', payload)
      } else {
        _queue.push({ endpoint: '/api/identify', payload: payload })
      }
    },

    track: function (eventName, properties) {
      var payload = {
        site_key:     SITE_KEY,
        event:        eventName,
        anonymous_id: anonymousId,
        session_id:   sessionId,
        page_url:     window.location.href,
        properties:   properties || {}
      }
      if (anonymousId) {
        send('/api/track', payload)
      } else {
        _queue.push({ endpoint: '/api/track', payload: payload })
      }
    }
  }

  // ─── Boot: fetch ID, then send initial pageview ──────────────────────────────
  sendPageview() // queued immediately (anonymousId is null)
  fetchId()      // async — flushes queue when done

})()
