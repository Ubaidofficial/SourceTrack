import { useState } from 'react'

// Brand logo in a white rounded "app-icon" chip. Platform cards use variant="card"
// (34px), the sidebar uses variant="sidebar" (15px, greyscale to stay calm).
//
// PRIVACY (non-negotiable, this is a privacy product): logos load ONLY from
// logo.dev, gated on VITE_LOGODEV_TOKEN. We NEVER fall back to Google's favicon
// service (or any third party) — that would leak the visitor's IP. No token, or a
// load error, → an inline monochrome glyph (first letter of the platform name),
// never an empty box, never a network call.
const SIZES = {
  card: { chip: 'w-[34px] h-[34px]', img: 'w-[22px] h-[22px]', text: 'text-sm' },
  sidebar: { chip: 'w-[15px] h-[15px]', img: 'w-[11px] h-[11px]', text: 'text-[8px]' }
}

function logoUrl(domain, greyscale) {
  const token = import.meta.env.VITE_LOGODEV_TOKEN
  if (!token || !domain) return null
  const params = new URLSearchParams({ token, size: '80', format: 'png', retina: 'true' })
  if (greyscale) params.set('greyscale', 'true')
  return `https://img.logo.dev/${domain}?${params.toString()}`
}

export default function LogoChip({ domain, name = '', variant = 'card' }) {
  const size = SIZES[variant] || SIZES.card
  const greyscale = variant === 'sidebar'
  const src = logoUrl(domain, greyscale)
  const [failed, setFailed] = useState(false)
  const showGlyph = !src || failed
  const glyph = (name || domain || '?').trim().charAt(0).toUpperCase()

  return (
    <span
      className={`${size.chip} shrink-0 inline-flex items-center justify-center rounded-[7px] bg-white ring-1 ring-gray-200 dark:ring-black/20 overflow-hidden`}
      aria-hidden={showGlyph ? 'true' : undefined}
    >
      {showGlyph ? (
        <span className={`${size.text} font-black text-gray-500 leading-none`}>{glyph}</span>
      ) : (
        <img
          src={src}
          alt={name ? `${name} logo` : ''}
          loading="lazy"
          width={variant === 'card' ? 22 : 11}
          height={variant === 'card' ? 22 : 11}
          className={`${size.img} object-contain`}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}
