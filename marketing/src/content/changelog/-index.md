---
title: "Product Changelog"
meta_title: "SourceTrack Product Changelog"
description: "Track the latest feature releases, attribution engine updates, and platform improvements."
image: "/images/og-image.png"
draft: false
page_header:
  badge: "Changelog"
  title: |
    Stay Updated with Our
    <br/>
    <mark>Product Releases</mark>
  subtitle: "Track new attribution features, search signals, and integration updates."

changelog_list:
  - version: "v1.2.0"
    date: "July 2026"
    title: "Phase 1 MCP Tools & Automation Score Engine"
    description: "Introduced stdio JSON-RPC MCP server tools for automated site setup, bot detection heuristics, and JSX-derived step synchronization guards."
    author: "SourceTrack Core Team"
    time: "14:00 PM"
    categories:
      - name: "NEW FEATURES"
        items:
          - icon: "check"
            text: "MCP Install Tools: Exposed detect_platform, get_install_snippet, and verify_installation via Model Context Protocol stdio interface."
          - icon: "check"
            text: "Automation Score Engine: Log-only bot heuristic scoring detecting webdriver, automation globals, and browser window shapes."
          - icon: "check"
            text: "Platform Guides Sync Guard: Single source of truth for platform install walkthrough steps verified against Docs JSX components at test time."
      - name: "ATTRIBUTION IMPROVEMENTS"
        items:
          - icon: "check"
            text: "Enhanced verify_installation backend status route handling for user session auth tokens."
          - icon: "check"
            text: "Optimized Tinybird pipe query response fallback circuits."

  - version: "v1.1.0"
    date: "June 2026"
    title: "Search Console SEO Revenue & AI Search Classifier"
    description: "Added Search Console organic query revenue matching and expanded AI referral classifiers for ChatGPT, Claude, Gemini, and Perplexity."
    author: "SourceTrack Core Team"
    time: "10:30 AM"
    categories:
      - name: "NEW FEATURES"
        items:
          - icon: "check"
            text: "Google Search Console Integration: Match organic search queries and landing pages to revenue webhooks with estimated financial yield."
          - icon: "check"
            text: "AI Search Referral Classifier: Automatically detect traffic originating from conversational AI platforms."
      - name: "UX ENHANCEMENTS"
        items:
          - icon: "check"
            text: "Visitor Journey Inspector: Visual pre-conversion touchpoint timeline detailing every pageview and campaign interaction."

  - version: "v1.0.0"
    date: "May 2026"
    title: "Cookieless Attribution Engine & Revenue Webhooks"
    description: "Initial production release featuring cookieless first-party tracking, Stripe test/live webhook ingestion, and multi-touch attribution models."
    author: "SourceTrack Core Team"
    time: "09:00 AM"
    categories:
      - name: "NEW FEATURES"
        items:
          - icon: "check"
            text: "Cookieless Identity Moat: 100% first-party tracking without third-party cookies or invasive device fingerprinting."
          - icon: "check"
            text: "Stripe & Shopify Webhooks: Automated conversion and revenue event ingestion."
          - icon: "check"
            text: "Multi-Touch Models: Side-by-side comparison of first-touch, last-touch, linear, and time-decay attribution."
---
