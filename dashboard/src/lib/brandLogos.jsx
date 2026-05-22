// Centralized brand SVG logos used on the Landing page (integrations, AI
// sources, traffic-source illustrations, etc). One place to update if a brand
// refreshes their mark. All logos render at h-5 or h-6 — sized via className.

// ── Ad platforms ─────────────────────────────────────────────────────────────

export const MetaLogo = ({ className = 'h-6 w-6' }) => (
  <svg viewBox="0 0 36 36" className={className}>
    <defs>
      <linearGradient id="meta-grad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#0064E1"/>
        <stop offset="100%" stopColor="#00B2FF"/>
      </linearGradient>
    </defs>
    <path d="M18.42 7.04c-4.45 0-7.92 4.55-10.43 9.28-1.92 3.6-3.7 6-5.32 6-1.27 0-1.97-1.06-1.97-2.86 0-3.4 1.74-6.7 3.92-6.7.92 0 1.7.36 2.55.96l1.41-2.65a6.7 6.7 0 0 0-4.4-1.65C1.78 9.42 0 13.85 0 19.6c0 3.93 1.96 6.4 4.6 6.4 2.5 0 4.41-1.61 6.62-5.62 1.94-3.55 3.34-5.65 4.94-5.65 1.7 0 2.5 1.18 3.62 3.42l3.31 6.83C24.46 28.07 26.13 30 28.96 30c3.5 0 5.04-2.4 5.04-6.27 0-5.7-2.7-13.69-15.58-16.69z" fill="url(#meta-grad)"/>
  </svg>
)

export const GoogleLogo = ({ className = 'h-6 w-6' }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

export const TikTokLogo = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.31 6.31 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.67a8.17 8.17 0 0 0 4.78 1.52V6.74a4.85 4.85 0 0 1-1.01-.05z" fill="#fff"/>
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-2.61v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-1.94-.75 2.89 2.89 0 0 0 2.78 2.13 2.89 2.89 0 0 0 2.88-2.5V3.36h.84a4.83 4.83 0 0 0 4.7 3.33z" fill="#25F4EE" opacity="0.7"/>
  </svg>
)

export const LinkedInLogo = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <rect width="24" height="24" rx="3" fill="#0A66C2"/>
    <path d="M7.2 9.8H4.6V19H7.2V9.8zM5.9 8.7c.9 0 1.5-.6 1.5-1.4C7.4 6.5 6.8 5.9 5.9 5.9 5.1 5.9 4.4 6.5 4.4 7.3c0 .8.6 1.4 1.5 1.4zM19.6 19h-2.6v-4.6c0-1.1 0-2.5-1.5-2.5-1.5 0-1.8 1.2-1.8 2.4V19H11V9.8h2.5v1.1h.1c.4-.7 1.2-1.3 2.5-1.3 2.7 0 3.2 1.8 3.2 4.1V19h-.7z" fill="white"/>
  </svg>
)

export const MicrosoftLogo = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 21 21" className={className}>
    <rect x="1"  y="1"  width="9" height="9" fill="#F25022"/>
    <rect x="11" y="1"  width="9" height="9" fill="#7FBA00"/>
    <rect x="1"  y="11" width="9" height="9" fill="#00A4EF"/>
    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
  </svg>
)

export const XLogo = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="#fff"/>
  </svg>
)

export const PinterestLogo = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <circle cx="12" cy="12" r="12" fill="#E60023"/>
    <path d="M12 5.3c-3.7 0-6.7 3-6.7 6.7 0 2.85 1.78 5.28 4.3 6.26-.06-.53-.11-1.35.02-1.93l.85-3.6s-.22-.43-.22-1.07c0-1 .58-1.74 1.3-1.74.62 0 .91.46.91 1.02 0 .62-.4 1.54-.6 2.4-.18.72.36 1.31 1.07 1.31 1.28 0 2.27-1.35 2.27-3.3 0-1.73-1.24-2.94-3.01-2.94-2.05 0-3.26 1.54-3.26 3.13 0 .62.24 1.28.54 1.65.06.07.07.13.05.2l-.2.84c-.04.13-.1.16-.24.1-.9-.42-1.46-1.73-1.46-2.78 0-2.26 1.64-4.34 4.74-4.34 2.48 0 4.41 1.77 4.41 4.14 0 2.47-1.55 4.45-3.71 4.45-.72 0-1.4-.38-1.64-.82l-.45 1.7c-.16.62-.59 1.4-.88 1.87C10.65 18.78 11.32 18.84 12 18.84c3.7 0 6.7-3 6.7-6.7s-3-6.7-6.7-6.7z" fill="white"/>
  </svg>
)

