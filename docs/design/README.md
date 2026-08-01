# Design reference artifacts

Rendered references, not the specification. The design spec is the single source of
truth — where these disagree with it, the spec wins.

| File | What it shows |
|---|---|
| `marketing.html` | Marketing homepage, light default with dark toggle, motion per §37 |

Known limitations — do not copy into production:

- Third-party logos load from a favicon service. Production must bundle local SVGs
  (see spec §3.4 implementation note).
- Pricing figures are `$00` placeholders pending the Stripe catalogue.
- All figures shown are fixture data.
