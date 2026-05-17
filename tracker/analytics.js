;(function () {
  var script = document.currentScript || document.querySelector('script[data-site-key]')
  var SITE_KEY = (script && script.getAttribute('data-site-key')) || ''
  var SESSION_KEY = 'st_sid'
  var API_URL = (script && script.src) ? new URL(script.src).origin : window.location.origin

  var sessionId = null
  try { sessionId = sessionStorage.getItem(SESSION_KEY) } catch (_e) {}
  if (!sessionId) {
    sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    })
    try { sessionStorage.setItem(SESSION_KEY, sessionId) } catch (_e) {}
  }

  var pageStart = Date.now()
  var lastUrl = window.location.href
  var entryPage = window.location.href

  function getDevice() {
    var w = window.innerWidth
    return w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop'
  }

  function getBrowser() {
    var ua = navigator.userAgent
    if (/Edg\//.test(ua)) return 'Edge'
    if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return 'Chrome'
    if (/Firefox\//.test(ua)) return 'Firefox'
    if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari'
    if (/OPR\/|Opera/.test(ua)) return 'Opera'
    return 'Other'
  }

  function getUtm() {
    var p = new URLSearchParams(window.location.search)
    return { utm_source: p.get('utm_source') || p.get('ref') || null, utm_medium: p.get('utm_medium') || null, utm_campaign: p.get('utm_campaign') || null }
  }

  function send(payload) {
    var body = JSON.stringify(payload)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(API_URL + '/api/analytics/collect', new Blob([body], { type: 'application/json' }))
    } else {
      fetch(API_URL + '/api/analytics/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {})
    }
  }

  function sendPageview(duration, exitPage) {
    var utm = getUtm()
    send({
      site_key: SITE_KEY,
      url: window.location.href,
      referrer: document.referrer || null,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      device: getDevice(),
      browser: getBrowser(),
      session_id: sessionId,
      duration_seconds: duration || 0,
      entry_page: entryPage,
      exit_page: exitPage || null
    })
  }

  // Track outbound clicks
  function trackOutbound(e) {
    var el = e.target.closest('a')
    if (!el) return
    var href = el.href || ''
    if (!href) return
    try {
      var linkHost = new URL(href).hostname
      if (linkHost && linkHost !== window.location.hostname) {
        send({
          site_key: SITE_KEY,
          event_type: 'outbound_click',
          url: window.location.href,
          session_id: sessionId,
          properties: { destination: href, link_text: (el.textContent || '').trim().slice(0, 100) }
        })
      }
    } catch (_e) {}
  }

  // Public API for custom events
  window.sourcetrack = {
    track: function (eventName, properties) {
      send({
        site_key: SITE_KEY,
        event_type: 'custom',
        event_name: eventName,
        url: window.location.href,
        session_id: sessionId,
        properties: properties || {}
      })
    }
  }

  // SPA route change
  function onUrlChange() {
    if (window.location.href !== lastUrl) {
      sendPageview(Math.round((Date.now() - pageStart) / 1000), lastUrl)
      lastUrl = window.location.href
      pageStart = Date.now()
      sendPageview(0)
    }
  }

  var _pushState = history.pushState
  history.pushState = function () { _pushState.apply(this, arguments); onUrlChange() }
  window.addEventListener('popstate', onUrlChange)

  // Exit page on leave
  window.addEventListener('pagehide', function () {
    sendPageview(Math.round((Date.now() - pageStart) / 1000), window.location.href)
  })

  // Outbound click tracking
  document.addEventListener('click', trackOutbound, true)

  // Initial pageview
  sendPageview(0)
})()
