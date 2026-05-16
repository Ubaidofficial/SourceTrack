## Last completed: Report Builder B+C ✅
- B: Grouped source picker — Organic/Paid/Social/AI/Email/Direct/Referral with sub-sources
- C: Duplicate report fix — was missing JSON.stringify on body
- Multi-metric + stacked charts + % change (from previous session) all working

## Remaining Report Builder gaps vs Cometly:
- Source icons (real SVG logos vs text initials)
- Stacked bar chart toggle (UI control to enable/disable stacking)
- Area chart type
- "Display only sources with data" toggle

## Next priority options:
A) Server-side pageview proxy (adblocker bypass — biggest data accuracy win)
B) Source icons with real SVG logos in table rows
C) Analytics sidebar nav link (missing from Layout)
D) T6.2 Generic webhook receiver

## Start next session:
cat ~/Desktop/trackiq/docs/SESSION_HANDOFF.md
grep -n "nav\|sidebar\|Analytics" ~/Desktop/trackiq/dashboard/src/components/Layout.jsx | head -20
