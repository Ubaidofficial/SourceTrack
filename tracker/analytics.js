;(function () {
  'use strict'
  if (window.__st_analytics_loaded) return
  window.__st_analytics_loaded = true
  var script = document.currentScript || document.querySelector('script[data-site-key]')
  var SITE_KEY = (script && script.getAttribute('data-site-key')) || ''
  if (!SITE_KEY) return
  var API_URL = (script && script.src) ? new URL(script.src).origin : window.location.origin
  var SESSION_KEY = '_st_sid'
  var sessionId = null
  try { sessionId = sessionStorage.getItem(SESSION_KEY) } catch (_e) {}
  if (!sessionId) {
    sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })
    try { sessionStorage.setItem(SESSION_KEY, sessionId) } catch (_e) {}
  }
  function getDevice() {
    var ua = navigator.userAgent
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return /iPad|Tablet/i.test(ua) ? 'tablet' : 'mobile'
    return 'desktop'
  }
  function getBrowser() {
    var ua = navigator.userAgent
    if (/Edg\//i.test(ua)) return 'edge'
    if (/Chrome/i.test(ua)) return 'chrome'
    if (/Firefox/i.test(ua)) return 'firefox'
    if (/Safari/i.test(ua)) return 'safari'
    return 'other'
  }
  function getUtm() {
    var p = new URLSearchParams(window.location.search)
    return { utm_source: p.get('utm_source') || p.get('ref') || null, utm_medium: p.get('utm_medium') || null, utm_campaign: p.get('utm_campaign') || null }
  }
  var pageStart = Date.now()
  function sendPageview(duration) {
    var utm = getUtm()
    var payload = { site_key: SITE_KEY, url: window.location.href, referrer: document.referrer || null, utm_source: utm.utm_source, utm_medium: utm.utm_medium, utm_campaign: utm.utm_campaign, device: getDevice(), browser: getBrowser(), session_id: sessionId, duration_seconds: duration || 0 }
    var body = JSON.stringify(payload)
    if (duration && navigator.sendBeacon) {
      navigator.sendBeacon(API_URL + '/api/analytics/collect', new Blob([body], { type: 'application/json' }))
    } else {
      fetch(API_URL + '/api/analytics/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {})
    }
  }
  sendPageview(0)
  window.addEventListener('pagehide', function () { sendPageview(Math.round((Date.now() - pageStart) / 1000)) })
  var lastUrl = window.location.href
  function onUrlChange() { if (window.location.href !== lastUrl) { lastUrl = window.location.href; pageStart = Date.now(); sendPageview(0) } }
  var _pushState = history.pushState
  history.pushState = function () { _pushState.apply(this, arguments); onUrlChange() }
  window.addEventListener('popstate', onUrlChange)
})()
