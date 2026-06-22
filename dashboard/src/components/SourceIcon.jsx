import React from 'react'
import {
  Globe, Search, Megaphone, Mail, MousePointer, Video, MessageSquare
} from 'lucide-react'
import {
  MetaLogo, GoogleLogo, TikTokLogo, LinkedInLogo, MicrosoftLogo, XLogo, PinterestLogo, SnapchatLogo,
  OpenAILogo, AnthropicLogo, PerplexityLogo, GeminiLogo, GrokLogo, CopilotLogo, DeepSeekLogo
} from '../lib/brandLogos'

/**
 * Normalizes any source string into a standardized name, brand key, and category.
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
  // Strip common query string/subdomain noise if it looks like a domain name
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

/**
 * Sourced brand icons matching SVGs or Lucide fallbacks.
 */
export function SourceIcon({ source, className = "w-4 h-4", ...props }) {
  const norm = normalizeSource(source)
  const c = className

  switch (norm.brandKey) {
    case 'google':
    case 'google_ads':
      return <GoogleLogo className={c} {...props} />
    case 'meta':
      return <MetaLogo className={c} {...props} />
    case 'tiktok':
      return <TikTokLogo className={c} {...props} />
    case 'linkedin':
      return <LinkedInLogo className={c} {...props} />
    case 'microsoft':
      return <MicrosoftLogo className={c} {...props} />
    case 'x':
      return <XLogo className={c} {...props} />
    case 'pinterest':
      return <PinterestLogo className={c} {...props} />
    case 'snapchat':
      return <SnapchatLogo className={c} {...props} />
    case 'chatgpt':
      return <OpenAILogo className={c} {...props} />
    case 'claude':
      return <AnthropicLogo className={c} {...props} />
    case 'perplexity':
      return <PerplexityLogo className={c} {...props} />
    case 'gemini':
      return <GeminiLogo className={c} {...props} />
    case 'grok':
      return <GrokLogo className={c} {...props} />
    case 'copilot':
      return <CopilotLogo className={c} {...props} />
    case 'deepseek':
      return <DeepSeekLogo className={c} {...props} />
    default:
      // Category Lucide fallbacks
      switch (norm.category) {
        case 'search':
          return <Search className={`${c} text-green-600 dark:text-green-400`} {...props} />
        case 'paid':
          return <Megaphone className={`${c} text-blue-500 dark:text-blue-400`} {...props} />
        case 'social':
          return <Globe className={`${c} text-indigo-600 dark:text-indigo-400`} {...props} />
        case 'email':
          return <Mail className={`${c} text-yellow-600 dark:text-yellow-400`} {...props} />
        case 'sms':
          return <MessageSquare className={`${c} text-orange-600 dark:text-orange-400`} {...props} />
        case 'direct':
          return <MousePointer className={`${c} text-gray-600 dark:text-gray-400`} {...props} />
        case 'referral':
          return <Globe className={`${c} text-purple-600 dark:text-purple-400`} {...props} />
        default:
          return <Globe className={`${c} text-gray-400`} {...props} />
      }
  }
}

/**
 * Unified chip/badge representing the source.
 */
export function SourceChip({ source, raw = false, className = "", ...props }) {
  if (!source) return null
  const norm = normalizeSource(source)

  let bgClass = "bg-slate-500/10 dark:bg-slate-500/10 border-slate-500/20 dark:border-slate-500/20 text-slate-700 dark:text-slate-400"

  switch (norm.category) {
    case 'ai':
      bgClass = "bg-emerald-500/10 dark:bg-emerald-500/10 border-emerald-500/20 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
      break
    case 'paid':
      bgClass = "bg-sky-500/10 dark:bg-sky-500/10 border-sky-500/20 dark:border-sky-500/20 text-sky-700 dark:text-sky-400"
      break
    case 'search':
      bgClass = "bg-green-500/10 dark:bg-green-500/10 border-green-500/20 dark:border-green-500/20 text-green-700 dark:text-green-400"
      break
    case 'social':
      bgClass = "bg-indigo-500/10 dark:bg-indigo-500/10 border-indigo-500/20 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-400"
      break
    case 'email':
      bgClass = "bg-amber-500/10 dark:bg-amber-500/10 border-amber-500/20 dark:border-amber-500/20 text-amber-700 dark:text-amber-400"
      break
    case 'sms':
      bgClass = "bg-orange-500/10 dark:bg-orange-500/10 border-orange-500/20 dark:border-orange-500/20 text-orange-700 dark:text-orange-400"
      break
    case 'direct':
      bgClass = "bg-slate-500/10 dark:bg-slate-500/10 border-slate-500/20 dark:border-slate-500/20 text-slate-700 dark:text-slate-400"
      break
    case 'referral':
      bgClass = "bg-purple-500/10 dark:bg-purple-500/10 border-purple-500/20 dark:border-purple-500/20 text-purple-700 dark:text-purple-400"
      break
    default:
      bgClass = "bg-slate-500/10 dark:bg-slate-500/10 border-slate-500/20 dark:border-slate-500/20 text-slate-700 dark:text-slate-400"
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-xs font-semibold max-w-full ${bgClass} ${className}`} {...props}>
      <SourceIcon source={source} className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="truncate">{raw ? source : norm.name}</span>
    </span>
  )
}
