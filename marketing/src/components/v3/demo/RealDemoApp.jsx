// RealDemoApp.jsx - Consolidated 8-screen Interactive Demo Workspace
// SSR-safe, client-hydrated ESM React component.
// Generated from prototype handoff.

import React, { useState, useEffect, useRef, useMemo } from 'react';

import '@/styles/demo-avatars.css';
import '@/styles/demo-workspace.css';
import '@/styles/demo-figma.css';
import '@/styles/demo-dashboard.css';

// --- State and hook aliases to preserve prototype code names ---
const uS = useState, uE = useEffect, uR = useRef, uM = useMemo;
const lvS = useState, lvE = useEffect, lvR = useRef;
const sS = useState, sE = useEffect;


// ==================== FROM brand-icons.jsx ====================
// Brand marks for traffic sources and integrations.
// <BrandIcon src="stripe" size={18} /> renders a rounded tile with the mark.
// Simplified, recognizable geometry in each brand's own colours — used at
// 16–38px, where full logo detail would disappear anyway.

function BrandIcon({ src, size = 18 }) {
  const s = size, r = Math.round(s * 0.28);
  const M = MARKS[ALIAS[src] || src];
  if (!M) {
    return (
      <span style={{ width:s, height:s, borderRadius:r, background:'#586161', display:'inline-grid', placeItems:'center', flexShrink:0, color:'#fff', fontSize:Math.round(s*0.42), fontWeight:900, letterSpacing:'-.02em' }}>
        {(src || '?').replace(/[^a-z]/gi, '').substring(0, 2).toUpperCase()}
      </span>
    );
  }
  const inner = M.full ? s : Math.round(s * (M.scale || 0.64));
  return (
    <span style={{ width:s, height:s, borderRadius:r, background:M.bg, display:'inline-grid', placeItems:'center', flexShrink:0, overflow:'hidden', boxShadow: M.bg === '#FFFFFF' ? 'inset 0 0 0 1px rgba(0,0,0,.08)' : 'none' }}>
      <svg viewBox="0 0 24 24" width={inner} height={inner} aria-hidden="true">{M.m}</svg>
    </span>
  );
}

