;(function () {
  'use strict'

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
    },

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
            page_path: location.pathname
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

  sendPageview()  // queued until fetchId() resolves
  fetchId()
})()