export const SnapchatLogo = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <rect width="24" height="24" rx="5" fill="#FFFC00"/>
    <path d="M12 5c2.49 0 4.5 2.01 4.5 4.5v1.85c.21-.1.4-.18.59-.18.78 0 1.4.4 1.4.94 0 .58-.67 1.06-1.5 1.06-.21 0-.4-.04-.59-.1-.1.69-.42 1.33-.91 1.85.42.6 1.1 1.04 1.97 1.18.27.04.42.21.4.42-.07.84-2.04 1.13-2.27 1.18-.07.4-.42.61-1.34.61-.51 0-1.09-.18-1.66-.18-.84 0-1.43.42-2.45.42-.99 0-1.6-.42-2.43-.42-.55 0-1.13.18-1.67.18-.94 0-1.27-.21-1.34-.61-.23-.05-2.2-.34-2.27-1.18-.02-.21.13-.38.4-.42.87-.14 1.55-.58 1.97-1.18-.49-.52-.81-1.16-.91-1.85-.19.06-.38.1-.59.1-.83 0-1.5-.48-1.5-1.06 0-.54.62-.94 1.4-.94.19 0 .38.08.59.18V9.5C7.5 7.01 9.51 5 12 5z" fill="#fff"/>
  </svg>
)

// ── E-commerce / platform ────────────────────────────────────────────────────

export const ShopifyLogo = ({ className = 'h-6 w-6' }) => (
  <svg viewBox="0 0 109 124" className={className}>
    <path d="M95.3 23.8c-.1-.7-.7-1.1-1.2-1.1-.5 0-9.7-.2-9.7-.2s-7.7-7.5-8.5-8.3c-.8-.8-2.4-.6-3-.4-.1 0-1.7.5-4.3 1.3C65.8 10.4 61.9 7 57 7c-.1 0-.2 0-.3 0C55.6 5.6 53.7 5 51.8 5c-14.2.4-21 17.8-23.1 26.8-5.5 1.7-9.4 2.9-9.8 3-.5.2-2.8.9-2.9 3.3L12 97.4 79.4 110l38.6-8.3L95.3 23.8z" fill="#96BF48"/>
    <path d="M94.1 22.7c-.5 0-9.7-.2-9.7-.2s-7.7-7.5-8.5-8.3c-.3-.3-.7-.4-1.1-.5l-5.8 118.3 38.6-8.3L95.3 23.8c-.2-.7-.7-.5-1.2-1.1z" fill="#5E8E3E"/>
    <path d="M57 60.2l-4.7 14.1s-4.2-2.2-9.3-2.2c-7.5 0-7.9 4.7-7.9 5.9 0 6.5 16.9 9 16.9 24.2 0 12-7.6 19.7-17.8 19.7-12.3 0-18.5-7.6-18.5-7.6l3.3-10.8s6.4 5.5 11.8 5.5c3.5 0 5-2.8 5-4.8 0-8.4-13.9-8.8-13.9-22.7 0-11.7 8.4-23 25.3-23 6.5 0 9.8 1.9 9.8 1.9z" fill="white"/>
  </svg>
)