const W = '#FFFFFF';
const MARKS = {
  /* ---------- search + ads ---------- */
  google: { bg:W, scale:.72, m:<g>
    <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4c-.2 1.2-1 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z"/>
    <path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.2v2.6C4.9 19.8 8.2 22 12 22z"/>
    <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-1.9s.1-1.3.3-1.9V7.6H3.2A9.9 9.9 0 0 0 2 12.1c0 1.6.4 3.2 1.2 4.5l3.2-2.6z"/>
    <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 3 14.7 2 12 2 8.2 2 4.9 4.2 3.2 7.6l3.2 2.6C7.2 7.8 9.4 6 12 6z"/></g> },
  'google-ads': { bg:W, scale:.74, m:<g>
    <path fill="#FBBC04" d="M2.6 16.3 9.3 4.7a2.6 2.6 0 0 1 4.5 2.6L7.1 18.9a2.6 2.6 0 0 1-4.5-2.6z"/>
    <path fill="#4285F4" d="M21.4 16.3 14.7 4.7a2.6 2.6 0 0 0-4.5 2.6l6.7 11.6a2.6 2.6 0 0 0 4.5-2.6z"/>
    <circle cx="5.2" cy="17.9" r="2.7" fill="#34A853"/></g> },
  'google-analytics': { bg:W, scale:.72, m:<g>
    <rect x="15.5" y="3" width="5.5" height="18" rx="2.7" fill="#F9AB00"/>
    <rect x="9.2" y="9" width="5.5" height="12" rx="2.7" fill="#E37400"/>
    <circle cx="5.4" cy="18.2" r="2.8" fill="#E37400"/></g> },
  bing: { bg:'#0C7C9E', scale:.6, m:<path fill={W} d="M6 3l4.2 1.5v11.2l4.4-2.6-2.2-1-1.3-3.3 7 2.6v4.2L10.2 21 6 18.6V3z"/> },
  duckduckgo: { bg:'#DE5833', scale:.72, m:<g>
    <circle cx="12" cy="12" r="9.5" fill="#DE5833"/><path fill={W} d="M12 5.4c3.2 0 5.2 2.2 5.2 5 0 2-1 3-1 4.6 0 1.4.6 2.8 1.3 4.1H8.2c1-1.7 1.4-3.2 1.1-5.4-.2-1.5-1-2.4-1-4 0-2.6 1.8-4.3 3.7-4.3z"/>
    <circle cx="10.4" cy="9.4" r="1" fill="#DE5833"/></g> },
  yahoo: { bg:'#5F01D1', scale:.6, m:<path fill={W} d="M3.4 6.6h3.7l2.7 4.6 2.7-4.6h3.6l-5.1 8.5V20H8.5v-4.9L3.4 6.6zm14.2 9.7h2.6V20h-2.6v-3.7zm.3-9.7h2.6l-1 6.6h-1.9l-.9-6.6h1.2z"/> },

  /* ---------- social ---------- */
  meta: { bg:W, scale:.78, m:<g>
    <path fill="#0081FB" d="M4.3 15.4c0-2.9 1.5-6.6 3.5-6.6 1.1 0 1.9.7 3.1 2.5l1.4 2.2-1.3 2c-1.6 2.5-2.7 3.5-4.2 3.5-1.6 0-2.5-1.4-2.5-3.6zm12-6.6c1.9 0 3.4 3.4 3.4 6.4 0 2.4-.9 3.8-2.5 3.8-1.4 0-2.3-.9-3.9-3.4l-.9-1.4 1-1.6c1.4-2.2 2.3-3.8 2.9-3.8z" opacity=".92"/>
    <path fill="#0064E0" d="M7.8 6.6c2.4 0 4 1.6 5.9 4.6l.5.8-1 1.6-1.4-2.2C10.6 9.5 9.8 8.8 8.7 8.8c-2 0-3.5 3.7-3.5 6.6H2.4c0-4.9 2.4-8.8 5.4-8.8zm8.5 0c3 0 5.4 3.7 5.4 8.6h-2.6c0-3-1.5-6.4-3.4-6.4-.6 0-1.5 1.6-2.9 3.8l-.6-1c1.7-2.9 2.6-5 4.1-5z"/></g> },
  facebook: { bg:'#1877F2', scale:.62, m:<path fill={W} d="M14.3 21v-8h2.8l.4-3.3h-3.2V7.6c0-.9.3-1.6 1.6-1.6h1.7V3c-.3 0-1.3-.1-2.4-.1-2.4 0-4.1 1.5-4.1 4.2v2.6H8.2V13h2.9v8h3.2z"/> },
  instagram: { bg:'linear-gradient(45deg,#FEDA77,#F58529 25%,#DD2A7B 55%,#8134AF 80%,#515BD4)', scale:.62, m:<g fill="none" stroke={W} strokeWidth="2.1">
    <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".2" strokeWidth="2.4"/></g> },
  linkedin: { bg:'#0A66C2', scale:.62, m:<path fill={W} d="M6.9 8.6H4.1V20h2.8V8.6zM5.5 3.9a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM20 13.6c0-3-1.6-4.4-3.7-4.4-1.7 0-2.5.9-2.9 1.6V8.6H10.6c0 .8 0 11.4 0 11.4h2.8v-6.2c0-.3 0-.6.1-.9.3-.7.9-1.4 1.9-1.4 1.3 0 1.8 1 1.8 2.5V20H20v-6.4z"/> },
  tiktok: { bg:'#010101', scale:.62, m:<g>
    <path fill="#25F4EE" d="M9.4 9.6v2.6a3.6 3.6 0 0 0-1 7v-2.7a1.1 1.1 0 0 1 1-1.9V9.6z"/>
    <path fill="#FE2C55" d="M13.4 3h-1.7c.3 1.9 1.4 3.4 3.1 4.2v2.6a7.3 7.3 0 0 1-3.1-.9v5.6a5.2 5.2 0 0 1-3.3 4.7 5.2 5.2 0 0 0 6.4-5V8.6a7.3 7.3 0 0 0 3.4.9V6.8c-2.7-.2-4.5-1.6-4.8-3.8z"/>
    <path fill={W} d="M11.7 3H9.4v11.5a1.1 1.1 0 0 1-2.1.6 1.1 1.1 0 0 1 .8-1.7v-2.7a3.6 3.6 0 0 0 .6 7.2 3.6 3.6 0 0 0 3.6-3.6V9.5a7.3 7.3 0 0 0 3.4.9V7.2C13.6 6.5 12.3 5 11.7 3z"/></g> },
  youtube: { bg:'#FF0000', scale:.68, m:<g>
    <rect x="2.5" y="5.6" width="19" height="12.8" rx="3.6" fill="#FF0000"/><path fill={W} d="M10.2 8.8v6.4l5.5-3.2z"/></g> },
  x: { bg:'#000000', scale:.56, m:<path fill={W} d="M17.6 3h3.2l-7 8 7.4 10h-5.9l-4.2-5.6L6.1 21H2.9l7.3-8.4L3.1 3h6l3.9 5.3L17.6 3zm-1.1 16h1.7L7.4 4.8H5.6L16.5 19z"/> },
  reddit: { bg:'#FF4500', scale:.72, m:<g>
    <circle cx="12" cy="13.4" r="8" fill={W}/><circle cx="9.4" cy="13" r="1.2" fill="#FF4500"/><circle cx="14.6" cy="13" r="1.2" fill="#FF4500"/>
    <path d="M9.3 16.2c1.5 1.2 4 1.2 5.5 0" stroke="#FF4500" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
    <circle cx="16.4" cy="5" r="1.8" fill={W}/><path d="M16 5.4 13.3 12" stroke={W} strokeWidth="1.2"/></g> },

  /* ---------- AI ---------- */
  chatgpt: { bg:'#000000', scale:.8, m:<g fill="none" stroke={W} strokeWidth="1.9" strokeLinejoin="round">
    <g transform="rotate(0 12 12)"><ellipse cx="12" cy="12" rx="4.2" ry="8.8"/></g>
    <g transform="rotate(60 12 12)"><ellipse cx="12" cy="12" rx="4.2" ry="8.8"/></g>
    <g transform="rotate(120 12 12)"><ellipse cx="12" cy="12" rx="4.2" ry="8.8"/></g></g> },
  claude: { bg:'#D97757', scale:.76, m:<g fill={W}>
    <g transform="rotate(0 12 12)"><path d="M12 12.6 10.55 3.2a1.45 1.45 0 0 1 2.9 0z"/></g>
    <g transform="rotate(32.7 12 12)"><path d="M12 12.6 10.55 3.2a1.45 1.45 0 0 1 2.9 0z"/></g>
    <g transform="rotate(65.5 12 12)"><path d="M12 12.6 10.55 3.2a1.45 1.45 0 0 1 2.9 0z"/></g>
    <g transform="rotate(98.2 12 12)"><path d="M12 12.6 10.55 3.2a1.45 1.45 0 0 1 2.9 0z"/></g>
    <g transform="rotate(130.9 12 12)"><path d="M12 12.6 10.55 3.2a1.45 1.45 0 0 1 2.9 0z"/></g>
    <g transform="rotate(163.6 12 12)"><path d="M12 12.6 10.55 3.2a1.45 1.45 0 0 1 2.9 0z"/></g>
    <g transform="rotate(196.4 12 12)"><path d="M12 12.6 10.55 3.2a1.45 1.45 0 0 1 2.9 0z"/></g>
    <g transform="rotate(229.1 12 12)"><path d="M12 12.6 10.55 3.2a1.45 1.45 0 0 1 2.9 0z"/></g>
    <g transform="rotate(261.8 12 12)"><path d="M12 12.6 10.55 3.2a1.45 1.45 0 0 1 2.9 0z"/></g>
    <g transform="rotate(294.5 12 12)"><path d="M12 12.6 10.55 3.2a1.45 1.45 0 0 1 2.9 0z"/></g>
    <g transform="rotate(327.3 12 12)"><path d="M12 12.6 10.55 3.2a1.45 1.45 0 0 1 2.9 0z"/></g></g> },
  gemini: { bg:W, scale:.74, m:<g>
    <defs><linearGradient id="gm" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#4E7FEE"/><stop offset="50%" stopColor="#8C6FE8"/><stop offset="100%" stopColor="#D96570"/></linearGradient></defs>
    <path fill="url(#gm)" d="M12 2c.7 5.2 4.1 8.6 9.3 9.3-5.2.7-8.6 4.1-9.3 9.3-.7-5.2-4.1-8.6-9.3-9.3C7.9 10.6 11.3 7.2 12 2z"/></g> },
  perplexity: { bg:'#20808D', scale:.72, m:<g fill="none" stroke={W} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.6v16.8"/>
    <path d="M12 9.2 5.9 4.4v9.5h12.2V4.4L12 9.2z"/>
    <path d="M5.9 14.5v5.1L12 14.8l6.1 4.8v-5.1"/></g> },
  copilot: { bg:'#0F6CBD', scale:.76, m:<g fill="none" stroke={W} strokeWidth="1.9" strokeLinecap="round">
    <path d="M4.2 15.4c0-4.4 1.7-8 4.6-8 2.1 0 3 1.6 3.6 3.6l1 3.4c.6 2.1 1.6 3.6 3.5 3.6 2.4 0 3.4-2.4 3.4-5"/>
    <path d="M19.8 12.2c0-4-1.6-6.6-4-6.6-2.1 0-3.1 1.7-3.7 3.8l-1 3.4c-.6 2-1.5 3.6-3.5 3.6-2.3 0-3.4-2.2-3.4-4.6"/></g> },
  deepseek: { bg:'#4D6BFE', scale:.72, m:<g fill="none" stroke={W} strokeWidth="1.7" strokeLinecap="round">
    <path d="M4 9c3.6-1.4 6.6.4 8.2 3.2 1.3 2.2 3.4 2.9 5.6 2.2"/><circle cx="9.4" cy="12.6" r="1.3" fill={W} stroke="none"/><path d="M18.4 7.6 20 9.2"/></g> },
  grok: { bg:'#000000', scale:.6, m:<path fill={W} d="M5.4 4h3.4l5.4 7.1L20 4h1.8l-6.7 8.6L21.4 20h-3.5l-4.9-6.4L7.4 20H5.6l6.2-8-6.4-8z"/> },
  cursor: { bg:'#000000', scale:.66, m:<path fill={W} d="M6 3.4 18.6 12 6 20.6V3.4zm2 3.8v9.6l7-4.8-7-4.8z"/> },

  /* ---------- CRM + forms + chat ---------- */
  hubspot: { bg:'#FF7A59', scale:.68, m:<g fill={W}>
    <circle cx="17.4" cy="6.4" r="2.4"/><circle cx="8.4" cy="17" r="4"/><path d="M12.2 6.2h1.8v6.4h-1.8z"/><path d="M13.4 12.2l3.2-3.6 1.3 1.2-3.2 3.6z"/><circle cx="13.1" cy="4.4" r="1.5"/></g> },
  salesforce: { bg:'#00A1E0', scale:.76, m:<path fill={W} d="M9.8 7.4a3.4 3.4 0 0 1 5.6-.9 4.1 4.1 0 0 1 5.5 4 3.5 3.5 0 0 1-1.6 6.6H8a4.3 4.3 0 0 1-4.3-4.3 4.3 4.3 0 0 1 3.2-4.2c.2-.5.5-.9.9-1.2z"/> },
  pipedrive: { bg:'#017737', scale:.62, m:<path fill={W} d="M9.6 4.2v1.6a4.2 4.2 0 0 1 3.4-1.7c3 0 5.2 2.5 5.2 6s-2.3 6.1-5.4 6.1c-1.4 0-2.5-.5-3.1-1.3V21H6.5V4.2h3.1zm2.6 2.7c-1.6 0-2.7 1.3-2.7 3.2s1.1 3.2 2.7 3.2c1.6 0 2.7-1.3 2.7-3.2s-1-3.2-2.7-3.2z"/> },
  attio: { bg:'#1C1C1C', scale:.62, m:<g fill={W}><circle cx="8.4" cy="8.4" r="3.2"/><circle cx="15.6" cy="15.6" r="3.2" opacity=".7"/><path d="M8.4 12.8h1.8v4.4a1.8 1.8 0 0 1-1.8 1.8H4v-1.8h4.4v-4.4z"/></g> },
  intercom: { bg:'#1F8DED', scale:.66, m:<g fill={W}>
    <rect x="4" y="4" width="2" height="12" rx="1"/><rect x="8" y="3" width="2" height="14" rx="1"/><rect x="14" y="3" width="2" height="14" rx="1"/><rect x="18" y="4" width="2" height="12" rx="1"/>
    <path d="M5 17.4c4.4 2.4 9.6 2.4 14 0l1 1.6c-5 2.8-11 2.8-16 0l1-1.6z"/></g> },
  crisp: { bg:'#1972F5', scale:.64, m:<path fill={W} d="M4 6.2A2.2 2.2 0 0 1 6.2 4h11.6A2.2 2.2 0 0 1 20 6.2v7.6a2.2 2.2 0 0 1-2.2 2.2H10L5 20v-3.9A2.2 2.2 0 0 1 4 14.2V6.2zm4 3.4h8v1.8H8V9.6z"/> },
  tidio: { bg:'#368FF6', scale:.64, m:<path fill={W} d="M4.6 5.4h6.2c4.6 0 8.6 2.6 8.6 6.8 0 4-3.4 6.6-8 6.6H9.2L5 21v-3.6c-1.4-1.2-2.2-2.9-2.2-4.9 0-2.9 1.4-5 1.8-7.1z"/> },
  drift: { bg:'#0090E3', scale:.64, m:<path fill={W} d="M4.8 4h9.4c3 0 5 2 5 4.8 0 3.6-3 6.2-7.2 6.2H9.4L5.2 19v-4c-1.6-1-2.6-2.6-2.6-4.6 0-2.4 1-4.4 2.2-6.4z"/> },
  typeform: { bg:'#262627', scale:.62, m:<path fill={W} d="M4.4 5h15.2v3.4h-5.8V19h-3.6V8.4H4.4V5z"/> },
  webflow: { bg:'#146EF5', scale:.7, m:<path fill={W} d="M21 7.4l-4.4 9.2h-2.9l1.9-3.9c-1.5 2.1-3.7 3.5-6.8 3.9l1.6-3.4c1.9-.3 3.1-1.2 3.8-2.6l-2 4.1H9.4l1.8-3.7c-1.5 2-3.6 3.2-6.4 3.6L6.4 11c1.7-.3 2.8-1.1 3.5-2.4l-1.7 3.5H5.4L9.8 3h2.9l-2 4.1C12.2 5 14.3 3.8 17 3.4l-1.7 3.6c-1.6.3-2.7 1-3.4 2.2l2-4.1h2.8L15 8.9c1.6-2.1 3.7-3.4 6.6-3.7L21 7.4z"/> },
  jotform: { bg:'#FF6100', scale:.6, m:<path fill={W} d="M14.6 4h3.2v9.6c0 3.4-2 5.6-5.4 5.6-3.1 0-5-1.8-5.4-4.4l3.1-.6c.2 1.3.9 2 2.1 2 1.4 0 2.4-.9 2.4-2.7V4z"/> },
  gravityforms: { bg:'#F15A2B', scale:.66, m:<path fill={W} d="M12 3l7.4 4.2v9L12 20.4 4.6 16.2v-9L12 3zm0 3.4-4.4 2.5v5l4.4 2.5 4.4-2.5v-5L12 6.4z"/> },

  /* ---------- meetings ---------- */
  calendly: { bg:'#006BFF', scale:.7, m:<path fill={W} d="M12 4.2c3 0 5.2 1.6 6.2 4.1l-2.6.9c-.6-1.4-1.9-2.3-3.6-2.3-2.4 0-4.1 1.9-4.1 5s1.7 5 4.1 5c1.7 0 3-.9 3.6-2.3l2.6.9c-1 2.5-3.2 4.1-6.2 4.1-4.2 0-7.1-3.1-7.1-7.7S7.8 4.2 12 4.2z"/> },
  cal: { bg:'#111111', scale:.66, m:<path fill={W} d="M4 8.8h2.6v6.4H4V8.8zm4.4 3.2a3.8 3.8 0 1 1 7 2h-2.4a1.6 1.6 0 1 0 0-4h2.4a3.8 3.8 0 0 1-7 2zm8.6-3.2H20v6.4h-3V8.8z"/> },
  chilipiper: { bg:'#F05C4B', scale:.62, m:<path fill={W} d="M13.6 3c.4 2 0 3.6-1.2 5 2.6-.4 4.6.6 6 3-3 0-4.8 1.2-5.4 3.6 2 .6 3 2 3 4.4-1.8-1.6-3.6-2-5.4-1.2-.6 2-2 3-4.2 3.2 1.4-1.8 1.6-3.6.6-5.4-2 .2-3.4-.6-4-2.4 2 .4 3.6 0 4.8-1.4-1-1.8-.8-3.4.6-4.8.2 2 1.2 3.2 3 3.6.4-2.4 1.4-4 2.2-4.2z"/> },
  savvycal: { bg:'#1A1A1A', scale:.64, m:<g fill="none" stroke={W} strokeWidth="1.9" strokeLinecap="round"><rect x="4" y="5.6" width="16" height="14" rx="3"/><path d="M4 10h16M8.6 3.4v4M15.4 3.4v4M9 14.4l2 2 3.6-4"/></g> },

  /* ---------- payments + commerce ---------- */
  stripe: { bg:'#635BFF', scale:.58, m:<path fill={W} d="M11.6 9.6c0-.7.6-1 1.5-1 1.4 0 3.1.5 4.5 1.2V6.4c-1.5-.6-3-.9-4.5-.9-3.7 0-6.1 1.9-6.1 5.1 0 5 6.8 4.2 6.8 6.4 0 .8-.7 1.1-1.7 1.1-1.5 0-3.5-.6-5-1.5v3.5c1.7.7 3.4 1 5 1 3.8 0 6.4-1.6 6.4-5 0-5.4-6.9-4.5-6.9-6.5z"/> },
  paddle: { bg:'#0B0F1A', scale:.66, m:<g fill={W}><path d="M4.6 4h5.2v16H6.8V6.8H4.6V4z" opacity=".9"/><path d="M11.6 4h5c2.6 0 4.4 1.8 4.4 4.4s-1.8 4.4-4.4 4.4h-2v7.2h-3V4zm3 2.8v3.2h1.8c.9 0 1.5-.6 1.5-1.6s-.6-1.6-1.5-1.6h-1.8z"/></g> },
  chargebee: { bg:'#FF3300', scale:.64, m:<path fill={W} d="M12 3.6a8.4 8.4 0 1 1 0 16.8 8.4 8.4 0 0 1 0-16.8zm0 2.8a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 0 0 0-11.2zm0 2.4a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z"/> },
  lemonsqueezy: { bg:'#FFC233', scale:.7, m:<path fill="#1A1A1A" d="M12 3.4c3.6 0 6.4 2.4 6.4 5.6 0 2-1 3.4-2.6 4.6 2 1 3.2 2.6 3.2 4.4 0 1.4-1 2.4-2.4 2.4H7.4C6 20.4 5 19.4 5 18c0-1.8 1.2-3.4 3.2-4.4C6.6 12.4 5.6 11 5.6 9c0-3.2 2.8-5.6 6.4-5.6z"/> },
  shopify: { bg:'#95BF47', scale:.7, m:<g><path fill={W} d="M15.4 6.2c-.2-1.6-.9-2.8-2.2-2.8-1.6 0-2.8 1.8-3.3 4.1l-2.3.7L6 20.2l9.6 1.6 1.6-14.2-1.8-1.4zm-3.6-1.4c.5 0 .9.5 1.1 1.4l-2.3.7c.3-1.3.8-2.1 1.2-2.1z"/>
    <path fill="#5E8E3E" d="M15.6 21.8 17.2 7.6l-1.8-1.4-1.2 15z" opacity=".55"/>
    <path fill="#5E8E3E" d="M12.6 11.2c-.6-.3-1.2-.5-1.9-.5-1.6 0-1.8 1-1.8 1.3 0 1.4 3.5 1.9 3.5 5 0 2.4-1.5 4-3.6 4-2.4 0-3.7-1.5-3.7-1.5l.7-2.2s1.3 1.1 2.4 1.1c.7 0 1-.6 1-1 0-1.7-2.9-1.8-2.9-4.7 0-2.3 1.7-4.6 5.1-4.6 1.3 0 2 .4 2 .4l-.8 2.7z"/></g> },
  woocommerce: { bg:'#7F54B3', scale:.72, m:<path fill={W} d="M3.4 7.4h17.2a1.6 1.6 0 0 1 1.6 1.6v5.6a1.6 1.6 0 0 1-1.6 1.6h-6l.9 2.4-3.4-2.4H3.4a1.6 1.6 0 0 1-1.6-1.6V9a1.6 1.6 0 0 1 1.6-1.6zm2 2.2c-.5 0-.8.4-.7.9l1.2 4c.1.4.4.6.8.6.4 0 .6-.2.8-.6l1-2.6.9 2.6c.1.4.4.6.8.6.4 0 .6-.2.8-.6l1.2-4c.1-.5-.2-.9-.7-.9-.4 0-.6.2-.7.6l-.8 2.8-.9-2.8c-.1-.4-.4-.6-.8-.6-.4 0-.6.2-.8.6l-.9 2.8-.7-2.8c-.1-.4-.4-.6-.7-.6z"/> },
  bigcommerce: { bg:'#121118', scale:.66, m:<path fill={W} d="M4 4h9.6c2.4 0 4 1.4 4 3.5 0 1.4-.7 2.4-1.8 3 1.4.5 2.4 1.7 2.4 3.4 0 2.4-1.8 4.1-4.6 4.1H4V4zm3 2.6v3h5.6c1 0 1.6-.6 1.6-1.5s-.6-1.5-1.6-1.5H7zm0 5.4v3.4h6c1.1 0 1.8-.7 1.8-1.7s-.7-1.7-1.8-1.7H7z"/> },

  /* ---------- ops ---------- */
  slack: { bg:W, scale:.72, m:<g>
    <path fill="#36C5F0" d="M7.4 14.6a2 2 0 1 1-2-2h2v2zm1 0a2 2 0 0 1 4 0v5a2 2 0 0 1-4 0v-5z" transform="translate(0 -1)"/>
    <path fill="#2EB67D" d="M9.4 7.4a2 2 0 1 1 2-2v2h-2zm0 1a2 2 0 0 1 0 4h-5a2 2 0 0 1 0-4h5z" transform="translate(1 1)"/>
    <path fill="#ECB22E" d="M16.6 9.4a2 2 0 1 1 2 2h-2v-2zm-1 0a2 2 0 0 1-4 0v-5a2 2 0 0 1 4 0v5z" transform="translate(0 1)"/>
    <path fill="#E01E5A" d="M14.6 16.6a2 2 0 1 1-2 2v-2h2zm0-1a2 2 0 0 1 0-4h5a2 2 0 0 1 0 4h-5z" transform="translate(-1 0)"/></g> },
  webhook: { bg:'#3A4147', scale:.68, m:<g fill="none" stroke={W} strokeWidth="1.9" strokeLinecap="round"><circle cx="6.2" cy="17.4" r="2.6"/><circle cx="17.8" cy="17.4" r="2.6"/><circle cx="12" cy="6.6" r="2.6"/><path d="M10.6 8.8 7.4 14.8M13.4 8.8l3.2 6M8.8 17.4h6.4"/></g> },
  api: { bg:'#2B3136', scale:.66, m:<g fill="none" stroke={W} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.4 6.4 3.6 12l4.8 5.6M15.6 6.4 20.4 12l-4.8 5.6M13.4 5.2l-2.8 13.6"/></g> },
  zapier: { bg:'#FF4F00', scale:.66, m:<path fill={W} d="M14.1 9.9h7v4.2h-7l4.9 5-3 3-5-4.9v7H9.9v-7l-5 4.9-3-3 5-5h-7V9.9h7l-5-5 3-3 5 5v-7h4.2v7l5-5 3 3-4.9 5z" transform="translate(1 1) scale(.87)"/> },
  mailchimp: { bg:'#FFE01B', scale:.68, m:<path fill="#241C15" d="M12 4.6c3.6 0 6.6 2.2 6.6 5 0 1-.4 1.8-1 2.6.8.6 1.4 1.4 1.4 2.4 0 2.4-3 4.4-7 4.4s-7-2-7-4.4c0-1 .5-1.8 1.3-2.4-.6-.8-.9-1.6-.9-2.6 0-2.8 3-5 6.6-5zm-2.4 5.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4.8 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/> },
  gmail: { bg:W, scale:.72, m:<g>
    <path fill="#EA4335" d="M3 7.4 12 14l9-6.6V6a1.6 1.6 0 0 0-1.6-1.6H4.6A1.6 1.6 0 0 0 3 6v1.4z"/>
    <path fill="#34A853" d="M3 8.8V18a1.6 1.6 0 0 0 1.6 1.6h2.8V11L3 8.8z"/>
    <path fill="#4285F4" d="M21 8.8 16.6 11v8.6h2.8A1.6 1.6 0 0 0 21 18V8.8z"/>
    <path fill="#FBBC04" d="M7.4 11 12 14.4 16.6 11v8.6H7.4V11z"/></g> },

  /* ---------- platforms + competitors (comparison tables) ---------- */
  plausible: { bg:'#5850EC', scale:.62, m:<path fill={W} d="M8.4 4h4.8c3.5 0 6 2.3 6 5.7 0 3.5-2.6 5.8-6.3 5.8h-1.6V20H8.4V4zm2.9 2.7v6.1h1.4c2 0 3.2-1.1 3.2-3s-1.2-3.1-3.2-3.1h-1.4z"/> },
  wordpress: { bg:'#21759B', scale:.72, m:<g fill={W}><path d="M12 3.2A8.8 8.8 0 0 0 4.4 16l4.4-11A8.7 8.7 0 0 1 12 3.2zm0 17.6a8.8 8.8 0 0 0 7.4-13.4l-3.6 10.6A8.7 8.7 0 0 1 12 20.8z"/><path d="M7.2 6.6 11 17.4l1.9-5.4-2.2-5.4H7.2zm6.4 0 3.6 9.8 1.4-4.2c.4-1.2.3-2.1-.4-3.6l-.9-2H13.6z"/></g> },
  gtm: { bg:W, scale:.78, m:<g><path fill="#8AB4F8" d="M12.6 21.4 3 11.8l4.6-4.6 9.6 9.6-4.6 4.6z"/><path fill="#4285F4" d="M11.4 2.6 21 12.2l-4.6 4.6L6.8 7.2l4.6-4.6z"/><circle cx="12" cy="19.2" r="2.2" fill="#246FDB"/></g> },
  framer: { bg:'#0055FF', scale:.6, m:<path fill={W} d="M6 3h12v6H12l6 6H6V9h6L6 3zm0 12h6v6l-6-6z"/> },
  polar: { bg:'#1C1C1C', scale:.66, m:<g fill="none" stroke={W} strokeWidth="1.7"><circle cx="12" cy="12" r="8.4"/><ellipse cx="12" cy="12" rx="4" ry="8.4"/></g> },
  klaviyo: { bg:'#1B1B1B', scale:.66, m:<path fill={W} d="M4 8.4 12 3.6l8 4.8-8 4.8-8-4.8zm0 4.6 3.4 2 4.6 2.8 4.6-2.8 3.4-2v3.4L12 20.4 4 16.4V13z"/> },
  ruler: { bg:'#00CC88', scale:.6, m:<g fill={W}><path d="M3.6 9.4h16.8v5.2H3.6V9.4zm2.2 0v2.2h1.6V9.4H5.8zm3.6 0v2.2H11V9.4H9.4zm3.6 0v2.2h1.6V9.4H13zm3.6 0v2.2h1.6V9.4h-1.6z"/></g> },
  cometly: { bg:'#4F46E5', scale:.62, m:<g fill={W}><circle cx="15.6" cy="8.4" r="4.2"/><path d="M11.4 11.6 4 19.6l1.4 1.4 8-7.4a5.9 5.9 0 0 1-2-2z"/></g> },
  triplewhale: { bg:'#111827', scale:.68, m:<path fill={W} d="M3 10.6c2.4-.9 4.4-.3 6 1.4 1.2 1.3 2.5 1.9 4 1.7 1.7-.2 3-1.2 4-3 .9 3.4-.4 6.2-3.2 7.3-3.2 1.3-6.6-.1-8.6-3.1L3 10.6zm12.6-4.2 3.6-1.2-1.2 3.6-2.4-2.4z"/> },
  northbeam: { bg:'#1E1B4B', scale:.64, m:<g fill="none" stroke={W} strokeWidth="1.9" strokeLinecap="round"><path d="M5 19V6.4L19 19V6.4"/></g> },
  attributer: { bg:'#0F172A', scale:.6, m:<g fill="none" stroke={W} strokeWidth="1.9"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" strokeDasharray="2 3"/></g> },
  sourcetrack: { bg:'#1F2323', scale:.86, m:<g transform="translate(1.45 1.35) rotate(28 12 12) scale(.5)"><rect x="6.2" y="4.5" width="10.4" height="25" rx="5.2" fill="#FF8552" opacity=".34"/><rect x="22.8" y="3.2" width="11.4" height="38.5" rx="5.7" fill="#CCF03F" opacity=".34"/><circle cx="11.4" cy="24.3" r="4.7" fill="#FF8552"/><circle cx="28.5" cy="36" r="5.2" fill="#CCF03F"/></g> },

  /* ---------- form builders ---------- */
  tally: { bg:'#000000', scale:.66, m:<path fill={W} d="M12 3.2c.7 3 1.1 4.7 1.6 5.6l3.4-2.4-2.1 3.6c1-.3 2.6-.6 5.3-1.1-2.7.5-4.3.9-5.3 1.4l3.6 2.1-4.2-1.1c.7.7 1.9 1.9 3.4 3.4-1.5-1.5-2.7-2.7-3.4-3.4l1.1 4.2-2.1-3.6c-.5 1-.9 2.6-1.4 5.3-.5-2.7-.9-4.3-1.4-5.3l-2.1 3.6 1.1-4.2c-.7.7-1.9 1.9-3.4 3.4 1.5-1.5 2.7-2.7 3.4-3.4l-4.2 1.1 3.6-2.1c-1-.5-2.6-.9-5.3-1.4 2.7-.5 4.3-.9 5.3-1.4L6.9 6.4l3.4 2.4c.5-.9.9-2.6 1.7-5.6z"/> },
  paperform: { bg:'#1A1A1A', scale:.66, m:<g fill="none" stroke={W} strokeWidth="1.7"><circle cx="12" cy="12" r="8"/><path d="M12 4c3 2.6 3 13.4 0 16M12 4c-3 2.6-3 13.4 0 16M4.4 9.4h15.2M4.4 14.6h15.2"/></g> },
  formstack: { bg:'#21B573', scale:.6, m:<g fill={W}><path d="M5 4.6h14v3.2H8.6v2.6H17v3.2H8.6V20H5V4.6z"/></g> },
  wufoo: { bg:'#C0392B', scale:.66, m:<g><circle cx="12" cy="12" r="9" fill={W}/><path fill="#C0392B" d="M6.6 8.4h2.2l1.2 5 1.2-5h1.6l1.2 5 1.2-5h2.2l-2.3 8h-2.1L12 12.2l-.8 4.2H9.1l-2.5-8z"/></g> },
  googleforms: { bg:'#673AB7', scale:.72, m:<g><path fill={W} d="M14 3H7.6A1.6 1.6 0 0 0 6 4.6v14.8A1.6 1.6 0 0 0 7.6 21h8.8a1.6 1.6 0 0 0 1.6-1.6V7l-4-4z"/><path fill="#673AB7" d="M9.4 10.4h5.6v1.4H9.4zm0 3h5.6v1.4H9.4zm0 3h3.6v1.4H9.4z"/><path fill="#B39DDB" d="M14 3v2.6a1.4 1.4 0 0 0 1.4 1.4H18L14 3z"/></g> },
  wpforms: { bg:'#E27730', scale:.64, m:<g fill={W}><rect x="4" y="5" width="16" height="14" rx="2"/><path fill="#E27730" d="M6.6 8.2h6.4v1.6H6.6zm0 3.2h10.8v1.6H6.6zm0 3.2h10.8v1.6H6.6z"/></g> },
  ninjaforms: { bg:'#E4443C', scale:.66, m:<g fill={W}><path d="M12 3.6c4.6 0 8.4 2.4 8.4 5.4 0 1.4-.8 2.6-2 3.6.4.8.6 1.6.6 2.4 0 3-3.2 5.4-7 5.4s-7-2.4-7-5.4c0-.8.2-1.6.6-2.4-1.2-1-2-2.2-2-3.6 0-3 3.8-5.4 8.4-5.4z"/><circle cx="9.4" cy="10.4" r="1.2" fill="#E4443C"/><circle cx="14.6" cy="10.4" r="1.2" fill="#E4443C"/></g> },
  contactform7: { bg:'#1B7CBE', scale:.72, m:<g><circle cx="12" cy="12" r="9" fill={W}/><path fill="#1B7CBE" d="M12 4.6a7.4 7.4 0 0 1 6.6 4L12 15.2 8.2 11.4l-2 2A7.4 7.4 0 0 1 12 4.6z"/></g> },
  formidable: { bg:'#2A2A2A', scale:.68, m:<g fill="none" stroke={W} strokeWidth="1.7"><rect x="4.4" y="4.4" width="15.2" height="15.2" rx="4"/><path d="M8.4 9.6h7.2M8.4 12.8h7.2M8.4 16h4"/></g> },
  fluentforms: { bg:'#1A7EFB', scale:.66, m:<g fill={W}><path d="M4.6 4.6h14.8v3.2H8.2v2.8h9.4v3.2H8.2v5.6H4.6V4.6z"/></g> },
  forminator: { bg:'#17A8E3', scale:.64, m:<g fill={W}><rect x="4" y="4.6" width="7" height="7" rx="1.6"/><rect x="13" y="4.6" width="7" height="7" rx="1.6" opacity=".7"/><rect x="4" y="13.4" width="7" height="7" rx="1.6" opacity=".7"/><rect x="13" y="13.4" width="7" height="7" rx="1.6"/></g> },
  cognitoforms: { bg:'#F26F21', scale:.7, m:<g fill="none" stroke={W} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3.4v2.4M12 18.2v2.4M3.4 12h2.4M18.2 12h2.4M6 6l1.7 1.7M16.3 16.3 18 18M18 6l-1.7 1.7M7.7 16.3 6 18"/></g> },
  unbounce: { bg:'#1B1B1B', scale:.62, m:<path fill={W} d="M6 4.6h3.4v8.6c0 2 1 3.2 2.6 3.2s2.6-1.2 2.6-3.2V4.6H18v8.8c0 3.8-2.4 6.2-6 6.2s-6-2.4-6-6.2V4.6z"/> },
  leadpages: { bg:'#2E475D', scale:.64, m:<g fill={W}><rect x="4.4" y="4.4" width="6.4" height="15.2" rx="1.6"/><rect x="13.2" y="4.4" width="6.4" height="6.4" rx="1.6" fill="#00C48C"/><rect x="13.2" y="13.2" width="6.4" height="6.4" rx="1.6" opacity=".75"/></g> },
  clickfunnels: { bg:'#1B4E8C', scale:.66, m:<g fill={W}><path d="M4 5h16l-5.4 6.6v5.2L9.4 20v-8.4L4 5z"/></g> },
  carrd: { bg:'#5B5BD6', scale:.64, m:<g fill={W}><rect x="4" y="6" width="16" height="12" rx="2.6"/><path fill="#5B5BD6" d="M6.6 9h5v6h-5zm7 0h4.2v1.6h-4.2zm0 2.8h4.2v1.6h-4.2z"/></g> },
  wix: { bg:'#000000', scale:.72, m:<path fill={W} d="M2.4 8.6h2.5l1.6 5.6 1.6-5.6h2.2l1.6 5.6 1.6-5.6h2.5l-2.8 7.8h-2.4l-1.6-5-1.5 5H7.1L4.3 8.6H2.4zm16.2 0h2.4v7.8h-2.4V8.6zm1.2-3.4a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z"/> },
  squarespace: { bg:'#000000', scale:.72, m:<g fill="none" stroke={W} strokeWidth="1.8" strokeLinecap="round"><path d="M5.6 13.6 10 9.2a3.4 3.4 0 0 1 4.8 4.8l-4.4 4.4"/><path d="M18.4 10.4 14 14.8a3.4 3.4 0 0 1-4.8-4.8L13.6 5.6"/></g> },
  marketo: { bg:'#5C4C9F', scale:.66, m:<g fill={W}><rect x="4.4" y="4.6" width="3" height="14.8" rx="1.4"/><rect x="10.4" y="7.2" width="3" height="9.6" rx="1.4"/><rect x="16.4" y="9.6" width="3" height="4.8" rx="1.4"/></g> },
  pardot: { bg:'#00A1E0', scale:.72, m:<path fill={W} d="M9.4 7.2a3.2 3.2 0 0 1 5.3-.8 3.9 3.9 0 0 1 5.2 3.8 3.3 3.3 0 0 1-1.5 6.2H7.7A4 4 0 0 1 3.8 12a4 4 0 0 1 3-3.9c.2-.4.4-.7.6-.9z"/> },
  activecampaign: { bg:'#356AE6', scale:.66, m:<path fill={W} d="M5.4 4.6 18.6 12 5.4 19.4v-3.6L13 12 5.4 8.2V4.6z"/> },
  convertkit: { bg:'#FB6970', scale:.6, m:<path fill={W} d="M8.6 4.6h6.8v3.2h-3.2v2.6h2.8v3.2h-2.8V20H8.6V4.6z"/> },

  /* ---------- chat widgets ---------- */
  zendesk: { bg:'#03363D', scale:.66, m:<g fill={W}><path d="M11 7v13H4L11 7zm2 10V4h7l-7 13z"/></g> },
  livechat: { bg:'#FF5100', scale:.64, m:<path fill={W} d="M4 6.6A2.6 2.6 0 0 1 6.6 4h10.8A2.6 2.6 0 0 1 20 6.6v6.8a2.6 2.6 0 0 1-2.6 2.6h-6L5.6 20v-4.2A2.6 2.6 0 0 1 4 13.4V6.6z"/> },
  tawk: { bg:'#03A84E', scale:.66, m:<g fill={W}><circle cx="9" cy="10.6" r="5.4"/><path d="M9 16.6 5.6 21v-4.4z"/><circle cx="16.4" cy="13.4" r="4" opacity=".7"/></g> },
  olark: { bg:'#2C6BED', scale:.66, m:<g fill={W}><circle cx="12" cy="12" r="8"/><path fill="#2C6BED" d="M9 10.4h6v1.6H9zm0 3h4v1.6H9z"/></g> },
  freshchat: { bg:'#25C16F', scale:.66, m:<path fill={W} d="M5 6.4A2.4 2.4 0 0 1 7.4 4h9.2A2.4 2.4 0 0 1 19 6.4v6.2a2.4 2.4 0 0 1-2.4 2.4h-5.2L6.6 19v-4A2.4 2.4 0 0 1 5 12.6V6.4z"/> },
  chatwoot: { bg:'#1F93FF', scale:.64, m:<path fill={W} d="M12 3.6a8.4 8.4 0 0 1 8.4 8.4c0 4.6-3.8 8.4-8.4 8.4H4.4l2-3.4A8.3 8.3 0 0 1 3.6 12 8.4 8.4 0 0 1 12 3.6z"/> },
  front: { bg:'#001B38', scale:.66, m:<g fill={W}><path d="M5 4.6h14v3.2H8.6v3H17V14H8.6v5.4H5V4.6z"/></g> },
  helpscout: { bg:'#1292EE', scale:.64, m:<g fill={W}><path d="M4 8.4 12 3l8 5.4-8 5.4L4 8.4z"/><path d="M4 14.2 12 19.6l8-5.4-2.6-1.8L12 16.2 6.6 12.4 4 14.2z" opacity=".75"/></g> },
  gorgias: { bg:'#3A0D2D', scale:.68, m:<g fill={W}><circle cx="9" cy="10" r="3.2"/><circle cx="15.6" cy="12.6" r="4.4" opacity=".8"/><path d="M6.4 15 4 20l5-1.6z"/></g> },
  smartsupp: { bg:'#00A0E2', scale:.64, m:<path fill={W} d="M4.4 6.6A2.6 2.6 0 0 1 7 4h10a2.6 2.6 0 0 1 2.6 2.6v6.6A2.6 2.6 0 0 1 17 15.8h-4.6L7 20v-4.2A2.6 2.6 0 0 1 4.4 13.2V6.6zm4 3h7.2v1.6H8.4z"/> },

  /* ---------- scheduling ---------- */
  tidycal: { bg:'#FF6B35', scale:.68, m:<g fill={W}><rect x="4" y="5.4" width="16" height="14.2" rx="2.6"/><path fill="#FF6B35" d="M4 9.6h16v1.6H4z"/><path fill="#FF6B35" d="M8.4 13.4l2.2 2.4 4.6-4.6 1.2 1.2-5.8 5.8-3.4-3.6z"/><rect x="7.2" y="3" width="2" height="4" rx="1" fill={W}/><rect x="14.8" y="3" width="2" height="4" rx="1" fill={W}/></g> },
  zcal: { bg:'#111827', scale:.62, m:<path fill={W} d="M6 5.4h12v2.8l-7.4 8.4H18v2.8H6v-2.8l7.4-8.4H6V5.4z"/> },
  acuity: { bg:'#1E3A5F', scale:.7, m:<g fill="none" stroke={W} strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 7.6V12l3.2 2"/></g> },
  youcanbookme: { bg:'#1DA4E0', scale:.66, m:<g fill={W}><rect x="4" y="5.6" width="16" height="14" rx="2.6"/><path fill="#1DA4E0" d="M4 10h16v1.6H4z"/><path fill="#1DA4E0" d="M9 13.6h6v1.6H9zm1.6 3h2.8v1.6h-2.8z"/></g> },
  msbookings: { bg:'#0364B8', scale:.7, m:<g><rect x="4" y="5.4" width="16" height="14.2" rx="2.4" fill={W}/><path fill="#0364B8" d="M4 9.4h16v1.8H4z"/><circle cx="12" cy="15.4" r="2.8" fill="#0364B8"/><path d="M12 13.6V15.4l1.4.9" stroke={W} strokeWidth="1.2" fill="none" strokeLinecap="round"/></g> },
  googlecalendar: { bg:W, scale:.74, m:<g><rect x="4" y="4" width="16" height="16" rx="2" fill="#4285F4"/><rect x="6.6" y="6.6" width="10.8" height="10.8" fill={W}/><path fill="#4285F4" d="M9.4 9.2h5.2v1.5h-1.8v5.1h-1.6v-5.1H9.4z"/><path fill="#34A853" d="M17.4 20h-3.8v-3.8h3.8z"/><path fill="#FBBC04" d="M20 17.4h-3.8v-3.8H20z"/><path fill="#EA4335" d="M20 6.6V4h-2.6z"/></g> },

  /* ---------- store + email + paid social ---------- */
  magento: { bg:'#EE672F', scale:.66, m:<g fill={W}><path d="M12 2.6 4 7.2v9.6l2.6 1.5V8.7L12 5.6l5.4 3.1v9.6l2.6-1.5V7.2L12 2.6zM9.4 19.8l2.6 1.6 2.6-1.6v-9.4L12 8.8l-2.6 1.6v9.4z"/></g> },
  ecwid: { bg:'#0B7EF4', scale:.66, m:<g fill={W}><path d="M4 7.4h13.2l-1.6 8H7.4L4 7.4zm2.6 10.2a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zm8.6 0a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4z"/></g> },
  prestashop: { bg:'#DF0067', scale:.66, m:<g fill={W}><circle cx="12" cy="10.4" r="4.6"/><path fill="#DF0067" d="M12 8a2.4 2.4 0 1 1 0 4.8A2.4 2.4 0 0 1 12 8z"/><path d="M5.4 17.4h13.2v2.4H5.4z"/></g> },
  snapchat: { bg:'#FFFC00', scale:.7, m:<path fill="#111" d="M12 3.4c2.9 0 4.4 2 4.4 4.6 0 1.4-.2 2.4.2 2.8.4.4 1.4 0 1.8.5.4.5-.4 1.4-1.6 2.2-.7.5-.7 1 .5 2.4.7.8 1.8 1 1.4 1.6-.4.6-1.8.4-2.4 1-.4.4-.2 1.2-.8 1.3-.7.1-1.7-.7-3.5-.7s-2.8.8-3.5.7c-.6-.1-.4-.9-.8-1.3-.6-.6-2-.4-2.4-1-.4-.6.7-.8 1.4-1.6 1.2-1.4 1.2-1.9.5-2.4-1.2-.8-2-1.7-1.6-2.2.4-.5 1.4-.1 1.8-.5.4-.4.2-1.4.2-2.8 0-2.6 1.5-4.6 4.4-4.6z"/> },
  pinterest: { bg:'#E60023', scale:.66, m:<path fill={W} d="M12.4 3.4c-4.8 0-7.6 3.2-7.6 6.6 0 1.6.9 3.5 2.3 4.1.2.1.4 0 .4-.2l.4-1.5c.1-.2 0-.3-.1-.5-.4-.5-.7-1.3-.7-2.1 0-2.6 1.9-5 5.2-5 2.8 0 4.8 1.9 4.8 4.6 0 3.1-1.5 5.2-3.5 5.2-1.1 0-1.9-.9-1.6-2 .3-1.3.9-2.7.9-3.6 0-.8-.4-1.5-1.4-1.5-1.1 0-2 1.1-2 2.6 0 1 .3 1.6.3 1.6l-1.4 5.7c-.4 1.6.1 3.9.1 4.1 0 .2.2.2.3.1.2-.2 1.4-1.8 1.8-3.4l.7-2.6c.4.7 1.5 1.3 2.7 1.3 3.5 0 5.9-3.2 5.9-7.4 0-3.2-2.7-6.2-6.8-6.2z"/> },
  microsoftads: { bg:W, scale:.72, m:<g><path fill="#F25022" d="M4 4h7.4v7.4H4z"/><path fill="#7FBA00" d="M12.6 4H20v7.4h-7.4z"/><path fill="#00A4EF" d="M4 12.6h7.4V20H4z"/><path fill="#FFB900" d="M12.6 12.6H20V20h-7.4z"/></g> },

  /* ---------- generic channels ---------- */
  email: { bg:'#F0602A', scale:.62, m:<g fill="none" stroke={W} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.4" y="6" width="17.2" height="12" rx="2.2"/><path d="M3.8 7.6 12 13.4l8.2-5.8"/></g> },
  direct: { bg:'#4B5353', scale:.6, m:<path fill={W} d="M5.4 3.4 19 12l-5.9 1.5L11.2 20 5.4 3.4z"/> },
  referral: { bg:'#00AA57', scale:.66, m:<g fill={W}><circle cx="9.2" cy="8.4" r="3.2"/><path d="M3.4 19.4a5.8 5.8 0 0 1 11.6 0H3.4z"/><circle cx="17.4" cy="6.4" r="3.4" stroke={W} strokeWidth=".8"/><path d="M15.9 6.5l1 1.1 2-2.4" stroke="#00AA57" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g> },
  organic: { bg:'#12A05B', scale:.66, m:<g fill="none" stroke={W} strokeWidth="1.9" strokeLinecap="round"><circle cx="10.6" cy="10.6" r="6.2"/><path d="M15.4 15.4 20 20"/></g> },
};

const ALIAS = {
  'google-organic':'google', 'google-search':'google', 'bing-organic':'bing', 'bing-ads':'bing',
  'meta-ads':'meta', 'fb':'facebook', 'ig':'instagram', 'ig-ads':'instagram',
  'linkedin-ads':'linkedin', 'tiktok-ads':'tiktok', 'twitter':'x',
  'newsletter':'email', 'mail':'email', 'none':'direct', 'partner':'referral',
  'hubspot-chat':'hubspot', 'hubspot-forms':'hubspot', 'cal.com':'cal', 'calcom':'cal',
  'woo':'woocommerce', 'lemon':'lemonsqueezy', 'ga4':'google-analytics',
  'openai':'chatgpt', 'anthropic':'claude', 'ms-copilot':'copilot',
  'google-tag-manager':'gtm', 'tagmanager':'gtm', 'wp':'wordpress',
  'triple-whale':'triplewhale', 'leadsource':'attributer', 'ga':'google-analytics',
  'search-console':'google', 'gsc':'google', 'ai':'chatgpt', 'us':'sourcetrack',
  'google-forms':'googleforms', 'wp-forms':'wpforms', 'ninja-forms':'ninjaforms',
  'contact-form-7':'contactform7', 'cf7':'contactform7', 'formidable-forms':'formidable',
  'fluent-forms':'fluentforms', 'cognito-forms':'cognitoforms', 'wix-forms':'wix',
  'hubspot-meetings':'hubspot', 'kit':'convertkit', 'active-campaign':'activecampaign',
  'zoho-salesiq':'olark', 'help-scout':'helpscout', 'tawk-to':'tawk', 'tawkto':'tawk',
  'google-calendar':'googlecalendar', 'microsoft-bookings':'msbookings',
  'youcanbook':'youcanbookme', 'square-space':'squarespace', 'squarespace-commerce':'squarespace',
  'microsoft-ads':'microsoftads', 'bing-ads-platform':'microsoftads', 'msft':'microsoftads',
  'snap':'snapchat', 'snapchat-ads':'snapchat', 'pinterest-ads':'pinterest',
  'youtube-ads':'youtube', 'reddit-ads':'reddit',
};




// ==================== FROM demo-data.jsx ====================
// Demo fixture dataset. Every figure in the demo app derives from THIS file, so
// KPIs, tables, charts, funnels and paths always reconcile with each other.
// Fixture data only — no customer or live account data.

const DEMO_RANGE = { label: 'Jul 4 – Aug 2, 2026', days: 30, start: 'Jul 4', end: 'Aug 2' };

// --- Channels: the single source of truth -----------------------------------
const CHANNELS = [
  { key:'paid-search',  name:'Paid Search',    sub:'Google Ads',        src:'google-ads',     visitors:1568, leads:72, conv:34, rev:7080 },
  { key:'organic',      name:'Organic Search', sub:'Google',            src:'google-organic', visitors:1432, leads:61, conv:28, rev:5410 },
  { key:'direct',       name:'Direct',         sub:'Direct / none',     src:'direct',         visitors:2541, leads:68, conv:29, rev:4940 },
  { key:'ai',           name:'AI Search',      sub:'ChatGPT, Gemini, Claude +19',src:'chatgpt',        visitors:642,  leads:38, conv:19, rev:2480 },
  { key:'paid-social',  name:'Paid Social',    sub:'LinkedIn + Meta',   src:'linkedin-ads',   visitors:596,  leads:25, conv:10, rev:1040 },
  { key:'referral',     name:'Referral',       sub:'Partner websites',  src:'referral',       visitors:524,  leads:20, conv:6,  rev:480 },
];

const sum = (k) => CHANNELS.reduce((a, c) => a + c[k], 0);
const TOTALS = {
  visitors: sum('visitors'), leads: sum('leads'), conv: sum('conv'), rev: sum('rev'),
};
TOTALS.cvr = TOTALS.conv / TOTALS.visitors * 100;      // 1.73%
TOTALS.v2l = TOTALS.leads / TOTALS.visitors * 100;     // 3.89%
TOTALS.l2c = TOTALS.conv / TOTALS.leads * 100;         // 44.4%

// Largest-remainder allocation so any weighted split sums EXACTLY to total.
function allocate(total, weights) {
  const wsum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => total * w / wsum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (let i = 0; left > 0; i++, left--) out[order[i % order.length][1]] += 1;
  return out;
}

// --- Daily series (sums to TOTALS.visitors / TOTALS.conv) -------------------
const DAY_W = [40,44,41,47,52,49,55,58,54,61,64,60,67,71,66,73,78,72,80,84,79,87,92,86,94,99,93,101,106,110];
const DAILY_VISITORS = allocate(TOTALS.visitors, DAY_W);
const DAILY_CONV = allocate(TOTALS.conv, DAY_W.map((w, i) => w * (i > 18 ? 1.25 : 1)));
const DAY_LABELS = (() => {
  const out = [];
  for (let d = 0; d < 30; d++) { const day = 4 + d; out.push(day <= 31 ? 'Jul ' + day : 'Aug ' + (day - 31)); }
  return out;
})();

// --- Attribution models: reweight the same $21,430 -------------------------
const MODELS = [
  { id:'first',  label:'First touch',
    w:{ 'paid-search':7080,'organic':5410,'direct':4940,'ai':2480,'paid-social':1040,'referral':480 },
    note:'Credit goes to the first recorded touch. Discovery channels look strongest.' },
  { id:'last',   label:'Last touch',
    w:{ 'paid-search':5180,'organic':4060,'direct':7940,'ai':1780,'paid-social':1880,'referral':590 },
    note:'Credit goes to the final touch before the conversion, which inflates Direct.' },
  { id:'linear', label:'Linear',
    w:{ 'paid-search':6120,'organic':5290,'direct':5410,'ai':2610,'paid-social':1480,'referral':520 },
    note:'Every touch in the path shares credit equally.' },
  { id:'pos',    label:'Position-based',
    w:{ 'paid-search':6640,'organic':5120,'direct':5880,'ai':2410,'paid-social':1010,'referral':370 },
    note:'40% first, 40% last, 20% spread across the middle touches.' },
  { id:'decay',  label:'Time decay',
    w:{ 'paid-search':5680,'organic':4820,'direct':6760,'ai':2140,'paid-social':1520,'referral':510 },
    note:'Credit increases the closer a touch sits to the conversion date.' },
  { id:'w',      label:'W-shaped',
    w:{ 'paid-search':6480,'organic':5240,'direct':6120,'ai':2260,'paid-social':940,'referral':390 },
    note:'30% each to first touch, lead creation and last touch — 10% to the middle.' },
  { id:'full',   label:'Full path',
    w:{ 'paid-search':6320,'organic':5180,'direct':6040,'ai':2340,'paid-social':1120,'referral':430 },
    note:'First touch, lead creation, opportunity and closed-won each take 22.5%.' },
  { id:'nondirect', label:'Last non-direct',
    w:{ 'paid-search':7640,'organic':5980,'direct':2210,'ai':3480,'paid-social':1560,'referral':560 },
    note:'Direct hands its credit back to the last known source — the honest read of a return visit.' },
  { id:'custom', label:'Custom weights',
    w:{ 'paid-search':6130,'organic':4740,'direct':6440,'ai':2130,'paid-social':1455,'referral':535 },
    note:'Your own split. This one is set to 50% first touch, 50% last touch.' },
];

// --- AI engines detected (22 assistant + answer-engine domains) ------------
const AI_DOMAINS = 22;
// Sums to the AI Search channel exactly: 642 visitors, 19 conversions, $2,480.
const AI_ENGINES = [
  { key:'chatgpt',    name:'ChatGPT',    host:'chatgpt.com',            visitors:268, conv:8, rev:1180, change:+8.2 },
  { key:'gemini',     name:'Gemini',     host:'gemini.google.com',      visitors:132, conv:4, rev:520,  change:+22.6 },
  { key:'claude',     name:'Claude',     host:'claude.ai',              visitors:96,  conv:3, rev:410,  change:+31.4 },
  { key:'perplexity', name:'Perplexity', host:'perplexity.ai',          visitors:88,  conv:3, rev:250,  change:+14.2 },
  { key:'copilot',    name:'Copilot',    host:'copilot.microsoft.com',  visitors:42,  conv:1, rev:120,  change:+6.1 },
];
const AI_OTHER = { visitors:16, conv:0, rev:0, engines:17 };

// --- Live visitors (realtime panel) ----------------------------------------
// Pseudonymous by design: SourceTrack sets no cookie and stores no name, so a
// session shows up as a stable animal alias derived from its anonymous id.
const LIVE = [
  { id:'a4f2c9e1', alias:'Wise Dolphin',   flag:'\u{1F1E7}\u{1F1F7}', dev:'mobile',  path:'/pricing',            src:'chatgpt',        label:'ChatGPT',      secs:6 },
  { id:'b71d0e55', alias:'Quick Raven',    flag:'\u{1F1FA}\u{1F1F8}', dev:'desktop', path:'/',                   src:'google-ads',     label:'Google Ads',   secs:12 },
  { id:'c93a4b07', alias:'Bright Koala',   flag:'\u{1F1E9}\u{1F1EA}', dev:'desktop', path:'/attribution',        src:'google-organic', label:'Organic',      secs:24 },
  { id:'d18f6c2a', alias:'Calm Otter',     flag:'\u{1F1EC}\u{1F1E7}', dev:'mobile',  path:'/compare/ga4',        src:'linkedin',       label:'LinkedIn',     secs:38 },
  { id:'e6b25d94', alias:'Swift Panther',  flag:'\u{1F1E8}\u{1F1E6}', dev:'desktop', path:'/blog/utm-tracking',  src:'perplexity',     label:'Perplexity',   secs:52 },
  { id:'f0c78a31', alias:'Bold Falcon',    flag:'\u{1F1EE}\u{1F1F3}', dev:'desktop', path:'/demo',               src:'direct',         label:'Direct',       secs:71 },
  { id:'2a5e91cf', alias:'Keen Heron',     flag:'\u{1F1E6}\u{1F1FA}', dev:'mobile',  path:'/integrations',       src:'meta',           label:'Meta Ads',     secs:94 },
  { id:'3b6f28ad', alias:'Warm Lynx',      flag:'\u{1F1EB}\u{1F1F7}', dev:'desktop', path:'/pricing',            src:'gemini',         label:'Gemini',       secs:118 },
];
const LIVE_PATHS = ['/pricing','/attribution','/demo','/integrations','/compare/ga4','/blog/utm-tracking','/','/features'];

function modelRevenue(modelId) {
  const m = MODELS.find((x) => x.id === modelId) || MODELS[0];
  const alloc = allocate(TOTALS.rev, CHANNELS.map((c) => m.w[c.key]));
  const out = {};
  CHANNELS.forEach((c, i) => { out[c.key] = alloc[i]; });
  return out;
}

// --- Per-channel sparkline shape (12 buckets, share of that channel) ------
const SPARK = {
  'paid-search': [38,42,40,47,44,52,49,58,55,62,60,68],
  'organic':     [30,33,36,34,40,43,41,48,52,50,57,61],
  'direct':      [52,49,55,58,54,60,57,63,66,62,70,68],
  'ai':          [12,15,19,22,28,31,38,42,49,55,62,70],
  'paid-social': [44,41,38,42,36,39,34,37,31,34,29,32],
  'referral':    [18,20,17,22,19,24,21,26,23,28,25,30],
};

// --- Referrers (Analytics + Reports) --------------------------------------
const REFERRERS = [
  { host:'google.com',           src:'google-organic', visitors:1432, conv:28, change:+10.2 },
  { host:'linkedin.com',         src:'linkedin',       visitors:381,  conv:7,  change:-3.1 },
  { host:'chatgpt.com',          src:'chatgpt',        visitors:268,  conv:8,  change:+8.2 },
  { host:'gemini.google.com',    src:'gemini',         visitors:132,  conv:4,  change:+22.6 },
  { host:'claude.ai',            src:'claude',         visitors:96,   conv:3,  change:+31.4 },
  { host:'perplexity.ai',        src:'perplexity',     visitors:88,   conv:3,  change:+14.2 },
  { host:'copilot.microsoft.com',src:'copilot',        visitors:42,   conv:1,  change:+6.1 },
];
const REF_TOTAL = {
  visitors: REFERRERS.reduce((a, r) => a + r.visitors, 0),
  conv: REFERRERS.reduce((a, r) => a + r.conv, 0),
  change: +12.4,
};

// --- SEO keywords --------------------------------------------------------
// Revenue here is ESTIMATED, not recorded: organic clicks for the query x the
// landing page's conversion rate x average order value. Totals stay inside the
// recorded Organic Search figures (1,432 visitors / 28 conversions / $5,410),
// with the remainder sitting in long-tail queries. Always labelled "est.".
const KEYWORDS = [
  { q:'marketing attribution software', clicks:412, pos:4.2, conv:8, rev:1720, page:'/attribution' },
  { q:'utm tracking tool',              clicks:286, pos:6.8, conv:6, rev:1080, page:'/product' },
  { q:'lead source tracking',           clicks:178, pos:5.4, conv:5, rev:940,  page:'/product' },
  { q:'ga4 alternative',                clicks:214, pos:8.1, conv:4, rev:760,  page:'/compare-ga4' },
  { q:'chatgpt referral traffic',       clicks:96,  pos:2.4, conv:3, rev:530,  page:'/ai-referral' },
  { q:'first touch vs last touch',      clicks:142, pos:3.6, conv:2, rev:380,  page:'/attribution' },
];
const KW_TOTAL = {
  clicks: KEYWORDS.reduce((a, k) => a + k.clicks, 0),
  conv: KEYWORDS.reduce((a, k) => a + k.conv, 0),
  rev: KEYWORDS.reduce((a, k) => a + k.rev, 0),
};

// --- Landing pages -------------------------------------------------------
const PAGES = [
  { path:'/pricing',            visitors:1284, leads:78, conv:31, rev:6120 },
  { path:'/',                   visitors:2106, leads:64, conv:24, rev:4380 },
  { path:'/attribution',        visitors:1042, leads:52, conv:26, rev:4210 },
  { path:'/compare/ga4',        visitors:842,  leads:41, conv:20, rev:3260 },
  { path:'/blog/utm-tracking',  visitors:1180, leads:29, conv:11, rev:1980 },
  { path:'/integrations',       visitors:849,  leads:20, conv:14, rev:1480 },
];

// --- Conversion paths (multi-touch) --------------------------------------
const PATHS = [
  { steps:['AI Search','Direct'],                    conv:21, rev:3940 },
  { steps:['Paid Search','Direct'],                  conv:18, rev:3210 },
  { steps:['Organic Search','Organic Search'],        conv:15, rev:2180 },
  { steps:['Paid Search'],                            conv:14, rev:2540 },
  { steps:['Paid Social','Organic Search','Direct'],  conv:11, rev:2090 },
  { steps:['Organic Search','AI Search','Direct'],    conv:9,  rev:1720 },
];
const PATHS_OTHER = { conv: TOTALS.conv - PATHS.reduce((a, p) => a + p.conv, 0),
                      rev: TOTALS.rev - PATHS.reduce((a, p) => a + p.rev, 0) };

// --- Leads + journeys ----------------------------------------------------
const LEADS = [
  { emoji:'👩🏾‍💼', name:'Amara Osei',    email:'amara@northwind.example',  ch:'AI Search',      src:'chatgpt',        first:'Jul 9',  last:'Jul 28', value:1480, status:'Customer', event:'Checkout',
    journey:[
      { t:'Jul 9 · 10:12',  kind:'visit', ttl:'Discovered us in ChatGPT', src:'chatgpt', page:'/compare/ga4', kv:[['Referrer','chatgpt.com'],['Channel','AI Search'],['UTMs present','No — inferred']] },
      { t:'Jul 12 · 20:47', kind:'visit', ttl:'Checked us in Perplexity', src:'perplexity', page:'/attribution', kv:[['Referrer','perplexity.ai'],['Channel','AI Search'],['Cited page','/attribution']] },
      { t:'Jul 15 · 08:41', kind:'visit', ttl:'Returned via branded search', src:'google-organic', page:'/pricing', kv:[['Referrer','google.com'],['Medium','organic'],['Query group','branded']] },
      { t:'Jul 18 · 12:09', kind:'visit', ttl:'Clicked a LinkedIn retargeting ad', src:'linkedin-ads', page:'/demo', kv:[['Campaign','retarget_visitors_q3'],['li_fat_id','b7c1…4e'],['Creative','single_image_02']] },
      { t:'Jul 21 · 14:03', kind:'form',  ttl:'Asked Claude, then filled the demo form', src:'claude', page:'/demo', kv:[['Referrer','claude.ai'],['Form','HubSpot · Request demo'],['First touch','AI Search']] },
      { t:'Jul 28 · 16:22', kind:'pay',   ttl:'Stripe payment captured', src:'direct', page:'/checkout', kv:[['Amount','$1,480.00'],['Plan','Growth · annual'],['Attributed to','AI Search (first touch)']] },
    ] },
  { emoji:'🧑🏼‍💻', name:'Tobias Lund',   email:'t.lund@meridian.example',  ch:'Paid Search',    src:'google-ads',     first:'Jul 6',  last:'Jul 22', value:2340, status:'Customer', event:'Checkout',
    journey:[
      { t:'Jul 6 · 11:20', kind:'visit', ttl:'Clicked Google Ads campaign', src:'google-ads', page:'/attribution', kv:[['Campaign','brand_exact'],['gclid','Cj0KCQ…9fA'],['Channel','Paid Search']] },
      { t:'Jul 10 · 07:31', kind:'visit', ttl:'Returned from a Gemini answer', src:'gemini', page:'/compare/ga4', kv:[['Referrer','gemini.google.com'],['Channel','AI Search']] },
      { t:'Jul 12 · 19:55', kind:'chat', ttl:'Started chat conversation', src:'google-ads', page:'/pricing', kv:[['Widget','Intercom'],['Duration','6m 12s']] },
      { t:'Jul 18 · 09:02', kind:'form', ttl:'Submitted trial signup', src:'direct', page:'/signup', kv:[['Form','Webflow · Trial'],['Seats','12']] },
      { t:'Jul 22 · 13:47', kind:'pay',  ttl:'Stripe payment captured', src:'direct', page:'/checkout', kv:[['Amount','$2,340.00'],['Plan','Growth · annual'],['Attributed to','Paid Search (first touch)']] },
    ] },
  { emoji:'👩🏽‍🔬', name:'Priya Raman',   email:'priya@lattice.example',    ch:'Organic Search', src:'google-organic', first:'Jul 11', last:'Jul 30', value:960,  status:'Customer', event:'Checkout',
    journey:[
      { t:'Jul 11 · 07:44', kind:'visit', ttl:'Organic entry on blog post', src:'google-organic', page:'/blog/utm-tracking', kv:[['Referrer','google.com'],['Medium','organic']] },
      { t:'Jul 19 · 12:18', kind:'visit', ttl:'Read comparison page', src:'google-organic', page:'/compare/ga4', kv:[['Pages this session','4'],['Time on site','7m 41s']] },
      { t:'Jul 26 · 15:30', kind:'form',  ttl:'Submitted lead form', src:'google-organic', page:'/pricing', kv:[['Form','Typeform · Contact'],['Company size','50–200']] },
      { t:'Jul 30 · 10:05', kind:'pay',   ttl:'Stripe payment captured', src:'direct', page:'/checkout', kv:[['Amount','$960.00'],['Plan','Starter · annual']] },
    ] },
  { emoji:'🧑🏻‍🎤', name:'Noah Fitzgerald', email:'noah@brightpath.example', ch:'Paid Social',  src:'linkedin-ads',   first:'Jul 14', last:'Jul 27', value:0,    status:'Lead',     event:'Demo form',
    journey:[
      { t:'Jul 14 · 08:30', kind:'visit', ttl:'Clicked LinkedIn Ads creative', src:'linkedin-ads', page:'/', kv:[['Campaign','abm_q3_mid'],['li_fat_id','a1f9…c2'],['Creative','carousel_04']] },
      { t:'Jul 20 · 17:12', kind:'visit', ttl:'Returned direct', src:'direct', page:'/integrations', kv:[['Session','3rd of 5']] },
      { t:'Jul 27 · 11:41', kind:'form',  ttl:'Submitted demo form', src:'direct', page:'/demo', kv:[['Form','HubSpot · Request demo'],['Synced to','HubSpot']] },
    ] },
  { emoji:'👩🏻‍🏫', name:'Sofia Marchetti', email:'sofia@quarry.example',   ch:'Direct',         src:'direct',         first:'Jul 2',  last:'Jul 29', value:1830, status:'Customer', event:'Checkout',
    journey:[
      { t:'Jul 2 · 09:14', kind:'visit', ttl:'Direct visit, no referrer', src:'direct', page:'/', kv:[['Referrer','—'],['Channel','Direct'],['Note','Stitched to later session by first-party ID']] },
      { t:'Jul 17 · 13:26', kind:'visit', ttl:'Returned from a Claude answer', src:'claude', page:'/attribution', kv:[['Referrer','claude.ai'],['Channel','AI Search']] },
      { t:'Jul 25 · 10:52', kind:'meet', ttl:'Booked meeting', src:'direct', page:'/demo', kv:[['Scheduler','Cal.com · 45 min']] },
      { t:'Jul 29 · 14:36', kind:'pay',  ttl:'Stripe payment captured', src:'direct', page:'/checkout', kv:[['Amount','$1,830.00'],['Plan','Growth · annual']] },
    ] },
  { emoji:'🧑🏼‍🌾', name:'Ethan Brooks',  email:'ethan@sablewood.example',  ch:'AI Search',      src:'perplexity',     first:'Jul 20', last:'Jul 31', value:0,    status:'Lead',     event:'Trial signup',
    journey:[
      { t:'Jul 20 · 21:03', kind:'visit', ttl:'Cited in a Perplexity answer', src:'perplexity', page:'/pricing', kv:[['Referrer','perplexity.ai'],['Channel','AI Search']] },
      { t:'Jul 26 · 09:52', kind:'visit', ttl:'Came back through Copilot', src:'copilot', page:'/attribution', kv:[['Referrer','copilot.microsoft.com'],['Channel','AI Search']] },
      { t:'Jul 31 · 08:19', kind:'form',  ttl:'Started free trial', src:'perplexity', page:'/signup', kv:[['Form','Webflow · Trial'],['Synced to','Salesforce']] },
    ] },
  { emoji:'👩🏻‍💻', name:'Mei Tanaka',    email:'mei@orchidlabs.example',   ch:'Referral',       src:'referral',       first:'Jul 16', last:'Jul 26', value:640,  status:'Customer', event:'Checkout',
    journey:[
      { t:'Jul 16 · 12:40', kind:'visit', ttl:'Referred by partner site', src:'referral', page:'/', kv:[['Referrer','partner.example'],['Channel','Referral']] },
      { t:'Jul 26 · 09:11', kind:'pay',   ttl:'Stripe payment captured', src:'direct', page:'/checkout', kv:[['Amount','$640.00'],['Plan','Starter · monthly']] },
    ] },
  { emoji:'🧑🏽‍🍳', name:'Ruben Alvarez', email:'ruben@fernhill.example',   ch:'Paid Search',    src:'google-ads',     first:'Jul 23', last:'Aug 1',  value:0,    status:'Lead',     event:'Chat',
    journey:[
      { t:'Jul 23 · 15:08', kind:'visit', ttl:'Clicked Google Ads campaign', src:'google-ads', page:'/attribution', kv:[['Campaign','attribution_bmm'],['Keyword','marketing attribution tool']] },
      { t:'Aug 1 · 10:44', kind:'chat',  ttl:'Started chat conversation', src:'direct', page:'/pricing', kv:[['Widget','Crisp'],['Qualified','Yes']] },
    ] },
];

// --- Integrations (no call tracking) -------------------------------------
const INTEGRATIONS = [
  { group:'Forms',      desc:'Lead source attached to every submission.',        on:true,  tools:[['hubspot','HubSpot'],['webflow','Webflow'],['typeform','Typeform'],['jotform','Jotform']] },
  { group:'Chat',       desc:'Chat conversations inherit the visitor session.',  on:true,  tools:[['intercom','Intercom'],['crisp','Crisp'],['tidio','Tidio']] },
  { group:'Meetings',   desc:'Every booking carries source and campaign.',       on:true,  tools:[['calendly','Calendly'],['cal','Cal.com'],['chilipiper','Chili Piper']] },
  { group:'Payments',   desc:'Revenue events tied back to first touch.',         on:true,  tools:[['stripe','Stripe'],['paddle','Paddle'],['chargebee','Chargebee']] },
  { group:'Ecommerce',  desc:'Order-level attribution with LTV by source.',      on:false, tools:[['shopify','Shopify'],['woocommerce','WooCommerce']] },
  { group:'CRM sync',   desc:'Source, journey and revenue written to your CRM.', on:true,  tools:[['hubspot','HubSpot'],['salesforce','Salesforce'],['pipedrive','Pipedrive'],['attio','Attio']] },
  { group:'Ad platforms', desc:'Server-side conversions pushed back for bidding.', on:true, tools:[['google-ads','Google Ads'],['meta-ads','Meta'],['linkedin-ads','LinkedIn'],['tiktok','TikTok']] },
  { group:'AI assistants', desc:'Query this workspace from an MCP client.',      on:true,  tools:[['claude','Claude'],['chatgpt','ChatGPT'],['cursor','Cursor']] },
  { group:'Alerts & API', desc:'Slack, webhooks and a REST endpoint.',           on:true,  tools:[['slack','Slack'],['webhook','Webhooks'],['api','REST API']] },
];

const CRM_MAP = [
  ['first_touch_channel', 'First touch channel'],
  ['last_touch_channel',  'Last touch channel'],
  ['utm_campaign',        'Campaign'],
  ['attributed_revenue',  'Revenue by source'],
  ['gclid',               'Google click ID'],
];

// --- Event pipeline (the "Tracking healthy" panel animates this) ----------
const PIPELINE = {
  trigger: { name:'purchase', lead:'Amara Osei', value:'$1,480.00', src:'chatgpt', srcLabel:'ChatGPT', page:'/checkout' },
  ingest: [
    ['stripe',      'Stripe webhook',    'charge.succeeded'],
    ['sourcetrack', 'Session stitched',  'first touch = AI Search'],
  ],
  targets: [
    ['google-ads', 'Google Ads',   'Offline conversion · value $1,480', '214ms'],
    ['meta',       'Meta CAPI',    'Purchase · value 1480 · USD',       '268ms'],
    ['linkedin',   'LinkedIn CAPI','Conversion · $1,480',               '302ms'],
    ['hubspot',    'HubSpot',      'Deal + first-touch channel written','176ms'],
    ['salesforce', 'Salesforce',   'Opportunity source updated',        '241ms'],
    ['slack',      'Slack',        '#revenue — new customer posted',    '88ms'],
  ],
  health: [
    ['Script response', '12ms p50'],
    ['Events last hour', '1,284'],
    ['Failed deliveries', '0'],
    ['Retry queue', 'empty'],
  ],
};

// Namespaced under DEMO — bare names like CHANNELS collide with other
// components on the marketing pages (lib/dashboard.jsx also exports CHANNELS).
const DEMO = {
  DEMO_RANGE, CHANNELS, TOTALS, MODELS, modelRevenue, allocate,
  DAILY_VISITORS, DAILY_CONV, DAY_LABELS, REFERRERS, REF_TOTAL,
  PAGES, PATHS, PATHS_OTHER, LEADS, INTEGRATIONS, CRM_MAP, SPARK,
  KEYWORDS, KW_TOTAL, LIVE, LIVE_PATHS, AI_DOMAINS, AI_ENGINES, AI_OTHER, PIPELINE,
};



// ==================== FROM live-visitors.jsx ====================
// LiveVisitors — realtime sessions panel. Used inside the demo app (Analytics,
// Dashboard) and on the marketing "See it in action" section.
// The tick only advances the on-screen clock and occasionally moves one session
// to a new page; it never invents conversions.


function agoLabel(s) {
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  return m + 'm ' + (s % 60) + 's';
}

function DevIcon({ kind }) {
  return kind === 'mobile' ? (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <rect x="7" y="3" width="10" height="18" rx="2.4" /><path d="M11 18.2h2" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <rect x="3" y="4.6" width="18" height="12" rx="2" /><path d="M8.6 20h6.8" />
    </svg>
  );
}

function LiveVisitors({ rows = 6, compact = false, showHead = true }) {
  const seed = (DEMO && DEMO.LIVE) || [];
  const paths = (DEMO && DEMO.LIVE_PATHS) || ['/'];
  const [list, setList] = lvS(seed.slice(0, rows));
  const [pulse, setPulse] = lvS(null);
  const tick = lvR(0);

  lvE(() => {
    if (!seed.length) return;
    const t = setInterval(() => {
      tick.current += 1;
      setList((prev) => {
        const next = prev.map((v) => ({ ...v, secs: v.secs + 3 }));
        // every 4th tick, one session navigates: it moves to the top of the list
        if (tick.current % 4 === 0) {
          const i = tick.current / 4 % next.length | 0;
          const v = next[i];
          const p = paths[(tick.current + i) % paths.length];
          if (p !== v.path) { v.path = p; v.secs = 2; setPulse(v.id); setTimeout(() => setPulse(null), 1200); }
          next.sort((a, b) => a.secs - b.secs);
        }
        return next;
      });
    }, 3000);
    return () => clearInterval(t);
  }, []);

  const live = list.length;
  return (
    <div className={'lv' + (compact ? ' compact' : '')}>
      {showHead ? (
        <div className="lv-head">
          <span className="lv-live"><i></i> {live} active now</span>
          <span className="lv-note">No cookie set · anonymous ids</span>
        </div>
      ) : null}
      <div className="lv-rows">
        {list.map((v) => (
          <div className={'lv-row' + (pulse === v.id ? ' moved' : '')} key={v.id}>
            <span className="lv-flag" aria-hidden="true">{v.flag}</span>
            <span className="lv-who">
              <b>{v.alias}</b>
              <em>{v.id}</em>
            </span>
            <span className="lv-dev"><DevIcon kind={v.dev} /></span>
            <code className="lv-path">{v.path}</code>
            <span className="lv-ago">{agoLabel(v.secs)}</span>
            <span className="lv-src">
              {BrandIcon ? <BrandIcon src={v.src} size={18} /> : null}
              {v.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}




// ==================== FROM demo-app.jsx ====================
// Demo app — shell, shared primitives, Dashboard + Analytics screens.



/* ================= shared primitives ================= */
function I({ d, n }) { // line icon
  const P = {
    grid:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    chart:'M5 20V10M12 20V4M19 20v-7',
    pie:'M12 3a9 9 0 1 0 9 9h-9z',
    users:'M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11zM3 20a6 6 0 0 1 12 0M17.5 11.5a2.6 2.6 0 1 0 0-5.2M15.5 20a4.5 4.5 0 0 1 6.5-4',
    doc:'M6 3h8l4 4v14H6zM14 3v4h4',
    gear:'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 12a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7.4 7.4 0 0 0-2-1.2L14.6 3h-4l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7.4 7.4 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
    chevD:'M6 9l6 6 6-6',
    chevR:'M9 6l6 6-6 6',
    x:'M6 6l12 12M18 6L6 18',
    out:'M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    dl:'M12 4v11M7 11l5 5 5-5M4 20h16',
    plus:'M12 5v14M5 12h14',
    cal:'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    moon:'M20 14a8 8 0 1 1-9.9-9.9A7 7 0 0 0 20 14z',
    sun:'M12 5V3M12 21v-2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7 4.9 19.1M19.1 4.9l-1.4 1.4M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z',
    search:'M10.6 4.4a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zM15.4 15.4 20 20',
    link:'M9.5 14.5l5-5M8 12l-2 2a3 3 0 0 0 4.2 4.2l2-2M16 12l2-2a3 3 0 0 0-4.2-4.2l-2 2',
    shield:'M12 3l7 3v6c0 4-3 7.4-7 9-4-1.6-7-5-7-9V6z',
    bolt:'M13 3L5 14h5l-1 7 8-11h-5z',
    bar:'M5 20V9M12 20V5M19 20v-9',
    line:'M4 17l5-6 4 3 7-8',
    kpi:'M4 6h16v12H4zM8 14l3-3 2 2 3-4',
    pin:'M12 3v9M8 7l4-4 4 4M6 21h12',
    csv:'M6 3h8l4 4v14H6zM9 13h6M9 17h4',
    check:'M5 13l4 4L19 7',
    refresh:'M20 11a8 8 0 1 0-2.3 5.7M20 5.5V11h-5.5',
    filt:'M4 5h16l-6 7v7l-4-2v-5z',
    tag:'M4 12l8-8h7v7l-8 8z',
    globe:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3C9.5 5.5 9.5 18.5 12 21',
    mail:'M3 6h18v12H3zM3 7l9 6 9-6',
    cart:'M4 6h16l-1.5 11H5.5zM9 6a3 3 0 0 1 6 0',
    card:'M3 6h18v12H3zM3 10h18',
    chat:'M20 12a8 8 0 0 1-8 8H8l-4 3v-5.5A8 8 0 0 1 12 4a8 8 0 0 1 8 8z',
    form:'M5 3h14v18H5zM9 8h6M9 12h6M9 16h3',
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={n || 1.9} strokeLinecap="round" strokeLinejoin="round"><path d={P[d]} /></svg>;
}

function useCount(target, ms = 900) {
  const [v, setV] = uS(target);
  const from = uR(target), raf = uR(0);
  uE(() => {
    const t0 = performance.now(), a = from.current;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      setV(a + (target - a) * e);
      if (p < 1) raf.current = requestAnimationFrame(tick); else from.current = target;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);
  return v;
}
const money = (n) => '$' + Math.round(n).toLocaleString();
const num = (n) => Math.round(n).toLocaleString();

function Kpi({ lbl, val, fmt, ctx, tone }) {
  const v = useCount(val);
  return (
    <div className="d-card k3 d-kpi">
      <div className="lbl">{lbl}</div>
      <div className="val">{fmt === 'money' ? money(v) : fmt === 'money2' ? '$' + v.toFixed(2) : fmt === 'pct' ? v.toFixed(1) + '%' : num(v)}</div>
      <div className={'ctx' + (tone ? ' ' + tone : '')}>{ctx}</div>
    </div>
  );
}

// Prominent per-screen feature band: what this screen is for, and the surfaces
// it touches. Keeps every screen self-explanatory in the embedded demo.
function FeatureBanner({ eb, title, copy, chips = [], tone }) {
  const B = BrandIcon;
  return (
    <div className={'d-feat' + (tone ? ' ' + tone : '')}>
      <div className="d-feat-copy">
        <span className="eb">{eb}</span>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      <div className="d-feat-chips">
        {chips.map(([src, label]) => (
          <span className="d-fchip" key={label}>{src && B ? <B src={src} size={19} /> : null}{label}</span>
        ))}
      </div>
    </div>
  );
}

function Src({ src, name, sub, size = 30 }) {
  const B = BrandIcon;
  return (
    <div className="d-ch">
      {B ? <B key="ic" src={src} size={size} /> : null}
      <span key="tx" style={{ minWidth: 0 }}><span className="nm" style={{ display:'block' }}>{name}</span>{sub ? <span className="sb" style={{ display:'block' }}>{sub}</span> : null}</span>
    </div>
  );
}

// Emoji person avatar with a small source badge in the corner. `name`/`sub`
// render as visible text; pass `label` instead when the caller draws its own
// heading and only needs the accessible name.
function Avatar({ emoji, src, name, sub, lg, label }) {
  const B = BrandIcon;
  return (
    <div className="d-ch">
      <span key="av" className="d-av-wrap">
        <span className={'d-av eav' + (lg ? ' lg' : '')} role="img" aria-label={label || name || 'person'}>{emoji || '\uD83D\uDC64'}</span>
        {B && src ? <span className="bdg"><B src={src} size={lg ? 18 : 15} /></span> : null}
      </span>
      {name ? <span key="tx" style={{ minWidth: 0 }}><span className="nm" style={{ display:'block' }}>{name}</span>{sub ? <span className="sb" style={{ display:'block' }}>{sub}</span> : null}</span> : null}
    </div>
  );
}

// Inline sparkline — 12 buckets, area + line.
function Spark({ vals }) {
  const W = 78, H = 26, max = Math.max(...vals), min = Math.min(...vals), rng = (max - min) || 1;
  const xs = vals.map((_, i) => (i / (vals.length - 1)) * (W - 3) + 1.5);
  const ys = vals.map((v) => H - 3 - ((v - min) / rng) * (H - 7));
  const ln = xs.map((x, i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + ys[i].toFixed(1)).join(' ');
  return (
    <svg className="d-spark" viewBox={`0 0 ${W} ${H}`}>
      <path className="ar" d={`${ln} L${xs[xs.length - 1]} ${H} L${xs[0]} ${H} Z`} />
      <path className="ln" d={ln} />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="2.1" fill="var(--d-chart)" />
    </svg>
  );
}

/* ================= area chart ================= */
function AreaChart({ values, marks, labels }) {
  const W = 900, H = 230, PAD = { l: 8, r: 8, t: 14, b: 26 };
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const max = Math.max(...values) * 1.22;
  const xs = values.map((_, i) => PAD.l + (i / (values.length - 1)) * iw);
  const ys = values.map((v) => PAD.t + ih - (v / max) * ih);
  const line = xs.map((x, i) => (i ? `L${x.toFixed(1)} ${ys[i].toFixed(1)}` : `M${x.toFixed(1)} ${ys[i].toFixed(1)}`)).join(' ');
  const area = `${line} L${xs[xs.length - 1]} ${PAD.t + ih} L${xs[0]} ${PAD.t + ih} Z`;
  const ref = uR(null); const [len, setLen] = uS(0);
  uE(() => { if (ref.current) setLen(ref.current.getTotalLength()); }, [line]);
  const [hov, setHov] = uS(null);

  return (
    <div className="d-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        onMouseLeave={() => setHov(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left) / r.width * W - PAD.l) / iw * (values.length - 1));
          setHov(Math.max(0, Math.min(values.length - 1, i)));
        }}>
        <defs>
          <linearGradient id="dg-a" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(163,199,32,.30)" /><stop offset="100%" stopColor="rgba(163,199,32,0)" />
          </linearGradient>
        </defs>
        {[.25, .5, .75, 1].map((f, i) => (
          <line key={i} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih - f * ih} y2={PAD.t + ih - f * ih} stroke="#EDEFE9" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#dg-a)" style={{ opacity: 0, animation: 'd-fade .7s .3s ease forwards' }} />
        <path ref={ref} d={line} fill="none" stroke="#A3C720" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"
          style={len ? { strokeDasharray: len, strokeDashoffset: len, animation: 'd-draw 1.25s cubic-bezier(.22,1,.36,1) forwards' } : { opacity: 0 }} />
        {marks.map((m, i) => m > 0 && i % 3 === 0 ? (
          <circle key={i} cx={xs[i]} cy={ys[i]} r={hov === i ? 5 : 3} fill="#fff" stroke="#15181A" strokeWidth="1.8" className="dot"
            style={{ opacity: 0, animation: `d-fade .3s ${.9 + i * .012}s ease forwards` }} />
        ) : null)}
        {hov != null ? <line x1={xs[hov]} x2={xs[hov]} y1={PAD.t} y2={PAD.t + ih} stroke="#15181A" strokeWidth="1" strokeDasharray="3 3" opacity=".35" /> : null}
        {[0, 7, 14, 21, 29].map((i) => (
          <text key={i} x={xs[i]} y={H - 6} fontSize="10.5" fontWeight="600" fill="#8A928E"
            textAnchor={i === 0 ? 'start' : i === 29 ? 'end' : 'middle'}>{labels[i]}</text>
        ))}
      </svg>
      <div className={'d-tip' + (hov != null ? ' on' : '')} style={{ left: hov != null ? `${(xs[hov] / W) * 100}%` : 0, top: hov != null ? `${(ys[hov] / H) * 100}%` : 0 }}>
        {hov != null ? <><em>{labels[hov]}</em>{num(values[hov])} visitors · {marks[hov]} conv</> : null}
      </div>
    </div>
  );
}

/* ================= channel table ================= */
function ChannelTable({ revBy, onRow, cvrCol = true, spark = false }) {
  const D = DEMO;
  // p1/p2/p3 = drop priority; the @container rules in demo.css hide them as the
  // embedded panel narrows, so the table never has to outgrow its card.
  const cols = [
    { h:'Channel / source', cell:(c) => <Src src={c.src} name={c.name} sub={c.sub} /> },
    { h:'Visitors', cell:(c) => num(c.visitors) },
    { h:'Leads', cls:'p1', cell:(c) => c.leads },
    { h:'Conversions', cell:(c) => c.conv },
  ];
  if (cvrCol) cols.push({ h:'CVR', cls:'p2', cell:(c) => (c.conv / c.visitors * 100).toFixed(1) + '%' });
  if (spark)  cols.push({ h:'Trend', cls:'p3', cell:(c) => <Spark vals={D.SPARK[c.key]} /> });
  cols.push({ h:'Revenue', cell:(c) => <RevCell v={(revBy || {})[c.key] != null ? revBy[c.key] : c.rev} /> });

  return (
    <table className="d-tbl">
      <thead><tr>
        {cols.map((c, i) => <th key={i} className={c.cls || ''}>{c.h}</th>)}
        <th key="chev"></th>
      </tr></thead>
      <tbody>
        {D.CHANNELS.map((c, i) => (
          <tr key={c.key} className="d-rowin" style={{ animationDelay: (i * 45) + 'ms' }} onClick={() => onRow && onRow(c)}>
            {cols.map((col, j) => <td key={j} className={col.cls || ''}>{col.cell(c)}</td>)}
            <td key="chev" className="chev"><I d="chevR" n="2.2" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function RevCell({ v }) { return <span>{money(useCount(v, 700))}</span>; }

/* ================= Dashboard ================= */
function ScreenDashboard({ go, openLead }) {
  const T = DEMO.TOTALS;
  return (
    <div className="d-screen">
      <div className="d-head">
        <div><h1>Dashboard</h1><p>What is driving leads and revenue in this workspace.</p></div>
        <div className="d-head-act">
          <button className="d-btn"><I d="dl" /> Export</button>
          <button className="d-btn dark" onClick={() => go('reports')}><I d="plus" /> Build report</button>
        </div>
      </div>
      <div className="d-grid">
        <FeatureBanner eb="Dashboard" title="Every conversion type in one place"
          copy="Forms, chat, meetings, payments and store orders land in the same dataset — each one carrying the source and journey that produced it."
          chips={[['typeform','Forms'],['intercom','Chat'],['calendly','Meetings'],['stripe','Payments'],['shopify','Orders']]} />
        <Kpi lbl="Visitors" val={T.visitors} ctx="↑ 12.4% vs prior period" tone="up" />
        <Kpi lbl="Leads" val={T.leads} ctx={T.v2l.toFixed(2) + '% visitor → lead'} />
        <Kpi lbl="Conversions" val={T.conv} ctx={T.l2c.toFixed(1) + '% lead → customer'} />
        <Kpi lbl="Attributed revenue" val={T.rev} fmt="money" ctx="Stripe payment events" />

        <div className="d-card k8">
          <div className="d-ctitle">
            <div><h3>Visitors and conversions</h3><p>Daily traffic with verified conversion markers</p></div>
            <div className="r"><span className="d-live"><b></b> Updated now</span></div>
          </div>
          <AreaChart values={DEMO.DAILY_VISITORS} marks={DEMO.DAILY_CONV} labels={DEMO.DAY_LABELS} />
          <div className="d-chart-foot">
            <span><b>{num(T.visitors)}</b>visitors</span>
            <span><b>{T.conv}</b>conversions</span>
            <span><b>{T.cvr.toFixed(2)}%</b>conversion rate</span>
          </div>
        </div>

        <div className="d-card k4 d-insight" style={{ display:'flex', flexDirection:'column' }}>
          <div className="eb">Performance insight</div>
          <h4>Paid Search created the most attributed revenue.</h4>
          <p>Google Ads generated {money(7080)} on first touch, while AI Search had the strongest visitor-to-customer rate at 3.0%.</p>
          <a className="d-link" style={{ marginTop:14 }} onClick={() => go('attribution')} href="#">Compare attribution <I d="chevR" n="2.4" /></a>
          <div className="tc">
            {BrandIcon ? <BrandIcon src="google-ads" size={30} /> : null}
            <span><div className="lbl">Top revenue channel</div><div className="v">Paid Search · {money(7080)}</div></span>
          </div>
        </div>

        <div className="d-card pad0">
          <div className="d-ctitle" style={{ padding:'18px 18px 0', marginBottom:14 }}>
            <div><h3>Channel performance</h3><p>First-touch attribution · {DEMO.DEMO_RANGE.label}</p></div>
            <div className="r"><a className="d-link" href="#" onClick={(e)=>{e.preventDefault();go('attribution');}}>View full attribution <I d="chevR" n="2.4" /></a></div>
          </div>
          <div className="d-tblwrap" style={{ padding:'0 4px 6px' }}><ChannelTable onRow={() => go('attribution')} /></div>
        </div>

        <div className="d-card k4" style={{ cursor:'pointer' }} onClick={() => go('analytics')}>
          <div className="d-ctitle"><div><h3>Explore traffic</h3><p>Sources, content and pages</p></div><div className="r"><I d="chevR" n="2.2" /></div></div>
          <div className="d-bars">
            {DEMO.REFERRERS.slice(0, 3).map((r) => (
              <div className="d-bar" key={r.host}>
              <div className="t"><span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>{BrandIcon ? <BrandIcon src={r.src} size={20} /> : null}{r.host}</span><b>{num(r.visitors)}</b></div>
                <div className="tr"><i style={{ width: (r.visitors / DEMO.REF_TOTAL.visitors * 100) + '%' }}></i></div>
              </div>
            ))}
          </div>
        </div>
        <div className="d-card k4" style={{ cursor:'pointer' }} onClick={() => go('leads')}>
          <div className="d-ctitle"><div><h3>Audit journeys</h3><p>Every lead and its conversion path</p></div><div className="r"><I d="chevR" n="2.2" /></div></div>
          <div style={{ display:'grid', gap:9 }}>
            {DEMO.LEADS.slice(0, 3).map((l) => (
              <div key={l.email} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span className="d-av eav" style={{ width:24, height:24, fontSize:13 }}>{l.emoji}</span>
                <span style={{ fontSize:12.5, fontWeight:800 }}>{l.name}</span>
                <span style={{ marginLeft:'auto', fontSize:12, fontWeight:700, color:'var(--d-ink-3)' }}>{l.journey.length} touches</span>
              </div>
            ))}
          </div>
        </div>
        <div className="d-card k4" style={{ cursor:'pointer' }} onClick={() => go('integrations')}>
          <div className="d-ctitle"><div><h3>Push conversions back</h3><p>Server-side sync status</p></div><div className="r"><I d="chevR" n="2.2" /></div></div>
          <div style={{ display:'grid', gap:9 }}>
            {['Google Ads','Meta','LinkedIn'].map((n, i) => (
              <div key={n} style={{ display:'flex', alignItems:'center', gap:10, fontSize:12.5, fontWeight:800 }}>
                <span className="d-tag green">Live</span>{n}
                <span style={{ marginLeft:'auto', fontSize:12, fontWeight:700, color:'var(--d-ink-3)' }}>{[34, 10, 10][i]} events</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= Analytics ================= */
function ScreenAnalytics({ go }) {
  const T = DEMO.TOTALS;
  const [tab, setTab] = uS('sources');
  const maxPage = Math.max(...DEMO.PAGES.map((p) => p.visitors));
  return (
    <div className="d-screen">
      <div className="d-head">
        <div><h1>Analytics</h1><p>Traffic, content and the funnel it produces.</p></div>
        <div className="d-head-act">
          <div className="d-seg">
            {[['sources','Sources'],['content','Content'],['funnel','Funnel']].map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="d-grid">
        <FeatureBanner eb="Analytics" title="Traffic that reconciles with revenue"
          copy="Sources, landing pages, funnel steps and multi-touch paths — all cut from the same first-party dataset, never sampled."
          chips={[['google','Sources'],['google-organic','SEO keywords'],['','Content'],['','Funnel'],['','Paths']]} />
        <Kpi lbl="Visitors" val={T.visitors} ctx="↑ 12.4% vs prior period" tone="up" />
        <Kpi lbl="Referred visitors" val={DEMO.REF_TOTAL.visitors} ctx="Known referring domains" />
        <Kpi lbl="Conversion rate" val={T.cvr} fmt="pct" ctx="Visitor → customer" />
        <Kpi lbl="Revenue per visitor" val={T.rev / T.visitors} fmt="money2" ctx="Attributed, first touch" />

        {tab === 'sources' ? (
          <React.Fragment key="s">
          <div className="d-card">
            <div className="d-ctitle">
              <div><h3>Realtime visitors</h3><p>Live sessions, updating every few seconds</p></div>
              <div className="r"><span className="d-note"><I d="shield" /> No cookie set</span></div>
            </div>
            {LiveVisitors ? <LiveVisitors rows={6} /> : null}
          </div>

          <div className="d-card">
            <div className="d-ctitle">
              <div><h3>AI assistant referrals</h3><p>Assistant-level traffic, conversions and revenue</p></div>
              <div className="r"><span className="d-note"><I d="shield" /> {DEMO.AI_DOMAINS} domains detected</span></div>
            </div>
            {AiEngines ? <AiEngines /> : null}
          </div>

          <div className="d-card pad0">
            <div className="d-ctitle" style={{ padding:'18px 18px 0', marginBottom:14 }}>
              <div><h3>Referring domains</h3><p>Where known referred traffic came from</p></div>
              <div className="r"><span className="d-note"><I d="shield" /> First-party measurement</span></div>
            </div>
            <div className="d-tblwrap" style={{ padding:'0 4px 6px' }}>
              <table className="d-tbl">
                <thead><tr><th>Referrer</th><th>Visitors</th><th>Conversions</th><th>Change</th></tr></thead>
                <tbody>
                  <tr className="sum"><td><span style={{ fontWeight:900 }}>Summary total</span></td><td>{num(DEMO.REF_TOTAL.visitors)}</td><td>{DEMO.REF_TOTAL.conv}</td><td style={{ color:'var(--d-green)' }}>+{DEMO.REF_TOTAL.change}%</td></tr>
                  {DEMO.REFERRERS.map((r, i) => (
                    <tr key={r.host} className="d-rowin" style={{ animationDelay:(i*45)+'ms' }}>
                      <td><Src src={r.src} name={r.host} size={26} /></td>
                      <td>{num(r.visitors)}</td><td>{r.conv}</td>
                      <td style={{ color: r.change > 0 ? 'var(--d-green)' : 'var(--d-red)' }}>{r.change > 0 ? '+' : ''}{r.change}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </React.Fragment>
        ) : null}

        {tab === 'content' ? (
          <React.Fragment key="c">
          <div className="d-card pad0">
            <div className="d-ctitle" style={{ padding:'18px 18px 0', marginBottom:14 }}>
              <div><h3>Landing pages</h3><p>Entry pages ranked by attributed revenue</p></div>
            </div>
            <div className="d-tblwrap" style={{ padding:'0 4px 6px' }}>
              <table className="d-tbl">
                <thead><tr><th>Landing page</th><th>Visitors</th><th>Leads</th><th>Conversions</th><th>Revenue</th></tr></thead>
                <tbody>
                  {DEMO.PAGES.map((p, i) => (
                    <tr key={p.path} className="d-rowin" style={{ animationDelay:(i*45)+'ms' }}>
                      <td>
                        <div style={{ display:'grid', gap:6, minWidth:200 }}>
                          <span style={{ fontWeight:800 }}>{p.path}</span>
                          <span className="tr" style={{ display:'block', height:6, borderRadius:99, background:'#F0F2EC', overflow:'hidden' }}>
                            <i style={{ display:'block', height:'100%', width:(p.visitors/maxPage*100)+'%', background:'linear-gradient(90deg,#B8DC2E,#CCF03F)', borderRadius:99 }}></i>
                          </span>
                        </div>
                      </td>
                      <td>{num(p.visitors)}</td><td>{p.leads}</td><td>{p.conv}</td><td>{money(p.rev)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="d-card pad0">
            <div className="d-ctitle" style={{ padding:'18px 18px 0', marginBottom:14 }}>
              <div><h3>SEO revenue by keyword <span className="d-tag">Estimated</span></h3><p>Organic queries modelled to revenue · {DEMO.DEMO_RANGE.label}</p></div>
              <div className="r"><span className="d-note"><I d="shield" /> Modelled, not recorded</span></div>
            </div>
            <div className="d-tblwrap" style={{ padding:'0 4px 6px' }}>
              <table className="d-tbl">
                <thead><tr><th>Query</th><th>Clicks</th><th className="p2">Avg. position</th><th className="p1">Conversions</th><th>Est. revenue</th></tr></thead>
                <tbody>
                  <tr className="sum">
                    <td><span style={{ fontWeight:900 }}>Tracked queries</span></td>
                    <td>{num(DEMO.KW_TOTAL.clicks)}</td>
                    <td className="p2">—</td>
                    <td className="p1">{DEMO.KW_TOTAL.conv}</td>
                    <td>{money(DEMO.KW_TOTAL.rev)}</td>
                  </tr>
                  {DEMO.KEYWORDS.map((k, i) => (
                    <tr key={k.q} className="d-rowin" style={{ animationDelay:(i*45)+'ms' }}>
                      <td>
                        <div className="d-ch">
                          {BrandIcon ? <BrandIcon src="google-organic" size={26} /> : null}
                          <span><div className="nm">{k.q}</div><div className="sub">{k.page}</div></span>
                        </div>
                      </td>
                      <td>{num(k.clicks)}</td>
                      <td className="p2">{k.pos.toFixed(1)}</td>
                      <td className="p1">{k.conv}</td>
                      <td>{money(k.rev)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding:'0 18px 16px', fontSize:11.5, fontWeight:700, color:'var(--d-ink-3)', lineHeight:1.5 }}>
              Estimate = organic clicks for the query × the landing page’s conversion rate × average order value. Tracked queries cover {num(DEMO.KW_TOTAL.clicks)} of {num(1432)} recorded organic visits; the rest sits in long-tail queries.
            </div>
          </div>
          </React.Fragment>
        ) : null}

        {tab === 'funnel' ? (
          <React.Fragment key="f">
            <div className="d-card">
              <div className="d-ctitle"><div><h3>Conversion funnel</h3><p>{DEMO.DEMO_RANGE.label} · all channels</p></div></div>
              <div className="d-funnel">
                {[
                  { l:'Visitors', v:num(T.visitors), r:'100%', w:100 },
                  { l:'Leads', v:num(T.leads), r:T.v2l.toFixed(2) + '% of visitors', w:38 },
                  { l:'Conversions', v:num(T.conv), r:T.l2c.toFixed(1) + '% of leads', w:22 },
                  { l:'Revenue', v:money(T.rev), r:money(T.rev / T.conv) + ' per customer', w:14 },
                ].map((s) => (
                  <div className="d-fstep" key={s.l} style={{ '--w': s.w + '%' }}>
                    <div className="lbl">{s.l}</div><div className="v">{s.v}</div><div className="r">{s.r}</div>
                    <span style={{ position:'absolute', left:0, bottom:0, height:3, width:s.w + '%', background:'var(--d-lime)' }}></span>
                  </div>
                ))}
              </div>
            </div>
            <div className="d-card">
              <div className="d-ctitle"><div><h3>Paths to conversion</h3><p>Channel sequences ranked by conversions</p></div>
                <div className="r"><a className="d-link" href="#" onClick={(e)=>{e.preventDefault();go('attribution');}}>Attribution models <I d="chevR" n="2.4" /></a></div></div>
              <table className="d-tbl">
                <thead><tr><th>Path</th><th>Conversions</th><th>Revenue</th></tr></thead>
                <tbody>
                  {DEMO.PATHS.map((p, i) => (
                    <tr key={i} className="d-rowin" style={{ animationDelay:(i*45)+'ms' }}>
                      <td>
                        <span className="d-path">
                          {p.steps.map((s, j) => (
                            <React.Fragment key={j}>
                              {j ? <span className="d-parrow">→</span> : null}
                              <span className="d-pnode">
                                {BrandIcon ? <BrandIcon src={(DEMO.CHANNELS.find((c) => c.name === s) || {}).src || 'direct'} size={18} /> : null}
                                {s}
                              </span>
                            </React.Fragment>
                          ))}
                        </span>
                      </td>
                      <td>{p.conv}</td><td>{money(p.rev)}</td>
                    </tr>
                  ))}
                  <tr className="sum"><td>{DEMO.PATHS_OTHER.conv} other paths</td><td>{DEMO.PATHS_OTHER.conv}</td><td>{money(DEMO.PATHS_OTHER.rev)}</td></tr>
                </tbody>
              </table>
            </div>
          </React.Fragment>
        ) : null}
      </div>
    </div>
  );
}





// ==================== FROM demo-screens.jsx ====================
// Demo app — Attribution, Leads (+ journey drawer), Reports, Integrations, Shell.


// Primitives live in demo-app.jsx (separate Babel scope) — alias them locally.

/* ================= Attribution ================= */
function ScreenAttribution({ openChannel }) {
  const [mid, setMid] = sS('first');
  const model = DEMO.MODELS.find((m) => m.id === mid);
  const revBy = DEMO.modelRevenue(mid);
  const T = DEMO.TOTALS;
    const top = DEMO.CHANNELS.map((c) => [c.name, revBy[c.key]]).sort((a, b) => b[1] - a[1])[0];
  const bestCvr = DEMO.CHANNELS.map((c) => [c.name, c.conv / c.visitors * 100]).sort((a, b) => b[1] - a[1])[0];
  const assisted = DEMO.PATHS.filter((p) => p.steps.length > 1).reduce((a, p) => a + p.conv, 0);

  return (
    <div className="d-screen">
      <div className="d-head">
        <div><h1>Attribution</h1><p>The same {money(T.rev)} of recorded revenue, credited five different ways.</p></div>
      </div>
      <div className="d-grid">
        <FeatureBanner eb="Attribution" title="Five models, one dataset underneath"
          copy="Change the model and the credit moves. The recorded visits and conversions never do — no re-tagging, no second pixel."
          chips={DEMO.MODELS.map((m) => ['', m.label])} />
        <div className="d-card" style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
          <span style={{ fontSize:9.5, fontWeight:900, letterSpacing:'.11em', textTransform:'uppercase', color:'var(--d-ink-3)' }}>Attribution model</span>
          <div className="d-seg">
            {DEMO.MODELS.map((m) => (
              <button key={m.id} className={m.id === mid ? 'on' : ''} onClick={() => setMid(m.id)}>{m.label}</button>
            ))}
          </div>
          <span className="d-note" style={{ marginLeft:'auto' }}><I d="shield" /> Model changes credit — not the recorded visits or conversions.</span>
        </div>

        <Kpi lbl="Attributed revenue" val={T.rev} fmt="money" ctx={T.conv + ' verified conversions'} />
        <Kpi lbl="Top revenue source" val={top[1]} fmt="money" ctx={top[0]} />
        <Kpi lbl="Best conversion rate" val={bestCvr[1]} fmt="pct" ctx={bestCvr[0] + ' · visitor → customer'} />
        <Kpi lbl="Assisted journeys" val={assisted} ctx="More than one touchpoint" />

        <div className="d-card pad0">
          <div className="d-ctitle" style={{ padding:'18px 18px 0', marginBottom:14 }}>
            <div><h3>Channel attribution</h3><p>{model.note}</p></div>
            <div className="r"><button className="d-btn"><I d="filt" /> Columns</button></div>
          </div>
          <div className="d-tblwrap" style={{ padding:'0 4px 6px' }}><ChannelTable revBy={revBy} onRow={openChannel} spark={true} /></div>
        </div>

        <div className="d-card k7">
          <div className="d-ctitle"><div><h3>Credit split</h3><p>Share of {money(T.rev)} under {model.label.toLowerCase()}</p></div></div>
          <div className="d-bars">
            {DEMO.CHANNELS.map((c) => (
              <div className="d-bar" key={c.key}>
                <div className="t"><span>{c.name}</span><b>{money(revBy[c.key])} · {(revBy[c.key] / T.rev * 100).toFixed(1)}%</b></div>
                <div className="tr"><i style={{ width: (revBy[c.key] / T.rev * 100) + '%' }}></i></div>
              </div>
            ))}
          </div>
        </div>

        <div className="d-card k5 d-insight" style={{ display:'flex', flexDirection:'column' }}>
          <div className="eb">What changed</div>
          <h4>Direct moves {money(Math.abs(DEMO.modelRevenue('last').direct - DEMO.modelRevenue('first').direct))} between first and last touch.</h4>
          <p>ChatGPT introduced 14 customers who later returned through Direct or Paid Search. Under last touch that discovery credit disappears entirely.</p>
          <div className="tc">
            {BrandIcon ? <BrandIcon src="chatgpt" size={30} /> : null}
            <span><div className="lbl">AI Search, first touch</div><div className="v">{money(DEMO.modelRevenue('first').ai)} · 19 conversions</div></span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= Leads ================= */
const EV_ICON = { visit:'globe', form:'form', chat:'chat', meet:'cal', pay:'card' };
function ScreenLeads({ openLead }) {
    const [f, setF] = sS('all');
  const [q, setQ] = sS('');
  const [sort, setSort] = sS({ k: 'value', asc: false });
  const cols = [
    { k:'name',    l:'Person',      srt:true },
    { k:'ch',      l:'First touch', srt:true },
    { k:'event',   l:'Conversion' },
    { k:'touches', l:'Touches',     srt:true, cls:'p1' },
    { k:'first',   l:'First seen',  cls:'p2' },
    { k:'value',   l:'Value',       srt:true },
    { k:'crm',     l:'CRM',         cls:'p3' },
  ];
  const get = (l, k) => k === 'touches' ? l.journey.length : k === 'value' ? l.value : (l[k] || '');
  let rows = D.LEADS.filter((l) => f === 'all' || (f === 'cust' ? l.status === 'Customer' : l.status === 'Lead'));
  const term = q.trim().toLowerCase();
  if (term) rows = rows.filter((l) => (l.name + ' ' + l.email + ' ' + l.ch + ' ' + l.event).toLowerCase().includes(term));
  rows = [...rows].sort((a, b) => {
    const x = get(a, sort.k), y = get(b, sort.k);
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return sort.asc ? r : -r;
  });
  const flip = (k) => setSort((s) => ({ k, asc: s.k === k ? !s.asc : false }));

  return (
    <div className="d-screen">
      <div className="d-head">
        <div><h1>Leads</h1><p>Every captured lead with its full journey. Open a row to inspect the evidence.</p></div>
        <div className="d-head-act">
          <span className="d-search">
            <I d="search" n="2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, channel…" aria-label="Search leads" />
          </span>
          <div className="d-seg">
            {[['all','All ' + D.LEADS.length],['cust','Customers'],['lead','Open']].map(([k, l]) => (
              <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>
            ))}
          </div>
          <button className="d-btn"><I d="dl" /> CSV</button>
        </div>
      </div>
      <div className="d-grid">
        <FeatureBanner eb="Leads" title="Every lead arrives with its journey attached"
          copy="Open any row for the full chronological path — first touch, every return visit, the form, the meeting, the payment — then watch it sync to your CRM."
          chips={[['hubspot','HubSpot'],['salesforce','Salesforce'],['pipedrive','Pipedrive'],['attio','Attio']]} />
        <div className="d-card pad0">
          <div className="d-tblwrap" style={{ padding:'6px 4px' }}>
            <table className="d-tbl">
              <thead><tr>
                {cols.map((c) => (
                  <th key={c.k} className={(c.cls ? c.cls + ' ' : '') + (c.srt ? 'srt' + (sort.k === c.k ? ' on' + (sort.asc ? ' asc' : '') : '') : '')}
                    onClick={c.srt ? () => flip(c.k) : undefined}>{c.l}</th>
                ))}
                <th key="chev"></th>
              </tr></thead>
              <tbody>
                {rows.map((l, i) => (
                  <tr key={l.email} className="d-rowin" style={{ animationDelay:(i*40)+'ms' }} onClick={() => openLead(l)}>
                    <td><Avatar emoji={l.emoji} src={l.src} name={l.name} sub={l.email} /></td>
                    <td>{l.ch}</td>
                    <td><span className={'d-tag' + (l.status === 'Customer' ? ' lime' : '')}>{l.event}</span></td>
                    <td className="p1">{l.journey.length}</td>
                    <td className="p2">{l.first}</td>
                    <td>{l.value ? money(l.value) : '—'}</td>
                    <td className="p3"><span className="d-tag green">Synced</span></td>
                    <td className="chev"><I d="chevR" n="2.2" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? <div className="d-empty">No leads match “{q}”.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function JourneyDrawer({ lead, onClose }) {
    sE(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <React.Fragment>
      <div className="d-scrim" onClick={onClose}></div>
      <aside className="d-drawer" role="dialog" aria-label={'Journey for ' + lead.name}>
        <div className="d-dhead">
          <Avatar emoji={lead.emoji} src={lead.src} lg={true} label={lead.name} />
          <div><h3>{lead.name}</h3><p>{lead.email}</p></div>
          <button className="d-x" onClick={onClose} aria-label="Close"><I d="x" n="2.2" /></button>
        </div>
        <div className="d-dbody">
          <div className="d-facts">
            <div><div className="l">First touch</div><div className="v">{BrandIcon ? <BrandIcon src={lead.src} size={20} /> : null}{lead.ch}</div></div>
            <div><div className="l">Last touch</div><div className="v">{BrandIcon ? <BrandIcon src={lead.journey[lead.journey.length - 1].src} size={20} /> : null}{lead.journey.length > 1 ? 'Direct' : lead.ch}</div></div>
            <div><div className="l">Touchpoints</div><div className="v">{lead.journey.length} across {lead.first} – {lead.last}</div></div>
            <div><div className="l">Attributed value</div><div className="v">{lead.value ? money(lead.value) : 'Not yet converted'}</div></div>
          </div>
          <div className="d-tl">
            {lead.journey.map((e, i) => (
              <div className={'d-ev' + (e.kind === 'pay' ? ' win' : '')} key={i} style={{ animationDelay: (i * 70 + 120) + 'ms' }}>
                <span className="mk"><I d={EV_ICON[e.kind]} n="2" /></span>
                <div className="bd">
                  <div className="t1">{e.ttl}{e.kind === 'pay' ? <span className="d-tag lime">Revenue</span> : null}</div>
                  <div className="t2">{e.t} · {e.page}</div>
                  <div className="kv">{e.kv.map(([k, v], j) => <div key={j}><span>{k}</span><b>{v}</b></div>)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="d-dsync">
            <span className="d-tag green">Synced</span>
            <span>Source, journey and revenue written to HubSpot and pushed to Google Ads.</span>
          </div>
        </div>
      </aside>
    </React.Fragment>
  );
}

/* ================= Reports ================= */
const TEMPLATES = [
  { id:'chan', nm:'Channel revenue',    sb:'Revenue grouped by channel',        view:'channel' },
  { id:'ref',  nm:'SEO & AI referrers', sb:'Visitors and conversions by domain', view:'ref' },
  { id:'page', nm:'Landing pages',      sb:'Entry pages ranked by revenue',      view:'page' },
  { id:'path', nm:'Paths to conversion',sb:'Multi-touch channel sequences',      view:'path' },
];
function ScreenReports() {
  const I = I, money = money, num = num;
  const [tpl, setTpl] = sS('ref');
  const [type, setType] = sS('bar');
  const t = TEMPLATES.find((x) => x.id === tpl);
  const [name, setName] = sS('Weekly AI + SEO referrers');
  return (
    <div className="d-screen">
      <div className="d-head">
        <div><h1>Report builder</h1><p>Pick a template, name it, pin it to the dashboard. Preview updates instantly.</p></div>
        <div className="d-head-act">
          <button className="d-btn"><I d="pin" /> Pin</button>
          <button className="d-btn"><I d="csv" /> CSV</button>
          <button className="d-btn dark"><I d="check" /> Save report</button>
        </div>
      </div>
      <div className="d-grid">
        <FeatureBanner eb="Reports" title="Templates that become client-ready reports"
          copy="Pick a template, rename it, pin it to a dashboard or publish it white-labelled on your own domain. The preview updates as you type."
          chips={[['','Pin to dashboard'],['','CSV'],['','PDF'],['slack','Scheduled to Slack']]} />
        <div className="d-card k5">
          <div className="d-ctitle"><div><h3>Configure</h3><p>Templates built on this workspace's data</p></div></div>
          <div style={{ display:'grid', gap:8, marginBottom:16 }}>
            {TEMPLATES.map((x) => (
              <div key={x.id} className={'d-tpl' + (x.id === tpl ? ' on' : '')} onClick={() => setTpl(x.id)}>
                <span><span className="nm" style={{ display:'block' }}>{x.nm}</span><span className="sb" style={{ display:'block' }}>{x.sb}</span></span>
                <span className="ar"><I d="chevR" n="2.2" /></span>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gap:14 }}>
            <div className="d-field"><label>Report name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="d-field"><label>Chart type</label>
              <div className="d-types">
                {[['bar','bar','Bar'],['line','line','Line'],['kpi','kpi','KPI']].map(([k, ic, l]) => (
                  <div key={k} className={'d-type' + (type === k ? ' on' : '')} onClick={() => setType(k)}><I d={ic} /> {l}</div>
                ))}
              </div>
            </div>
            <div className="d-field"><label>Attribution model</label><select defaultValue="first">{DEMO.MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></div>
          </div>
        </div>

        <div className="d-card k7 pad0">
          <div className="d-ctitle" style={{ padding:'18px 18px 0', marginBottom:14 }}>
            <div>
              <span style={{ fontSize:9.5, fontWeight:900, letterSpacing:'.12em', textTransform:'uppercase', color:'var(--d-lime-ink)' }}>Live preview</span>
              <h3 style={{ marginTop:8, fontSize:19 }}>{name || t.nm}</h3>
              <p>{DEMO.DEMO_RANGE.label} · first touch · {t.sb.toLowerCase()}</p>
            </div>
          </div>
          <div className="d-tblwrap" style={{ padding:'0 18px 18px' }}>
            {t.view === 'ref' ? (
              <table className="d-tbl">
                <thead><tr><th>Referrer</th><th>Visitors</th><th>Conversions</th><th>Change</th></tr></thead>
                <tbody>
                  <tr className="sum"><td>Summary total</td><td>{num(DEMO.REF_TOTAL.visitors)}</td><td>{DEMO.REF_TOTAL.conv}</td><td style={{ color:'var(--d-green)' }}>+{DEMO.REF_TOTAL.change}%</td></tr>
                  {DEMO.REFERRERS.map((r, i) => (
                    <tr key={r.host} className="d-rowin" style={{ animationDelay:(i*45)+'ms' }}>
                      <td><Src src={r.src} name={r.host} size={26} /></td><td>{num(r.visitors)}</td><td>{r.conv}</td>
                      <td style={{ color: r.change > 0 ? 'var(--d-green)' : 'var(--d-red)' }}>{r.change > 0 ? '+' : ''}{r.change}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {t.view === 'channel' ? <ChannelTable /> : null}
            {t.view === 'page' ? (
              <table className="d-tbl">
                <thead><tr><th>Landing page</th><th>Visitors</th><th>Conversions</th><th>Revenue</th></tr></thead>
                <tbody>{DEMO.PAGES.map((p, i) => (
                  <tr key={p.path} className="d-rowin" style={{ animationDelay:(i*45)+'ms' }}><td>{p.path}</td><td>{num(p.visitors)}</td><td>{p.conv}</td><td>{money(p.rev)}</td></tr>
                ))}</tbody>
              </table>
            ) : null}
            {t.view === 'path' ? (
              <table className="d-tbl">
                <thead><tr><th>Path</th><th>Conversions</th><th>Revenue</th></tr></thead>
                <tbody>{DEMO.PATHS.map((p, i) => (
                  <tr key={i} className="d-rowin" style={{ animationDelay:(i*45)+'ms' }}><td>{p.steps.join(' → ')}</td><td>{p.conv}</td><td>{money(p.rev)}</td></tr>
                ))}</tbody>
              </table>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= Integrations ================= */
function ScreenIntegrations() {
  const I = I;
  const [on, setOn] = sS(() => DEMO.INTEGRATIONS.map((g) => g.on));
  return (
    <div className="d-screen">
      <div className="d-head">
        <div><h1>Integrations</h1><p>Capture on one side, sync on the other. Nothing to rebuild.</p></div>
      </div>
      <div className="d-grid">
        <FeatureBanner eb="Integrations" title="Capture on one side, sync on the other"
          copy="Connect the tools you already run. Source and revenue flow out to your CRM, your ad platforms, and any AI assistant that speaks MCP."
          chips={[['stripe','Stripe'],['shopify','Shopify'],['google-ads','Google Ads'],['meta','Meta'],['claude','Claude']]} />
        <div className="d-card">
          <div className="d-ctitle"><div><h3>Connections</h3><p>{on.filter(Boolean).length} of {on.length} groups active in this workspace</p></div></div>
          <div className="d-int">
            {DEMO.INTEGRATIONS.map((g, i) => (
              <div className="d-icard" key={g.group}>
                <div className="hd">
                  <h4>{g.group}</h4>
                  <span className={'d-sw' + (on[i] ? '' : ' off')} role="switch" aria-checked={on[i]} onClick={() => setOn(on.map((v, j) => j === i ? !v : v))}><i></i></span>
                </div>
                <p>{g.desc}</p>
                <div className="d-logos">
                  {g.tools.map(([s, n]) => (
                    <span className="d-lchip" key={n}>{BrandIcon ? <BrandIcon src={s} size={16} /> : null}{n}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="d-card k6">
          <div className="d-ctitle"><div><h3>CRM field mapping</h3><p>Written on every new contact</p></div><div className="r"><span className="d-tag green">Live</span></div></div>
          <div style={{ display:'grid', gap:8 }}>
            {DEMO.CRM_MAP.map(([a, b]) => (
              <div key={a} style={{ display:'grid', gridTemplateColumns:'1fr 18px 1fr', alignItems:'center', gap:10, padding:'10px 13px', borderRadius:11, border:'1px solid var(--d-line)', background:'#FBFCF9', fontSize:12.5, fontWeight:800 }}>
                <code style={{ fontFamily:'var(--font-mono,monospace)', fontSize:11.5, color:'var(--d-lime-ink)' }}>{a}</code>
                <span style={{ color:'var(--d-ink-3)', textAlign:'center' }}>→</span>
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="d-card k6">
          <div className="d-ctitle"><div><h3>Ask this workspace</h3><p>Connected AI assistants query the same dataset</p></div></div>
          <div style={{ display:'grid', gap:10 }}>
            <div style={{ border:'1px solid var(--d-line)', borderRadius:12, padding:'12px 14px', fontSize:13, fontWeight:600, background:'#FBFCF9' }}>
              Which channel produced the most revenue, and how much of it disappears under last touch?
            </div>
            <div style={{ borderLeft:'3px solid var(--d-lime)', border:'1px solid var(--d-line)', borderRadius:12, padding:'12px 14px', fontSize:13, fontWeight:600, lineHeight:1.55 }}>
              Paid Search leads on first touch with {money(7080)} of {money(DEMO.TOTALS.rev)}. Switching to last touch moves {money(3000)} of credit into Direct, and AI Search drops from {money(2480)} to {money(DEMO.modelRevenue('last').ai)}.
            </div>
            <div className="d-logos" style={{ marginTop:4 }}>
              {[['claude','Claude'],['chatgpt','ChatGPT'],['cursor','Cursor'],['slack','Slack alerts'],['api','REST API']].map(([s, n]) => (
                <span className="d-lchip" key={n}>{BrandIcon ? <BrandIcon src={s} size={16} /> : null}{n}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= Shell ================= */
// const NAV = [];
// const TITLES = {};

/* ================= Tracking-health panel =================
   Click "Tracking healthy" in the top bar: this replays one real conversion
   fanning out to every ad platform, CRM and alert channel it is pushed to. */
function TrackingPanel({ onClose }) {
  const P = DEMO.PIPELINE;
  const I = I, B = BrandIcon;
  const [run, setRun] = sS(0);
  const [step, setStep] = sS(0);

  sE(() => {
    setStep(0);
    const marks = [260, 620];                       // trigger, then ingest
    P.targets.forEach((_, i) => marks.push(980 + i * 340));
    const ids = marks.map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => ids.forEach(clearTimeout);
  }, [run]);

  sE(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const delivered = Math.max(0, step - 2);
  const total = P.targets.length;
  const allDone = delivered >= total;

  return (
    <>
      <div className="d-scrim" onClick={onClose}></div>
      <div className="tp" role="dialog" aria-label="Tracking health and event delivery">
        <header className="tp-head">
          <span className="tp-live"><i></i></span>
          <div>
            <h3>Tracking healthy</h3>
            <p>Every conversion is being stitched, credited and pushed back out.</p>
          </div>
          <button className="tp-x" onClick={onClose} aria-label="Close"><I d="x" n="2.4" /></button>
        </header>

        <div className="tp-health">
          {P.health.map(([k, v]) => (
            <div className="tp-h" key={k}><span>{k}</span><b>{v}</b></div>
          ))}
        </div>

        <div className="tp-body">
          <div className={'tp-event' + (step >= 1 ? ' on' : '')}>
            <span className="tp-eb">Incoming event</span>
            <div className="tp-erow">
              <code>{P.trigger.name}</code>
              <b>{P.trigger.value}</b>
            </div>
            <div className="tp-emeta">
              {B ? <B src={P.trigger.src} size={18} /> : null}
              <span>{P.trigger.lead} · first touch {P.trigger.srcLabel}</span>
              <i>{P.trigger.page}</i>
            </div>
          </div>

          <div className={'tp-ingest' + (step >= 2 ? ' on' : '')}>
            {P.ingest.map(([src, name, detail], i) => (
              <div className="tp-i" key={name} style={{ transitionDelay: (i * 90) + 'ms' }}>
                {B ? <B src={src} size={20} /> : null}
                <span>{name}</span><i>{detail}</i>
                <span className="tp-tick"><I d="check" n="3" /></span>
              </div>
            ))}
          </div>

          <div className="tp-split"><span>fans out to {total} destinations</span></div>

          <div className="tp-targets">
            {P.targets.map(([src, name, payload, ms], i) => {
              const state = delivered > i ? 'ok' : delivered === i ? 'send' : 'wait';
              return (
                <div className={'tp-t ' + state} key={name}>
                  <span className="tp-wire"><i></i></span>
                  {B ? <B src={src} size={26} /> : null}
                  <div className="tp-tinfo">
                    <strong>{name}</strong>
                    <span>{payload}</span>
                  </div>
                  <span className="tp-status">
                    {state === 'ok' ? <><I d="check" n="3" /> {ms}</> : state === 'send' ? 'sending…' : 'queued'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <footer className="tp-foot">
          <span>{allDone ? `All ${total} destinations acknowledged. Nothing queued, nothing dropped.` : `Delivering ${delivered} of ${total}…`}</span>
          <button className="d-btn" onClick={() => setRun((r) => r + 1)}><I d="refresh" n="2.2" /> Replay</button>
        </footer>
      </div>
    </>
  );
}



// ==================== FROM demo-fx.jsx ====================
// Figma-aligned product UI: shell, primitives, leads, campaigns, settings.
// Loaded after demo-app.jsx / demo-screens.jsx; overrides window.DemoApp.



/* ---------- icons ---------- */
const ICON_PATHS = {
  grid:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  trend:'M4 17.5 9.5 11l3.5 3.2L20 6.5M20 6.5h-4.6M20 6.5v4.6',
  users:'M9 11.2a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6zM3 20a6 6 0 0 1 12 0M17.6 11.4a2.7 2.7 0 1 0 0-5.4M15.6 20a4.6 4.6 0 0 1 6.4-4',
  board:'M7 4h10a1 1 0 0 1 1 1v15l-3-2-3 2-3-2-3 2V5a1 1 0 0 1 1-1zM9 9h6M9 13h4',
  plug:'M9.5 14.5l5-5M8 12l-2 2a3 3 0 0 0 4.2 4.2l2-2M16 12l2-2a3 3 0 0 0-4.2-4.2l-2 2',
  gear:'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 12a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7.4 7.4 0 0 0-2-1.2L14.6 3h-4l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7.4 7.4 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  pie:'M12 3a9 9 0 1 0 9 9h-9z',
  doc:'M6 3h8l4 4v14H6zM14 3v4h4',
  logout:'M14 20H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h8M10 12h10M10 12l3.5-3.5M10 12l3.5 3.5',
  search:'M10.6 4.4a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zM15.4 15.4 20 20',
  bell:'M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9zM13.7 19.5a2 2 0 0 1-3.4 0',
  sun:'M12 5V3M12 21v-2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7 4.9 19.1M19.1 4.9l-1.4 1.4M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z',
  moon:'M20 14a8 8 0 1 1-9.9-9.9A7 7 0 0 0 20 14z',
  chevD:'M6 9l6 6 6-6', chevR:'M9 6l6 6-6 6', chevL:'M15 6l-6 6 6 6',
  up:'M6 18 18 6M18 6h-7M18 6v7', dn:'M6 6l12 12M18 18h-7M18 18v-7',
  dl:'M12 15V4M7.5 10.5 12 15l4.5-4.5M4 20h16', ul:'M12 4v11M7.5 8.5 12 4l4.5 4.5M4 20h16',
  check:'M5 13l4 4L19 7',
  pin:'M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11zM12 12.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z',
  layers:'M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5M3 17.5 12 22l9-4.5',
  mobile:'M8 2.5h8a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1zM11 18.6h2',
  desktop:'M3 5h18v11H3zM9 20h6M12 16v4',
  click:'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5.4l3.4 2',
  radar:'M12 12 19 5M12 21a9 9 0 1 1 9-9M12 17a5 5 0 1 1 5-5',
  rewind:'M11 6 4 12l7 6V6zM20 6l-7 6 7 6V6z',
  shield:'M12 3l7.5 3v6.2c0 4.3-3.2 7.9-7.5 9.3-4.3-1.4-7.5-5-7.5-9.3V6z',
  wave:'M3 12h3l2.5-6 3.5 13 3-9 2 2h4',
  sort:'M4 6h13M4 12h9M4 18h5M18 10v9M18 19l-2.6-2.6M18 19l2.6-2.6',
  filt:'M4 5h16l-6 7v7l-4-2v-5z',
  cal:'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  file:'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h4',
  cart:'M4 6h16l-1.5 11H5.5zM9 6a3 3 0 0 1 6 0',
  mailopen:'M3 10 12 4l9 6v10H3V10zM3 10l9 6 9-6',
  x:'M6 6l12 12M18 6L6 18',
};
function FI({ d, n, c }) {
  return <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={n || 1.8} strokeLinecap="round" strokeLinejoin="round"><path d={ICON_PATHS[d] || ''} /></svg>;
}

/* ---------- formatting ---------- */
const pct = (n, d = 1) => (n > 0 ? '+' : '') + n.toFixed(d) + '%';

function Delta({ v, note }) {
  const up = v >= 0;
  return <div className={'dl ' + (up ? 'up' : 'dn')}><FI d={up ? 'up' : 'dn'} n="2.2" />{pct(v)}{note ? <i>{note}</i> : null}</div>;
}

/* ---------- derived fixture (reconciles with DEMO) ---------- */
const D = DEMO;
const SPEND = { 'paid-search': 1420, 'paid-social': 560 };
const SPEND_TOTAL = SPEND['paid-search'] + SPEND['paid-social'];
const PAID_REV = D.CHANNELS.filter((c) => SPEND[c.key]).reduce((a, c) => a + c.rev, 0);
const PAID_CLICKS = D.CHANNELS.filter((c) => SPEND[c.key]).reduce((a, c) => a + c.visitors, 0);
const PAID_LEADS = D.CHANNELS.filter((c) => SPEND[c.key]).reduce((a, c) => a + c.leads, 0);
const ROAS = PAID_REV / SPEND_TOTAL;

const CAMPAIGNS = [
  { id:'c1', name:'brand_exact',          ch:'Google Ads',   src:'google-ads',   on:true,  budget:600, spent:520, conv:14, rev:2860, purch:14 },
  { id:'c2', name:'attribution_bmm',      ch:'Google Ads',   src:'google-ads',   on:true,  budget:520, spent:460, conv:12, rev:2320, purch:12 },
  { id:'c3', name:'competitor_ga4',       ch:'Google Ads',   src:'google-ads',   on:true,  budget:300, spent:280, conv:5,  rev:1220, purch:5 },
  { id:'c4', name:'retarget_visitors_q3', ch:'Google Ads',   src:'google-ads',   on:false, budget:200, spent:160, conv:3,  rev:680,  purch:3 },
  { id:'c5', name:'abm_q3_mid',           ch:'LinkedIn Ads', src:'linkedin-ads', on:true,  budget:260, spent:240, conv:6,  rev:480,  purch:6 },
  { id:'c6', name:'thought_leader_ads',   ch:'LinkedIn Ads', src:'linkedin-ads', on:false, budget:180, spent:160, conv:2,  rev:260,  purch:2 },
  { id:'c7', name:'lookalike_saas',       ch:'Meta Ads',     src:'meta-ads',     on:false, budget:140, spent:110, conv:1,  rev:180,  purch:1 },
  { id:'c8', name:'video_views_test',     ch:'Meta Ads',     src:'meta-ads',     on:false, budget:80,  spent:50,  conv:1,  rev:120,  purch:1 },
];

const PAYBACK = [
  { key:'organic',     name:'Organic Search', src:'google-organic', months:0.5, tone:'good', label:'Excellent', series:[8,12,10,16,14,20,18,24,22,28,26,32] },
  { key:'paid-search', name:'Paid Search',    src:'google-ads',     months:2.3, tone:'ok',   label:'Stable',    series:[6,9,7,12,10,15,13,18,17,21,20,24] },
  { key:'ai',          name:'AI Search',      src:'chatgpt',        months:2.8, tone:'ok',   label:'Healthy',   series:[3,4,6,7,10,12,15,17,20,23,26,30] },
  { key:'paid-social', name:'Paid Social',    src:'linkedin-ads',   months:3.8, tone:'warn', label:'Slow',      series:[9,8,10,7,9,6,8,7,9,8,10,9] },
];

// event → pill
const EVENTS = {
  'Checkout':      ['Purchase',   'purchase'],
  'Demo form':     ['MQL',        'mql'],
  'Trial signup':  ['Free trial', 'trial'],
  'Chat':          ['Lead',       'lead'],
};
const MON = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
const parseDay = (s) => { const m = /([A-Z][a-z]{2}) (\d+)/.exec(s || ''); return m ? new Date(2026, MON[m[1]], +m[2]) : null; };
const fmtDate = (s) => { const d = parseDay(s); return d ? String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/2026' : s; };

// 48 rows for the All Leads table: the 8 fixture journeys cycled with distinct
// profile ids so pagination has something honest to page through.
const LEAD_ROWS = (() => {
  const out = [];
  for (let i = 0; i < 48; i++) {
    const l = D.LEADS[i % D.LEADS.length];
    out.push({ ...l, pid: 'P' + String(i + 1).padStart(3, '0'), key: 'r' + i });
  }
  return out;
})();

const FX = { SPEND, SPEND_TOTAL, PAID_REV, PAID_CLICKS, PAID_LEADS, ROAS, CAMPAIGNS, PAYBACK, EVENTS, LEAD_ROWS, parseDay, fmtDate, money, num, pct, FI, Delta };

/* ================= shared bits ================= */
function Card({ title, sub, right, dots = true, children, pad }) {
  return (
    <div className="fx-card">
      {title ? (
        <div className="fx-chead">
          <div><h3>{title}</h3>{sub ? <p>{sub}</p> : null}</div>
          <div className="r">{right}{dots ? <button className="fx-dots" aria-label="Card options">···</button> : null}</div>
        </div>
      ) : null}
      {pad ? <div className="fx-pad">{children}</div> : children}
    </div>
  );
}

function KpiStrip({ items }) {
  return (
    <div className="fx-kpis">
      {items.map((k) => (
        <div className="fx-kpi" key={k.lbl}>
          <div className="lbl">{k.lbl}</div>
          <div className={'val' + (k.sm ? ' sm' : '')}>{k.val}</div>
          {k.delta != null ? <Delta v={k.delta} note={k.note} /> : k.note ? <div className="dl"><i>{k.note}</i></div> : null}
        </div>
      ))}
    </div>
  );
}

function Th({ children, sort }) { return <th>{children}{sort !== false ? <span className="so">▲▼</span> : null}</th>; }

function Pager({ page, pages, onPage }) {
  const list = [];
  for (let i = 1; i <= Math.min(pages, 6); i++) list.push(i);
  return (
    <div className="fx-pag">
      <button disabled={page === 1} onClick={() => onPage(page - 1)}><FI d="chevL" n="2.2" /> Prev page</button>
      {list.map((n) => <button key={n} className={'n' + (n === page ? ' on' : '')} onClick={() => onPage(n)}>{n}</button>)}
      <button disabled={page === pages} onClick={() => onPage(page + 1)}>Next page <FI d="chevR" n="2.2" /></button>
    </div>
  );
}

function SrcCell({ src, name }) {
  const B = BrandIcon;
  return <span className="fx-src">{B ? <B src={src} size={22} /> : null}{name}</span>;
}

/* ================= Leads table (shared by dashboard + All Leads) ========= */
function LeadsTable({ rows, onOpen, compact }) {
  return (
    <div className="fx-tw">
      <table className="fx-tbl">
        <thead><tr>
          <Th sort={false}>Profile ID</Th><Th sort={false}>Name</Th><Th sort={false}>Email address</Th>
          <Th>Source</Th><Th sort={false}>Event type</Th><Th>Event value</Th><Th>Date</Th><Th sort={false}></Th>
        </tr></thead>
        <tbody>
          {rows.map((l, i) => {
            const [lbl, cls] = EVENTS[l.event] || ['Lead', 'lead'];
            return (
              <tr key={l.key || l.email} className="d-rowin" style={{ animationDelay: Math.min(i, 12) * 32 + 'ms' }}>
                <td className="mut">{l.pid || 'P' + String(i + 1).padStart(3, '0')}</td>
                <td>{l.name}</td>
                <td className="mut">{l.email}</td>
                <td><SrcCell src={l.src} name={l.ch} /></td>
                <td><span className={'fx-pill ' + cls}>{lbl}</span></td>
                <td className="num">{l.value ? money(l.value) : '—'}</td>
                <td className="mut num">{fmtDate(l.last)}</td>
                <td style={{ textAlign:'right' }}><button className="fx-jl" onClick={() => onOpen(l)}>View journey <FI d="chevR" n="2.4" /></button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ================= Journey modal ================= */
function JourneyModal({ lead, onClose }) {
  const B = BrandIcon;
  const [open, setOpen] = uS(0);
  const [asc, setAsc] = uS(false);
  uE(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const j = lead.journey;
  const a = parseDay(j[0].t), b = parseDay(j[j.length - 1].t);
  const days = a && b ? Math.round((b - a) / 86400000) : 0;
  const acts = asc ? j : j.slice().reverse();
  const [evLbl] = EVENTS[lead.event] || ['Lead'];
  const stats = [
    ['pin',    j[j.length - 1].page,                'Last location'],
    ['layers', lead.value ? money(lead.value) : '—', 'Conversion value'],
    ['mobile', j.length % 2 ? 'Mobile' : 'Desktop',  'Device'],
    ['click',  String(j.length),                     'Touchpoints'],
    ['clock',  days + ' days',                       'Journey duration'],
    ['radar',  lead.first,                           'First touch'],
    ['rewind', evLbl,                                'Current event type'],
  ];

  return (
    <div className="fx-modal-wrap">
      <div className="fx-scrim" onClick={onClose}></div>
      <div className="fx-modal" role="dialog" aria-label={lead.name + ' journey'}>
        <header className="fx-mhead">
          <button className="fx-rnd" onClick={onClose} aria-label="Back to leads"><FI d="chevL" n="2.2" /></button>
          <div className="t">Back to leads<b>{lead.name} journey</b></div>
          <div className="fx-mact">
            <button className="fx-b soft">Sync to CRM</button>
            <button className="fx-b line"><FI d="ul" n="2" /> Export</button>
            <button className="fx-b lime">Mark as qualified</button>
          </div>
        </header>
        <div className="fx-mbody">
          <div>
            <h3 className="fx-mname">{lead.name}</h3>
            <p className="fx-mmeta">{lead.email}<i>•</i>{lead.pid || 'P001'}</p>
            <span className="fx-mlast">Last activity {lead.last}</span>
            <div className="fx-stats">
              {stats.map(([ic, v, l]) => (
                <div className="fx-stat" key={l}><FI d={ic} n="1.9" /><span style={{ minWidth:0 }}><b>{v}</b><span>{l}</span></span></div>
              ))}
            </div>
          </div>
          <div>
            <div className="fx-acthead">
              <h4>All activity</h4>
              <span className="s" onClick={() => setAsc(!asc)}>Sort by time: <b>{asc ? 'Ascending' : 'Descending'}</b><FI d="sort" n="1.9" /></span>
            </div>
            <div className="fx-acts">
              {acts.map((s, i) => (
                <div className={'fx-act' + (open === i ? ' open' : '')} key={i}>
                  <button className="fx-act-t" onClick={() => setOpen(open === i ? -1 : i)}>
                    <FI d="chevD" n="2.2" c="cv" />
                    <span className="fx-dot lime">{B ? <B src={s.src} size={20} /> : null}</span>
                    <span className="nm">{s.ttl}</span>
                    <span className="ts">{s.t}</span>
                  </button>
                  {open === i ? (
                    <div className="fx-act-kv">
                      <div><span>Page</span><b>{s.page}</b></div>
                      {s.kv.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= All Leads ================= */
function ScreenAllLeads({ openLead }) {
  const [page, setPage] = uS(1);
  const per = 12, pages = Math.ceil(LEAD_ROWS.length / per);
  const rows = LEAD_ROWS.slice((page - 1) * per, page * per);
  return (
    <div className="fx-screen">
      <Card title="All leads" sub={LEAD_ROWS.length + ' profiles · ' + D.DEMO_RANGE.label}
        right={<a className="fx-viewall" href="#" onClick={(e) => e.preventDefault()}>View all <FI d="chevR" n="2.4" /></a>}>
        <LeadsTable rows={rows} onOpen={openLead} />
        <Pager page={page} pages={pages} onPage={setPage} />
      </Card>
      <p className="fx-note"><b>Illustrative fixture data.</b> No customer information or live account data is shown.</p>
    </div>
  );
}

/* ================= Campaigns ================= */
function ScreenCampaigns() {
  const [on, setOn] = uS(() => Object.fromEntries(CAMPAIGNS.map((c) => [c.id, c.on])));
  const [sel, setSel] = uS({});
  const conv = CAMPAIGNS.reduce((a, c) => a + c.conv, 0);
  return (
    <div className="fx-screen">
      <div className="fx-kpis-wrap">
        <div className="fx-chead"><div><h3>Key performance metrics</h3></div><div className="r"><button className="fx-dots" aria-label="Card options">···</button></div></div>
        <KpiStrip items={[
          { lbl:'Total conversions', val:num(conv), delta:23.5 },
          { lbl:'Total revenue', val:money(PAID_REV), delta:18.2 },
          { lbl:'Ad spend', val:money(SPEND_TOTAL), delta:-5.7 },
          { lbl:'Avg. ROAS', val:ROAS.toFixed(1) + 'x', delta:5.1 },
          { lbl:'Avg. cost per lead', val:'$' + (SPEND_TOTAL / PAID_LEADS).toFixed(2), delta:-38 },
        ]} />
      </div>
      <Card title="Campaign list" sub="Paid channels only · ROAS uses attributed revenue">
        <div className="fx-tw">
          <table className="fx-tbl">
            <thead><tr>
              <th style={{ width:44 }}></th><Th>Status</Th><Th>Campaign / channel</Th><Th>Budget</Th>
              <Th>Amount spent</Th><Th>Conversions</Th><Th>ROAS</Th><Th>Purchases</Th><Th>Net profit</Th>
            </tr></thead>
            <tbody>
              {CAMPAIGNS.map((c, i) => {
                const live = on[c.id];
                return (
                  <tr key={c.id} className="d-rowin" style={{ animationDelay: i * 34 + 'ms' }}>
                    <td><span className={'fx-cb' + (sel[c.id] ? ' on' : '')} onClick={() => setSel({ ...sel, [c.id]: !sel[c.id] })} role="checkbox" aria-checked={!!sel[c.id]} tabIndex={0}><FI d="check" n="3.2" /></span></td>
                    <td>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:10 }}>
                        <button className={'fx-sw' + (live ? ' on' : '')} onClick={() => setOn({ ...on, [c.id]: !live })} aria-label={c.name + ' status'}><i></i></button>
                        {live ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td><SrcCell src={c.src} name={c.name} /><span style={{ display:'block', marginLeft:31, fontSize:11.5, fontWeight:500, color:'var(--f-ink-3)' }}>{c.ch}</span></td>
                    <td className="num mut">{money(c.budget)}</td>
                    <td className="num">{money(c.spent)}</td>
                    <td className="num">{c.conv} <span className="fx-up" style={{ fontSize:12 }}>{pct((c.rev / c.spent - ROAS) / ROAS * 100, 0)}</span></td>
                    <td><span className="fx-pill solid">{(c.rev / c.spent).toFixed(1)}x</span></td>
                    <td className="num">{c.purch}</td>
                    <td className="num fx-up">{money(c.rev - c.spent)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={1} pages={1} onPage={() => {}} />
      </Card>
      <p className="fx-note"><b>Illustrative fixture data.</b> Spend, conversions and revenue reconcile with the paid channels on the dashboard.</p>
    </div>
  );
}

/* ================= Settings ================= */
function ScreenSettings() {
  const [t, setT] = uS({ capi:true, mcp:true, weekly:false, decay:true });
  const rows = [
    ['capi', 'Server-side conversions', 'Push verified conversions back to Google Ads, Meta, LinkedIn and TikTok.'],
    ['mcp', 'MCP endpoint', 'Let Claude, ChatGPT and Cursor query this workspace directly.'],
    ['weekly', 'Weekly digest', 'Email a Monday summary of revenue by source to the team.'],
    ['decay', 'Last non-direct fallback', 'Direct sessions hand credit back to the last known source.'],
  ];
  return (
    <div className="fx-screen">
      <Card title="Workspace" sub="demo.sourcetrack.example" dots={false} pad>
        <div style={{ display:'grid', gap:14, maxWidth:520 }}>
          {[['Site name','SourceTrack Demo'],['Tracking script','Installed · 12ms p50'],['Attribution window','90 days'],['Default model','First touch']].map(([k, v]) => (
            <div key={k} style={{ display:'grid', gridTemplateColumns:'minmax(120px,170px) 1fr', gap:16, fontSize:13.5, alignItems:'baseline' }}>
              <span style={{ color:'var(--f-ink-3)', fontWeight:500 }}>{k}</span><b style={{ fontWeight:700 }}>{v}</b>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Behaviour" sub="What this workspace does automatically" dots={false}>
        <div className="fx-rows">
          {rows.map(([k, name, desc]) => (
            <div className="fx-row" key={k}>
              <span style={{ minWidth:0 }}><span className="nm">{name}</span><span className="sub" style={{ display:'block', whiteSpace:'normal' }}>{desc}</span></span>
              <span className="rt"><button className={'fx-sw' + (t[k] ? ' on' : '')} onClick={() => setT({ ...t, [k]: !t[k] })} aria-label={name}><i></i></button></span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ================= Tracking health sheet =================
   The topbar pill answers one question at a glance — is anything dropping? —
   and opening it replays a real conversion fanning out to every destination
   it is pushed to, grouped by what each destination is for. */
const TRACK_GROUPS = [
  { id:'capi', name:'Conversions API', note:'Server-side, value included', rows:[
    ['google-ads', 'Google Ads',      'Offline conversion · $1,480', '214ms'],
    ['meta',       'Meta CAPI',       'Purchase · 1480 USD',         '268ms'],
    ['linkedin',   'LinkedIn CAPI',   'Conversion · $1,480',         '302ms'],
    ['tiktok',     'TikTok Events',   'CompletePayment · $1,480',    '336ms'],
  ] },
  { id:'capture', name:'Capture surfaces', note:'Source attached on arrival', rows:[
    ['hubspot',  'HubSpot forms', '18 submissions today',   '—' ],
    ['webflow',  'Webflow forms', '6 submissions today',    '—' ],
    ['intercom', 'Intercom chat', '4 conversations today',  '—' ],
    ['calendly', 'Calendly',      '3 meetings booked',      '—' ],
    ['stripe',   'Stripe',        '2 charges captured',     '—' ],
  ] },
  { id:'crm', name:'CRM sync', note:'Journey and revenue written back', rows:[
    ['hubspot',    'HubSpot',    'Deal + first-touch channel', '176ms'],
    ['salesforce', 'Salesforce', 'Opportunity source updated', '241ms'],
    ['pipedrive',  'Pipedrive',  'Person source field set',    '198ms'],
  ] },
  { id:'alerts', name:'Alerts & API', note:'Where the team hears about it', rows:[
    ['slack',   'Slack',     '#revenue — new customer',  '88ms'],
    ['webhook', 'Webhooks',  'POST /conversion · 200 OK','112ms'],
    ['api',     'REST API',  'Read endpoint healthy',    '—' ],
  ] },
];
const TRACK_TOTAL = TRACK_GROUPS.reduce((a, g) => a + g.rows.length, 0);

function TrackingSheet({ onClose }) {
  const B = BrandIcon;
  const P = D.PIPELINE;
  const [run, setRun] = uS(0);
  const [step, setStep] = uS(0);
  uE(() => {
    setStep(0);
    const ids = [];
    for (let i = 0; i <= TRACK_TOTAL + 1; i++) ids.push(setTimeout(() => setStep(i + 1), 220 + i * 145));
    return () => ids.forEach(clearTimeout);
  }, [run]);
  uE(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const delivered = Math.max(0, step - 2);
  const done = delivered >= TRACK_TOTAL;
  let idx = 0;

  return (
    <div className="fx-sheet-wrap">
      <div className="fx-scrim" onClick={onClose}></div>
      <aside className="fx-sheet" role="dialog" aria-label="Tracking health">
        <header className="fx-sheet-head">
          <span className="fx-livedot"><i></i></span>
          <div><h3>Tracking healthy</h3><p>Every conversion is stitched, credited and pushed back out.</p></div>
          <button className="fx-rnd" onClick={onClose} aria-label="Close"><FI d="x" n="2.2" /></button>
        </header>

        <div className="fx-health">
          {P.health.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
        </div>

        <div className="fx-sheet-body">
          <div className={'fx-trig' + (step >= 1 ? ' on' : '')}>
            <span className="eb">Incoming event</span>
            <div className="r"><code>{P.trigger.name}</code><b>{P.trigger.value}</b></div>
            <div className="m">
              {B ? <B src={P.trigger.src} size={18} /> : null}
              <span>{P.trigger.lead} · first touch {P.trigger.srcLabel}</span><i>{P.trigger.page}</i>
            </div>
          </div>
          <div className="fx-fan"><span>fans out to {TRACK_TOTAL} destinations</span></div>

          {TRACK_GROUPS.map((g) => (
            <div className="fx-tgroup" key={g.id}>
              <div className="h"><strong>{g.name}</strong><span>{g.note}</span></div>
              {g.rows.map(([src, name, payload, ms]) => {
                const i = idx++;
                const state = delivered > i ? 'ok' : delivered === i ? 'send' : 'wait';
                return (
                  <div className={'fx-trow ' + state} key={g.id + name}>
                    {B ? <B src={src} size={24} /> : null}
                    <span style={{ minWidth:0 }}><strong>{name}</strong><span>{payload}</span></span>
                    <span className="st">{state === 'ok' ? <><FI d="check" n="3" /> {ms}</> : state === 'send' ? 'sending…' : 'queued'}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <footer className="fx-sheet-foot">
          <span>{done ? `All ${TRACK_TOTAL} destinations acknowledged. Nothing queued, nothing dropped.` : `Delivering ${delivered} of ${TRACK_TOTAL}…`}</span>
          <button className="fx-b line" onClick={() => setRun((r) => r + 1)}><FI d="wave" n="2" /> Replay</button>
        </footer>
      </aside>
    </div>
  );
}

/* ================= Shell ================= */
const NAV = [
  ['Management', [
    { id:'dashboard', label:'Dashboard', icon:'trend' },
    { id:'leads',     label:'All leads', icon:'users' },
    { id:'campaigns', label:'Campaigns', icon:'board' },
  ]],
  ['Analysis', [
    { id:'analytics',   label:'Analytics',   icon:'grid' },
    { id:'attribution', label:'Attribution', icon:'pie' },
    { id:'reports',     label:'Reports',     icon:'doc' },
  ]],
  ['Configuration', [
    { id:'integrations', label:'Integrations', icon:'plug' },
    { id:'settings',     label:'Settings',     icon:'gear' },
  ]],
];
const TITLES = { dashboard:'Dashboard', leads:'All leads', campaigns:'Campaigns', analytics:'Analytics', attribution:'Attribution', reports:'Report builder', integrations:'Integrations', settings:'Settings' };
const RANGES = ['Last 24 hours', 'Last 7 days', 'Last 30 days'];

function DemoApp({ start = 'dashboard', full = false }) {
  const [route, setRoute] = uS(start);
  const [hist, setHist] = uS([start]);
  const [at, setAt] = uS(0);
  const [lead, setLead] = uS(null);
  const [dark, setDark] = uS(false);
  const [range, setRange] = uS(2);
  const [nav, setNav] = uS(false);
  const [track, setTrack] = uS(false);

  const go = (r) => {
    setLead(null); setRoute(r); setNav(false);
    setHist((h) => { const n = h.slice(0, at + 1).concat(r); setAt(n.length - 1); return n; });
  };
  const step = (d) => { const i = at + d; if (i < 0 || i >= hist.length) return; setAt(i); setLead(null); setRoute(hist[i]); };

  const isLeads = route === 'leads';
  const showRange = route === 'dashboard' || route === 'campaigns' || route === 'analytics' || route === 'attribution';

  return (
    <div className={'st-demo fx' + (full ? ' full' : '') + (dark ? ' dark' : '') + (nav ? ' nav-open' : '')}>
      <button className="fx-scrim2" onClick={() => setNav(false)} aria-label="Close menu" tabIndex={nav ? 0 : -1}></button>
      <aside className="fx-side">
        <div className="fx-wordmark">
          {React.createElement('st-logo', { size: '34', style: { width: 34, height: 34 } })}
          SourceTrack
        </div>
        {NAV.map(([grp, items]) => (
          <React.Fragment key={grp}>
            <div className="fx-navgrp">{grp}</div>
            {items.map((n) => (
              <button key={n.id} className={'fx-nav' + (route === n.id ? ' on' : '')} onClick={() => go(n.id)}>
                <FI d={n.icon} /> {n.label}
              </button>
            ))}
          </React.Fragment>
        ))}
        <div className="fx-side-foot">
          <a className="fx-out" href="index.html"><FI d="logout" /> Back to site</a>
        </div>
      </aside>

      <div className="d-main">
        <div className="fx-top">
          <button className="fx-burger" onClick={() => setNav(!nav)} aria-label="Menu" aria-expanded={nav}><i></i><i></i><i></i></button>
          <span className="fx-toptitle">{TITLES[route]}</span>
          <label className="fx-search">
            <FI d="search" n="2" />
            <input placeholder="Search leads, campaigns, pages" aria-label="Search" />
            <span className="fx-key">K</span>
          </label>
          <div className="fx-topright">
            <button className="fx-track" onClick={() => setTrack(true)} title="See where every event goes"><span className="pip"></span><span className="tx">Tracking healthy</span></button>
            <button className="fx-bell" aria-label="Notifications"><FI d="bell" n="1.9" /><i></i></button>
            <div className="fx-theme">
              <button className={dark ? '' : 'on'} onClick={() => setDark(false)} aria-label="Light theme"><FI d="sun" n="1.9" /></button>
              <button className={dark ? 'on' : ''} onClick={() => setDark(true)} aria-label="Dark theme"><FI d="moon" n="1.9" /></button>
            </div>
            <button className="fx-user"><span className="fx-face eav is-live" role="img" aria-label="Kevin">🧑🏽‍💼</span><span>Kevin</span><FI d="chevD" n="2.2" /></button>
          </div>
        </div>

        <div className="fx-sub">
          <div className="fx-navbtns">
            <button className="fx-rnd" disabled={at === 0} onClick={() => step(-1)} aria-label="Back"><FI d="chevL" n="2.2" /></button>
            <button className="fx-rnd" disabled={at >= hist.length - 1} onClick={() => step(1)} aria-label="Forward"><FI d="chevR" n="2.2" /></button>
          </div>
          <span className="fx-crumb"><b></b>{TITLES[route]}</span>
          <div className="fx-subright">
            {isLeads ? (
              <>
                <button className="fx-drop">First touch <FI d="chevD" n="2.2" /></button>
                <button className="fx-drop">All sources <FI d="chevD" n="2.2" /></button>
                <button className="fx-drop">This month <FI d="chevD" n="2.2" /></button>
                <button className="fx-drop"><FI d="filt" n="2" /> More filters</button>
              </>
            ) : null}
            {showRange ? (
              <div className="fx-range">
                {RANGES.map((r, i) => <button key={r} className={i === range ? 'on' : ''} onClick={() => setRange(i)}>{r}</button>)}
              </div>
            ) : null}
            {route === 'campaigns' ? <button className="fx-drop">Attribution model <FI d="chevD" n="2.2" /></button> : null}
            <button className="fx-export"><FI d="ul" n="2" /> Export</button>
          </div>
        </div>

        <div className="fx-body d-body" style={{ padding:'0 24px 30px' }}>
          {route === 'dashboard'    && ScreenDashboardFx ? <ScreenDashboardFx go={go} openLead={setLead} range={range} /> : null}
          {route === 'leads'        ? <ScreenAllLeads openLead={setLead} /> : null}
          {route === 'campaigns'    ? <ScreenCampaigns /> : null}
          {route === 'analytics'    && ScreenAnalytics ? <ScreenAnalytics go={go} /> : null}
          {route === 'attribution'  && ScreenAttribution ? <ScreenAttribution openChannel={() => go('leads')} /> : null}
          {route === 'reports'      && ScreenReports ? <ScreenReports /> : null}
          {route === 'integrations' && ScreenIntegrations ? <ScreenIntegrations /> : null}
          {route === 'settings'     ? <ScreenSettings /> : null}
        </div>
      </div>

      {lead ? <JourneyModal lead={lead} onClose={() => setLead(null)} /> : null}
      {track ? <TrackingSheet onClose={() => setTrack(false)} /> : null}
    </div>
  );
}





// ==================== FROM demo-fx-dash.jsx ====================
// Figma-aligned dashboard: greeting KPIs, recent leads, revenue, AI search,
// channel health, campaigns donut, attribution models, search terms, payback.


const F = FX;
// money, num, pct are resolved from outer scope
// Card, KpiStrip, Th are resolved from outer scope
// SrcCell, LeadsTable are resolved from outer scope

const CH_COLOR = { 'paid-search':'#4285F4', 'organic':'#00AA57', 'direct':'#1F2323', 'ai':'#7D8090', 'paid-social':'#0A66C2', 'referral':'#FF8800' };

/* ---------- small charts ---------- */
function Area({ values, labels }) {
  const W = 780, H = 210, P = { l: 34, r: 10, t: 12, b: 24 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const max = Math.max(...values) * 1.15;
  const xs = values.map((_, i) => P.l + (i / (values.length - 1)) * iw);
  const ys = values.map((v) => P.t + ih - (v / max) * ih);
  const line = xs.map((x, i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + ys[i].toFixed(1)).join(' ');
  const ticks = [0, .25, .5, .75, 1];
  return (
   <div className="fx-plotbox"><svg className="fx-plot" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <defs><linearGradient id="fx-ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(204,240,63,.62)" /><stop offset="100%" stopColor="rgba(204,240,63,0)" /></linearGradient></defs>
      {ticks.map((f, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={P.t + ih - f * ih} y2={P.t + ih - f * ih} stroke="var(--f-line-2)" strokeWidth="1" strokeDasharray={i ? '4 5' : ''} />
          <text x={P.l - 8} y={P.t + ih - f * ih + 3.5} textAnchor="end" fontSize="10" fontWeight="600" fill="var(--f-ink-3)">{f ? Math.round(max * f / 100) / 10 + 'k' : '0'}</text>
        </g>
      ))}
      <path d={`${line} L${xs[xs.length - 1]} ${P.t + ih} L${xs[0]} ${P.t + ih} Z`} fill="url(#fx-ag)" style={{ opacity:0, animation:'d-fade .7s .25s ease forwards' }} />
      <path d={line} fill="none" stroke="#CCF03F" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      {[0, 8, 16, 24, 29].map((i) => (
        <text key={i} x={xs[i]} y={H - 5} fontSize="10" fontWeight="600" fill="var(--f-ink-3)" textAnchor={i === 0 ? 'start' : i === 29 ? 'end' : 'middle'}>{labels[i]}</text>
      ))}
    </svg></div>
  );
}

function MiniSpark({ vals, color }) {
  const W = 74, H = 26, max = Math.max(...vals), min = Math.min(...vals), r = (max - min) || 1;
  const d = vals.map((v, i) => (i ? 'L' : 'M') + (i / (vals.length - 1) * (W - 2) + 1).toFixed(1) + ' ' + (H - 3 - (v - min) / r * (H - 6)).toFixed(1)).join(' ');
  return <svg className="fx-spark" viewBox={`0 0 ${W} ${H}`} style={{ width:W, height:H, flex:'none' }}><path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

function Bars({ items }) {
  const W = 560, H = 210, P = { l: 34, b: 30, t: 10 };
  const iw = W - P.l - 8, ih = H - P.b - P.t;
  const max = Math.max(...items.map((i) => i.v)) * 1.12;
  const bw = iw / items.length;
  return (
   <div className="fx-plotbox"><svg className="fx-plot" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {[0, .25, .5, .75, 1].map((f, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - 8} y1={P.t + ih - f * ih} y2={P.t + ih - f * ih} stroke="var(--f-line-2)" strokeWidth="1" strokeDasharray={i ? '4 5' : ''} />
          <text x={P.l - 8} y={P.t + ih - f * ih + 3.5} textAnchor="end" fontSize="10" fontWeight="600" fill="var(--f-ink-3)">{f ? Math.round(max * f / 100) / 10 + 'k' : '0'}</text>
        </g>
      ))}
      {items.map((it, i) => {
        const h = it.v / max * ih, x = P.l + i * bw + bw * .22, w = bw * .56;
        return (
          <g key={i}>
            <rect x={x} y={P.t} width={w} height={ih} rx="6" fill="var(--f-soft)" />
            <rect x={x} y={P.t + ih - h} width={w} height={h} rx="6" fill={it.c} style={{ transformOrigin: `0 ${P.t + ih}px`, animation:`fx-grow .8s ${i * .07}s cubic-bezier(.22,1,.36,1) both` }} />
            <text x={x + w / 2} y={H - 10} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--f-ink-3)">{it.k}</text>
          </g>
        );
      })}
    </svg></div>
  );
}

function GroupBars({ groups, series }) {
  const W = 560, H = 215, P = { l: 34, b: 28, t: 10 };
  const iw = W - P.l - 8, ih = H - P.b - P.t;
  const max = Math.max(...groups.flatMap((g) => g.v)) * 1.15;
  const gw = iw / groups.length, bw = gw * .74 / series.length;
  return (
   <div className="fx-plotbox"><svg className="fx-plot" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {[0, .25, .5, .75, 1].map((f, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - 8} y1={P.t + ih - f * ih} y2={P.t + ih - f * ih} stroke="var(--f-line-2)" strokeWidth="1" strokeDasharray={i ? '4 5' : ''} />
          <text x={P.l - 8} y={P.t + ih - f * ih + 3.5} textAnchor="end" fontSize="10" fontWeight="600" fill="var(--f-ink-3)">{f ? Math.round(max * f / 100) / 10 + 'k' : '0'}</text>
        </g>
      ))}
      {groups.map((g, i) => (
        <g key={i}>
          {g.v.map((v, j) => {
            const h = v / max * ih, x = P.l + i * gw + gw * .13 + j * bw;
            return <rect key={j} x={x} y={P.t + ih - h} width={bw * .82} height={h} rx="4" fill={series[j].c} style={{ transformOrigin:`0 ${P.t + ih}px`, animation:`fx-grow .75s ${(i * 3 + j) * .05}s cubic-bezier(.22,1,.36,1) both` }} />;
          })}
          <text x={P.l + i * gw + gw / 2} y={H - 9} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--f-ink-3)">{g.k}</text>
        </g>
      ))}
    </svg></div>
  );
}

function Donut({ slices, center, label }) {
  const R = 78, r = 52, C = 2 * Math.PI * ((R + r) / 2), sw = R - r;
  const total = slices.reduce((a, s) => a + s.v, 0);
  let acc = 0;
  return (
    <div className="fx-donut-c" style={{ width: R * 2, height: R * 2 }}>
      <svg viewBox={`0 0 ${R * 2} ${R * 2}`} style={{ width:'100%', height:'100%', transform:'rotate(-90deg)' }}>
        {slices.map((s) => {
          const len = s.v / total * C, off = acc; acc += len;
          return <circle key={s.k} cx={R} cy={R} r={(R + r) / 2} fill="none" stroke={s.c} strokeWidth={sw}
            strokeDasharray={`${len - 3} ${C - len + 3}`} strokeDashoffset={-off} strokeLinecap="round"
            style={{ animation:'d-fade .6s ease both' }} />;
        })}
      </svg>
      <div className="mid"><b>{center}</b><span>{label}</span></div>
    </div>
  );
}

/* ================= Dashboard ================= */
function ScreenDashboardFx({ go, openLead }) {
  const T = D.TOTALS;
  const B = BrandIcon;
  const top = D.CHANNELS.slice().sort((a, b) => b.rev - a.rev)[0];
  const maxPage = Math.max(...D.PAGES.map((p) => p.leads));
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const models = ['first', 'last', 'linear'];
  const mSeries = [{ n:'First touch', c:'#1F2323' }, { n:'Last touch', c:'#CCF03F' }, { n:'Linear', c:'#00AA57' }];
  const mGroups = D.CHANNELS.slice(0, 5).map((c) => ({ k: c.name.split(' ')[0], v: models.map((m) => D.MODELS.find((x) => x.id === m).w[c.key]) }));

  return (
    <div className="fx-screen">
      {/* greeting + KPIs */}
      <div className="fx-kpis-wrap">
        <div className="fx-chead">
          <div className="fx-greet"><h2>{greet}, Kevin</h2><p>Here is a quick update from your website · {D.DEMO_RANGE.label}</p></div>
          <div className="r"><button className="fx-dots" aria-label="Card options">···</button></div>
        </div>
        <KpiStrip items={[
          { lbl:'Attributed revenue', val:money(T.rev), delta:23.5 },
          { lbl:'Top channel', val:top.sub, sm:true, note:money(top.rev) },
          { lbl:'Conversions', val:num(T.conv), delta:18.5 },
          { lbl:'Ad spend', val:money(F.SPEND_TOTAL), delta:-5.7 },
          { lbl:'ROAS', val:F.ROAS.toFixed(1) + 'x', delta:16 },
        ]} />
      </div>

      {/* recent leads */}
      <Card title="Recent leads" sub="Newest profiles and the source that produced them"
        right={<a className="fx-viewall" href="#" onClick={(e) => { e.preventDefault(); go('leads'); }}>View all <FI d="chevR" n="2.4" /></a>}>
        <LeadsTable rows={D.LEADS.slice(0, 7)} onOpen={openLead} />
      </Card>

      {/* revenue + AI search */}
      <div className="fx-cols">
        <Card title="Revenue" sub="Daily attributed revenue" right={<span className="fx-mini">This month <FI d="chevD" n="2.2" /></span>}>
          <Area values={D.DAILY_VISITORS.map((v, i) => Math.round(v * (T.rev / T.visitors) * (1 + (i % 5) * .05)))} labels={D.DAY_LABELS} />
          <div className="fx-revfoot">
            <span><b>{num(T.visitors)}</b>Total sessions<em className="fx-up">{pct(12.5)}</em></span>
            <span><b>{money(T.rev)}</b>Revenue generated<em className="fx-up">{pct(23.5)}</em></span>
          </div>
        </Card>
        <Card title="Leads from AI search" sub={D.AI_DOMAINS + ' assistant and answer-engine domains detected'} right={<span className="fx-mini">This month <FI d="chevD" n="2.2" /></span>}>
          <div className="fx-rows">
            {D.AI_ENGINES.map((e) => (
              <div className="fx-row" key={e.key}>
                {B ? <B src={e.key} size={26} /> : null}
                <span className="fx-idy"><span className="nm">{e.name}</span><span className="sub">{e.host}</span></span>
                <span className="rt">
                  <span className="v">{num(e.visitors)}</span>
                  <span className={'fx-chg ' + (e.change > 0 ? 'fx-up' : 'fx-dn')}>{pct(e.change)}</span>
                  <MiniSpark vals={D.SPARK.ai.map((v, i) => v * (1 + ((e.visitors + i) % 7) * .06))} color="#FF8800" />
                </span>
              </div>
            ))}
            <div className="fx-row">
              <span className="fx-dot"><FI d="grid" n="1.9" /></span>
              <span style={{ minWidth:0 }}><span className="nm">{D.AI_OTHER.engines} other engines</span><span className="sub">Long tail</span></span>
              <span className="rt"><span className="v">{D.AI_OTHER.visitors}</span></span>
            </div>
          </div>
        </Card>
      </div>

      {/* best channel + revenue by channels */}
      <div className="fx-cols">
        <Card title="Best performing channel" sub="Return per channel with a scale signal" right={<span className="fx-mini">This month <FI d="chevD" n="2.2" /></span>}>
          <div className="fx-rows">
            {D.CHANNELS.map((c) => {
              const spend = F.SPEND[c.key];
              const perf = spend ? (c.rev / spend).toFixed(1) + 'x ROAS' : '$' + (c.rev / c.visitors).toFixed(2) + ' RPV';
              const sig = c.key === 'paid-search' ? ['ok', 'Scale up'] : c.key === 'organic' ? ['good', 'Compounding'] : c.key === 'ai' ? ['good', 'Invest'] : c.key === 'paid-social' ? ['warn', 'Maxed'] : c.key === 'direct' ? ['ok', 'Stable'] : ['bad', 'Review'];
              return (
                <div className="fx-row" key={c.key}>
                  {B ? <B src={c.src} size={26} /> : null}
                  <span className="fx-idy"><span className="nm">{c.name}</span><span className="sub">{c.sub}</span></span>
                  <span className="rt">
                    <span className="v">{perf}</span>
                    <span className={'fx-chg ' + (c.key === 'paid-social' || c.key === 'referral' ? 'fx-dn' : 'fx-up')}>{pct(c.key === 'paid-social' ? -5.7 : c.key === 'referral' ? -2.4 : 12.5)}</span>
                    <span className={'fx-pill ' + sig[0]}>{sig[1]}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Revenue by channel" sub={'First touch · ' + money(T.rev) + ' attributed'} right={<span className="fx-mini">This month <FI d="chevD" n="2.2" /></span>}>
          <div className="fx-pad" style={{ paddingBottom:6 }}>
            <Bars items={D.CHANNELS.map((c) => ({ k: c.name.split(' ')[0], v: c.rev, c: CH_COLOR[c.key] }))} />
          </div>
        </Card>
      </div>

      {/* health + top pages + recent feed */}
      <div className="fx-cols t3">
        <Card title="Channel health" sub="Share of leads" dots={false}>
          <div className="fx-rows">
            {D.CHANNELS.map((c) => (
              <div className="fx-row" key={c.key}>
                {B ? <B src={c.src} size={22} /> : null}
                <span className="nm fx-chname">{c.name}</span>
                <span className="fx-bar-t"><i style={{ width: (c.leads / T.leads * 100 * 2.6) + '%', background: CH_COLOR[c.key] }}></i></span>
                <span className="rt"><span className="fx-count">{c.leads} leads</span></span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Top pages by leads" sub="Entry pages that produce profiles" dots={false}>
          <div className="fx-pad" style={{ display:'grid', gap:10 }}>
            {D.PAGES.slice().sort((a, b) => b.leads - a.leads).slice(0, 4).map((p) => (
              <div className="fx-pcard" key={p.path} style={{ background:`linear-gradient(100deg,var(--f-lime-w) ${p.leads / maxPage * 74}%,transparent)` }}>
                <span className="ic"><FI d="file" n="1.9" /></span>
                <span style={{ minWidth:0 }}><span className="nm">{p.path === '/' ? 'Home' : p.path.split('/').pop().replace(/-/g, ' ')}</span><span className="u" style={{ display:'block' }}>sourcetrack.example{p.path}</span></span>
                <span style={{ marginLeft:'auto' }}><span className="fx-count">{num(p.leads)} leads</span></span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Recent activity" sub="Live conversion feed" dots={false}>
          <div className="fx-rows">
            {D.LEADS.slice(0, 6).map((l) => {
              const [lbl, cls] = F.EVENTS[l.event] || ['Lead', 'lead'];
              return (
                <div className="fx-row" key={l.email} style={{ cursor:'pointer' }} onClick={() => openLead(l)}>
                  <span className="eav" style={{ width:30, height:30, fontSize:15 }} role="img" aria-label={l.name}>{l.emoji}</span>
                  <span style={{ minWidth:0 }}>
                    <span className="nm">{l.name} <span className={'fx-pill ' + cls} style={{ marginLeft:6, height:20, fontSize:10.5 }}>{lbl}</span></span>
                    <span className="sub">{l.email}</span>
                  </span>
                  <span className="rt">{B ? <B src={l.src} size={20} /> : null}<span className="sub" style={{ minWidth:36, textAlign:'right' }}>{l.last}</span></span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* campaigns donut + attribution models */}
      <div className="fx-cols">
        <Card title="Leads by campaign" sub="Paid campaigns ranked by attributed revenue" right={<span className="fx-mini">This month <FI d="chevD" n="2.2" /></span>}>
          <div className="fx-donut">
            <Donut center={num(F.PAID_LEADS)} label="paid leads this month"
              slices={F.CAMPAIGNS.slice(0, 5).map((c, i) => ({ k:c.id, v:c.rev, c:['#00AA57','#CCF03F','#4285F4','#1F2323','#FF8800'][i] }))} />
            <div className="fx-donut-l">
              {F.CAMPAIGNS.slice(0, 4).map((c, i) => (
                <div key={c.id}>
                  <div className="h"><i style={{ background:['#00AA57','#CCF03F','#4285F4','#1F2323'][i] }}></i>{c.name}</div>
                  <div className="m"><span><b>{c.conv}</b> conversions</span><span><b>{money(c.rev)}</b> revenue</span><span><b>{(c.rev / c.spent).toFixed(1)}x</b> ROAS</span></div>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card title="Attribution models" sub="Same revenue, three ways of crediting it"
          right={<a className="fx-viewall" href="#" onClick={(e) => { e.preventDefault(); go('attribution'); }}>Compare all <FI d="chevR" n="2.4" /></a>}>
          <div className="fx-pad" style={{ paddingBottom:0 }}><GroupBars groups={mGroups} series={mSeries} /></div>
          <div className="fx-legend" style={{ paddingBottom:16 }}>
            {mSeries.map((s) => <span key={s.n}><i style={{ background:s.c }}></i>{s.n}</span>)}
          </div>
        </Card>
      </div>

      {/* channel detail + search terms */}
      <div className="fx-cols">
        <Card title="Channel performance detail" sub="Leads, conversion rate and revenue" right={<span className="fx-mini">This month <FI d="chevD" n="2.2" /></span>}>
          <div className="fx-tw">
            <table className="fx-tbl">
              <thead><tr><Th>Source</Th><Th>Visitors</Th><Th>Leads</Th><Th>CVR</Th><Th>Revenue</Th></tr></thead>
              <tbody>
                {D.CHANNELS.map((c) => (
                  <tr key={c.key}><td><SrcCell src={c.src} name={c.name} /></td>
                    <td className="num">{num(c.visitors)}</td>
                    <td className="num">{c.leads}</td>
                    <td className="num"><span className="fx-count">{(c.conv / c.visitors * 100).toFixed(1)}%</span></td>
                    <td className="num fx-up">{money(c.rev)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Conversions by search term" sub="Organic queries · revenue is estimated" right={<span className="fx-mini">This month <FI d="chevD" n="2.2" /></span>}>
          <div className="fx-tw">
            <table className="fx-tbl">
              <thead><tr><Th>Search term</Th><Th>Clicks</Th><Th>Conversions</Th><Th>Est. revenue</Th></tr></thead>
              <tbody>
                {D.KEYWORDS.map((k) => (
                  <tr key={k.q}><td><SrcCell src="google-organic" name={k.q} /></td>
                    <td className="num">{num(k.clicks)}</td>
                    <td className="num">{k.conv}</td>
                    <td className="num fx-up">{money(k.rev)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* payback */}
      <Card title="Payback period" sub="Months to profit by channel" right={<span className="fx-mini">This month <FI d="chevD" n="2.2" /></span>}>
        <div className="fx-pb">
          {F.PAYBACK.map((p) => (
            <div className="fx-pb-c" key={p.key}>
              <div className="fx-pb-h">{B ? <B src={p.src} size={20} /> : null}{p.name}<span className={'fx-pill ' + p.tone}>{p.label}</span></div>
              <div className="fx-pb-m">{p.months} mo</div>
              <MiniSpark vals={p.series} color={p.tone === 'warn' ? '#FF8800' : '#00AA57'} />
            </div>
          ))}
        </div>
      </Card>

      <p className="fx-note"><b>Illustrative fixture data.</b> Every figure on this screen reconciles with the same dataset — no customer or live account data is shown.</p>
    </div>
  );
}





// --- Export the main DemoApp component ---
export default DemoApp;
