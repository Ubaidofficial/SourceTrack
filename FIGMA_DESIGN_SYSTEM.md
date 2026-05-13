# Figma Design System — SourceTrack

Use this as the visual source of truth for dashboard, onboarding, All Leads, Campaigns, Journey modal, and future Report Builder styling.

Status: derived from exported Figma screenshots shared in chat. Do not treat unsupported features as implemented unless verified in code.

## Brand

- Product: SourceTrack
- Style: compact SaaS analytics dashboard, high-density attribution tables, lime active states, light/dark dashboard support.
- Core layout: fixed sidebar + top search/action bar + 12-column card grid.

## Typography

Figma typography screen confirms:

- Font family: Switzer
- Weights: Regular, Medium, Semi-Bold, Bold
- Type scale labels:
  - Display 1, Display 2
  - Heading 1–7
  - Body/XXL, Body/Xtra Large, Body/Large, Body/Regular, Body/Small, Body/Xtra Small with 600/500/400 weights
  - Caption/XL, Caption/Large, Caption/Regular, Caption/Small, Caption/SX

Implementation note:
- Verify whether Switzer is available/licensed in the app.
- If not, use an approved fallback and document the decision.

## Color tokens

Confirmed from Figma color screen:

| Token | Hex | Primary usage |
|---|---:|---|
| Black | `#1F2323` | text, primary button, dark surfaces |
| Gray | `#7D8090` | muted text/icons |
| Primary | `#CCF03F` | active nav, selected state, CTA accent, badges |
| Secondary | `#00AA57` | positive trend/success |
| Orange / Warning | `#FF8800` | warning/monitor/review states |
| Red / Danger | `#E54545` | negative trend/danger |

Figma theme ratio:
- 60% white space / background
- 30% content
- 10% action color

## Light theme

Observed:
- Very light gray page background.
- White sidebar/cards.
- Subtle borders and soft shadows.
- Light gray table headers.
- Lime active nav and selected states.
- Black primary CTA buttons.
- White/outlined secondary buttons.

## Dark theme

Observed only for main dashboard screens.

- Dark gray/black page background.
- Dark cards/tables.
- Lime active states.
- High contrast charts and badges.
- Not all pages are shown in dark mode; dark mode coverage for onboarding, All Leads, Campaigns, Journey modal, and Report Builder is unverified.

## Grid and spacing

Confirmed:
- Desktop grid: 1320px
- Columns: 12
- Column width: 88px
- Gutter: 24px
- Spacing system: 4px soft grid
- Spacing increments shown: 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 72, 96, 124, 160px

## Card layout primitives

Figma defines:
- Full Screen Card
- Large Card
- Regular Card
- Small Card

Use these for dashboard widgets and future Report Builder cards.

## Sidebar

Observed nav:
- Dashboard
- All Leads
- Campaigns
- Integrations
- Settings
- Log-out

Groups:
- Management
- Configuration

Active state:
- Lime background
- Dark text/icon
- Rounded rectangle

## Top bar

Observed:
- Search input with shortcut hint.
- Notification icon.
- Theme toggle icons.
- Avatar/name menu.
- Breadcrumb/back controls.
- Date buttons: Last 24 hours, Last 7 days, Last 30 days.
- Export button.
- Some pages add source/model/date/more filters.

## Cards and tables

Cards:
- Title left, ellipsis/menu right.
- Optional timeframe dropdown.
- White/dark surface with border and soft shadow.
- Dense content.

Tables:
- Compact row height.
- Gray header row.
- Sort icons in headers.
- Source/channel icon + label.
- Event/status pills.
- Lime underlined action links such as View Journey.
- Pagination with lime current page.

## Badges

Observed:
- Lead: lime
- Free Trial: gray
- MQL: green-tinted
- Purchase: tan/orange
- Sign Up: lime
- Active: dark/lime toggle or pill
- Expired: gray
- Stable/Invest/Monitor/Reduce/Optimize/Review: colored status pills

## Charts

Observed:
- Lime line charts with pale lime gradient fill.
- Channel color bar charts with platform logos.
- Donut chart with central KPI.
- Multi-series line charts with tooltip.
- Orange/green sparklines.

## Journey modal pattern

Observed:
- Dark overlay.
- Large centered white modal.
- Header actions: Sync To CRM, Export, Mark as Qualified.
- Left lead summary card with lime background.
- Right activity timeline with expandable cards.
- Platform icons and timestamps.

## Onboarding pattern

Observed:
- Large whitespace.
- Centered white card.
- Top horizontal 5-step stepper.
- Logo top-left.
- Watch Video CTA top-right.
- Lime completed steps, black active step, gray future steps.
- Black primary CTA with arrow.

## Report Builder design guidance

Figma does not include Report Builder.

Keep Report Builder as an app feature, but restyle it using:
- same sidebar/topbar shell
- same card/table density
- same filter control style
- same lime active states
- same export button style
- same saved-report card language
- same empty/loading/error states
