const AI_HOST_MAP = {
  'chat.openai.com': 'ChatGPT',
  'chatgpt.com': 'ChatGPT',
  'claude.ai': 'Claude',
  'perplexity.ai': 'Perplexity',
  'gemini.google.com': 'Gemini',
  'grok.x.com': 'Grok',
  'copilot.microsoft.com': 'Copilot',
  'deepseek.com': 'DeepSeek',
  'you.com': 'You.com AI',
  'phind.com': 'Phind',
  'kagi.com': 'Kagi'
}

export function detectAIPlatform(req, _res, next) {
  try {
    const referer = req.headers.referer
    if (!referer) {
      req.ai_source = null
      return next()
    }

    const url = new URL(referer)
    const hostname = url.hostname

    if (hostname === 'bing.com' && url.pathname.startsWith('/chat')) {
      req.ai_source = 'Copilot'
      return next()
    }

    req.ai_source = AI_HOST_MAP[hostname] || null
  } catch (_err) {
    req.ai_source = null
  }

  next()
}
