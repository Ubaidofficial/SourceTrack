import React from 'react'
import {
  Globe, Search, Megaphone, Mail, MousePointer, Video, MessageSquare
} from 'lucide-react'
import {
  MetaLogo, GoogleLogo, TikTokLogo, LinkedInLogo, MicrosoftLogo, XLogo, PinterestLogo, SnapchatLogo,
  OpenAILogo, AnthropicLogo, PerplexityLogo, GeminiLogo, GrokLogo, CopilotLogo, DeepSeekLogo
} from '../lib/brandLogos'

import { normalizeSource } from '../lib/source-normalizer.js'
export { normalizeSource }

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
