export function validateCrossDomainSettings(body, siteDomain, isProduction = false) {
  // 1. Validate domains
  let crossDomainDomains = undefined
  if (body.cross_domain_domains !== undefined) {
    const rawDomains = body.cross_domain_domains
    if (rawDomains === null) {
      crossDomainDomains = null
    } else if (!Array.isArray(rawDomains)) {
      throw new Error('cross_domain_domains must be an array or null')
    } else {
      const uniqueDomains = [...new Set(rawDomains.map(d => typeof d === 'string' ? d.trim().toLowerCase() : '').filter(Boolean))]
      if (uniqueDomains.length > 20) {
        throw new Error('Maximum of 20 cross-domain domains allowed')
      }

      const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/
      for (const d of uniqueDomains) {
        if (d.length > 100) {
          throw new Error(`Domain "${d}" is too long (max 100 characters)`)
        }
        if (d.includes('://') || d.includes('/')) {
          throw new Error(`Domains must not contain protocols or paths: "${d}"`)
        }
        if (d.includes('*')) {
          throw new Error(`Wildcards are not supported: "${d}"`)
        }
        if (!domainRegex.test(d)) {
          throw new Error(`Invalid domain format: "${d}"`)
        }

        // Require at least one dot and reject single label names (e.g. "example", "localhost", "com")
        if (!d.includes('.')) {
          throw new Error(`Domain "${d}" is invalid. Cross-domain hostnames must contain at least one dot.`)
        }

        const unsafePublicSuffixes = [
          'com', 'net', 'org', 'co', 'io', 'ai', 'app', 'dev',
          'co.uk', 'com.au', 'org.uk', 'net.cn', 'edu', 'gov', 'localhost'
        ]
        if (unsafePublicSuffixes.includes(d)) {
          throw new Error(`Domain "${d}" is a public suffix or local hostname and cannot be used for cross-domain tracking.`)
        }

        if (isProduction) {
          if (d === 'localhost' || d === '127.0.0.1' || d === '::1' || d.endsWith('.localhost')) {
            throw new Error(`localhost domain "${d}" is not allowed in production`)
          }
        }
      }
      crossDomainDomains = uniqueDomains
    }
  }

  // 2. Validate cookie domain
  let crossDomainCookieDomain = undefined
  if (body.cross_domain_cookie_domain !== undefined) {
    const rawCookie = body.cross_domain_cookie_domain
    if (rawCookie === null || rawCookie === '') {
      crossDomainCookieDomain = null
    } else if (typeof rawCookie !== 'string') {
      throw new Error('cross_domain_cookie_domain must be a string or null')
    } else {
      const cookieDomain = rawCookie.trim().toLowerCase()
      if (cookieDomain.length > 100) {
        throw new Error('Cookie domain is too long (max 100 characters)')
      }
      if (!cookieDomain.startsWith('.')) {
        throw new Error('Cookie domain must start with a leading dot (e.g. .example.com)')
      }

      const cookieRegex = /^\.[a-z0-9.-]+$/
      if (!cookieRegex.test(cookieDomain)) {
        throw new Error(`Invalid cookie domain format: "${cookieDomain}"`)
      }

      const stripped = cookieDomain.slice(1)
      if (stripped.split('.').filter(Boolean).length < 2) {
        throw new Error(`Cookie domain "${cookieDomain}" is unsafe and cannot be set directly on a top-level domain.`)
      }

      const unsafeCookieSuffixes = [
        '.com', '.net', '.org', '.co', '.io', '.ai', '.app', '.dev',
        '.co.uk', '.com.au', '.org.uk', '.localhost', '.edu', '.gov'
      ]
      if (unsafeCookieSuffixes.includes(cookieDomain)) {
        throw new Error(`Cookie domain "${cookieDomain}" is unsafe and cannot be set directly on a public suffix.`)
      }

      const siteDomainLower = siteDomain ? siteDomain.toLowerCase().trim() : null
      if (!siteDomainLower) {
        throw new Error('Cannot set cookie domain when the site has no primary domain configured.')
      }

      if (siteDomainLower !== stripped && !siteDomainLower.endsWith('.' + stripped)) {
        throw new Error(`Cookie domain "${cookieDomain}" must match the tracked site domain "${siteDomainLower}" or be a parent domain of it.`)
      }

      crossDomainCookieDomain = cookieDomain
    }
  }

  return { crossDomainDomains, crossDomainCookieDomain }
}
