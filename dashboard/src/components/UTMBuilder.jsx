import { useState } from 'react'
import { Copy, Check, X } from 'lucide-react'

export default function UTMBuilder() {
  const [url, setUrl] = useState('')
  const [source, setSource] = useState('')
  const [medium, setMedium] = useState('')
  const [campaign, setCampaign] = useState('')
  const [content, setContent] = useState('')
  const [term, setTerm] = useState('')
  const [copied, setCopied] = useState(false)

  const params = new URLSearchParams()
  if (source) params.set('utm_source', source)
  if (medium) params.set('utm_medium', medium)
  if (campaign) params.set('utm_campaign', campaign)
  if (content) params.set('utm_content', content)
  if (term) params.set('utm_term', term)

  const taggedUrl = url && params.toString()
    ? `${url}${url.includes('?') ? '&' : '?'}${params.toString()}`
    : url || ''

  function handleCopy() {
    if (!taggedUrl) return
    navigator.clipboard.writeText(taggedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleClear() {
    setUrl('')
    setSource('')
    setMedium('')
    setCampaign('')
    setContent('')
    setTerm('')
  }

  const inputClass = "w-full px-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-st-black/20 dark:focus:ring-white/20"

  function onBlurLower(setter) {
    return (e) => setter(e.target.value.trim().toLowerCase())
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-st-gray dark:text-gray-400 mb-1">Destination URL</label>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value.trim())}
          onBlur={e => setUrl(e.target.value.trim())}
          placeholder="https://yoursite.com/landing-page"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-st-gray dark:text-gray-400 mb-1">utm_source</label>
          <input
            type="text"
            value={source}
            onChange={e => setSource(e.target.value)}
            onBlur={onBlurLower(setSource)}
            placeholder="google"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-st-gray dark:text-gray-400 mb-1">utm_medium</label>
          <input
            type="text"
            value={medium}
            onChange={e => setMedium(e.target.value)}
            onBlur={onBlurLower(setMedium)}
            placeholder="cpc"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-st-gray dark:text-gray-400 mb-1">utm_campaign</label>
        <input
          type="text"
          value={campaign}
          onChange={e => setCampaign(e.target.value)}
          onBlur={onBlurLower(setCampaign)}
          placeholder="summer-sale-2025"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-st-gray dark:text-gray-400 mb-1">utm_content <span className="text-gray-400">(optional)</span></label>
          <input
            type="text"
            value={content}
            onChange={e => setContent(e.target.value)}
            onBlur={onBlurLower(setContent)}
            placeholder="banner-top"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-st-gray dark:text-gray-400 mb-1">utm_term <span className="text-gray-400">(optional)</span></label>
          <input
            type="text"
            value={term}
            onChange={e => setTerm(e.target.value)}
            onBlur={onBlurLower(setTerm)}
            placeholder="running+shoes"
            className={inputClass}
          />
        </div>
      </div>

      {taggedUrl && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <p className="text-xs text-st-gray dark:text-gray-400 mb-1">Tagged URL</p>
          <p className="text-xs text-st-black dark:text-white break-all font-mono">{taggedUrl}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          disabled={!taggedUrl}
          className="flex items-center gap-1.5 px-4 py-2 bg-st-black dark:bg-white text-white dark:text-st-black text-sm font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-40 transition-colors"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          onClick={handleClear}
          className="px-4 py-2 text-sm text-st-gray dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
