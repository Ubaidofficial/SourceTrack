;(function () {
  'use strict'

  var config = window.__trackiq_config
  if (!config || !config.site_key || !config.api_url) return

  var SITE_KEY = config.site_key
  var API_URL = config.api_url.replace(/\/$/, '')

  var COOKIE_DOMAIN = ''
  try {
    var _scriptTag = document.currentScript ||
      document.querySelector('script[data-site-key="' + SITE_KEY + '"]')
    COOKIE_DOMAIN = (_scriptTag && _scriptTag.getAttribute('data-cookie-domain')) || ''
  } catch(_e) { COOKIE_DOMAIN = '' }

  function uuidv4() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    /* Fallback for browsers without crypto.randomUUID */
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0
      var v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
    return match ? decodeURIComponent(match[1]) : null
  }

  function setCookie(name, value) {
    var domainPart = COOKIE_DOMAIN ? '; domain=' + COOKIE_DOMAIN : ''
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; SameSite=None; Secure; path=/; max-age=31536000' + domainPart
  }

  function generateFingerprint() {
    try {
      var parts = [
        navigator.userAgent || '',
        navigator.language || '',
        (screen.width || 0) + 'x' + (screen.height || 0),
        (screen.colorDepth || 0) + '',
        (new Date().getTimezoneOffset()) + '',
        (navigator.hardwareConcurrency || 0) + '',
        (navigator.maxTouchPoints || 0) + ''
      ]
      var str = parts.join('||')
      var hash = 0
      for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i)
        hash = hash & hash
      }
      return 'fp_' + Math.abs(hash).toString(16)
    } catch(_e) {
      return null
    }
  }

  function getUtmParams() {
    var params = new URLSearchParams(window.location.search)
    return {
      ref: params.get('ref') || null,
      source: params.get('source') || null,
      via: params.get('via') || null,
      utm_source: params.get('utm_source') || params.get('ref') || params.get('source') || params.get('via') || null,
      utm_medium: params.get('utm_medium') || null,
      utm_campaign: params.get('utm_campaign') || null,
      utm_content: params.get('utm_content') || null,
      utm_term: params.get('utm_term') || null,
      gclid: params.get('gclid') || null,
      fbclid: params.get('fbclid') || null,
      msclkid: params.get('msclkid') || null,
      ttclid: params.get('ttclid') || null
    }
  }

  var idCookieName = '__ti_id_' + SITE_KEY
  var ftCookieName = '__ti_ft_' + SITE_KEY
  var ltCookieName = '__ti_lt_' + SITE_KEY

  // ── Cookieless mode ──────────────────────────────────────────────────────
  var cookieless = !!(config && config.cookieless)
  var anonymousId, idType
  if (cookieless) {
    var qp_cl = new URLSearchParams(window.location.search)
    var xdId_cl = qp_cl.get('__tq_id')
    if (xdId_cl) {
      anonymousId = xdId_cl
      idType = 'cross_domain'
    } else {
      try { anonymousId = sessionStorage.getItem(idCookieName) } catch (_e) {}
      if (!anonymousId) {
        anonymousId = uuidv4()
        try { sessionStorage.setItem(idCookieName, anonymousId) } catch (_e) {}
      }
      idType = 'cookieless'
    }
  } else {
  // ── Normal mode ──────────────────────────────────────────────────────────
  var anonymousId = getCookie(idCookieName)
  var idType = 'cookie'
  var qp = new URLSearchParams(window.location.search)
  if (!anonymousId) {
    var xdId = qp.get('__tq_id')
    if (xdId) {
      anonymousId = xdId
      idType = 'cross_domain'
    } else {
      try { anonymousId = localStorage.getItem(idCookieName) } catch (_e) { /* unavailable */ }
      if (anonymousId) idType = 'localStorage'
    }
  }

  if (!anonymousId) {
    try { anonymousId = sessionStorage.getItem(idCookieName) } catch (_e) {}
    if (anonymousId) idType = 'session'
  }

  if (!anonymousId) {
    var fp = generateFingerprint()
    if (fp) {
      anonymousId = fp
      idType = 'fingerprint'
    }
  }

  if (!anonymousId) {
    anonymousId = uuidv4()
    idType = 'generated'
  }

  setCookie(idCookieName, anonymousId)
  try { localStorage.setItem(idCookieName, anonymousId) } catch (_e) { /* unavailable */ }
  try { sessionStorage.setItem(idCookieName, anonymousId) } catch (_e) {}
  } // end cookieless else

  var utm = getUtmParams()
  var now = new Date().toISOString()

  if (!getCookie(ftCookieName)) {
    var xdFt = qp.get('__tq_ft')
    var ft = null
    if (xdFt) {
      try {
        ft = JSON.parse(xdFt)
      } catch (_e) { ft = null }
    }
    if (!ft) {
      ft = { timestamp: now }
      if (utm.utm_source) {
        ft.source = utm.utm_source
        ft.medium = utm.utm_medium
        ft.campaign = utm.utm_campaign
      }
    }
    setCookie(ftCookieName, JSON.stringify(ft))
  }

  if (utm.utm_source) {
    var lt = {
      timestamp: now,
      source: utm.utm_source,
      medium: utm.utm_medium,
      campaign: utm.utm_campaign
    }
    setCookie(ltCookieName, JSON.stringify(lt))
  }

  var ftData = null
  try {
    var rawFt = getCookie(ftCookieName)
    if (rawFt) ftData = JSON.parse(rawFt)
  } catch (_e) { /* ignore */ }

  function sendEvent(event, extraProps) {
    var payload = JSON.stringify({
      site_key: SITE_KEY,
      event: event,
      anonymous_id: anonymousId,
      id_type: idType,
      page_url: window.location.href,
      referrer: document.referrer || null,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_content: utm.utm_content,
      utm_term: utm.utm_term,
      gclid: utm.gclid,
      fbclid: utm.fbclid,
      msclkid: utm.msclkid,
      ttclid: utm.ttclid,
      ref_param: utm.ref,
      source_param: utm.source,
      via_param: utm.via,
      first_touch_source: ftData ? ftData.source || null : null,
      first_touch_medium: ftData ? ftData.medium || null : null,
      first_touch_campaign: ftData ? ftData.campaign || null : null
    })

    if (extraProps) {
      var extra = JSON.parse(payload)
      Object.assign(extra, extraProps)
      payload = JSON.stringify(extra)
    }

    var blob = new Blob([payload], { type: 'application/json' })

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API_URL + '/api/' + (event === '$conversion' ? 'conversion' : 'collect'), blob)
      } else {
        /* fallthrough to fetch */
        throw new Error('no beacon')
      }
    } catch (_e) {
      fetch(API_URL + '/api/' + (event === '$conversion' ? 'conversion' : 'collect'), {
        method: 'POST',
        body: blob,
        keepalive: true
      }).catch(function () { /* silent */ })
    }
  }

  function fillHiddenFields() {
    var fields = document.querySelectorAll('[data-trackiq]')
    for (var i = 0; i < fields.length; i++) {
      var el = fields[i]
      var prop = el.getAttribute('data-trackiq')
      if (prop === 'anonymous_id') el.value = anonymousId
      if (prop === 'utm_source') el.value = utm.utm_source || ''
      if (prop === 'utm_medium') el.value = utm.utm_medium || ''
      if (prop === 'utm_campaign') el.value = utm.utm_campaign || ''
      if (prop === 'utm_content') el.value = utm.utm_content || ''
      if (prop === 'utm_term') el.value = utm.utm_term || ''
      if (prop === 'ref') el.value = utm.ref || ''
      if (prop === 'source') el.value = utm.source || ''
      if (prop === 'via') el.value = utm.via || ''
      if (prop === 'utm_content') el.value = utm.utm_content || ''
      if (prop === 'utm_term') el.value = utm.utm_term || ''
      if (prop === 'ref') el.value = utm.ref || ''
      if (prop === 'source') el.value = utm.source || ''
      if (prop === 'via') el.value = utm.via || ''
      if (prop === '__tq_id') el.value = anonymousId
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fillHiddenFields)
  } else {
    fillHiddenFields()
  }

  var isFirstVisit = !getCookie(idCookieName + '_seen')

  if (isFirstVisit) {
    setCookie(idCookieName + '_seen', '1')
  }

  function sendIdentify(traits, userId) {
    var payload = {
      site_key: SITE_KEY,
      anonymous_id: anonymousId,
      id_type: idType,
      traits: traits || {}
    }
    if (userId) {
      payload.user_id = userId
    }
    if (ftData) {
      if (ftData.source) payload.first_touch_source = ftData.source
      if (ftData.medium) payload.first_touch_medium = ftData.medium
      if (ftData.campaign) payload.first_touch_campaign = ftData.campaign
    }
    var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API_URL + '/api/identify', blob)
      } else {
        throw new Error('no beacon')
      }
    } catch (_e) {
      fetch(API_URL + '/api/identify', {
        method: 'POST',
        body: blob,
        keepalive: true
      }).catch(function () { /* silent */ })
    }
  }

  window.__trackiq = {
    id: function () { return anonymousId },
    identify: function (traits) {
      var userId = null
      var cleaned = traits || {}
      if (cleaned.user_id) {
        userId = cleaned.user_id
        var copy = {}
        for (var k in cleaned) {
          if (k !== 'user_id') copy[k] = cleaned[k]
        }
        cleaned = copy
      }
      sendIdentify(cleaned, userId)
    },
    event: function (name, props) { sendEvent(name, props) },
    conversion: function (value, props) {
      var p = props || {}
      p.conversion_value = value
      if (props) {
        if (typeof props.conversion_type === 'string') {
          var ct = props.conversion_type.trim()
          if (ct.length > 0) p.conversion_type = ct
        }
        if (typeof props.form_name === 'string') {
          var fn = props.form_name.trim().slice(0, 120).replace(/[^a-zA-Z0-9 _-]/g, '')
          if (fn.length > 0) p.form_name = fn
        }
      }
      sendEvent('$conversion', p)
    },
    page: function () { sendEvent('$pageview') },
    getCrossDomainUrl: function (url) {
      if (typeof url !== 'string') return url
      var u
      try {
        u = new URL(url, window.location.href)
      } catch (_e) {
        return url
      }
      u.searchParams.set('__tq_id', anonymousId)
      if (ftData && (ftData.source || ftData.medium || ftData.campaign)) {
        var ftPayload = {}
        if (ftData.source) ftPayload.s = ftData.source
        if (ftData.medium) ftPayload.m = ftData.medium
        if (ftData.campaign) ftPayload.c = ftData.campaign
        u.searchParams.set('__tq_ft', JSON.stringify(ftPayload))
      }
      return u.href
    }
  }

  if (!window.trackiq) {
    window.trackiq = window.__trackiq
  }

  // Cross-domain v1: strip __tq_ params from URL after reading them
  if (qp.has('__tq_id') || qp.has('__tq_ft')) {
    try {
      var cleanUrl = new URL(window.location.href)
      cleanUrl.searchParams.delete('__tq_id')
      cleanUrl.searchParams.delete('__tq_ft')
      window.history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash)
    } catch (_e) { /* ignore */ }
  }

  sendEvent('$pageview')

  if (isFirstVisit) {
    sendEvent('install_verified', {
      domain: window.location.hostname

    })
  }

  // Optional user_id auto-detection via DOM selector configured in the install snippet.
  // Reads only data-trackiq-user-id attribute from the matching element — no textContent fallback.
  // The __trackiq_auto_identified guard prevents duplicate identify calls within a single page
  // load (the tracker re-initializes on each navigation, so a new page load → fresh guard).
  // TODO confirm: preferred auto-detection contract — currently DOM-selector + data attribute
  if (config.user_id_selector && !window.__trackiq_auto_identified) {
    window.__trackiq_auto_identified = true
    try {
      var el = document.querySelector(config.user_id_selector)
      if (el) {
        var autoUserId = el.getAttribute('data-trackiq-user-id')
        if (autoUserId) {
          window.__trackiq.identify({ user_id: autoUserId })
        }
      }
    } catch (_e) { /* selector invalid — silently skip */ }
  }

  // Outbound link auto-tracking
  document.addEventListener('click', function(e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]')
    if (!a) return
    try {
      var url = new URL(a.href)
      if (url.hostname !== window.location.hostname && url.protocol.startsWith('http')) {
        sendEvent('outbound_click', { outbound_url: url.href, outbound_domain: url.hostname })
      }
    } catch(_e) {}
  }, true)
})()
