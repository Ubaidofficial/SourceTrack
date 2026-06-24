/**
 * Pure source normalizer shared between frontend and backend.
 * Standardizes raw source values into display names, brand keys, and categories.
 */
export function normalizeSource(source = '') {
  const rawStr = String(source || '')
  const src = rawStr.trim().toLowerCase()
  if (!src) {
    return { name: 'Direct / None', brandKey: 'direct', category: 'direct' }
  }

  // 1. AI Platforms
  if (src.includes('chatgpt') || src.includes('openai') || src === 'chatgpt.com') {
    return { name: 'ChatGPT', brandKey: 'chatgpt', category: 'ai' }
  }
  if (src.includes('perplexity')) {
    return { name: 'Perplexity', brandKey: 'perplexity', category: 'ai' }
  }
  if (src.includes('claude') || src.includes('anthropic')) {
    return { name: 'Claude', brandKey: 'claude', category: 'ai' }
  }
  if (src.includes('gemini') || src.includes('google ai') || src.includes('google-ai')) {
    return { name: 'Gemini', brandKey: 'gemini', category: 'ai' }
  }
  if (src.includes('copilot') || src.includes('bing chat') || src.includes('bing-chat')) {
    return { name: 'Copilot', brandKey: 'copilot', category: 'ai' }
  }
  if (src.includes('grok') || src.includes('xai')) {
    return { name: 'Grok', brandKey: 'grok', category: 'ai' }
  }
  if (src.includes('deepseek')) {
    return { name: 'DeepSeek', brandKey: 'deepseek', category: 'ai' }
  }

  // 2. Paid / Ad Channels
  if (src.includes('google ads') || src.includes('googleads') || src.includes('gclid') || src === 'google ads / paid search') {
    return { name: 'Google Ads', brandKey: 'google_ads', category: 'paid' }
  }
  if (src.includes('facebook ads') || src.includes('facebook-ads') || src.includes('fbclid') || src.includes('meta ads') || src.includes('meta-ads') || src === 'meta ads / paid social') {
    return { name: 'Meta Ads', brandKey: 'meta', category: 'paid' }
  }
  if (src.includes('instagram ads') || src.includes('igads')) {
    return { name: 'Instagram Ads', brandKey: 'meta', category: 'paid' }
  }
  if (src.includes('tiktok ads') || src.includes('tiktokads')) {
    return { name: 'TikTok Ads', brandKey: 'tiktok', category: 'paid' }
  }
  if (src.includes('linkedin ads') || src.includes('linkedinads')) {
    return { name: 'LinkedIn Ads', brandKey: 'linkedin', category: 'paid' }
  }
  if (src.includes('bing ads') || src.includes('bingads') || src.includes('msn ads')) {
    return { name: 'Bing Ads', brandKey: 'microsoft', category: 'paid' }
  }
  if (src.includes('ads') || src.includes('paid')) {
    return { name: 'Paid Ads', brandKey: 'ads', category: 'paid' }
  }

  // 3. Social Media
  if (src.includes('linkedin')) {
    return { name: 'LinkedIn', brandKey: 'linkedin', category: 'social' }
  }
  if (src.includes('facebook') || src.includes('fb.me') || src.includes('m.facebook')) {
    return { name: 'Facebook', brandKey: 'meta', category: 'social' }
  }
  if (src.includes('instagram') || src.includes('instagr.am')) {
    return { name: 'Instagram', brandKey: 'meta', category: 'social' }
  }
  if (src.includes('twitter') || src.includes('t.co') || src === 'x' || src.includes('x.com')) {
    return { name: 'X / Twitter', brandKey: 'x', category: 'social' }
  }
  if (src.includes('tiktok')) {
    return { name: 'TikTok', brandKey: 'tiktok', category: 'social' }
  }
  if (src.includes('reddit')) {
    return { name: 'Reddit', brandKey: 'reddit', category: 'social' }
  }
  if (src.includes('youtube') || src.includes('youtu.be')) {
    return { name: 'YouTube', brandKey: 'youtube', category: 'social' }
  }
  if (src.includes('pinterest')) {
    return { name: 'Pinterest', brandKey: 'pinterest', category: 'social' }
  }
  if (src.includes('snapchat')) {
    return { name: 'Snapchat', brandKey: 'snapchat', category: 'social' }
  }

  // 4. Organic Search
  if (src.includes('google') || src.includes('google organic') || src.includes('google search') || src.includes('google.co')) {
    return { name: 'Google', brandKey: 'google', category: 'search' }
  }
  if (src.includes('bing')) {
    return { name: 'Bing', brandKey: 'microsoft', category: 'search' }
  }
  if (src.includes('yahoo')) {
    return { name: 'Yahoo', brandKey: 'search', category: 'search' }
  }
  if (src.includes('duckduckgo') || src.includes('ddg')) {
    return { name: 'DuckDuckGo', brandKey: 'search', category: 'search' }
  }
  if (src === 'organic' || src === 'search' || src.includes('seo')) {
    return { name: 'Organic Search', brandKey: 'search', category: 'search' }
  }

  // 5. Communications / Messaging
  if (src.includes('newsletter')) {
    return { name: 'Newsletter', brandKey: 'email', category: 'email' }
  }
  if (src.includes('email') || src.includes('mail')) {
    return { name: 'Email', brandKey: 'email', category: 'email' }
  }
  if (src.includes('sms') || src.includes('text message') || src === 'text') {
    return { name: 'SMS', brandKey: 'sms', category: 'sms' }
  }

  // 6. Direct / Referral / Unknown
  if (src.includes('direct') || src === 'none' || src === 'self') {
    return { name: 'Direct / None', brandKey: 'direct', category: 'direct' }
  }
  if (src.includes('referral') || src === 'ref') {
    return { name: 'Referral', brandKey: 'referral', category: 'referral' }
  }
  if (src.includes('unknown') || src === 'other' || src === 'unknown / other') {
    return { name: 'Unknown / Other', brandKey: 'unknown', category: 'other' }
  }

  // Fallback - display the formatted string directly
  let cleanName = rawStr
  if (cleanName.includes('://')) {
    cleanName = cleanName.split('://')[1]
  }
  if (cleanName.includes('/')) {
    cleanName = cleanName.split('/')[0]
  }
  if (cleanName.startsWith('www.')) {
    cleanName = cleanName.slice(4)
  }

  const displayName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1)
  return { name: displayName, brandKey: 'unknown', category: 'referral' }
}
