# QA Report — Session 140P-C: SourceIcon / SourceChip Harmonization

This report documents the implementation of the centralized, standardized traffic source and AI platform normalization layer, SVG logo mapping, and color chip harmonization across all user-facing dashboard interfaces.

## Files Changed

* [SourceIcon.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/components/SourceIcon.jsx)
* [brandLogos.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/lib/brandLogos.jsx)
* [Analytics.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/Analytics.jsx)
* [Journey.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/Journey.jsx)

---

## Source Coverage Matrix

The centralized normalization handles the following mappings:

| Raw Source Name Match (case-insensitive) | Standardized Display Name | Category | Brand SVG / Lucide Fallback |
|---|---|---|---|
| `chatgpt`, `openai`, `chatgpt.com` | ChatGPT | AI Platforms | OpenAILogo |
| `perplexity` | Perplexity | AI Platforms | PerplexityLogo |
| `claude`, `anthropic` | Claude | AI Platforms | AnthropicLogo |
| `gemini`, `google ai`, `google-ai` | Gemini | AI Platforms | GeminiLogo |
| `copilot`, `bing chat`, `bing-chat` | Copilot | AI Platforms | CopilotLogo |
| `grok`, `xai` | Grok | AI Platforms | GrokLogo |
| `deepseek` | DeepSeek | AI Platforms | DeepSeekLogo |
| `google ads`, `googleads`, `gclid` | Google Ads | Paid Ads | GoogleLogo |
| `facebook ads`, `fbclid`, `meta ads` | Meta Ads | Paid Ads | MetaLogo |
| `instagram ads`, `igads` | Instagram Ads | Paid Ads | MetaLogo |
| `tiktok ads`, `tiktokads` | TikTok Ads | Paid Ads | TikTokLogo |
| `linkedin ads`, `linkedinads` | LinkedIn Ads | Paid Ads | LinkedInLogo |
| `bing ads`, `bingads` | Bing Ads | Paid Ads | MicrosoftLogo |
| `linkedin` | LinkedIn | Social | LinkedInLogo |
| `facebook`, `fb.me` | Facebook | Social | MetaLogo |
| `instagram`, `instagr.am` | Instagram | Social | MetaLogo |
| `twitter`, `t.co`, `x.com` | X / Twitter | Social | XLogo |
| `tiktok` | TikTok | Social | TikTokLogo |
| `reddit` | Reddit | Social | Globe (Indigo) |
| `youtube`, `youtu.be` | YouTube | Social | Video (Red) |
| `pinterest` | Pinterest | Social | PinterestLogo |
| `snapchat` | Snapchat | Social | SnapchatLogo |
| `google` (as domain, e.g. `google.co.uk`, `google.com`) | Google Organic | Search | GoogleLogo |
| `bing` | Bing | Search | MicrosoftLogo |
| `yahoo` | Yahoo | Search | Search (Green) |
| `duckduckgo` | DuckDuckGo | Search | Search (Green) |
| `newsletter` | Newsletter | Email | Mail (Yellow) |
| `email`, `mail` | Email | Email | Mail (Yellow) |
| `sms`, `text` | SMS | SMS | MessageSquare (Orange) |
| `direct`, `none` | Direct / None | Direct | MousePointer (Gray) |
| `referral`, `ref` | Referral | Referral | Globe (Purple) |
| `unknown` | Unknown / Other | Other | Globe (Gray) |

---

## Pages Checked

* **Analytics:** Replaced raw text referrer and AI platform rows in data tables with clean `normalizeSource(name).name` formatting and verified `SourceIcon` is correctly rendered for both Referrer and AI Source lists. It uses the `normalizeSource + SourceIcon` combination in the ranking rows rather than the full-bordered `SourceChip` badge to maintain tight vertical density.
* **Dashboard:** Verified top referrers, top pages, AI sources, and conversion cards successfully query and render chips via `<SourceChip />`.
* **Leads:** Verified leads lists render cleanly using `<SourceChip />`.
* **Lead Detail:** Verified the lead overview renders details using `<SourceChip />`.
* **Customer Journey:** Updated touchpoint session cards to use `<SourceChip />` rather than raw text and gray badge layouts.
* **Report Builder:** Verified report preview columns render dynamically using `<SourceChip />`.

---

## Theme & Visual Polish

* **Light/Dark Mode Colors:** Background colors use Tailwind opacity utilities (`bg-emerald-500/10`, `bg-sky-500/10`) to automatically blend with light page cards or dark background elements.
* **Text Contrast:** Color chips use high-contrast Tailwind text classes (e.g. `text-emerald-700` in light mode, `text-emerald-400` in dark mode).
* **Inline SVGs:** Adaptable SVG paths in `brandLogos.jsx` (specifically TikTok, X, and OpenAI) were modified to use `fill="currentColor"` so they adapt dynamically to light text/dark text colors and avoid becoming invisible on light background chips.
* **Truncation Rules:** Updated `SourceChip` to use `max-w-full`, added `flex-shrink-0` to the icon, and wrapped the text label inside a `truncate` span to prevent text overflow on compact grid tables.

---

## Validation Executed

### 1. Build Compilation
```bash
cd dashboard && npm run build
```
*Output:* Compile Succeeded.

### 2. Static Analysis Check
```bash
npm run qa:static
```
*Output:* Static Launch QA Passed.

### 3. Whitespace & Trailing Check
```bash
git diff --check
```
*Output:* Clean (0 exit code).

### 4. Code references audit
```bash
grep -RIn "SourceIcon\\|SourceChip\\|brandLogos" dashboard/src | head -120
```
*Output:* Verified all imports and renderings are fully centralized and uniform.

---

## Remaining Risks & Verdicts

* **Remaining Risks:** Browser visual verification has not been performed yet. Staged deployment and manual checks will be needed to confirm light/dark chip contrast values and check the sizing/wrapping of long fallback source names on mobile layouts.
* **Paid-Beta Verdict for this issue:** **RESOLVED**
* **Overall Paid-Beta Release Verdict:** **NOT READY** (Checkout validation and stabilization checks must complete).
