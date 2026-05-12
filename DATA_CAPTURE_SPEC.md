# Data Capture Spec

This document is the current source of truth for what SourceTrack captures, accepts, stores, and exposes.

Treat this as verified only for fields confirmed in tracker/API code. Mark future fields as roadmap until implemented.

## Browser tracker

Primary files:

- `tracker/loader.js`
- `tracker/tracker.js`
- `tracker/loader.min.js`
- `tracker/tracker.min.js`

If `tracker/tracker.js` changes, run:

    npm run build:tracker

## Tracker identity

The tracker stores an anonymous visitor ID using a site-key scoped cookie/local storage key.

The tracker exposes:

    window.trackiq.id()
    window.trackiq.identify(...)
    window.trackiq.event(...)
    window.trackiq.conversion(...)
    window.trackiq.page()
    window.trackiq.getCrossDomainUrl(...)

## URL params captured today

The tracker captures these URL params:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `ref`
- `source`
- `via`

Current fallback behavior:

    utm_source = utm_source || ref || source || via

The tracker sends these fallback params separately:

- `ref_param`
- `source_param`
- `via_param`

## First-touch fields

The tracker persists first-touch fields when first seen:

- `first_touch_source`
- `first_touch_medium`
- `first_touch_campaign`

Conversions should carry first-touch fields when available.

## Pageview/event capture

Client event payload includes:

- `site_key`
- `event`
- `anonymous_id`
- `page_url`
- `referrer`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `ref_param`
- `source_param`
- `via_param`
- `first_touch_source`
- `first_touch_medium`
- `first_touch_campaign`

API route:

    POST /api/track

Backend enriches with:

- `site_id`
- `device_type`
- `country`
- `server_timestamp`
- `ai_source`
- `ingestion_method = server_routed`

## Conversion capture

Client conversion call:

    trackiq.conversion(value, {
      conversion_type: 'lead',
      form_name: 'Contact Form'
    })

API route:

    POST /api/conversion

Conversion fields:

- `site_key`
- `anonymous_id`
- `conversion_value`
- `conversion_type`
- `form_name`
- `page_url`
- `referrer`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `ref_param`
- `source_param`
- `via_param`
- `first_touch_source`
- `first_touch_medium`
- `first_touch_campaign`

Backend enriches with:

- `site_id`
- `device_type`
- `country`
- `server_timestamp`
- `ai_source`
- `ingestion_method = server_routed`

## Identify capture

API route:

    POST /api/identify

Expected identity fields include:

- `site_key`
- `anonymous_id`
- `user_id`
- `traits`
- `first_touch_source`
- `first_touch_medium`
- `first_touch_campaign`

Used to connect anonymous visitor identity to known users/leads.

## AI source detection

Middleware:

    api/middleware/ai-platform.js

Detected AI sources currently include:

- ChatGPT
- Claude
- Perplexity
- Gemini
- Grok
- Copilot
- DeepSeek
- You.com AI
- Phind
- Kagi

AI source is derived from HTTP referrer. Some AI products strip referrers, so AI attribution may be undercounted.

## PostHog properties

PostHog receives event properties through backend routes.

Core properties used by reporting:

- `site_id`
- `anonymous_id`
- `page_url`
- `referrer`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `ref_param`
- `source_param`
- `via_param`
- `first_touch_source`
- `first_touch_medium`
- `first_touch_campaign`
- `conversion_value`
- `conversion_type`
- `form_name`
- `ai_source`
- `device_type`
- `country`
- `server_timestamp`
- `ingestion_method`

## Event Logger exposure

Event Logger should expose:

Top-level columns:

- `event`
- `timestamp`
- `distinct_id`
- `source`
- `medium`
- `campaign`
- `ai_source`
- `page`
- `referrer`
- `conversion_type`
- `conversion_value`
- `ingestion_method`
- `device_type`
- `country`

Detail drawer/raw properties should include:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `ref_param`
- `source_param`
- `via_param`
- `first_touch_source`
- `first_touch_medium`
- `first_touch_campaign`
- `ai_source`

## Report Builder dimensions

Supported relevant group-by dimensions:

- `channel`
- `source`
- `medium`
- `campaign`
- `ai_source`
- `landing_page`
- `country`
- `device`
- `conversion_type`
- `date`

Current channel taxonomy:

- Direct
- Organic Search
- Paid Search
- Organic Social
- Paid Social
- Email
- AI Search
- Referral
- Other

## Not yet verified/built

Do not claim these as live until code and QA prove them:

- `gclid`
- `gbraid`
- `wbraid`
- `fbclid`
- `msclkid`
- `ttclid`
- `li_fat_id`
- `ad_id`
- `campaign_id`
- `adset_id`
- `creative_id`
- real ad spend ingestion
- ad account / ad set / ad ID reporting
- full cross-device identity stitching
- server-side payment-provider attribution parity
- predictive LTV

## Session 78 verification URLs

Use these local URLs:

    http://localhost:8080/sourcetrack-test.html?utm_source=google&utm_medium=cpc&utm_campaign=session78
    http://localhost:8080/sourcetrack-test.html?ref=twitter
    http://localhost:8080/sourcetrack-test.html?source=newsletter&via=email

Then verify in Event Logger and Report Builder.
