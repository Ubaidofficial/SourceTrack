# S97 Audit Report

## ✅ Confirmed working
- App.jsx — DesignSystem removed, /ai-chat route present
- Layout.jsx — Live Events nav label, no /ai-chat in navItems, trial banner from Supabase sites table, trialInfo daysLeft badges (amber/red/pulse), Upgrade → /settings, bubble 52px bg-st-black, slide-in 400px 70vh rounded-tl-2xl, bubble+panel hidden on /onboarding, AIChatPanel uses fetchApi('/ai-chat'), siteKey loaded from Supabase before chat
- OnboardingProgress.jsx — STEP_LABELS 6 labels, active underline, lime completed, connectors
- OnboardingCard.jsx — no icon rendered, rounded-2xl shadow-md border max-w-[560px], 22px title
- JourneyModal.jsx — left panel bg-st-lime/10, 4-KPI grid, 3 filter pills with live counts, Zap icon with bg-st-lime circle, AI_COLORS map with getAIColor fallback
- Dashboard.jsx — ArcElement registered, Doughnut imported, KPI delta from _prev keys, Leads Over Time card using channelTrendResults, Revenue by Campaign using Doughnut, Channel Payback Analysis from activeResults, verdict logic (Scale/Watch/Pause), AI Forecast teaser with Sparkles → /ai-analytics, no Pipeline Stages/LTV by Model/Session Analytics cards, no orphaned = useQuery({, AI_PLATFORM_COLORS map, ai_leads column in table
- Settings.jsx — PLANS 3 entries (29/50, 99/200/highlight, 149/500), Pro card bg-st-black text-white, Pro CTA bg-st-lime text-st-black, handleSubscribe(p.key), loadingCheckout per-plan
- Campaigns.jsx — Blended ROAS KPI tile computed from spendMap, CPL column renders spend/conversions per row, CPL shows — when no spend
- AIAnalytics.jsx — ForecastCard renders Line chart with 2 datasets (historical solid + forecast dashed borderDash: [6,4]), AnomalyCard renders WoW table (Channel/This week/Last week/Δ Revenue/Δ Leads), VerdictCard renders SCALE/PAUSE/KILL badges
- api/middleware/tier-check.js — PLAN_LIMITS, named export checkTierLimit, catch calls next(), getSupabase() factory
- api/index.js — checkTierLimit in POST /api/track, /api/collect, /api/conversion chains
- api/routes/analytics.js — BOT_UA_PATTERN at module level, silent drop first after destructure
- api/routes/dashboard.js — conversions_prev, ai_revenue_prev, channel_trend in response
- api/routes/ai-analytics.js — /forecast returns { forecast: null, reason: 'insufficient_data' } when <14 days, /anomalies sets has_enough_data boolean, both use dynamic import for ai-client
- dashboard/src/lib/api.js — createCheckout signature with planKey default 'pro', body includes plan_key

## ⚠️ Fixed
- dashboard/src/pages/Leads.jsx — filterSource state was missing (used in queryKey and API call but never declared) — added `const [filterSource, setFilterSource] = useState('all')`
- dashboard/src/pages/AIAnalytics.jsx — VerdictCard called `fetchApi('/api/attribution/verdicts')` causing double /api prefix — changed to `/attribution/verdicts`
- dashboard/src/pages/Leads.jsx — source filter dropdown UI was missing (filterSource state had no control) — added select with options all/organic/paid/ai/social/email/direct/referral

## ❌ Could not fix
- None

## Build
✅ API syntax checks passing (node --check on 4 files)
⚠️ Dashboard build unavailable — no package.json or vite config in dashboard/ directory
