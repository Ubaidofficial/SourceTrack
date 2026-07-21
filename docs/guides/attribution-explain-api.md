# Attribution Explain — API Reference

**Last verified:** 2026-07-21 (against `b3cb043`)

`GET /api/attribution/explain` — why a single visitor's conversion was attributed to a given source, under a given model.

Mounted as a direct handler in `api/index.js` (`:462`). Everything below describes what the handler in `api/routes/attribution.js` actually returns — field names and shapes were read from the code, not from a sibling endpoint's schema.

---

## Authentication

The endpoint runs the chain `requireUserAuth` → `validateSiteKey` → `requireSiteMembership` → `defaultLimit`.

You need **two** credentials on every request:

| Credential | Where | What it is |
|---|---|---|
| Supabase session JWT | `Authorization: Bearer <token>` header | A logged-in dashboard user's token |
| `site_key` | `?site_key=…` query parameter | The site you are querying |

This is a **user-session endpoint, not a Server API Token endpoint.** A `st_live_…` Server API Token (see Settings → Server API Tokens) does **not** authenticate here — it is accepted only by `POST /api/server/event`. There is no API-key auth mode for this endpoint.

The caller must belong to the workspace that owns the site: `requireSiteMembership` compares `req.site.company_id` against the user's `company_id`. A `super_admin` bypasses the site check. Sites with no `company_id` fall back to an owner check against `site.owner_id`.

**Rate limit:** 100 requests per 60 seconds (`defaultLimit`), with standard `RateLimit-*` response headers.

---

## Parameters

| Param | Required | Notes |
|---|---|---|
| `site_key` | ✅ | Also consumed by the auth chain |
| `model` | ✅ | One of the nine models below |
| `distinct_id` | ✅ | The visitor identifier to explain |

All three are required — omitting any one returns `400`.

Valid `model` values: `first_touch`, `last_touch`, `first_touch_non_direct`, `last_touch_non_direct`, `ai_platforms`, `linear`, `u_shaped`, `time_decay`, `w_shaped`.

> **The four multi-touch models return no attribution here.** `linear`, `u_shaped`, `time_decay`, and `w_shaped` are accepted and return `200`, but `attributed_to` is `null` and `reason` is the fixed string *"Step-by-step explanations are currently available for single-touch models only. Advanced models are calculated in aggregate reports."* Per-visitor step-by-step explanation is implemented for the five single-touch models only. Those four models additionally require the `multi_touch_attribution` plan feature, so on a plan without it the request returns `402` before it reaches that branch.

---

## Response

`200` with `{ success: true, data: <explanation>, error: null }`.

The `data` object:

| Field | Type | Notes |
|---|---|---|
| `model` | string | Echoes the requested model |
| `distinct_id` | string | Echoes the requested visitor |
| `conversion` | object | `timestamp`, `value` (number, `0` when absent), `page_url`, `user_id`, `anonymous_id`, `ingestion_method` (defaults to `'server_routed'`) |
| `journey_summary` | object | See below |
| `sessions` | array | Sessions derived at read time — not materialized |
| `attributed_to` | object \| null | `{ source, medium, campaign }`; `ai_platforms` adds a `type` field. `null` for the four multi-touch models |
| `reason` | string | Plain-language explanation of the attribution decision |
| `fallback` | boolean | `true` when the model could not find its preferred touch and fell back |
| `skipped_touches` | array | Populated **only** for the two `*_non_direct` models; `[]` otherwise |
| `all_touches` | array | Every `$pageview` touch: `timestamp`, `page_url`, `source` (defaults `'direct'`), `medium` (defaults `'none'`), `campaign`, `type` (`'direct'` \| `'non_direct'`), `ai_source` |

`journey_summary` contains: `total_events`, `touchpoint_count`, `direct_touches`, `non_direct_touches`, `journey_duration_days` (`0` when fewer than 2 touchpoints), `session_count`, `first_session_at`, `last_session_at`, `converting_session_index` (`null` when no session contains the conversion).

Each entry in `sessions` carries: `session_index` (1-based), `started_at`, `ended_at`, `duration_seconds`, `pageview_count`, `event_count`, `entry_page`, `exit_page`, `entry_source`, `entry_medium`, `entry_campaign`, `entry_country`, `entry_device_type`, `acquisition_key`, `is_direct_entry`, `contains_conversion`, `conversion_value`.

> **Two session fields are always `null` on this endpoint.** `entry_country` and `entry_device_type` are populated from the event's `country` / `device_type` properties, and the journey read behind this endpoint does not select those columns. They are structurally present but never filled here. Do not treat them as "no country recorded" — they are not queried.

