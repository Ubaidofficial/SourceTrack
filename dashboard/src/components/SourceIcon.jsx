import React from 'react'
import {
  Globe, Search, Megaphone, Mail, MousePointer, Sparkles, Video
} from 'lucide-react'

// Simple SVG brand icons or fallbacks for custom source rendering
export function SourceIcon({ source, className = "w-4 h-4", ...props }) {
  const src = (source || '').toLowerCase()

  // AI Platforms
  if (src.includes('chatgpt') || src.includes('openai')) {
    return <Sparkles className={`${className} text-emerald-600 dark:text-emerald-400`} {...props} />
  }
  if (src.includes('perplexity')) {
    return <Sparkles className={`${className} text-purple-600 dark:text-purple-400`} {...props} />
  }
  if (src.includes('claude') || src.includes('anthropic')) {
    return <Sparkles className={`${className} text-orange-600 dark:text-orange-400`} {...props} />
  }
  if (src.includes('gemini') || src.includes('google ai') || src.includes('google-ai')) {
    return <Sparkles className={`${className} text-blue-600 dark:text-blue-400`} {...props} />
  }

  // Organic Search & Search Engines
  if (src.includes('google organic') || src.includes('google search') || (src === 'google' && !src.includes('ads'))) {
    return <Search className={`${className} text-green-600 dark:text-green-400`} {...props} />
  }
  if (src.includes('bing')) {
    return <Search className={`${className} text-teal-600 dark:text-teal-400`} {...props} />
  }

  // Paid Channels
  if (src.includes('google ads') || src.includes('googleads') || src.includes('gclid') || src.includes('ads')) {
    return <Megaphone className={`${className} text-blue-500 dark:text-blue-400`} {...props} />
  }

  // Social Channels
  if (src.includes('linkedin')) {
    return <Globe className={`${className} text-indigo-700 dark:text-indigo-400`} {...props} />
  }
  if (src.includes('facebook') || src.includes('meta') || src.includes('instagram')) {
    return <Globe className={`${className} text-pink-600 dark:text-pink-400`} {...props} />
  }
  if (src.includes('tiktok')) {
    return <Globe className={`${className} text-gray-900 dark:text-gray-100`} {...props} />
  }
  if (src.includes('reddit')) {
    return <Globe className={`${className} text-orange-500 dark:text-orange-400`} {...props} />
  }
  if (src.includes('twitter') || src.includes('x.com')) {
    return <Globe className={`${className} text-gray-900 dark:text-gray-100`} {...props} />
  }
  if (src.includes('youtube')) {
    return <Video className={`${className} text-red-600 dark:text-red-400`} {...props} />
  }

  // Other channels
  if (src.includes('email') || src.includes('newsletter')) {
    return <Mail className={`${className} text-yellow-600 dark:text-yellow-400`} {...props} />
  }
  if (src.includes('direct')) {
    return <MousePointer className={`${className} text-gray-600 dark:text-gray-400`} {...props} />
  }
  if (src.includes('referral')) {
    return <Globe className={`${className} text-amber-600 dark:text-amber-400`} {...props} />
  }

  // Fallbacks
  if (src === 'organic') return <Search className={`${className} text-green-600 dark:text-green-400`} {...props} />
  if (src === 'paid') return <Megaphone className={`${className} text-blue-500 dark:text-blue-400`} {...props} />
  if (src === 'email') return <Mail className={`${className} text-yellow-600 dark:text-yellow-400`} {...props} />
  if (src === 'unknown') return <Globe className={`${className} text-gray-400`} {...props} />

  return <Globe className={`${className} text-gray-400`} {...props} />
}

export function SourceChip({ source, className = "", ...props }) {
  if (!source) return null
  const src = source.trim()
  const lower = src.toLowerCase()

  // Assign background colors depending on category
  let bgClass = "bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-900/30 dark:border-gray-800 dark:text-gray-300"

  if (lower.includes('chatgpt') || lower.includes('openai')) {
    bgClass = "bg-emerald-50 border-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400"
  } else if (lower.includes('perplexity')) {
    bgClass = "bg-purple-50 border-purple-100 text-purple-800 dark:bg-purple-950/20 dark:border-purple-900/30 dark:text-purple-400"
  } else if (lower.includes('claude') || lower.includes('anthropic')) {
    bgClass = "bg-orange-50 border-orange-100 text-orange-800 dark:bg-orange-950/20 dark:border-orange-900/30 dark:text-orange-400"
  } else if (lower.includes('gemini') || lower.includes('google-ai')) {
    bgClass = "bg-blue-50 border-blue-100 text-blue-800 dark:bg-blue-950/20 dark:border-blue-900/30 dark:text-blue-400"
  } else if (lower.includes('google ads') || lower.includes('ads') || lower.includes('paid')) {
    bgClass = "bg-sky-50 border-sky-100 text-sky-800 dark:bg-sky-950/20 dark:border-sky-900/30 dark:text-sky-400"
  } else if (lower.includes('google') || lower.includes('organic')) {
    bgClass = "bg-green-50 border-green-100 text-green-800 dark:bg-green-950/20 dark:border-green-900/30 dark:text-green-400"
  } else if (lower.includes('email') || lower.includes('newsletter')) {
    bgClass = "bg-yellow-50 border-yellow-100 text-yellow-850 dark:bg-yellow-950/10 dark:border-yellow-900/20 dark:text-yellow-400"
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium ${bgClass} ${className}`} {...props}>
      <SourceIcon source={src} className="w-3.5 h-3.5" />
      {src}
    </span>
  )
}
