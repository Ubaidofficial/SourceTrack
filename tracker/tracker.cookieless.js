;(function () {
  'use strict'

  // ─── Do Not Track / Global Privacy Control ────────────────────────────────
  // Opt-out signaled by the browser/OS — abort before any id fetch or beacon.
  // Parity with the cookie build (tracker.js). Opt-in is still possible via the
  // data-consent-required attribute (consent system below).
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true) return

  // ─── Config ────────────────────────────────────────────────────────────────
  var sc = document.currentScript || document.querySelector('script[data-site-key]')
  var K  = (sc && sc.getAttribute('data-site-key')) || ''
  var B  = (sc && sc.src) ? new URL(sc.src).origin : location.origin
  var EXCL = (sc && sc.getAttribute('data-exclude')) || ''
  // Phase 1 auto-fill: opt-in. Default OFF — when absent/!=='true', no new behavior.
  var AUTO_FIELDS = !!(sc && sc.getAttribute('data-auto-fields') === 'true')

  // Single source of truth for the attribution fields safe to hand off into a
  // customer's form. NO raw referrer, NO IP — referrer only as referrer_host,
  // the URL only as landing_page_path.
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

  // ─── First-touch derivation (in-memory only — no persistent storage) ───────
  // Cookieless trade-off: first-touch is session-scoped, not cross-session.
  // We stamp a timestamp at derivation time so backends/reporting have a
  // canonical first-touch moment for this session, even though it does not
  // persist across page loads.
  function deriveFirstTouch(p, ref) {
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
    return {
      first_touch_source: src,
      first_touch_medium: med,
      first_touch_campaign: p.utm_campaign || '',
      first_touch_timestamp: new Date().toISOString()
    }
  }

  // ─── Shared UTM + click-id field builder ───────────────────────────────────
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
  function send(ep, data) {
    if (isExcluded()) return  // Suppress sending on excluded paths!
    var b = JSON.stringify(data), u = B + ep
    try {
      navigator.sendBeacon
        ? navigator.sendBeacon(u, new Blob([b], { type: 'application/json' }))
        : fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: b, keepalive: true }).catch(function () {})
    } catch (_) {}
  }

  // ─── Consent management (in-memory only) ────────────────────────────────────
  // Mirrors the cookie build's gate (tracker.js). data-consent-required="true"
  // holds all tracking until sourcetrack.consent(true) (opt-in mode); without it,
  // tracking fires immediately (opt-out model). sourcetrack.optOut()/optIn()
  // always work. NOTE: the cookieless build has NO storage, so the consent
  // decision is in-memory and PER-PAGE-LOAD by design — it is NOT persisted
  // across page loads (the cookie build persists it in localStorage).
  var CONSENT_REQUIRED = !!(sc && sc.getAttribute('data-consent-required') === 'true')
  var _cq = []
  var _consentGiven = null  // null = undecided; true/false = explicit (in-memory only)

  var _rawSend = send
  function sendGated(ep, data) {
    if (isExcluded()) return                            // excluded paths
    if (_consentGiven === false) return                 // opted out
    if (CONSENT_REQUIRED && _consentGiven !== true) {   // opt-in: hold until consent(true)
      _cq.push([ep, data])
      return
    }
    _rawSend(ep, data)
  }
  send = sendGated
  function _flushConsentQueue() {
    var q = _cq.splice(0)
    for (var i = 0; i < q.length; i++) _rawSend(q[i][0], q[i][1])
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
  // If the server is unreachable or returns no visitor_id, we fall back to a
  // session-scoped random id so the tracker keeps working — but cross-session
  // attribution will not work for this visitor until the next successful fetch.
  // We surface a console.warn so site owners debugging "why is everyone direct"
  // can see the cause in DevTools without us silently dropping the request.
  function warnFallback(reason) {
    try {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[SourceTrack] Cookieless visitor ID ' + reason + ' — using a session-only fallback id. Cross-session attribution may not work for this visitor. See https://sourcetrack.ai/docs/troubleshooting#cookieless')
      }
    } catch (_) {}
  }
  function fetchId() {
    fetch(B + '/api/tracker/id?site_key=' + encodeURIComponent(K), { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (j) {
        if (j && j.visitor_id) {
          AID = j.visitor_id
          SID = j.session_id || AID
        } else {
          warnFallback('request returned no id')
          AID = 'cl-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
          SID = AID
        }
        flush()
      })
      .catch(function () {
        warnFallback('request failed (network or blocker)')
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
  // SPA frameworks can fire pushState in rapid bursts during transitions.
  // Debounce auto-pageviews to ~100ms so a burst of pushState calls only
  // produces one pageview for the final URL. Manual sourcetrack.track() calls
  // bypass this and still fire immediately.
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

  function base64urlEncode(str) {
    try {
      var base64 = btoa(unescape(encodeURIComponent(str)))
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    } catch (_) { return '' }
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
      if (!AID) return url
      try {
        var u = new URL(url, location.href)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return url

        if (!u.searchParams.has('__st_id')) {
          u.searchParams.set('__st_id', AID)
        }

        var p = params()
        var ref = document.referrer || null
        var ft = deriveFirstTouch(p, ref)
        if (ft && ft.first_touch_source && ft.first_touch_source !== 'direct' && !u.searchParams.has('__st_ft')) {
          var payload = {
            s: sanitizeFtValue(ft.first_touch_source),
            m: sanitizeFtValue(ft.first_touch_medium) || 'none',
            c: sanitizeFtValue(ft.first_touch_campaign) || ''
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

    conversion: function (opts) {
      opts = opts || {}
      var p = params(), ref = document.referrer || null
      var data = Object.assign(
        { site_key: K, anonymous_id: AID, session_id: SID, page_url: location.href, referrer: ref, cookieless: true,
          conversion_value: opts.value || opts.conversion_value || 0,
          conversion_type:  opts.type  || opts.conversion_type  || 'conversion',
          order_id:         opts.order_id || opts.orderId        || null,
          event_id:         opts.event_id || null },           // dedup id (no _fbp/_fbc: cookieless reads no cookies)
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
    },

    // ── Consent API ─────────────────────────────────────────────────────────
    // Parity with the cookie build. In-memory only (cookieless has no storage):
    // the decision is per-page-load and is NOT persisted across loads.
    // sourcetrack.consent(true)  — grant, flush queued events
    // sourcetrack.consent(false) — deny, clear queue, stop tracking
    consent: function (granted) {
      _consentGiven = !!granted
      if (_consentGiven) {
        _flushConsentQueue()
      } else {
        _cq.length = 0  // clear queued events — do not send
      }
    },
    optOut: function () { window.sourcetrack.consent(false) },
    optIn:  function () { window.sourcetrack.consent(true) },
    hasConsent: function () { return _consentGiven },

    getContext: function () {
      var p = params(), ref = document.referrer || null
      var ft = deriveFirstTouch(p, ref)
      return {
        anonymous_id: AID || null,
        session_id: SID || null,
        first_touch_source: ft.first_touch_source,
        first_touch_medium: ft.first_touch_medium,
        first_touch_campaign: ft.first_touch_campaign,
        current_source: ft.first_touch_source,
        current_medium: ft.first_touch_medium,
        current_campaign: ft.first_touch_campaign,
        last_touch_source: ft.first_touch_source,
        last_touch_medium: ft.first_touch_medium,
        last_touch_campaign: ft.first_touch_campaign,
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
    // Note: in cookieless mode, anonymous_id may be null until server ID resolves.
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
    // Note: in cookieless mode, call on form submit to avoid null anonymous_id.
    fillHiddenFields: function (opts) {
      opts = opts || {}
      var selector     = typeof opts.selector === 'string' ? opts.selector : 'form'
      var fieldMap     = opts.fields && typeof opts.fields === 'object' ? opts.fields : {}
      var createMissing = !!opts.createMissing
      // skipNonEmpty (Phase 1 auto-fill): never overwrite a non-empty / already-filled field.
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
                if (input.value) continue
                if (input.getAttribute && input.getAttribute('data-st-injected')) continue
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
  // Privacy: the cookieless build has no consent gate, so the auto-fill feature
  // gates itself on DNT/GPC for parity with the cookie build.
  function autoFillAllowed() {
    return !(navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true)
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
      runAutoFill()

      if (typeof MutationObserver === 'undefined' || !document.body) return
      var obs = new MutationObserver(function (muts) {
        for (var m = 0; m < muts.length; m++) {
          var added = muts[m].addedNodes || []
          for (var n = 0; n < added.length; n++) {
            var node = added[n]
            if (node && (node.nodeName === 'FORM' || (node.querySelector && node.querySelector('form')))) {
              runAutoFill()
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
    if (lower.indexOf('@') !== -1) return null
    if ((lower.match(/\d/g) || []).length >= 6) return null
    if (lower.indexOf('http://') !== -1 || lower.indexOf('https://') !== -1 || lower.indexOf('//') === 0) return null
    if (
      lower.indexOf('sk_') === 0 || lower.indexOf('pk_') === 0 ||
      lower.indexOf('rk_') === 0 || lower.indexOf('key_') === 0 ||
      lower.indexOf('api_') === 0 || lower.indexOf('token') === 0 ||
      lower.indexOf('secret') === 0
    ) return null
    if (/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(cleaned)) return null
    return cleaned
  }

  function handleBookingPassthrough(e) {
    if (e.button === 2) return // skip right clicks
    if (isExcluded()) return   // suppress on excluded paths

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
      var ft = deriveFirstTouch(p, ref)
      var u = utmFields(p)

      var data = Object.assign(
        {
          site_key: K,
          event: 'form_submit',
          anonymous_id: AID,
          session_id: SID,
          page_url: location.href,
          referrer: ref,
          cookieless: true,
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
        ft,
        { ai_source: aiSrc(ref, p.utm_source) }
      )

      AID ? send('/api/track', data) : _q.push({ ep: '/api/track', data: data })
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
  //   Requires window.Cal to be loaded. Does NOT intercept raw Cal.com postMessage
  //   (internal format, undocumented). Retries up to 10 times at 500ms (max 5 s).
  //   Cookieless note: AID may be null at hook-registration time if fetchId() has
  //   not resolved yet; events are queued via _q and sent once AID is available.

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
    var data = {
      site_key: K,
      event: 'booking_scheduled',
      anonymous_id: AID,
      session_id: SID,
      page_url: location.href,
      cookieless: true,
      properties: {
        event_type: 'booking_scheduled',
        booking_provider: provider,
        booking_detection_method: 'browser_embed_event',
        booking_event_type: eventType,
        page_url: location.href,
        page_path: location.pathname
      }
    }
    AID ? send('/api/track', data) : _q.push({ ep: '/api/track', data: data })
  }

  // ── Calendly ────────────────────────────────────────────────────────────────
  addEventListener('message', function (e) {
    if (isExcluded()) return
    if (!_isCalendlyOrigin(e.origin)) return
    if (!e.data || typeof e.data !== 'object') return
    if (e.data.event !== 'calendly.event_scheduled') return
    if (!_dedupeBookingEvent('calendly', 'event_scheduled')) return
    _sendBookingScheduled('calendly', 'event_scheduled')
  })

  // ── Cal.com — best-effort embed API detection ────────────────────────────
  var _calRetries = 0
  var _calMaxRetries = 10
  function _tryRegisterCalCom() {
    if (typeof window.Cal === 'function') {
      try {
        window.Cal('on', {
          action: 'bookingSuccessfulV2',
          callback: function () {
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
  }
  _tryRegisterCalCom()

  sendPageview()  // queued until fetchId() resolves
  fetchId()
})()