> **Click IDs do not split sessions here.** Sessions split on a 30-minute inactivity gap or a change in acquisition context. The acquisition key is built from `utm_source` / `utm_medium` / `utm_campaign` plus paid click IDs (`gclid`, `fbclid`, …), but the journey read behind this endpoint selects only the three UTM fields, so in practice only UTM changes cause a split on this endpoint.

`reason` values are fixed strings chosen per model — for example `first_touch` returns *"First touch source stored in browser cookie at initial visit"*, or *"First touch was direct (no UTM on first visit)"* when the first touch carried no UTM.

---

## Example

```
GET /api/attribution/explain?site_key=YOUR_SITE_KEY&model=first_touch_non_direct&distinct_id=a3f1c2e8-...
Authorization: Bearer <supabase-jwt>
```

```json
{
  "success": true,
  "data": {
    "model": "first_touch_non_direct",
    "distinct_id": "a3f1c2e8-...",
    "conversion": {
      "timestamp": "2026-07-18T14:22:05.000Z",
      "value": 249,
      "page_url": "https://example.com/checkout/success",
      "user_id": null,
      "anonymous_id": "a3f1c2e8-...",
      "ingestion_method": "server_routed"
    },
    "journey_summary": {
      "total_events": 7,
      "touchpoint_count": 6,
      "direct_touches": 2,
      "non_direct_touches": 4,
      "journey_duration_days": 5,
      "session_count": 3,
      "first_session_at": "2026-07-13T09:02:11.000Z",
      "last_session_at": "2026-07-18T14:22:05.000Z",
      "converting_session_index": 3
    },
    "sessions": [
      {
        "session_index": 1,
        "started_at": "2026-07-13T09:02:11.000Z",
        "ended_at": "2026-07-13T09:07:48.000Z",
        "duration_seconds": 337,
        "pageview_count": 2,
        "event_count": 2,
        "entry_page": "https://example.com/blog/attribution-basics",
        "exit_page": "https://example.com/pricing",
        "entry_source": "google",
        "entry_medium": "organic",
        "entry_campaign": null,
        "entry_country": null,
        "entry_device_type": null,
        "acquisition_key": "google|organic||",
        "is_direct_entry": false,
        "contains_conversion": false,
        "conversion_value": 0
      }
    ],
    "attributed_to": { "source": "google", "medium": "organic", "campaign": null },
    "reason": "Earliest non-direct pageview for this visitor",
    "fallback": false,
    "skipped_touches": [
      { "timestamp": "2026-07-13T08:58:02.000Z", "source": "direct", "reason": "Skipped: direct touch before first non-direct" }
    ],
    "all_touches": [
      {
        "timestamp": "2026-07-13T09:02:11.000Z",
        "page_url": "https://example.com/blog/attribution-basics",
        "source": "google",
        "medium": "organic",
        "campaign": null,
        "type": "non_direct",
        "ai_source": null
      }
    ]
  },
  "error": null
}
```

---

## Errors

| Status | When | Body |
|---|---|---|
| `400` | `site_key`, `model`, or `distinct_id` missing | `error: "site_key, model, and distinct_id are required"` |
| `400` | `model` not in the allowed set | `error: "Invalid model. Must be one of: …"` |
| `401` | Missing/invalid JWT, or missing/unknown `site_key` | `"Missing or invalid Authorization header"`, `"Invalid or expired token"`, `"Missing site_key"`, `"Invalid site_key"` |
| `402` | Trial expired, subscription inactive, or `multi_touch_attribution` not on plan (the four multi-touch models only) | Plan-gate payload |
| `403` | Authenticated but the site belongs to another workspace | `"Access denied — this site belongs to another workspace"` |
| `404` | No conversion found for this `distinct_id` | `error: "No conversion found for this visitor"` |
| `429` | Over 100 requests/minute | Standard rate-limit response |

> ⚠️ **An internal failure returns `200`, not `5xx`.** The handler's `catch` responds `200 { success: true, data: null, error: null }`. A dropped upstream read is therefore indistinguishable at the HTTP layer from a successful call — except that `data` is `null`, which the `404` path never produces. **Treat `success: true` with `data: null` as an error, not as "no data."** Do not render it as an empty state. Tracked as `KNOWN_ISSUES` **KI-47**.

---

## Related Docs

- [Forms and Booking — Support Matrix](forms-and-booking-support.md)
- [Form & Checkout Source Handoff](form_checkout_source_handoff.md)
