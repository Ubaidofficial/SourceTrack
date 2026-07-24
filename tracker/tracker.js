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
  // Phase 1 auto-fill: opt-in. Default OFF — when absent/!=='true', no new behavior.
  var AUTO_FIELDS = !!(sc && sc.getAttribute('data-auto-fields') === 'true')

  // Single source of truth for the attribution fields safe to hand off into a
  // customer's form / URL / POST body. NO raw referrer, NO IP — referrer is
  // exposed only as referrer_host, the URL only as landing_page_path.
  var HANDOFF_SAFE_KEYS = [
    'anonymous_id', 'session_id',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'referrer_host', 'landing_page_path',
    'first_touch_source', 'first_touch_medium', 'first_touch_campaign',
    'last_touch_source', 'last_touch_medium', 'last_touch_campaign'
  ]

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

  // ── Identity persistence + erasure ─────────────────────────────────────────
  // persistAid() is the ONE place that writes st_aid (incl. the data-cookie-domain branch).
  // init and consent(true) both go through mintIdentity()/persistAid(), so the mint logic is
  // never duplicated (the AI_HOST_MAP-vs-AI_DOMAINS_MAP drift lesson).
  var PRESERVE_ON_WITHDRAWAL = ['st_consent']  // the withdrawal record itself must survive
  function persistAid() {
    ls('st_aid', AID)
    if (validCookieDomain) setCookie('st_aid', AID, validCookieDomain)
  }
  function mintIdentity() {
    AID = uid(); persistAid()
    SID = uid(); ss('st_sid', SID)
  }
  // consent(false) erasure. Best-effort-COMPLETE: per-key try/catch so one throw (Safari private
  // mode) can't abort the sweep and strand identifiers. PREFIX sweep, not a const key-list, so a
  // future st_* key is erased by default — fail toward erasure. Preserve-list is the ONLY exception.
  function clearStoredIdentity() {
    ;[localStorage, sessionStorage].forEach(function (store) {
      try {
        var keys = []
        for (var i = 0; i < store.length; i++) { var sk = store.key(i); if (sk) keys.push(sk) }
        for (var j = 0; j < keys.length; j++) {
          if (keys[j].indexOf('st_') === 0 && PRESERVE_ON_WITHDRAWAL.indexOf(keys[j]) === -1) {
            try { store.removeItem(keys[j]) } catch (_) {}
          }
        }
      } catch (_) {}
    })
    try {
      document.cookie.split(';').forEach(function (c) {
        var name = c.split('=')[0].trim()
        if (name.indexOf('st_') === 0 && PRESERVE_ON_WITHDRAWAL.indexOf(name) === -1) {
          // st_aid was set with domain=<validCookieDomain>; path=/, OR host-only when unset —
          // expire BOTH variants (a domain cookie from an earlier visit persists otherwise).
          try { document.cookie = name + '=; path=/; max-age=0' } catch (_) {}
          if (validCookieDomain) {
            try { document.cookie = name + '=; path=/; domain=' + validCookieDomain + '; max-age=0' } catch (_) {}
          }
        }
      })
    } catch (_) {}
    // In-memory identity: every send path + getToken() reads these vars, not storage. Nulling them
    // stops the erased id from resurrecting into outbound events after a same-page optIn().
    AID = null
    SID = null
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

  persistAid()

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
  var _pk = 'utm_source,utm_medium,utm_campaign,utm_content,utm_term,ref,source,via,gclid,gbraid,wbraid,fbclid,msclkid,ttclid,li_fat_id,li_fatid,twclid,dclid,snapclid,pclid,sccid,ko_click_id,utm_id,st_campaign_id,st_adgroup_id,st_ad_id,st_target_id,st_network,st_device,st_matchtype,st_verify'.split(',')
  function params() {
    var p = new URLSearchParams(location.search), r = {}
    _pk.forEach(function (k) { r[k] = p.get(k) })

    // Normalise LinkedIn click IDs client-side
    var rawLiFatId = r.li_fat_id || ''
    var rawLiFatid = r.li_fatid || ''
    r.li_fat_id = (rawLiFatId.trim ? rawLiFatId.trim() : rawLiFatId) || (rawLiFatid.trim ? rawLiFatid.trim() : rawLiFatid) || null

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
      || (p.fbclid || p.ttclid || p.li_fat_id || p.twclid || p.snapclid || p.pclid || p.sccid ? 'paid_social' : null)
      || (p.dclid ? 'display' : null)
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
      li_fat_id: p.li_fat_id, li_fatid: p.li_fatid, twclid: p.twclid,
      dclid: p.dclid, snapclid: p.snapclid, pclid: p.pclid,
      sccid: p.sccid, ko_click_id: p.ko_click_id,
      utm_id: p.utm_id, st_campaign_id: p.st_campaign_id, st_adgroup_id: p.st_adgroup_id,
      st_ad_id: p.st_ad_id, st_target_id: p.st_target_id, st_network: p.st_network,
      st_device: p.st_device, st_matchtype: p.st_matchtype, st_verify: p.st_verify
    }
  }

  // ─── Send ──────────────────────────────────────────────────────────────────
  // Prefer fetch keepalive over sendBeacon: it survives page unload AND is
  // xhr-typed, so it is NOT caught by the adblock "$ping,third-party" rule that
  // silently drops sendBeacon's ping request (uBlock/ABP/Brave). sendBeacon is
  // only the fallback where keepalive is unsupported, so unload sends still
  // survive there. Feature-detected once — never trust a UA/version string.
  var supportsKeepalive = (function () {
    try { return 'keepalive' in new Request('') } catch (_) { return false }
  })()
  function send(ep, data) {
    var b = JSON.stringify(data), u = B + ep
    try {
      if (supportsKeepalive) {
        fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: b, keepalive: true }).catch(function () {})
      } else if (navigator.sendBeacon) {
        navigator.sendBeacon(u, new Blob([b], { type: 'application/json' }))
      }
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

  // ─── Engaged-time beacon ─────────────────────────────────────────────────────
  // Fires ONE custom $heartbeat when the page is left, giving a single-page
  // session a later same-session event so the server-derived session endTs (and
  // therefore duration) reflects real engaged time instead of 0s. Deliberately
  // NOT $pageview — that would consume pageview quota and inflate pageview_count.
  // One per page load: _hbSent dedups the visibilitychange(hidden)+pagehide
  // double-fire. Goes through the consent/exclusion-gated send + sendBeacon.
  var _hbSent = false
  function sendHeartbeat() {
    if (_hbSent || !SID) return
    _hbSent = true
    send('/api/track', { site_key: K, event: '$heartbeat', anonymous_id: AID, session_id: SID, page_url: location.href })
  }
  addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') sendHeartbeat()
  })
  addEventListener('pagehide', sendHeartbeat)

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
          event_id:         opts.event_id || null,            // shared browser↔server dedup id
          fbp:              getCookie('_fbp') || null,         // merchant's own Meta cookies
          fbc:              getCookie('_fbc') || null,         // (read-only; forwarded to Meta CAPI)
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

    // sourcetrack.getToken() — returns the resolved anonymous_id for server-side
    // attribution stitching (pass it to your backend alongside a form/order).
    getToken: function () { return AID },

    // ── Consent API ───────────────────────────────────────────────────────────
    // sourcetrack.consent(true)  — grant consent, flush queued events
    // sourcetrack.consent(false) — deny consent, clear queue, stop tracking
    consent: function (granted) {
      _consentGiven = !!granted
      try { localStorage.setItem(CONSENT_KEY, String(_consentGiven)) } catch (_) {}
      if (_consentGiven) {
        // Re-consent after withdrawal: AID/SID were nulled by the erasure, so mint a FRESH
        // identity — never resurrect the erased one. Same mint path as init.
        if (AID === null) mintIdentity()
        _flushQueue()
      } else {
        _queue.length = 0        // clear queued events — do not send
        clearStoredIdentity()    // GDPR withdrawal: delete stored identifiers + null in-memory AID/SID
      }
    },

    // sourcetrack.optOut() — stop all tracking immediately (persisted)
    optOut: function () { window.sourcetrack.consent(false) },

    // sourcetrack.optIn()  — resume tracking (persisted)
    optIn:  function () { window.sourcetrack.consent(true) },

    // sourcetrack.hasConsent() — returns true/false/null
    hasConsent: function () { return _consentGiven },

    // sourcetrack.getContext() — returns non-PII attribution context
    getContext: function () {
      var p = params(), ref = document.referrer || null
      var currentSrc = p.utm_source || p.ref || p.source
        || (ref && (function () {
          try { var h = new URL(ref).hostname.replace('www.', ''); return h && h !== location.hostname ? h : null } catch (_) {}
        })())
        || 'direct'
      var currentMed = p.utm_medium
        || (p.gclid || p.gbraid || p.wbraid || p.msclkid ? 'cpc' : null)
        || (p.fbclid || p.ttclid || p.li_fat_id || p.twclid || p.snapclid || p.pclid || p.sccid ? 'paid_social' : null)
        || (p.dclid ? 'display' : null)
        || 'none'
      var currentCmp = p.utm_campaign || ''

      return {
        anonymous_id: AID || null,
        session_id: SID || null,
        first_touch_source: ls('st_ft_src') || 'direct',
        first_touch_medium: ls('st_ft_med') || 'none',
        first_touch_campaign: ls('st_ft_cmp') || '',
        current_source: currentSrc,
        current_medium: currentMed,
        current_campaign: currentCmp,
        last_touch_source: currentSrc,
        last_touch_medium: currentMed,
        last_touch_campaign: currentCmp,
        utm_source: p.utm_source || null,
        utm_medium: p.utm_medium || null,
        utm_campaign: p.utm_campaign || null,
        utm_term: p.utm_term || null,
        utm_content: p.utm_content || null,
        referrer: ref || null,
        referrer_host: (function () { try { return ref ? new URL(ref).hostname || null : null } catch (_) { return null } })(),
        landing_page_path: location.pathname || null,
        click_ids: {
          gclid: p.gclid || null,
          gbraid: p.gbraid || null,
          wbraid: p.wbraid || null,
          fbclid: p.fbclid || null,
          msclkid: p.msclkid || null,
          ttclid: p.ttclid || null,
          li_fat_id: p.li_fat_id || null,
          li_fatid: p.li_fatid || null,
          twclid: p.twclid || null,
          dclid: p.dclid || null,
          snapclid: p.snapclid || null,
          pclid: p.pclid || null,
          sccid: p.sccid || null,
          ko_click_id: p.ko_click_id || null
        }
      }
    },

    // sourcetrack.getHandoffParams({ prefix: 'st_' }) — flat key/value object of safe
    // attribution context. Suitable for hidden fields, URL params, or POST bodies.
    // Omits null/undefined values. No raw full URL or query string.
    // Raw referrer is excluded by default — use includeReferrer: true only when you
    // intentionally want to forward the full referrer URL to a third-party tool.
    getHandoffParams: function (opts) {
      opts = opts || {}
      var prefix = typeof opts.prefix === 'string' ? opts.prefix : 'st_'
      var ctx = window.sourcetrack.getContext()
      var out = {}
      var safe = HANDOFF_SAFE_KEYS
      for (var i = 0; i < safe.length; i++) {
        var k = safe[i]
        if (ctx[k] !== null && ctx[k] !== undefined) {
          out[prefix + k] = String(ctx[k])
        }
      }
      if (opts.includeReferrer && ctx.referrer !== null && ctx.referrer !== undefined) {
        out[prefix + 'referrer'] = String(ctx.referrer)
      }
      var cids = ctx.click_ids || {}
      var cidKeys = Object.keys(cids)
      for (var j = 0; j < cidKeys.length; j++) {
        var ck = cidKeys[j]
        if (cids[ck] !== null && cids[ck] !== undefined) {
          out[prefix + ck] = String(cids[ck])
        }
      }
      return out
    },

    // sourcetrack.fillHiddenFields({ selector, fields, createMissing }) — fills
    // pre-existing input[type=hidden] elements with attribution context values.
    // Explicit call required — no automatic injection. Never reads visible inputs.
    fillHiddenFields: function (opts) {
      opts = opts || {}
      var selector     = typeof opts.selector === 'string' ? opts.selector : 'form'
      var fieldMap     = opts.fields && typeof opts.fields === 'object' ? opts.fields : {}
      var createMissing = !!opts.createMissing
      // skipNonEmpty (used by Phase 1 auto-fill): never overwrite a field that
      // already has a value or that we previously filled (data-st-injected).
      var skipNonEmpty = !!opts.skipNonEmpty
      var ctx = window.sourcetrack.getContext()

      function resolve(key) {
        if (Object.prototype.hasOwnProperty.call(ctx, key)) return ctx[key]
        if (ctx.click_ids && Object.prototype.hasOwnProperty.call(ctx.click_ids, key)) return ctx.click_ids[key]
        return null
      }

      try {
        var forms = document.querySelectorAll(selector)
        for (var fi = 0; fi < forms.length; fi++) {
          var form = forms[fi]
          var keys = Object.keys(fieldMap)
          for (var ki = 0; ki < keys.length; ki++) {
            var inputName = keys[ki]
            var ctxKey    = fieldMap[inputName]
            var val       = resolve(ctxKey)
            if (val === null || val === undefined) continue
            var input = form.querySelector('input[type=hidden][name="' + inputName + '"]')
            if (!input && createMissing) {
              input = document.createElement('input')
              input.type = 'hidden'
              input.name = inputName
              form.appendChild(input)
            }
            if (input) {
              if (skipNonEmpty) {
                if (input.value) continue                                  // never overwrite a non-empty field
                if (input.getAttribute && input.getAttribute('data-st-injected')) continue  // idempotent
              }
              input.value = String(val)
              if (skipNonEmpty && input.setAttribute) {
                try { input.setAttribute('data-st-injected', '1') } catch (_) {}
              }
            }
          }
        }
      } catch (_) {}
    }
  }

  // ─── Phase 1 Auto-Fill (opt-in: data-auto-fields="true") ────────────────────
  // Populates ONLY pre-existing hidden inputs whose name matches the safe handoff
  // set (createMissing:false — never creates nodes, never overwrites non-empty).
  // Runs at discovery time only; never in the submit path, never preventDefault.
  // Privacy: DNT/GPC already hard-aborts this whole IIFE at the top; we re-check
  // here for defence-in-depth and also honor the consent gate (_consentGiven).
  function autoFillAllowed() {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true) return false
    if (_consentGiven === false) return false
    if (CONSENT_REQUIRED && _consentGiven !== true) return false
    return true
  }

  function runAutoFill() {
    try {
      if (!AUTO_FIELDS || !autoFillAllowed()) return
      var fields = {}
      for (var i = 0; i < HANDOFF_SAFE_KEYS.length; i++) {
        fields['st_' + HANDOFF_SAFE_KEYS[i]] = HANDOFF_SAFE_KEYS[i]
      }
      var cids = (window.sourcetrack.getContext().click_ids) || {}
      for (var ck in cids) {
        if (Object.prototype.hasOwnProperty.call(cids, ck)) fields['st_' + ck] = ck
      }
      window.sourcetrack.fillHiddenFields({ selector: 'form', fields: fields, createMissing: false, skipNonEmpty: true })
    } catch (_) {}
  }

  function initAutoFill() {
    try {
      if (!AUTO_FIELDS) return
      runAutoFill()  // fill forms present now

      // Bounded observer for late/SPA forms — hard auto-disconnect after the cap.
      if (typeof MutationObserver === 'undefined' || !document.body) return
      var obs = new MutationObserver(function (muts) {
        for (var m = 0; m < muts.length; m++) {
          var added = muts[m].addedNodes || []
          for (var n = 0; n < added.length; n++) {
            var node = added[n]
            if (node && (node.nodeName === 'FORM' || (node.querySelector && node.querySelector('form')))) {
              runAutoFill()  // idempotent (skipNonEmpty + data-st-injected)
              return
            }
          }
        }
      })
      obs.observe(document.body, { childList: true, subtree: true })
      setTimeout(function () { try { obs.disconnect() } catch (_) {} }, 10000)  // hard cap: 10s
    } catch (_) {}
  }

  if (AUTO_FIELDS) {
    try {
      if (document.readyState === 'loading') {
        addEventListener('DOMContentLoaded', initAutoFill)
      } else {
        initAutoFill()
      }
    } catch (_) {}
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

  // ─── Booking UTM Passthrough ────────────────────────────────────────────────
  // Appends safe attribution params to supported booking provider URLs before
  // navigation. Never captures input values, never reads form fields.
  // sourcetrack_landing_page and sourcetrack_referrer are deferred: the tracker
  // does not yet have a safe, deduplicated path sanitizer suitable for URL-valued
  // passthrough params; adding them here without that gate risks forwarding raw
  // page URLs (with query strings) into booking provider sessions.
  var BOOKING_HOSTS = [
    'calendly.com',
    'cal.com',
    'tidycal.com',
    'savvycal.com',
    'zcal.co',
    'oncehub.com',
    'youcanbook.me'
  ]

  function isBookingHost(hostname) {
    var h = hostname.toLowerCase().split(':')[0]
    for (var i = 0; i < BOOKING_HOSTS.length; i++) {
      var bh = BOOKING_HOSTS[i]
      if (h === bh || h.slice(-(bh.length + 1)) === '.' + bh) return true
    }
    return false
  }

  // Light sanitizer for ref/source/via values — only pass short safe strings
  function sanitizeBookingParam(val) {
    if (typeof val !== 'string') return null
    var cleaned = val.trim()
    if (cleaned.length === 0 || cleaned.length > 80) return null
    var lower = cleaned.toLowerCase()
    // Reject emails
    if (lower.indexOf('@') !== -1) return null
    // Reject phone-like strings (6+ digits)
    if ((lower.match(/\d/g) || []).length >= 6) return null
    // Reject URL-like strings
    if (lower.indexOf('http://') !== -1 || lower.indexOf('https://') !== -1 || lower.indexOf('//') === 0) return null
    // Reject token/secret-like prefixes
    if (
      lower.indexOf('sk_') === 0 || lower.indexOf('pk_') === 0 ||
      lower.indexOf('rk_') === 0 || lower.indexOf('key_') === 0 ||
      lower.indexOf('api_') === 0 || lower.indexOf('token') === 0 ||
      lower.indexOf('secret') === 0
    ) return null
    // Reject JWT-like values (two dots with base64 sections)
    if (/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(cleaned)) return null
    return cleaned
  }

  function handleBookingPassthrough(e) {
    if (e.button === 2) return // skip right clicks
    if (_consentGiven === false) return // opt-out

    var a = e.target
    while (a && a.nodeName !== 'A') a = a.parentNode
    if (!a) return

    var href = a.getAttribute('href')
    if (!href) return

    try {
      var url = new URL(href, location.href)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      if (!isBookingHost(url.hostname)) return

      var p = params()

      // Mapping of passthrough params: key in booking URL → value from current context
      // Only appended if not already present in the booking URL
      var candidates = [
        ['utm_source',   p.utm_source],
        ['utm_medium',   p.utm_medium],
        ['utm_campaign', p.utm_campaign],
        ['utm_term',     p.utm_term],
        ['utm_content',  p.utm_content],
        ['gclid',        p.gclid],
        ['gbraid',       p.gbraid],
        ['wbraid',       p.wbraid],
        ['fbclid',       p.fbclid],
        ['msclkid',      p.msclkid],
        ['ttclid',       p.ttclid],
        ['li_fat_id',    p.li_fat_id],
        ['twclid',       p.twclid],
        ['ref',          sanitizeBookingParam(p.ref)],
        ['source',       sanitizeBookingParam(p.source)],
        ['via',          sanitizeBookingParam(p.via)],
        ['sourcetrack_source',   p.utm_source],
        ['sourcetrack_medium',   p.utm_medium],
        ['sourcetrack_campaign', p.utm_campaign]
      ]

      var mutated = false
      for (var i = 0; i < candidates.length; i++) {
        var key = candidates[i][0]
        var val = candidates[i][1]
        if (val && typeof val === 'string' && val.trim() && !url.searchParams.has(key)) {
          url.searchParams.set(key, val.trim())
          mutated = true
        }
      }

      if (mutated) {
        a.setAttribute('href', url.toString())
      }
    } catch (_) {}
  }
  addEventListener('mousedown', handleBookingPassthrough)
  addEventListener('touchstart', handleBookingPassthrough)

  // ─── Automatic Form Submit Tracking ────────────────────────────────────────
  var lastSubmits = typeof WeakMap !== 'undefined' ? new WeakMap() : null

  function sanitizeFormMetadata(val) {
    if (typeof val !== 'string') return null
    var cleaned = val.trim()
    if (cleaned.length === 0) return null
    if (cleaned.length > 120) cleaned = cleaned.slice(0, 120)

    var lower = cleaned.toLowerCase()

    // 1. Email check
    if (lower.indexOf('@') !== -1) return null

    // 2. Phone check (6+ digits)
    var digitCount = (lower.match(/\d/g) || []).length
    if (digitCount >= 6) return null

    // 3. Secrets, tokens, keys, passwords, credentials
    if (
      lower.indexOf('sk_') !== -1 ||
      lower.indexOf('pk_') !== -1 ||
      lower.indexOf('token') !== -1 ||
      lower.indexOf('secret') !== -1 ||
      lower.indexOf('auth') !== -1 ||
      lower.indexOf('key') !== -1 ||
      lower.indexOf('pass') !== -1 ||
      lower.indexOf('card') !== -1 ||
      lower.indexOf('cc_') !== -1
    ) {
      return null
    }

    // 4. URL check
    if (lower.indexOf('http://') !== -1 || lower.indexOf('https://') !== -1) return null

    return cleaned
  }

  function handleFormSubmit(e) {
    var form = e.target
    if (!form || form.nodeName !== 'FORM') return

    try {
      if (_consentGiven === false) return

      var now = new Date().getTime()
      if (lastSubmits) {
        var lastTime = lastSubmits.get(form)
        if (lastTime && (now - lastTime < 2000)) return
        lastSubmits.set(form, now)
      } else {
        if (form._stLastSubmit && (now - form._stLastSubmit < 2000)) return
        form._stLastSubmit = now
      }

      var provider = 'native'
      var idAttr = form.getAttribute('id') || ''
      var classAttr = form.getAttribute('class') || ''
      var nameAttr = form.getAttribute('name') || ''

      if (
        form.getAttribute('data-wf-form') ||
        form.getAttribute('data-wf-page-id') ||
        classAttr.indexOf('w-form') !== -1 ||
        (form.parentNode && form.parentNode.getAttribute('class') && form.parentNode.getAttribute('class').indexOf('w-form') !== -1)
      ) {
        provider = 'webflow'
      } else if (
        classAttr.indexOf('wpcf7') !== -1 ||
        classAttr.indexOf('wpforms') !== -1 ||
        classAttr.indexOf('gform') !== -1 ||
        classAttr.indexOf('elementor-form') !== -1 ||
        idAttr.indexOf('wpcf7') === 0 ||
        idAttr.indexOf('gform_') === 0
      ) {
        provider = 'wordpress'
      }

      var sanitizedId = sanitizeFormMetadata(idAttr)
      var sanitizedName = sanitizeFormMetadata(nameAttr)

      var actionHost = null
      var actionPath = null
      var action = typeof form.action === 'string' ? form.action : form.getAttribute('action')
      if (action && action.trim()) {
        var trimmedAction = action.trim()
        if (trimmedAction.toLowerCase().indexOf('javascript:') !== 0) {
          try {
            var parsedUrl = new URL(trimmedAction, location.href)
            if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
              actionHost = parsedUrl.hostname
              actionPath = parsedUrl.pathname
            }
          } catch (_) {}
        }
      }

      var ignoreConv = form.getAttribute('data-sourcetrack-ignore-conversion') === 'true'

      var p = params(), ref = document.referrer || null
      var f = getFT(), u = utmFields(p)

      send('/api/track', Object.assign(
        {
          site_key: K,
          event: 'form_submit',
          anonymous_id: AID,
          session_id: SID,
          page_url: location.href,
          referrer: ref,
          properties: {
            event_type: 'form_submit',
            form_provider: provider,
            form_id: sanitizedId,
            form_name: sanitizedName,
            form_action_host: actionHost,
            form_action_path: actionPath,
            page_url: location.href,
            page_path: location.pathname,
            ignore_conversion: ignoreConv
          }
        },
        u,
        { ref_param: p.ref, source_param: p.source, via_param: p.via },
        f,
        { ai_source: aiSrc(ref, p.utm_source) }
      ))
    } catch (_) {}
  }
  addEventListener('submit', handleFormSubmit, true)

  // ─── Confirmed Booking Detection ───────────────────────────────────────────
  // Emits booking_scheduled through /api/track (NOT /api/conversion).
  // No raw invitee email / name / phone / address / URIs are forwarded.
  //
  // Calendly: raw window.message from embedded iframe.
  //   Fires only for calendly.event_scheduled. Origin validated to calendly.com
  //   or *.calendly.com. All other Calendly events are silently ignored.
  //
  // Cal.com: best-effort Cal embed API detection.
  //   Hooks into window.Cal('on', 'bookingSuccessfulV2') only when the Cal.com
  //   embed snippet is present on the page. Retries up to 10 times at 500ms
  //   intervals (max 5 s), then stops. Does NOT intercept raw Cal.com postMessage
  //   (internal format, not a public API). Cal.com link-only flows remain
  //   UTM passthrough only.

  // In-memory dedupe: fires at most once per provider+eventType+pathname per 5s
  var _bookingDedupeMap = {}
  function _dedupeBookingEvent(provider, eventType) {
    var key = provider + ':' + eventType + ':' + location.pathname
    var now = Date.now()
    if (_bookingDedupeMap[key] && now - _bookingDedupeMap[key] < 5000) return false
    _bookingDedupeMap[key] = now
    return true
  }

  function _isCalendlyOrigin(origin) {
    if (typeof origin !== 'string') return false
    try {
      var h = new URL(origin).hostname.toLowerCase()
      return h === 'calendly.com' || h.slice(-(13)) === '.calendly.com'
    } catch (_) { return false }
  }

  function _sendBookingScheduled(provider, eventType) {
    send('/api/track', {
      site_key: K,
      event: 'booking_scheduled',
      anonymous_id: AID,
      session_id: SID,
      page_url: location.href,
      properties: {
        event_type: 'booking_scheduled',
        booking_provider: provider,
        booking_detection_method: 'browser_embed_event',
        booking_event_type: eventType,
        page_url: location.href,
        page_path: location.pathname
      }
    })
  }

  // ── Calendly ────────────────────────────────────────────────────────────────
  addEventListener('message', function (e) {
    if (_consentGiven === false) return
    if (isExcluded()) return
    if (!_isCalendlyOrigin(e.origin)) return
    if (!e.data || typeof e.data !== 'object') return
    if (e.data.event !== 'calendly.event_scheduled') return
    if (!_dedupeBookingEvent('calendly', 'event_scheduled')) return
    _sendBookingScheduled('calendly', 'event_scheduled')
  })

  // ── Cal.com — best-effort embed API detection ────────────────────────────
  // Requires window.Cal to be loaded on the page. Retries at 500ms intervals,
  // up to 10 times (5 s), then gives up. Cal.com absent → UTM passthrough only.
  var _calRetries = 0
  var _calMaxRetries = 10
  function _tryRegisterCalCom() {
    if (typeof window.Cal === 'function') {
      try {
        window.Cal('on', {
          action: 'bookingSuccessfulV2',
          callback: function () {
            if (_consentGiven === false) return
            if (isExcluded()) return
            if (!_dedupeBookingEvent('calcom', 'bookingSuccessfulV2')) return
            _sendBookingScheduled('calcom', 'bookingSuccessfulV2')
          }
        })
      } catch (_) {}
      return
    }
    _calRetries++
    if (_calRetries < _calMaxRetries) {
      setTimeout(_tryRegisterCalCom, 500)
    }
    // Retry budget exhausted — Cal.com embed not present; UTM passthrough only
  }
  _tryRegisterCalCom()

  sendPageview()
})()