export const StripeLogo = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 60 25" className={className}>
    <path fillRule="evenodd" clipRule="evenodd" d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.25c0-1.85-1.07-2.58-2.08-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V6.27h3.76l.08 1.02a4.7 4.7 0 0 1 3.23-1.29c2.9 0 5.62 2.6 5.62 7.4 0 5.23-2.7 6.9-5.65 6.9zm-.95-10.9c-.94 0-1.64.31-2.04.73l.02 5.48c.35.31.9.62 2.02.62 1.54 0 2.59-1.7 2.59-3.39 0-1.92-.92-3.44-2.59-3.44zM28.24 5v3.52l-4.13.88V5zm-4.13 15.25V6.27h4.13v13.98h-4.13zm-4.52 0h-4.13V6.27h4.14v2.02c.94-1.44 2.56-2.3 4.18-2.3v4.05c-.35-.04-.7-.06-1.06-.06-1.2 0-2.7.5-3.13 1.42v8.85zM9.29 20.3c-1.96 0-3.14-.54-3.97-1.02l.01 5.5-4.12.87V6.27h3.76l.08 1.02a4.53 4.53 0 0 1 3.3-1.29c2.9 0 5.63 2.6 5.63 7.4 0 5.23-2.71 6.9-5.69 6.9zm-.97-10.9c-.9 0-1.64.35-2.03.73l.01 5.48c.37.31.92.62 2.05.62 1.52 0 2.58-1.7 2.58-3.39 0-1.92-.94-3.44-2.61-3.44z" fill="#635BFF"/>
  </svg>
)

export const WebflowLogo = ({ className = 'h-6 w-6' }) => (
  <svg viewBox="0 0 256 256" className={className}>
    <path d="M190.5 60H65.5C56.9 60 50 66.9 50 75.5v105c0 8.6 6.9 15.5 15.5 15.5h125c8.6 0 15.5-6.9 15.5-15.5v-105c0-8.6-6.9-15.5-15.5-15.5z" fill="#4353FF"/>
    <path d="M166.5 108.5l-20 47.5L129 113.5 111.5 156l-20-47.5H75l36 75 18.5-42.5L148 183.5l36-75h-17.5z" fill="white"/>
  </svg>
)

export const WooCommerceLogo = ({ className = 'h-5 w-auto' }) => (
  <svg viewBox="0 0 250 90" className={className}>
    <rect width="250" height="90" rx="12" fill="#7F54B3"/>
    <text x="18" y="62" fill="white" fontSize="52" fontWeight="900" fontFamily="Arial, sans-serif">Woo</text>
  </svg>
)

export const WordPressLogo = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <circle cx="12" cy="12" r="12" fill="#21759B"/>
    <path d="M2.2 12c0 4.3 2.5 8.1 6.1 9.9L3 7.4C2.5 8.8 2.2 10.4 2.2 12zm17.3-.5c0-1.3-.5-2.3-1-3-.6-.9-1.1-1.7-1.1-2.6 0-1 .8-2 1.9-2h.1a9.8 9.8 0 0 0-14.8.7h.7c1.2 0 3-.1 3-.1.6 0 .7.9.1.9 0 0-.6.1-1.3.1L10.5 18l2.3-6.8-1.6-4.4c-.6 0-1.1-.1-1.1-.1-.6 0-.5-1 .1-1 0 0 1.8.1 2.9.1 1.2 0 3-.1 3-.1.6 0 .7.9.1.9 0 0-.6.1-1.3.1l2.6 7.7.7-2.4c.3-1 .5-1.7.5-2.3zm-6.4 1.3l-2.2 6.4c.7.2 1.4.3 2.1.3.9 0 1.7-.1 2.5-.4l-.1-.2-2.3-6.1zm5.4-10A9.8 9.8 0 0 1 21.8 12a9.8 9.8 0 0 1-5 8.6l3.1-9c.6-1.4.8-2.5.8-3.5 0-.4 0-.7-.1-1.3z" fill="white"/>
  </svg>
)

// ── AI platforms ─────────────────────────────────────────────────────────────

