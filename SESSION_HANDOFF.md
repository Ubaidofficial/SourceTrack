Last completed: Session 97 — T3.4 Business-type KPI frontend switching
Branch: main | Build: ✅ passing
Next: T4.1 — Dashboard simplification, remove duplicate channel sections

Context:
- getKpiConfig() + enrichKpis() helpers added outside Dashboard component
- kpiConfig.map() replaces old ternary KPI block in Dashboard.jsx
- businessType read from overview?.business_type || site?.business_type
- MRR, CAC, AOV, CPL, ROAS show "Not yet tracked" empty states — not claimed as implemented
- MetricTile already had isEmpty prop support — no changes needed there

Do NOT touch:
- Attribution engine, backend routes, tracker.js
- COMPETITOR_PARITY.md, KNOWN_ISSUES.md, BUG_REVIEW_LOG.md
