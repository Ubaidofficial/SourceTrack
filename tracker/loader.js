;(function () {
  'use strict'

  if (window.__trackiq_loaded) return
  window.__trackiq_loaded = true

  var script = document.currentScript
  var siteKey = ''
  var userIdSelector = ''
  if (script) {
    siteKey = script.getAttribute('data-site-key') || ''
    userIdSelector = script.getAttribute('data-user-id-selector') || ''
  }

  if (!siteKey) {
    return
  }

  var apiUrl = window.__trackiq_config && window.__trackiq_config.api_url
    ? window.__trackiq_config.api_url
    : (script && script.src ? new URL(script.src).origin : window.location.origin)

  window.__trackiq_config = { site_key: siteKey, api_url: apiUrl, user_id_selector: userIdSelector }

  var queue = []
  var trackerReady = false

  function flushQueue() {
    trackerReady = true
    var q = queue
    queue = []
    for (var i = 0; i < q.length; i++) {
      try {
        q[i]()
      } catch (_e) { /* ignore */ }
    }
  }

  function enqueue(fn) {
    if (trackerReady) {
      try { fn() } catch (_e) { /* ignore */ }
    } else {
      queue.push(fn)
    }
  }

  window.trackiq = {
    id: function () {
      if (trackerReady && window.__trackiq && window.__trackiq.id) {
        return window.__trackiq.id()
      }
      return null
    },
    identify: function (traits) {
      enqueue(function () {
        if (window.__trackiq && window.__trackiq.identify) {
          window.__trackiq.identify(traits)
        }
      })
    },
    event: function (name, props) {
      enqueue(function () {
        if (window.__trackiq && window.__trackiq.event) {
          window.__trackiq.event(name, props)
        }
      })
    },
    conversion: function (value, props) {
      enqueue(function () {
        if (window.__trackiq && window.__trackiq.conversion) {
          window.__trackiq.conversion(value, props)
        }
      })
    },
    page: function () {
      enqueue(function () {
        if (window.__trackiq && window.__trackiq.page) {
          window.__trackiq.page()
        }
      })
    }
  }

  var s = document.createElement('script')
  s.src = apiUrl + '/tracker.min.js'
  s.async = true
  s.onload = flushQueue
  s.onerror = function () {
    /* fail silently */
  }
  document.head.appendChild(s)
})()
