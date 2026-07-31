# Consent Mode v2 — Scoping Memo

**Status:** SCOPING COMPLETE — founder sign-off received 2026-07-31. Ready for implementation, sequenced per §3.3 (CAPI consent parameter first, tracker granular consent state second).
**Date:** 2026-07-29
**Scope:** Google Consent Mode v2 (`ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization`)

> **Compliance boundary (GTM §5.1, unchanged):** building consent infrastructure does **not** license a
> "GDPR compliant" claim. Ratified vocabulary stays: *consent-aware*, *privacy-conscious*, *GPC/DNT
> honored*. "Consent Mode v2 supported" is a **technical interop** claim — checkable and safe — but only
> once CAPI delivery actually enforces it (§3). Shipping the signal without the enforcement would make
> that claim false.

---

## 0. Premise correction: there is no sGTM in this stack

The brief assumed Consent Mode "ties into the sGTM setups already in the stack." Verified against the
code — it does not, because there are none.

- GTM appears **only as an install method**: the customer pastes the SourceTrack snippet into a Custom
  HTML tag in *their own* container (`dashboard/src/pages/docs/DocsGTM.jsx:57`,
  `dashboard/src/pages/PublicIntegrations.jsx:27`). SourceTrack is explicitly **not** distributed as a
  GTM gallery tag template.
- There is **no server-side GTM container**, and no `gtag`/`dataLayer` read anywhere in the tracker or
  API. The only `googletagmanager.com` reference in the repo is `api/lib/platform-detector.js:39`, which
  *detects* whether a customer's site uses GTM — it does not integrate with it.

**Consequence, and it is the central constraint of this whole project:** SourceTrack cannot receive
Consent Mode signals "for free." A gallery-tag template gets GTM's built-in consent checks applied by the
container. A Custom HTML tag does not — GTM's native consent gating would block the *entire tag*,
killing anonymous analytics along with everything else, which contradicts the pattern §2 commits to.

So the signal has to be **relayed explicitly by the customer's CMP into a SourceTrack API**. That is the
mechanism this memo scopes. (Reading GTM's internal `google_tag_data.ics` consent object from a Custom
HTML tag is undocumented and fragile — not recommended, do not build on it.)

---

## 1. What signal to read, and how it meets the existing GPC/DNT logic

### 1.1 The four signals, mapped to what SourceTrack actually does

| Signal | What it governs in SourceTrack | Real? |
|---|---|---|
| `analytics_storage` | Persistent identity in the cookie build — the `st_*` localStorage keys holding AID/SID | Yes — direct mapping |
| `ad_storage` | Click-ID capture + reading the merchant's own Meta cookies `_fbp`/`_fbc` (`tracker/tracker.js:488-489`) | Yes — direct mapping |
| `ad_user_data` | Whether hashed email / IP / UA may be **sent to an ad platform** → gates CAPI `user_data` | Yes — the load-bearing one (§3) |
| `ad_personalization` | Nothing. SourceTrack builds no ad audiences and does no personalization. | **No** — accept and relay, never claim to act on it |