export const OpenAILogo = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M22.28 9.82a5.97 5.97 0 0 0-.51-4.91 6.04 6.04 0 0 0-6.5-2.9A6.07 6.07 0 0 0 4.98 4.18a5.97 5.97 0 0 0-3.98 2.9 6.05 6.05 0 0 0 .74 7.1 5.97 5.97 0 0 0 .51 4.91 6.04 6.04 0 0 0 6.5 2.9 5.97 5.97 0 0 0 4.5 2.01 6.04 6.04 0 0 0 5.79-4.23 5.97 5.97 0 0 0 3.98-2.9 6.04 6.04 0 0 0-.74-7.05zm-9.06 12.66a4.48 4.48 0 0 1-2.87-1.04l.14-.08 4.78-2.76a.78.78 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.5 4.5zM3.56 18.16a4.47 4.47 0 0 1-.54-3.02l.14.08 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.07.07 0 0 1-.03.06l-4.83 2.79a4.5 4.5 0 0 1-6.14-1.63zM2.3 7.7a4.47 4.47 0 0 1 2.36-1.97V11.39a.77.77 0 0 0 .39.68l5.81 3.36-2.02 1.16a.07.07 0 0 1-.07 0l-4.83-2.8a4.5 4.5 0 0 1-1.64-6.14zm16.6 3.86l-5.84-3.39 2.02-1.16a.07.07 0 0 1 .07 0l4.83 2.79a4.5 4.5 0 0 1-.68 8.12v-5.69a.77.77 0 0 0-.4-.67zm2-3.02l-.14-.08-4.77-2.78a.78.78 0 0 0-.78 0L9.36 9.05V6.72a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.26 12.65l-2.02-1.17a.07.07 0 0 1-.04-.06V5.85a4.5 4.5 0 0 1 7.38-3.46l-.14.08-4.78 2.76a.78.78 0 0 0-.39.68zm1.1-2.37l2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5z" fill="#fff"/>
  </svg>
)

export const AnthropicLogo = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M4.7 19.2L9.6 5.6h2.83l4.9 13.6h-2.65l-1.2-3.42H8.55l-1.2 3.42H4.7zm4.7-5.93h3.16l-1.58-4.55-1.58 4.55zM18.93 19.2L14.04 5.6h-2.03l4.88 13.6h2.04z" fill="#D97757"/>
  </svg>
)

export const PerplexityLogo = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <rect width="24" height="24" rx="5" fill="#1FB8CD"/>
    <path d="M12 4l7 4v8l-7 4-7-4V8z" fill="none" stroke="#fff" strokeWidth="1.5"/>
    <path d="M12 8v8M8 10l8 4M16 10l-8 4" stroke="#fff" strokeWidth="1.2"/>
  </svg>
)

export const GeminiLogo = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <defs>
      <linearGradient id="gem-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#4796E3"/>
        <stop offset="50%" stopColor="#8C46E3"/>
        <stop offset="100%" stopColor="#E347B6"/>
      </linearGradient>
    </defs>
    <path d="M12 2C12 6 8 10 4 10 8 10 12 14 12 22 12 14 16 10 20 10 16 10 12 6 12 2z" fill="url(#gem-grad)"/>
  </svg>
)

export const GrokLogo = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <rect width="24" height="24" rx="5" fill="#000"/>
    <path d="M5 18l4.5-6L5 6h2.5L11 11l3.5-5H17l-4.5 6L17 18h-2.5L11 13l-3.5 5H5z" fill="#fff"/>
  </svg>
)

export const CopilotLogo = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M12 3c4.5 0 8 2 8 5v3c1.7 0 3 1.3 3 3v3c0 1.7-1.3 3-3 3H4c-1.7 0-3-1.3-3-3v-3c0-1.7 1.3-3 3-3V8c0-3 3.5-5 8-5zm-3 9c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1zm6 0c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" fill="#2BB4F2"/>
  </svg>
)

export const DeepSeekLogo = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <circle cx="12" cy="12" r="11" fill="#4D6BFE"/>
    <path d="M7 11c.5-2 2.5-3.5 5-3.5 3 0 5.5 2 5.5 4.5 0 1.2-.5 2.3-1.3 3.1.4-.4.7-.9.7-1.6 0-1.5-1.5-2.7-3.4-2.7-1.5 0-2.8.8-3.4 1.9-.5-.5-1.4-.8-2.1-.8-.4 0-.7.1-1 .1z" fill="#fff"/>
    <circle cx="10" cy="13" r="1" fill="#fff"/>
  </svg>
)

// ── Traffic source category icons ────────────────────────────────────────────
// Used to illustrate the channels SourceTrack attributes (Paid Search, Paid
// Social, Organic Search, Referral, Direct, Email). Distinct from specific
// brand logos — these represent categories.

