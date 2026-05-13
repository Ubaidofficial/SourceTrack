# Implementation Gap List

Structured inventory of what is implemented vs design-required vs missing.  
Do not claim features are implemented unless verified in code and QA.

## Legend

- ✅ Implemented (verified in code)
- ⚠️ Partially implemented (code exists but unverified or incomplete)
- 🎨 Design-only (Figma spec exists, no code)
- ❌ Missing

## Core Tracking

| Feature | Status | Verified | Notes |
|---|---|---|---|
| Tracker/pixel (UTM/ref/source/via capture) | ✅ | Code inspection (S78) | All 16 fields confirmed |
| POST /api/track | ✅ | Code inspection (S78) | All 16 fields persisted |
| POST /api/conversion | ✅ | Code inspection (S78) | ref/source/via parity fixed in S78 |
| POST /api/identify | ✅ | Code inspection | Uses $set, alias pending |
| AI source detection | ✅ | Code inspection | 10 platforms from referrer |
| First-touch persistence | ✅ | Code inspection | Cookie + localStorage |
| Cross-domain tracking | ✅ | Code inspection | Query param pass-through |

## Attribution & Reporting

| Feature | Status | Verified | Notes |
|---|---|---|---|
| 5 attribution models | ✅ | Code inspection | first_touch, last_touch, non-direct, ai_platforms |
| 10 group-by dimensions | ✅ | Code inspection | channel, source, medium, campaign, ai_source, landing_page, country, device, conversion_type, date |
| 16 report metrics | ✅ | Code inspection | Core/Conversion/AI/LTV/Session groups |
| Channel taxonomy (9 channels) | ✅ | Code inspection | Session 77 |
| Flexible report filters | ✅ | Code inspection | Session 79 filter_channel wiring |
| Attribution windows | ✅ | Code inspection | 1/7/14/30/60/90 day lookback |
| attribute_by (conversion/first_seen/original) | ✅ | Code inspection | Session 77 |
| Sessionization | ✅ | Code inspection | 30-min inactivity rule |

## Report Builder

| Feature | Status | Verified | Notes |
|---|---|---|---|
| 8 presets | ✅ | Code inspection | Sessions 77-79 |
| 7-step guided workflow | ✅ | Code inspection | |
| Searchable metric selector | ✅ | Code inspection | |
| Date presets + custom | ✅ | Code inspection | |
| Chart types (bar/line/pie/table) | ✅ | Code inspection | |
| Quick channel filter buttons | ✅ | Code inspection | Session 79 |
| Source quick-select pills | ✅ | Code inspection | Session 79 |
| Filter helper copy | ✅ | Code inspection | Session 79 |
| Save/load/duplicate/delete reports | ✅ | Code inspection | Session 80 |
| Saved report metadata cards | ✅ | Code inspection | Session 80 |
| New report reset | ✅ | Code inspection | Session 80 |
| Save/Update distinction | ✅ | Code inspection | Session 80 |
| Scoped DELETE | ✅ | Code inspection | Session 80 |
| CSV export | ✅ | Code inspection | Includes filter_channel |
| Figma visual alignment | ❌ | — | Planned Session 86 |

## Event Logger

| Feature | Status | Verified | Notes |
|---|---|---|---|
| Event listing + search/filter | ✅ | Code inspection | |
| Detail drawer with raw properties | ✅ | Code inspection | Session 78 added 8 fields |
| Health/edge cases/data quality | ✅ | Code inspection | |
| Figma visual alignment | ❌ | — | Part of Session 84 |

## Dashboard

| Feature | Status | Verified | Notes |
|---|---|---|---|
| 9-card fixed grid | ⚠️ | Code inspection | No drag-and-drop, no widget rendering loop |
| KPI cards | ⚠️ | Code inspection | Basic KPIs; no business-specific variants |
| Charts (revenue, AI) | ⚠️ | Code inspection | Basic chart cards |
| Add-to-Dashboard button | ❌ | Code inspection | Disabled with `{false &&}` guard |
| Raw tables → `<DashboardTable>` | ✅ | Session 84.2 | 5 raw tables replaced; build passes |
| Inline empty states → `<EmptyState>` | ✅ | Session 84.3 | Revenue Trend + AI Sources replaced with `<EmptyState>` |
| Time range → `<FilterBar>` | ✅ | Session 84.5 | Replaced pill group + export with `<FilterBar>` |
| `.st-container` wrapper | ✅ | Session 84.3 | Dashboard.jsx now uses `.st-container` |
| CTA button colors (`bg-gray-900`) | ✅ | Session 84.4 | 2 Create Report CTAs → `bg-st-black` |
| Chart color (`#D7F550`) | ❌ | Session 84.4 audit | Skipped; guard rule "do not change chart colors" |
| Sidebar active (`bg-gray-100`) | ✅ | Session 84.4 | Sidebar nav active → `bg-st-lime/10 text-st-black` |
| Top bar "Live" badge | ✅ | Session 84.4 | Live badge → `bg-st-lime/20 text-st-black` |
| Business-specific dashboards | 🎨 | — | 4 variants in Figma spec |
| Figma visual alignment | ⚠️ | Sessions 84.2–84.5 | Tables + wrapper + empty states + sidebar/CTAs + FilterBar done; chart color only remaining item |

