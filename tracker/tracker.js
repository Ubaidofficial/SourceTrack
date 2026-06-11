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
  var EXCL = (sc && sc.getAttribute('data-exclude')) || ''

  function isPathExcluded(path, patternsStr) {
    if (!patternsStr) return false
    var patterns = patternsStr.split(',')
    for (var i = 0; i < patterns.length; i++) {
      var pat = patterns[i].trim()
      if (!pat) continue
      if (pat.charAt(0) !== '/') pat = '/' + pat
      if (pat.indexOf('*') !== -1) {
        var prefix = pat.replace(/\*/g, '')
        if (path.indexOf(prefix) === 0 || path === prefix.replace(/\/$/, '')) return true
      } else if (path === pat) {
        return true
      }
    }
    return false
  }

  function isExcluded() {
    var pathname = location.pathname
    if (pathname.charAt(0) !== '/') pathname = '/' + pathname
    return isPathExcluded(pathname, EXCL)
  }


  // ─── Storage helpers ───────────────────────────────────────────────────────
  function ls(k, v) {
    try { return v !== undefined ? (localStorage.setItem(k, v), v) : localStorage.getItem(k) } catch (_) { return null }
  }
  function ss(k, v) {
    try { return v !== undefined ? (sessionStorage.setItem(k, v), v) : sessionStorage.getItem(k) } catch (_) { return null }
  }
  function getCookie(name) {
    try {
      var matches = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'))
      return matches ? decodeURIComponent(matches[1]) : null
    } catch (_) { return null }
  }
  function setCookie(name, value, domain) {
    try {
      var cookie = name + '=' + encodeURIComponent(value) + '; path=/; SameSite=Lax; max-age=31536000'
      if (domain) {
        cookie += '; domain=' + domain
      }
      if (location.protocol === 'https:') {
        cookie += '; Secure'
      }
      document.cookie = cookie
    } catch (_) {}
  }
  function base64urlEncode(str) {
    try {
      var base64 = btoa(unescape(encodeURIComponent(str)))
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    } catch (_) { return '' }
  }
  function base64urlDecode(str) {
    try {
      var base64 = str.replace(/-/g, '+').replace(/_/g, '/')
      while (base64.length % 4) { base64 += '=' }
      return decodeURIComponent(escape(atob(base64)))
    } catch (_) { return null }
  }

  // ─── Identity ──────────────────────────────────────────────────────────────
  function uid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0
      return (c === 'x' ? r : r & 3 | 8).toString(16)
    })
  }

  var cookieDomain = sc && sc.getAttribute('data-cookie-domain')
  var validCookieDomain = null
  if (cookieDomain) {
    cookieDomain = cookieDomain.trim().toLowerCase()
    if (cookieDomain.indexOf('.') === 0 && cookieDomain.length <= 100 && /^\.[a-z0-9.-]+$/.test(cookieDomain)) {
      var unsafe = [
        '.com', '.net', '.org', '.co', '.io', '.ai', '.app', '.dev',
        '.co.uk', '.com.au', '.org.uk', '.localhost', '.edu', '.gov'
      ]
      if (unsafe.indexOf(cookieDomain) === -1 && cookieDomain.slice(1).split('.').filter(Boolean).length >= 2) {
        var host = location.hostname.toLowerCase()
        var sDomain = cookieDomain.slice(1)
        if (host === sDomain || host.slice(-sDomain.length - 1) === '.' + sDomain) {
          validCookieDomain = cookieDomain
        }
      }
    }
  }

  var AID = ls('st_aid')
  if (!AID && validCookieDomain) {
    AID = getCookie('st_aid')
  }
  var isNewIdentity = !AID

  var urlParams = null
  var urlAid = null
  var urlFt = null
  try {
    urlParams = new URLSearchParams(location.search)
    urlAid = urlParams.get('__st_id')
    urlFt = urlParams.get('__st_ft')
  } catch (_) {}

  if (isNewIdentity && urlAid && urlAid.length >= 1 && urlAid.length <= 50 && /^[a-zA-Z0-9_-]{1,50}$/.test(urlAid)) {
    AID = urlAid
    isNewIdentity = false
  }

  if (!AID) {
    AID = uid()
  }

  ls('st_aid', AID)

  if (validCookieDomain) {
    setCookie('st_aid', AID, validCookieDomain)
  }

  if (!ls('st_ft_src') && urlFt && urlFt.length <= 300) {
    var decodedFt = base64urlDecode(urlFt)
    if (decodedFt && decodedFt.length <= 500) {
      try {
        var parsedFt = JSON.parse(decodedFt)
        if (parsedFt && typeof parsedFt === 'object') {
          var cleanSrc = typeof parsedFt.s === 'string' ? parsedFt.s.trim().slice(0, 100).replace(/[\x00-\x1F\x7F]/g, '') : ''
          var cleanMed = typeof parsedFt.m === 'string' ? parsedFt.m.trim().slice(0, 100).replace(/[\x00-\x1F\x7F]/g, '') : ''
          var cleanCmp = typeof parsedFt.c === 'string' ? parsedFt.c.trim().slice(0, 100).replace(/[\x00-\x1F\x7F]/g, '') : ''

          if (cleanSrc) {
            ls('st_ft_src', cleanSrc)
            ls('st_ft_med', cleanMed || 'none')
            ls('st_ft_cmp', cleanCmp || '')
            ls('st_ft_ts', new Date().toISOString())
          }
        }
      } catch (_) {}
    }
  }

  if (urlParams && (urlParams.has('__st_id') || urlParams.has('__st_ft'))) {
    try {
      urlParams.delete('__st_id')
      urlParams.delete('__st_ft')
      var newSearch = urlParams.toString()
      var newUrl = location.pathname + (newSearch ? '?' + newSearch : '') + location.hash
      history.replaceState(null, '', newUrl)
    } catch (_) {}
  }

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
  var _pk = 'utm_source,utm_medium,utm_campaign,utm_content,utm_term,ref,source,via,gclid,gbraid,wbraid,fbclid,msclkid,ttclid,li_fat_id,twclid,utm_id,st_campaign_id,st_adgroup_id,st_ad_id,st_target_id,st_network,st_device,st_matchtype'.split(',')
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
    // first_touch_timestamp is written by storeFirstTouch() in localStorage as `st_ft_ts`.
    // We forward it so the backend can preserve the original first-touch moment
    // even when prior pageview events have rolled out of the attribution window.
    return {
      first_touch_source:    ls('st_ft_src') || 'direct',
      first_touch_medium:    ls('st_ft_med') || 'none',
      first_touch_campaign:  ls('st_ft_cmp') || '',
      first_touch_timestamp: ls('st_ft_ts')  || null
    }
  }

  // ─── Shared UTM + click-id field builder ───────────────────────────────────
  // Used in both pageview and conversion payloads — defined once, no duplication
  function utmFields(p) {
    return {
      utm_source: p.utm_source, utm_medium: p.utm_medium, utm_campaign: p.utm_campaign,
      utm_content: p.utm_content, utm_term: p.utm_term,
      gclid: p.gclid, gbraid: p.gbraid, wbraid: p.wbraid,
      fbclid: p.fbclid, msclkid: p.msclkid, ttclid: p.ttclid,
      li_fat_id: p.li_fat_id, twclid: p.twclid,
      utm_id: p.utm_id, st_campaign_id: p.st_campaign_id, st_adgroup_id: p.st_adgroup_id,
      st_ad_id: p.st_ad_id, st_target_id: p.st_target_id, st_network: p.st_network,
      st_device: p.st_device, st_matchtype: p.st_matchtype
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
  // SPA frameworks (Next.js, Remix, SvelteKit, React Router) can fire several
  // pushState calls in quick succession during animated transitions and
  // programmatic redirects. We debounce auto-pageviews to ~100ms so only the
  // final URL of a burst gets tracked. Manual sourcetrack.track()/.conversion()
  // calls go through send() directly and are unaffected.
  var _lastUrl = location.href, _ps = history.pushState
  var _pvTimer = null
  function _schedulePv() {
    if (location.href === _lastUrl) return
    _lastUrl = location.href
    if (_pvTimer) clearTimeout(_pvTimer)
    _pvTimer = setTimeout(function () { _pvTimer = null; sendPageview() }, 100)
  }
  history.pushState = function () {
    _ps.apply(this, arguments)
    _schedulePv()
  }
  addEventListener('popstate', _schedulePv)

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
    if (isExcluded()) return  // Suppress sending on excluded paths!
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

  function sanitizeFtValue(val) {
    if (typeof val !== 'string') return ''
    var clean = val.replace(/[\x00-\x1F\x7F]/g, '').trim()
    return clean.slice(0, 100)
  }

  // ─── Public API ────────────────────────────────────────────────────────────
  window.sourcetrack = {
    decorateUrl: function (url) {
      if (!url) return url
      try {
        var u = new URL(url, location.href)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return url

        if (!u.searchParams.has('__st_id')) {
          u.searchParams.set('__st_id', AID)
        }

        var ftSrc = sanitizeFtValue(ls('st_ft_src'))
        if (ftSrc && !u.searchParams.has('__st_ft')) {
          var payload = {
            s: ftSrc,
            m: sanitizeFtValue(ls('st_ft_med')) || 'none',
            c: sanitizeFtValue(ls('st_ft_cmp')) || ''
          }
          var encoded = base64urlEncode(JSON.stringify(payload))
          if (encoded && encoded.length <= 300) {
            u.searchParams.set('__st_ft', encoded)
          }
        }
        return u.toString()
      } catch (_) {
        return url
      }
    },

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

  // ─── Auto-decoration ───────────────────────────────────────────────────────
  function handleCrossDomainClick(e) {
    if (e.button === 2) return // Skip right clicks

    var a = e.target
    while (a && a.nodeName !== 'A') a = a.parentNode
    if (!a) return

    var href = a.getAttribute('href')
    if (!href) return

    if (a.hasAttribute('download')) return
    var extRegex = /\.(zip|tar|gz|pdf|docx|xlsx|pptx|dmg|exe|pkg|bin|csv|mp3|mp4|wav|avi)$/i
    if (extRegex.test(href.split('?')[0].split('#')[0])) return

    try {
      var url = new URL(href, location.href)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      if (url.hostname === location.hostname) return

      var crossDomainsStr = sc && sc.getAttribute('data-cross-domains')
      if (!crossDomainsStr) return
      var list = crossDomainsStr.split(',').map(function (d) { return d.trim().toLowerCase() }).filter(Boolean)

      var targetHost = url.hostname.toLowerCase().split(':')[0]
      var matched = false
      for (var i = 0; i < list.length; i++) {
        var item = list[i]
        if (targetHost === item || targetHost.slice(-item.length - 1) === '.' + item) {
          matched = true
          break
        }
      }
      if (!matched) return

      if (url.searchParams.has('__st_id')) return

      var decorated = window.sourcetrack.decorateUrl(href)
      a.setAttribute('href', decorated)
    } catch (_) {}
  }
  addEventListener('mousedown', handleCrossDomainClick)
  addEventListener('touchstart', handleCrossDomainClick)

  sendPageview()
})()
