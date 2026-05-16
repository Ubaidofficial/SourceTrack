# Docs Index

## Start Here

| File | Purpose | When to Read | Status |
|---|---|---|---|
| `RULES.md` | 10 coding behavior rules for every session | Every session | Current |
| `AGENT_BRIEF.md` | Product, stack, ports, commands, core rules | Every session | Current |
| `AGENTS.md` | AI agent context — read order, session procedures, key files table | Every session | Current |
| `PROJECT_CONTEXT_COMPACT.md` | Condensed product/stack/design/guardrails overview | Every session | Current |
| `SESSION_STATE.md` | Current session, branch, blockers, active work | Every session | Current |
| `SESSION_HANDOFF.md` | Last completed work, pending QA | Every session | Handoff |
| `KNOWN_ISSUES.md` | Verified bugs/gaps only | Every session | Current |
| `SESSION_STATE.md (replaces AI_SESSION_PLAN)` | Upcoming session roadmap and priorities | Every session | Current |

## Session Tracking

| File | Purpose | When to Read | Status |
|---|---|---|---|
| `SESSION_LOG.md` | Running log of sessions 75+ with dates, branches, summaries, QA status | Sometimes | Current |
| `IMPLEMENTATION_GAP_LIST.md` | Structured inventory — implemented vs design-required vs missing | Sometimes | Current |
| `BUG_REVIEW_LOG.md` | Code review issues, potential regressions, risk assessments | Before handoff | Current |

## Current Source of Truth

| File | Purpose | When to Read | Status |
|---|---|---|---|
| `SYSTEM.md` | Global guardrails, API shape, PostHog/HogQL invariants, cookie spec, AI detection | Every session (invariants) | Current |
| `ATTRIBUTION.md` | Attribution truthfulness contract — 13 parts governing source credit, metrics, LTV, sessions, channels | Attribution/reporting work | Current |
| `DATA_CAPTURE_SPEC.md` | Canonical list of captured fields, tracker behavior, enrichment, PostHog properties, verified vs roadmap | Attribution/data work | Current |
| `SUPABASE_SCHEMA.md` | Expected Supabase tables, migrations, RLS policies, verification queries | Supabase/schema work | Current |
| `IDENTITY_DESIGN.md` | Identity stitching architecture, identify flow, alias strategy, edge cases | Identity/data work | Current |

## Design / Figma / Dashboard Specs

| File | Purpose | When to Read | Status | Warning |
|---|---|---|---|---|
| `FIGMA_DESIGN_SYSTEM.md` | Design tokens — typography (Switzer), colors (lime/charcoal/neutral), grid, sidebar, cards, tables, badges, charts | Design/dashboard work | Generated spec | Design reference only; verify implementation in code |
| `FIGMA_TOKEN_IMPLEMENTATION_PLAN.md` | Repo-verified plan for font, color tokens, grid, and new shared components (Session 83.2) | Before Session 83.2 | Implementation plan | Do not implement until 83.2 starts |
| `BUSINESS_DASHBOARDS_SPEC.md` | 4 dashboard variants (Revenue, E-commerce, Lead Gen, SaaS), KPI rows, widget matrices | Design/dashboard work | Generated spec | Design-confirmed; implementation status unverified |
| `COMPETITOR_PARITY.md` | Gap analysis between codebase and Figma/competitor benchmarks | Design/dashboard work | Planning doc | Not proof features exist; verify code before claiming |
| `ONBOARDING_FLOW_SPEC.md` | 5-step Figma onboarding flow spec | Design/dashboard work | Generated spec | Design-confirmed; implementation status unverified |

## QA / Runbooks

| File | Purpose | When to Read | Status |
|---|---|---|---|
| `QA_RUNBOOK.md` | Standard QA commands, per-feature checklists, pre-commit steps | When QA-ing | Current |
| `MANUAL_QA_BACKLOG.md` | Per-session manual QA items, all currently pending | When QA-ing | Current |
| `COMMANDCODE_RUNBOOK.md` | Standard procedures — start, checks, session end, emergency | When QA-ing | Current |

## Architecture / Navigation

| File | Purpose | When to Read | Status |
|---|---|---|---|
| `ARCHITECTURE.md` | Codebase map — directories, route files, middleware, data stores, frontend pages | Sometimes (codebase navigation) | Reference |

## Historical Archives

| File | Purpose | When to Read | Status | Warning |
|---|---|---|---|---|
| `PROGRESS.md` | Session-by-session implementation history from Session 1 through current | Archive only | Historical | Do not treat as proof of current implementation. Unchecked items may be stale. |
| `DEEPSEEK.md` | Session history from DeepSeek's perspective with guardrails and TODOs | Archive only | Historical | Do not treat as proof of current implementation. TODOs may be resolved but not cleaned up. |