export const PaidSearchIcon = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <circle cx="11" cy="11" r="6" stroke="#60A5FA" strokeWidth="2"/>
    <path d="M16 16l4 4" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="11" cy="11" r="2.5" fill="#60A5FA"/>
  </svg>
)

export const PaidSocialIcon = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <circle cx="6.5" cy="9" r="2.5" fill="#F472B6"/>
    <circle cx="17.5" cy="9" r="2.5" fill="#F472B6"/>
    <path d="M6.5 13c-2.5 0-4 1.5-4 3.5V19h8v-2.5c0-2-1.5-3.5-4-3.5zM17.5 13c-2.5 0-4 1.5-4 3.5V19h8v-2.5c0-2-1.5-3.5-4-3.5z" fill="#F472B6"/>
  </svg>
)

export const OrganicSearchIcon = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <circle cx="11" cy="11" r="6" stroke="#34D399" strokeWidth="2"/>
    <path d="M16 16l4 4" stroke="#34D399" strokeWidth="2" strokeLinecap="round"/>
    <path d="M8 11h6M11 8v6" stroke="#34D399" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

export const ReferralIcon = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <path d="M7 17L17 7M17 7H10M17 7v7" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="6" cy="18" r="2.5" fill="#A78BFA"/>
    <circle cx="18" cy="6" r="2.5" fill="#A78BFA"/>
  </svg>
)

export const DirectIcon = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <path d="M12 4l8 8-8 8-8-8z" stroke="#FBBF24" strokeWidth="2" strokeLinejoin="round"/>
    <circle cx="12" cy="12" r="2.5" fill="#FBBF24"/>
  </svg>
)

export const EmailIcon = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <rect x="3" y="6" width="18" height="13" rx="2" stroke="#F87171" strokeWidth="2"/>
    <path d="M3 8l9 6 9-6" stroke="#F87171" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
)

// ── Curated registries ───────────────────────────────────────────────────────

// Logo lookup by integration name — used in the "Integrates with everything" section.
export const INTEGRATION_LOGOS = {
  'Meta Ads':      MetaLogo,
  'Google Ads':    GoogleLogo,
  'TikTok Ads':    TikTokLogo,
  'LinkedIn Ads':  LinkedInLogo,
  'Microsoft Ads': MicrosoftLogo,
  'Shopify':       ShopifyLogo,
  'WooCommerce':   WooCommerceLogo,
  'Webflow':       WebflowLogo,
  'WordPress':     WordPressLogo,
  'Stripe':        StripeLogo,
}

// AI platform display data — name + logo + dot colour for badges.
export const AI_PLATFORMS = [
  { name: 'ChatGPT',    Logo: OpenAILogo,    bg: 'bg-emerald-500/10', text: 'text-emerald-300', dot: 'bg-emerald-500' },
  { name: 'Claude',     Logo: AnthropicLogo, bg: 'bg-orange-500/10',  text: 'text-orange-300',  dot: 'bg-orange-500' },
  { name: 'Perplexity', Logo: PerplexityLogo,bg: 'bg-cyan-500/10',    text: 'text-cyan-300',    dot: 'bg-cyan-500' },
  { name: 'Gemini',     Logo: GeminiLogo,    bg: 'bg-blue-500/10',    text: 'text-blue-300',    dot: 'bg-blue-500' },
  { name: 'Grok',       Logo: GrokLogo,      bg: 'bg-white/10',       text: 'text-white/80',    dot: 'bg-white' },
  { name: 'Copilot',    Logo: CopilotLogo,   bg: 'bg-sky-500/10',     text: 'text-sky-300',     dot: 'bg-sky-500' },
  { name: 'DeepSeek',   Logo: DeepSeekLogo,  bg: 'bg-indigo-500/10',  text: 'text-indigo-300',  dot: 'bg-indigo-500' },
]

// Traffic-source category lookup for the channel illustration.
export const TRAFFIC_CATEGORY_ICONS = {
  'Paid Search':    PaidSearchIcon,
  'Paid Social':    PaidSocialIcon,
  'Organic Search': OrganicSearchIcon,
  'Referral':       ReferralIcon,
  'Direct':         DirectIcon,
  'Email':          EmailIcon,
}
