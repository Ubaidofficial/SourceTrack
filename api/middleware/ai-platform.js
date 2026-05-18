const AI_HOST_MAP = {
  'chat.openai.com': 'ChatGPT',
  'chatgpt.com': 'ChatGPT',
  'claude.ai': 'Claude',
  'anthropic.com': 'Claude',
  'perplexity.ai': 'Perplexity',
  'gemini.google.com': 'Gemini',
  'bard.google.com': 'Gemini',
  'aistudio.google.com': 'Gemini',
  'grok.x.com': 'Grok',
  'grok.com': 'Grok',
  'copilot.microsoft.com': 'Copilot',
  'deepseek.com': 'DeepSeek',
  'meta.ai': 'Meta AI',
  'you.com': 'You.com',
  'phind.com': 'Phind',
  'kagi.com': 'Kagi',
  'mistral.ai': 'Mistral',
  'poe.com': 'Poe'
}

const AI_UTM_SOURCES = new Set([
  'chatgpt','chat.openai.com','openai',
  'claude','claude.ai','anthropic',
  'perplexity','perplexity.ai',
  'gemini','bard','google-gemini',
  'grok','xai',
  'copilot','bing-copilot','microsoft-copilot',
  'deepseek','deep-seek',
  'meta-ai','meta.ai'
])

export function detectAIPlatform(req, _res, next) {
  try {
    const referer = req.headers.referer || req.headers.referrer
    if (referer) {
      try {
        const url = new URL(referer)
        const hostname = url.hostname.replace('www.', '')
        if (hostname === 'bing.com' &&
           (url.pathname.startsWith('/chat') || url.pathname.startsWith('/search'))) {
          req.ai_source = 'Copilot'
          return next()
        }
        if (hostname === 'x.com' && url.pathname.includes('/i/grok')) {
          req.ai_source = 'Grok'
          return next()
        }
        const mapped = AI_HOST_MAP[hostname]
        if (mapped) { req.ai_source = mapped; return next() }
      } catch (_urlErr) {}
    }
    const utmSource = String(
      req.body?.utm_source || req.query?.utm_source || ''
    ).toLowerCase().trim()
    if (utmSource && AI_UTM_SOURCES.has(utmSource)) {
      req.ai_source = utmSource.charAt(0).toUpperCase() + utmSource.slice(1)
      return next()
    }
    const explicit = req.body?.ai_source || null
    if (explicit) { req.ai_source = explicit; return next() }
    req.ai_source = null
  } catch (_err) {
    req.ai_source = null
  }
  next()
}
