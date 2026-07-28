---
title: "Privacy Policy Overview"
meta_title: "Privacy Policy Overview — SourceTrack"
description: "Privacy overview and tracking data handling policies for the SourceTrack attribution analytics platform."
image: "/images/og-image.png"
draft: false
page_header:
  title: "Privacy & Data Handling"
  subtitle: "Learn how SourceTrack collects, processes, and protects visitor analytics data."
---

#### Notice & Transparency Overview

Please note that this document is a practical product and privacy overview describing how the SourceTrack platform handles data. It is provided for transparency and does not constitute formal legal certification.

#### 1. Privacy-Conscious Design

SourceTrack is built as a privacy-conscious attribution platform. Our goal is to connect marketing efforts to actual conversion outcomes with the minimum necessary data collection. Unlike broad analytics suites, we do not build cross-site behavior profiles or sell customer telemetry data.

#### 2. Data We Collect

When a workspace installs our tracking pixel, we collect analytics events submitted by that website. This includes:
- Pageviews, referrer headers, and landing page paths.
- Campaign parameters (UTM tags, click identifiers like GCLID).
- AI discovery referrers (e.g., ChatGPT, Claude, Gemini, Perplexity).
- Conversion events (signups, purchases, and custom events configured by the workspace owner).

#### 3. IP Addresses & Geolocation

SourceTrack uses IP addresses solely to determine approximate geographic location (country level) during ingestion. We discard raw IP addresses immediately after country classification and do not store them in long-term ClickHouse event logs.

#### 4. No Third-Party Selling

We do not sell, rent, or trade event data to data brokers or advertising networks. Workspace data remains strictly isolated under Row-Level Security (RLS) to the owning account.