Be honest about `ad_personalization` in docs rather than implying it drives behavior. Accepting and
storing it (so the customer's own downstream tags stay coherent) is correct; claiming SourceTrack
"honors" it is not, since there is nothing to honor.

### 1.2 Three privacy layers exist today, and they are NOT the same gate

**(a) DNT/GPC hard abort** — `tracker/tracker.js:11-27`, `tracker/tracker.cookieless.js:12-22`.
The whole IIFE returns and exposes an all-no-op stub. Re-checked defence-in-depth at `tracker.js:696`.

**(b) Binary consent gate** — `data-consent-required="true"` + `sourcetrack.consent(bool)`, wrapping
`send()` at `tracker.js:406-417` (cookieless `:183-196`). Persisted to `localStorage.st_consent` in the
cookie build; **in-memory and per-page-load in the cookieless build by design**
(`tracker.cookieless.js:171-178`).

**(c) Server-side — nothing.** `api/lib/privacy-suppression.js` reads the `sec-gpc`/`dnt` headers but only
*counts* them into the Tinybird `privacy_signals` datasource; it gates nothing. `api/routes/admin.js:654`
self-reports it plainly: `consent/privacy: not_implemented — No consent enforcement pipeline.`

### 1.3 Additive, or does it interact? — Both, and the interaction is where the risk is

**Additive to (a) — but only if GPC/DNT stays supreme.** Consent Mode `granted` must never re-enable
tracking that GPC denied. The code already encodes this: `optIn` is a deliberate no-op under GPC
(`tracker.js:15-18`) with an explicit *"do not 'fix' this into a real opt-in — that is a compliance
defect"* comment. **Consent Mode v2 introduces exactly the pressure that comment warns about** — a CMP
asserting `ad_storage: granted` while the browser sends GPC. Rule, non-negotiable: **GPC/DNT wins,
always; the granular consent setter stays a no-op under suppression.** This is the single most important
invariant in the build.

**NOT additive to (b) — it is a generalization of (b), and needs care in three places:**

1. **Binary → 4 axes.** One `_consentGiven` boolean gates `send()` wholesale. There is no way to express
   "analytics granted, ads denied" in that model. The existing gate must become a *projection* of the new
   4-axis state so existing installs are untouched: `consent(true)` keeps meaning "all four granted", and
   `hasConsent()` keeps returning a boolean.

2. **⚠️ The withdrawal side-effect is a live footgun.** `consent(false)` currently calls
   `clearStoredIdentity()` (`tracker.js:539`), erasing stored identifiers. Under granular consent,
   `ad_storage: denied` must **not** trigger identity erasure — that would destroy anonymous analytics,
   the exact thing §2 commits to preserving. Only `analytics_storage: denied` may touch identity. Get
   this wrong and every EU visitor who declines marketing cookies silently has their AID deleted.

3. **Cookieless persistence asymmetry.** Consent is per-page-load in the cookieless build. Any design
   assuming "we stored the consent decision" is wrong for half the product — the CMP must re-feed the
   signal on every page load in cookieless mode, and the docs must say so.

---

## 2. Default behavior before consent

### 2.1 Do not change the existing default

Today, without `data-consent-required`, tracking fires immediately — opt-out model, backward-compatible
with every existing install (`tracker.js:389-390`). **Recommendation: leave it alone.** Consent Mode
defaults apply *only* when the customer explicitly opts in, same shape as `data-consent-required` today.
Silently flipping the global default to denied is the expensive-to-reverse move the brief is rightly
worried about.

### 2.2 When consent mode IS on — recommended split

Default all four to `denied` (Google's own requirement), then:

| Layer | Before consent | Rationale |
|---|---|---|
| Anonymous pageview / session analytics | **Available** | Matches the committed pattern. See 2.3 — this is a genuine architectural fit, not a workaround. |
| Persistent identity (`st_*` localStorage AID/SID) | **Blocked** until `analytics_storage: granted` | Cookie build only; cookieless has no storage, so nothing to block |
| `identify()` / email / PII | **Blocked** until `ad_user_data: granted` | This is the identity-collection line |
| CAPI outbound delivery | **Blocked** until `ad_user_data: granted` | §3 — the load-bearing gate |
| Merchant `_fbp`/`_fbc` cookie read | **Blocked** until `ad_storage: granted` | `tracker.js:488-489` |

### 2.3 The cookieless build is already Google's "advanced consent mode" shape

Worth stating plainly because it is a real advantage and not a stretch: advanced consent mode means the
tag fires cookieless pings before consent. **That is literally what `tracker.cookieless.js` already
does** — no storage, server-derived session ID, anonymous analytics with no consent dependency. Most
competitors have to build this; SourceTrack shipped it for privacy reasons and it happens to be the
correct pre-consent primitive.

### 2.4 ⚠️ The decision that needs the founder's explicit call

In the **cookie** build, "anonymous analytics survives" and "no persistent identity before consent" are
in direct conflict. Without a localStorage AID you get a fresh visitor per page load — pre-consent
traffic becomes unattributable across pages **and inflates visitor counts.**

**Recommended answer:** when consent mode is on and `analytics_storage` is denied, **serve the cookieless
code path** (session-scoped, server-derived ID) rather than degrading the cookie build into a
broken-identity state. It reuses a shipped, tested primitive instead of inventing a third identity mode.
It is also the largest build item in this memo — it means the two tracker builds must share a runtime
switch rather than being separate artifacts.

**§6 data-truth consequence:** pre-consent traffic must not silently vanish from the dashboard. It needs
a calm disclosure ("X% of sessions were pre-consent") — not a quietly lower number, and not a fake zero.

---

## 3. Intersection with CAPI — these must be sequenced, not built independently

### 3.1 Verified current state

- **`dispatchCapi()` (`api/lib/conversion-sync.js:294`) has no consent parameter and no consent check.**
  It fans out to Meta, Google Ads, Microsoft UET, and LinkedIn unconditionally.
- Two call sites: `api/routes/conversion.js:429` (browser-originated) and
  `api/routes/conversion-offline.js:238` (server-side / Payments API).
- Only gate today is plan: `hasFeature(plan, 'capi_server_side')` — free off, starter+ on
  (`api/lib/plan-features.js:42`).
- The Stripe webhook path (`api/routes/stripe-webhook.js`) writes `$conversion` **directly to Tinybird**
  and does **not** call `dispatchCapi` — out of scope today, but flag it if CAPI is ever wired there.

### 3.2 Why they cannot be independent

1. **CAPI is the only place SourceTrack sends PII to a third party.** `sendMetaCAPI` transmits hashed
   email, client IP, user agent, and `_fbp`/`_fbc` (`conversion-sync.js:130-136`). That is precisely what
   `ad_user_data` governs. **Consent Mode without CAPI gating is decorative** — it would relay a signal it
   does not enforce, which is worse than not shipping it, because it invites a claim that cannot be
   backed.

2. **The browser path can carry consent; the offline path cannot.** `conversion.js:429` has a live browser
   context, so consent state can ride along in the conversion payload. `conversion-offline.js:238` is
   server-to-server — no browser, no consent signal, and **no field on the ingestion contract to carry
   one.** This is the real design work, and it is invisible until you look at both call sites.

3. **Build order matters.** Land the CAPI consent *parameter* first — a `consent` argument threaded
   through `dispatchCapi` + both call sites + the offline ingestion contract, defaulting to today's
   behavior so nothing changes on day one. Then land the tracker's granular consent state and wire it into
   the browser call site. **The reverse order ships a consent UI that gates nothing.**

---

## 4. Decisions — founder sign-off received 2026-07-31

1. **Cookie build, `analytics_storage: denied`** — fall back to the cookieless path (*recommended*), or
   no tracking at all? Drives the largest build item (§2.4).
   **DECIDED: fall back to the cookieless code path.**
2. **Offline / Payments-API conversions with no consent field** — fail-closed on `ad_user_data`
   (*recommended*: still deliver the conversion, but withhold `user_data` from platforms absent an
   affirmative signal), or grandfather existing behavior? Fail-closed **will reduce match rates for
   existing customers** — that is a real, customer-visible cost and the reason this needs a decision
   rather than a default.
   **DECIDED: fail-closed — still deliver the conversion, withhold `user_data`.**
3. **New attribute or replacement?** Ship as `data-consent-mode` alongside `data-consent-required`
   (*recommended*), not replacing it — `data-consent-required` is publicly documented at
   `dashboard/src/pages/developers/DevelopersTracker.jsx:162` and customers depend on it.
   **DECIDED: additive `data-consent-mode` attribute, `data-consent-required` untouched.**
4. **Plan gating** — consent mode free-tier-available? *Recommended yes*: it is a privacy floor, not a
   premium feature. The CAPI half only matters starter+ regardless, since CAPI is already plan-gated.
   **DECIDED: yes, available on the free plan.**

---

## 5. Known non-goals

- Not a GDPR compliance claim (GTM §5.1).
- Not a GTM gallery tag template — out of scope, would be its own project (§0).
- No CAPI payload enrichment — still prohibited under design.md §26.1; consent gating changes *whether*
  we send, never *what* we send.