## Onboarding

| Feature | Status | Verified | Notes |
|---|---|---|---|
| Basic onboarding flow | ✅ | Sessions 85.1–85.2 | Code verified; st token colors migrated |
| 5-step Figma stepper | ⚠️ | Session 85.3 audit | 6-step code vs 5-step Figma; needs product/design decision, not a bug |
| Business type selection | ✅ | Sessions 85.1–85.2 | Implemented + st colors |
| GTM + Standard install paths | ✅ | Sessions 85.1–85.2 | Both paths implemented + st colors |
| Conversion configuration | ✅ | Sessions 85.1–85.2 | Implemented + st colors |
| Script verification | ✅ | Session 85.1 audit | Verified; polls /api/install/status; logs errors |

## Leads & Journey

| Feature | Status | Verified | Notes |
|---|---|---|---|
| Leads listing page | ⚠️ | Unverified | Code exists, Figma parity unknown |
| Lead detail page | ❌ | Code inspection | "Not yet implemented" per PROGRESS.md |
| Journey API | ⚠️ | Unverified | `/api/journey/:visitorId` exists |
| Journey modal (Figma) | 🎨 | — | Planned Session 87 |
| CRM sync / Mark as Qualified | ❌ | — | Deferred |

## Campaigns

| Feature | Status | Verified | Notes |
|---|---|---|---|
| Campaigns page | ⚠️ | Unverified | ROAS column placeholder, no spend data |
| Campaign KPI row (Figma) | 🎨 | — | Planned Session 88 |
| Ad spend ingestion | ❌ | — | Deferred |
| Ad click IDs (gclid, fbclid, etc.) | ❌ | — | KNOWN_ISSUES #3 |

## UI Primitives & Design System (Session 83.1 audit)

| Feature | Status | Verified | Notes |
|---|---|---|---|
| Figma design tokens (colors) | ✅ | Session 83.2 | `st` namespace in Tailwind config: black/gray/lime/green/orange/red |
| Inter font (Switzer fallback) | ✅ | Session 83.2 | Inter via Google Fonts; configured as default sans in Tailwind |
| 1320px grid wrapper | ✅ | Session 83.2 | `.st-container` utility class (max-w-[1320px] mx-auto px-6) |
| 12-column layout (88px col, 24px gutter) | ✅ | Session 83.2 | Documented: use `grid-cols-12 gap-6` |
| `<DashboardCard>` | ✅ | Session 83.1 audit | Exists, used throughout. Needs color token migration only. |
| `<MetricTile>` | ✅ | Session 83.1 audit | Exists, used for KPI row. Needs color token migration only. |
| `<StatusBadge>` | ✅ | Session 83.1 audit | 9 variants. Needs color token migration only. |
| `<OnboardingCard>` | ⚠️ | Session 83.1 audit | Exists but uses inline styles (`#6F7070`, fontWeight:600). Needs cleanup. |
| `<OnboardingProgress>` | ⚠️ | Session 83.1 audit | Exists but uses hardcoded `#D7F550` (should be `#CCF03F`). |
| `<DashboardTable>` | ✅ | Session 83.2 | New component. Props: columns, rows, onRowClick, emptyMessage. |
| `<FilterBar>` | ✅ | Session 83.2 | New component. Props: dateButtons, activeDate, onDateChange, onExport. |
| `<EmptyState>` | ✅ | Session 83.2 | New component. Props: icon, title, description, action. |
| Layout sidebar active state | ✅ | Session 84.4 | Now uses `bg-st-lime/10 text-st-black` |
| Layout top bar | ⚠️ | Session 83.1 audit | Minimal (page title only); "Live" badge fixed (84.4); missing search, notifications, theme toggle |
| Visual test page (`/design-system`) | ✅ | Session 83.2 | Route added, shows all tokens and components. |

## Competitor Parity

| Capability | DataFast | Cometly | Usermaven | SourceTrack |
|---|---|---|---|---|
| UTM/ref/source/via | ✅ | ✅ | ✅ | ✅ |
| AI source detection | — | — | — | ✅ (10 platforms) |
| First/last touch attribution | ✅ | ✅ | ✅ | ✅ (5 models) |
| Ad click IDs | ✅ | ✅ | — | ❌ |
| Ad spend ingestion | ✅ | ✅ | — | ❌ |
| Ad account/ad set reporting | ✅ | ✅ | — | ❌ |
| Conversion sync | — | ✅ | — | ❌ |
| Multi-touch (beyond single-touch) | — | ✅ | — | ❌ |
| Customer journey view | — | ✅ | ✅ | ⚠️ (API only) |
| Ecommerce analytics | — | — | ✅ | ❌ |
| Product analytics | — | — | ✅ | ❌ |
| CRM integration | — | — | — | ❌ |
| Payment provider attribution | ✅ | — | — | ❌ |

Legend: ✅ = implemented and verified, ⚠️ = partially implemented, ❌ = missing, — = unknown/not applicable
