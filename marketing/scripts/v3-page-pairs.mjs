#!/usr/bin/env node
// V3 PER-PAGE CONTRAST PAIRS — the scaffold that keeps the zero-match guard from going blind.
//
// THE PROBLEM THIS SOLVES. contrast-audit.mjs's zero-match guard fails loudly when an
// asserted selector matches nothing in the built page. That is what would have caught
// `.hero-text > mark` orphaning itself in 2a — but it only covers pairs that are DECLARED.
// A v3 page whose pairs were never added is not "passing"; it is unmeasured, and the audit
// reports a clean run either way. Across 12 pages that gap compounds.
//
// So: every v3 page registers here IN THE SAME PR THAT BUILDS IT. A page present in the
// build but absent from this registry FAILS — silence is not consent.
//
// ── ⚠️ KNOWN BLIND SPOT: DECLARED ≠ COMPUTED. Read before trusting a green run. ────────
// This harness verifies two things per row: that the SELECTOR matches something in the built
// page, and that the DECLARED fg/bg pair scores above its level. It does NOT verify that the
// declared fg/bg are the colours that selector actually computes to. Nothing here reads the
// cascade.
//
// That gap was demonstrated, not theorised, by the v1.5 repaint (2026-08-08). design.md §3
// replaced the entire palette; every one of the 219 hexes in this registry still named a v1.4
// value; and the run stayed GREEN across all 9 routes — because #12100C on #D2EC2A and
// #1F2323 on #CCF03F both clear AA. The registry was certifying colours that were on no page.
// The literals were repointed in that same change, but the mechanism that hid it is still here.
//
// WHAT THAT MEANS IN PRACTICE: a green run proves the pairs we CLAIM are legible and the
// selectors exist. It does not prove the page renders those pairs. Whenever a token value
// moves, these literals must move with it IN THE SAME CHANGE — nothing here will tell you
// they did not. Closing this properly needs a real cascade resolution (or a browser), which
// is a larger change than the repaint it was found during.
//
// Usage:  node scripts/v3-page-pairs.mjs        (after an astro build)

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// ═══ A GREEN RUN DOES NOT MEAN EVERY COLOUR ON THE PAGE IS VERIFIED. ═════════
// Read the coverage table below BEFORE trusting this script's output. Six of the
// ten ways CSS reaches a built page are read here; three are not, and one more
// is only detectable because a guard was added for it. This is the first thing
// on the page on purpose — it is what a reader needs before the output, not
// after it.
//
// ═══ WHAT THIS READS, AND WHAT IT DOES NOT ═══════════════════════════════════
// Written after the dead-token bug went through THREE merged PRs (#660/#661/#662)
// because the harnesses could not see where the CSS actually lived. Two blind
// spots were found in two checks, so a third was assumed until disproven — and a
// third was found. Enumerated empirically from the built output, not from docs.
//
// EVERY WAY CSS REACHES A BUILT PAGE IN THIS ASTRO SETUP:
//
//   #  path                                    emitted as              read here?
//   1  import "x.css" in .astro frontmatter    <link> /_astro/*.css    YES
//   2  ...same, but INLINED                    <style> in <head>       YES (added
//        Astro `inlineStylesheets: 'auto'` inlines small sheets. v3-pages.css is
//        emitted this way and NEVER appears in dist/_astro — the plan badge,
//        featured border, billing toggle and compare split live only here. This
//        was blind spot #2.
//   3  scoped <style> in an .astro component   SPLIT: bundle AND       YES
//        Observed on /v3: 6 data-astro-cid     inline
//        rules in bundles, 2 inline.
//        ⚠️ READ THIS BEFORE "SIMPLIFYING" THE INLINE READING. Because scoped
//        styles land in BOTH places at once, reading only dist/_astro made them
//        PARTIALLY read — and a partial read looks exactly like a complete one,
//        which is the entire failure family on this project. SectionHead.astro,
//        StatRow.astro and Bento.astro all carry <style> blocks, so this was
//        LIVE, not theoretical. #663 closed it as a SIDE EFFECT of adding inline
//        reading for v3-pages.css, NOT by design — nobody was looking for it.
//        Dropping the inline read because "the bundles have the CSS" reopens it,
//        and the reopened version reports green.
//   4  <style is:global>                       same as #3              YES
//   5  @import chains (main.css pulls 10       folded into the         YES
//        files incl. generated-theme.css)      bundle at build
//   6  Tailwind utilities                      folded into a bundle    YES
//
//   ── NOT READ. #7 and #8 now have GUARDS; #9 and #10 do not. ──
//   7  inline style="..." ATTRIBUTE            on the element itself   NO
//        This was blind spot #3, and it was LIVE: 20 inline style attrs on the
//        v3 routes, 6 of them paint-bearing — the plan blurb, 3x on /v3 and 3x
//        on /v3/pricing, from two source lines. A colour in style="" is not
//        merely unmeasured, it is UNDETECTABLE: there is no selector to register
//        a pair against, so the zero-match guard has nothing to orphan and every
//        other check passes in silence.
//        FIXED: those six moved to .v3-plan-blurb and are registered as a pair.
//        GUARDED: the INLINE STYLE GUARD below FAILS on any paint property in a
//        style attribute on a v3 route. The convention alone ("keep colours in
//        classes") enforces nothing — a rule with no check behind it is the same
//        fictional-guard pattern this file exists to prevent.
//   8  CSS in public/ linked outside /_astro   verbatim copy           NO
//        The route loader matches href="/_astro/..." only, so a plain
//        <link href="/x.css"> would have been SKIPPED SILENTLY, not flagged —
//        a check passing because it cannot see. 0 such files exist today, which
//        is precisely why it was worth pinning.
//        GUARDED: the STYLESHEET LINK GUARD below FAILS on any linked stylesheet
//        this harness does not read.
//   9  runtime JS injection (insertRule,       at runtime only         NO
//        createElement('style'), cssText)
//        Latent: present on /v3 (the motion library injects
//        [data-motion-pop-id] rules) but those set position/width/height only —
//        0 colour-setting occurrences across every built JS bundle. A future
//        library that themes at runtime would be invisible here.
//  10  framework island styles bundled         at runtime only         NO
//        into JS                               Latent: 3 JS bundles on /v3, 0
//                                              colour occurrences.
//
// SUMMARY: 6 paths read directly. #7 and #8 are not read, but are now
// DETECTABLE — each has a guard below that fails rather than passing in silence.
// #9 and #10 cannot be closed without a real browser; they are written down
// rather than dismissed because each is one dependency away from becoming live.
// A future check that reports green still does not prove every colour is
// verified — it proves the six covered paths are.
// ═════════════════════════════════════════════════════════════════════════════

// ── the registry ─────────────────────────────────────────────────────────────
// route -> pairs. Add a page's entry in the PR that creates the page.
// `sel` must be a REAL CSS selector whose class/id tokens exist in that page's built HTML —
// not a descriptive label. Nine descriptive labels in contrast-audit.mjs had to be rewritten
// precisely because a label cannot be verified against a DOM.
export const V3_PAGE_PAIRS = {
  // ── /v3 homepage. Registered in the SAME PR that builds the page. ──────────
  // ⚠️ THE DARK BAND (section 4) IS WHY THIS MATTERS. Flipping a section's surface
  // invalidates every carried-forward number on it, even when the text's own CSS
  // is untouched: TrustBar's badge went 10.54 -> 1.22 on exactly this kind of flip
  // in 2b because the surface beneath it changed. Every pair on a dark surface
  // below is computed against that surface, not inherited from a light one.
  '/': [
    // ⚠️ THE THREE `.v3-section--dark` PAIRS ARE GONE, NOT MOVED. Section 4 was the
    // homepage's only dark band; the v4 design renders Coverage as a card on paper, so
    // that surface no longer exists on `/` and any ratio measured against it is VOID.
    // The zero-match guard caught this the moment the section flipped — which is the
    // whole point of it, and the same class as the TrustBar 10.54 -> 1.22 failure below:
    // a carried-forward ratio survives a surface flip without the text's own CSS
    // changing. Deleted rather than repointed at a surface that is not there.
    //
    // Hero orbit — a dark panel (--v3-black-900) with a lighter card on it
    // (--v3-black-700). Scored separately because they are two surfaces, and a pair
    // carried across a surface flip is the TrustBar 10.54 -> 1.22 failure below.
    { id: 'orbit status label', sel: '.v3-orbit-status', fg: '#F2F4F3', bg: '#141818', level: 'AA' },
    { id: 'orbit lead name', sel: '.v3-orbit-lead-body strong', fg: '#F2F4F3', bg: '#303636', level: 'AA' },
    { id: 'orbit lead meta', sel: '.v3-orbit-lead-meta', fg: '#A8AFAF', bg: '#303636', level: 'AA' },
    // Ink on lime — §3.6: lime is a SURFACE you put dark text on, never a text colour.
    { id: 'orbit qualified flag', sel: '.v3-orbit-flag', fg: '#1F2323', bg: '#CCF03F', level: 'AA' },
    { id: 'orbit sent badge', sel: '.v3-orbit-sent', fg: '#1F2323', bg: '#CCF03F', level: 'AA' },

    // Coverage's own pairs, scored on --v3-paper-card (#FFFFFF):
    { id: 'coverage tab (resting)', sel: '.v3-cov-tab', fg: '#586161', bg: '#FFFFFF', level: 'AA' },
    { id: 'coverage tab (selected)', sel: '.v3-cov-tab', fg: '#FFFFFF', bg: '#1F2323', level: 'AA' },
    // The muted half of each panel heading. gray-600, NOT gray-500 — at 19px/800
    // gray-500 clears AA-large by 0.07 (3.07 vs 3.00), too thin a margin to certify.
    { id: 'coverage panel heading (muted)', sel: '.v3-cov-panel h3', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'coverage panel heading (ink)', sel: '.v3-cov-panel h3 strong', fg: '#1F2323', bg: '#FFFFFF', level: 'AA' },
    { id: 'coverage panel sub', sel: '.v3-cov-panel p', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'coverage mark name', sel: '.bm-name', fg: '#1F2323', bg: '#FFFFFF', level: 'AA' },
    // "+N more" is 12.5px at weight 800 — BELOW the 18.66px-bold threshold for
    // AA-large, so it needs the full 4.5:1. It shipped at gray-500 (3.07:1) in the
    // first draft of this section; registering it here is what surfaced that.
    { id: 'coverage +N more', sel: '.v3-cov-cell--more', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'coverage mark monogram', sel: '.bm-mono', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    // bento cells — a second, lighter dark surface (--v3-black-700), scored separately
    { id: 'bento dark h3', sel: '.v3-bento-cell-dark', fg: '#F2F4F3', bg: '#303636', level: 'AA' },
    { id: 'bento dark body', sel: '.v3-bento-cell-dark', fg: '#A8AFAF', bg: '#303636', level: 'AA' },
    // accent cell — ink on a lime tint. §3.6: lime is a SURFACE you put dark text on.
    { id: 'bento accent h3', sel: '.v3-bento-cell-accent', fg: '#1F2323', bg: '#E8FF9A', level: 'AA' },
    // ⚠️ SECTION 18 PAIRS RE-SCORED, NOT CARRIED FORWARD. The full-bleed lime band
    // was replaced with a paper close (§2.6's "never a full-bleed wash behind primary
    // content"), so every ratio measured against the lime surface is VOID — a
    // carried-forward ratio across a surface flip is the TrustBar 10.54 -> 1.22 failure
    // exactly, and it happens without the text's own CSS changing.
    //
    // ⚠️ WHY OPTION 2 IS RIGHT — AND WHY THE ORIGINAL ARGUMENT FOR IT WAS NOT.
    // Recorded so the next reader inherits the correct reasoning, not the bad one.
    //
    // The ruling was made on measured coverage of 30.9% desktop / 32.1% mobile
    // against §2.6's ~15% ceiling. Those figures were invalid. --v3-accent was
    // unresolved at the time (see v3-tokens.css), so `.v3-cta-band`'s background
    // computed to `transparent` and real lime coverage was ZERO. Worse, the
    // replacement was equally unpainted: `.v3-btn-accent` sets background and
    // color from --v3-accent / --v3-ink, both dead. Both states rendered zero
    // lime, so option 2 was a visual no-op when it was ruled — it did not remove
    // a lime close, it chose where lime would land once the tokens were fixed.
    //
    // OPTION 2 STANDS ANYWAY, on §2.6's SECOND clause, which is independent of
    // coverage: a full-bleed lime wash behind an <h2> and a <p> is the named
    // never-case regardless of how many pixels it occupies. That was true before
    // the tokens broke and is true now that lime paints. A button is on §2.6's
    // own acceptable-uses list. Destination right, original reasoning wrong.
    //
    // Do not "restore" the band by citing the 30.9%/32.1% figures as evidence it
    // was once justified. They measured a transparent box.
    // The lede also stopped using opacity .82 and takes --v3-gray-600 instead: a token
    // has a fixed value, an opacity has to be composited before it can be scored.
    { id: 'CTA close heading on paper', sel: '.v3-cta-close h2', fg: 'var(--v3-ink)', bg: 'var(--v3-paper)', level: 'AA-large' },
    { id: 'CTA close lede on paper', sel: '.v3-cta-close p', fg: '#647070', bg: '#FAFAF7', level: 'AA' },
    // The button is now the ENTIRE accent presence in section 18 — and lime as a button
    // is on §2.6's own acceptable-uses list, not a workaround around it.
    { id: 'CTA button ink on lime', sel: '.v3-btn-accent', fg: '#1F2323', bg: '#CCF03F', level: 'AA' },
    // light surfaces
    { id: 'frame chrome url', sel: '.v3-frame-url', fg: '#9DA7A7', bg: '#1F2323', level: 'AA' },
    { id: 'card body on paper-card', sel: '.v3-card p', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'eyebrow on paper', sel: '.v3-eyebrow', fg: '#586161', bg: '#FAFAF7', level: 'AA' },
    // Was an inline style attribute — undetectable by every check here until it
    // became a class. See the INLINE STYLE GUARD below.
    { id: 'plan blurb on card', sel: '.v3-plan-blurb', fg: '#647070', bg: '#FFFFFF', level: 'AA' }
  ],
  // ── /pricing ───────────────────────────────────────────────────────────
  '/pricing': [
    { id: 'plan name on card', sel: '.v3-plan h3', fg: '#1F2323', bg: '#FFFFFF', level: 'AA' },
    { id: 'plan feature li', sel: '.v3-plan li', fg: '#586161', bg: '#FFFFFF', level: 'AA' },
    { id: 'plan-alt small', sel: '.v3-plan-alt', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    // Was an inline style attribute (see the INLINE STYLE GUARD below): a colour
    // in style="" has no selector, so no pair could be registered against it and
    // the zero-match guard had nothing to orphan. Now a class, now scored.
    { id: 'plan blurb on card', sel: '.v3-plan-blurb', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    // The featured plan uses a 2px accent BORDER and a small badge, never a lime
    // fill: §2.6's acceptable uses are a badge, a button, a highlighted line. A
    // filled card would be lime behind primary content, the clause with no budget.
    { id: 'plan badge ink on lime', sel: '.v3-plan-badge', fg: '#1F2323', bg: '#CCF03F', level: 'AA' },
    { id: 'toggle active', sel: '.v3-billing-toggle span[data-active]', fg: '#1F2323', bg: '#FFFFFF', level: 'AA' },
    { id: 'toggle inactive', sel: '.v3-billing-toggle span', fg: '#586161', bg: '#EEF3F3', level: 'AA' },
    { id: 'table cell', sel: '.v3-table-card td', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'CTA close heading', sel: '.v3-cta-close h2', fg: '#1F2323', bg: '#FAFAF7', level: 'AA-large' },
    { id: 'CTA button ink on lime', sel: '.v3-btn-accent', fg: '#1F2323', bg: '#CCF03F', level: 'AA' }
  ],
  // ── /compare/ga4 ───────────────────────────────────────────────────────
  '/compare/ga4': [
    { id: 'compare panel label', sel: '.v3-compare-panel h3', fg: '#586161', bg: '#FFFFFF', level: 'AA' },
    { id: 'compare value', sel: '.v3-compare-value', fg: '#1F2323', bg: '#FFFFFF', level: 'AA-large' },
    { id: 'compare panel body', sel: '.v3-compare-panel p', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    // Dark band pairs are scored against THIS page's dark surface, not carried
    // over from the homepage — same tokens, but a carried-forward ratio across a
    // surface is the habit that produced TrustBar 10.54 -> 1.22.
    { id: 'dark band title', sel: '.v3-section--dark .v3-section-title', fg: '#F2F4F3', bg: '#141818', level: 'AA-large' },
    { id: 'dark band lede', sel: '.v3-section--dark .v3-section-lede', fg: '#A8AFAF', bg: '#141818', level: 'AA' },
    { id: 'stat label', sel: '.v3-stat-label', fg: '#586161', bg: '#FAFAF7', level: 'AA' },
    { id: 'CTA close heading', sel: '.v3-cta-close h2', fg: '#1F2323', bg: '#FAFAF7', level: 'AA-large' },
    { id: 'CTA button ink on lime', sel: '.v3-btn-accent', fg: '#1F2323', bg: '#CCF03F', level: 'AA' }
  ],
  // ── /product ───────────────────────────────────────────────────────────
  '/product': [
    // Steps sit DIRECTLY on the soft band with no card between them, so the
    // surface is --v3-gray-50 (#F7FAFA) and not the paper-card every other card
    // pair on this page is scored against.
    { id: 'step number', sel: '.v3-step-num', fg: '#586161', bg: '#F7FAFA', level: 'AA' },
    { id: 'step title', sel: '.v3-step h3', fg: '#1F2323', bg: '#F7FAFA', level: 'AA' },
    { id: 'step body', sel: '.v3-step p', fg: '#647070', bg: '#F7FAFA', level: 'AA' },
    // Journey rows sit inside .v3-frame-body, so the surface is paper-card, NOT
    // the page paper. Scored against the surface they are actually on.
    { id: 'journey timestamp', sel: '.v3-journey-when', fg: '#586161', bg: '#FFFFFF', level: 'AA' },
    { id: 'journey body', sel: '.v3-journey-what', fg: '#1F2323', bg: '#FFFFFF', level: 'AA' },
    { id: 'journey sub', sel: '.v3-journey-what em', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'journey value', sel: '.v3-journey-val', fg: '#586161', bg: '#FFFFFF', level: 'AA' },
    // The converting row is the page's single accent data point (§2.6, fourth
    // acceptable use). Ink on lime, same pair as the button — scored anyway.
    { id: 'journey won chip', sel: '.v3-journey-row--won .v3-journey-val', fg: '#1F2323', bg: '#CCF03F', level: 'AA' },
    { id: 'card body on paper-card', sel: '.v3-card p', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'stat label', sel: '.v3-stat-label', fg: '#586161', bg: '#FAFAF7', level: 'AA' },
    { id: 'frame chrome url', sel: '.v3-frame-url', fg: '#9DA7A7', bg: '#1F2323', level: 'AA' },
    { id: 'CTA close heading', sel: '.v3-cta-close h2', fg: '#1F2323', bg: '#FAFAF7', level: 'AA-large' },
    { id: 'CTA button ink on lime', sel: '.v3-btn-accent', fg: '#1F2323', bg: '#CCF03F', level: 'AA' }
  ],
  // ── /attribution ───────────────────────────────────────────────────────
  '/attribution': [
    { id: 'family kicker', sel: '.v3-group > h3', fg: '#586161', bg: '#FFFFFF', level: 'AA' },
    { id: 'family lede', sel: '.v3-group > p', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'model name', sel: '.v3-group li b', fg: '#1F2323', bg: '#FFFFFF', level: 'AA' },
    { id: 'model weighting', sel: '.v3-group li span', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'divided band h3', sel: '.v3-divided h3', fg: '#1F2323', bg: '#FFFFFF', level: 'AA' },
    { id: 'divided band body', sel: '.v3-divided p', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    // ⚠️ THIS PAGE PUTS .v3-cards ON THE DARK BAND — a combination the homepage
    // never shipped. The cards keep their paper-card fill, so the card INTERIOR
    // pairs are light-on-light and unchanged. Registered explicitly rather than
    // assumed: assuming a carried-forward ratio survives a surface flip is the
    // TrustBar 10.54 -> 1.22 failure, and "the card didn't change" is exactly the
    // reasoning that produced it.
    { id: 'dark band title', sel: '.v3-section--dark .v3-section-title', fg: '#F2F4F3', bg: '#141818', level: 'AA-large' },
    { id: 'dark band lede', sel: '.v3-section--dark .v3-section-lede', fg: '#A8AFAF', bg: '#141818', level: 'AA' },
    { id: 'dark band eyebrow', sel: '.v3-section--dark .v3-eyebrow', fg: '#A8AFAF', bg: '#141818', level: 'AA' },
    { id: 'card h3 on dark band', sel: '.v3-section--dark .v3-card h3', fg: '#1F2323', bg: '#FFFFFF', level: 'AA' },
    { id: 'card body on dark band', sel: '.v3-section--dark .v3-card p', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'quiet link on paper', sel: '.v3-link-quiet', fg: '#1F2323', bg: '#FAFAF7', level: 'AA' },
    { id: 'CTA close heading', sel: '.v3-cta-close h2', fg: '#1F2323', bg: '#FAFAF7', level: 'AA-large' },
    { id: 'CTA button ink on lime', sel: '.v3-btn-accent', fg: '#1F2323', bg: '#CCF03F', level: 'AA' }
  ],
  // ── /v3/ai-referral-tracking ──────────────────────────────────────────────
  '/ai-referral-tracking': [
    { id: 'stat number', sel: '.v3-stat-num', fg: '#1F2323', bg: '#FAFAF7', level: 'AA-large' },
    { id: 'stat label', sel: '.v3-stat-label', fg: '#586161', bg: '#FAFAF7', level: 'AA' },
    { id: 'card body on paper-card', sel: '.v3-card p', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'journey timestamp', sel: '.v3-journey-when', fg: '#586161', bg: '#FFFFFF', level: 'AA' },
    { id: 'journey body', sel: '.v3-journey-what', fg: '#1F2323', bg: '#FFFFFF', level: 'AA' },
    { id: 'journey sub', sel: '.v3-journey-what em', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'journey won chip', sel: '.v3-journey-row--won .v3-journey-val', fg: '#1F2323', bg: '#CCF03F', level: 'AA' },
    { id: 'bento dark h3', sel: '.v3-bento-cell-dark', fg: '#F2F4F3', bg: '#303636', level: 'AA' },
    { id: 'bento dark body', sel: '.v3-bento-cell-dark', fg: '#A8AFAF', bg: '#303636', level: 'AA' },
    { id: 'frame chrome url', sel: '.v3-frame-url', fg: '#9DA7A7', bg: '#1F2323', level: 'AA' },
    { id: 'CTA close heading', sel: '.v3-cta-close h2', fg: '#1F2323', bg: '#FAFAF7', level: 'AA-large' },
    { id: 'CTA button ink on lime', sel: '.v3-btn-accent', fg: '#1F2323', bg: '#CCF03F', level: 'AA' }
  ],
  // ── /v3/use-cases-saas ────────────────────────────────────────────────────
  '/use-cases-saas': [
    { id: 'stat number', sel: '.v3-stat-num', fg: '#1F2323', bg: '#FAFAF7', level: 'AA-large' },
    { id: 'stat label', sel: '.v3-stat-label', fg: '#586161', bg: '#FAFAF7', level: 'AA' },
    { id: 'card body on paper-card', sel: '.v3-card p', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'journey timestamp', sel: '.v3-journey-when', fg: '#586161', bg: '#FFFFFF', level: 'AA' },
    { id: 'journey body', sel: '.v3-journey-what', fg: '#1F2323', bg: '#FFFFFF', level: 'AA' },
    { id: 'journey sub', sel: '.v3-journey-what em', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'journey won chip', sel: '.v3-journey-row--won .v3-journey-val', fg: '#1F2323', bg: '#CCF03F', level: 'AA' },
    { id: 'divided band h3', sel: '.v3-divided h3', fg: '#1F2323', bg: '#FFFFFF', level: 'AA' },
    { id: 'divided band body', sel: '.v3-divided p', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'frame chrome url', sel: '.v3-frame-url', fg: '#9DA7A7', bg: '#1F2323', level: 'AA' },
    { id: 'CTA close heading', sel: '.v3-cta-close h2', fg: '#1F2323', bg: '#FAFAF7', level: 'AA-large' },
    { id: 'CTA button ink on lime', sel: '.v3-btn-accent', fg: '#1F2323', bg: '#CCF03F', level: 'AA' }
  ],
  // ── /v3/use-cases-ecommerce ───────────────────────────────────────────────
  '/use-cases-ecommerce': [
    { id: 'stat number', sel: '.v3-stat-num', fg: '#1F2323', bg: '#FAFAF7', level: 'AA-large' },
    { id: 'stat label', sel: '.v3-stat-label', fg: '#586161', bg: '#FAFAF7', level: 'AA' },
    { id: 'table cell', sel: '.v3-table-card td', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'table row header', sel: '.v3-table-card th', fg: '#1F2323', bg: '#FFFFFF', level: 'AA' },
    { id: 'card body on paper-card', sel: '.v3-card p', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'compare panel label', sel: '.v3-compare-panel h3', fg: '#586161', bg: '#FFFFFF', level: 'AA' },
    { id: 'compare value', sel: '.v3-compare-value', fg: '#1F2323', bg: '#FFFFFF', level: 'AA-large' },
    { id: 'compare panel body', sel: '.v3-compare-panel p', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'CTA close heading', sel: '.v3-cta-close h2', fg: '#1F2323', bg: '#FAFAF7', level: 'AA-large' },
    { id: 'CTA button ink on lime', sel: '.v3-btn-accent', fg: '#1F2323', bg: '#CCF03F', level: 'AA' }
  ],
  // ── /v3/report-builder ────────────────────────────────────────────────────
  '/report-builder': [
    // The grouped list is the same frame attribution §2 uses, on the same soft
    // band, so the surfaces match — scored here anyway rather than carried over.
    { id: 'group kicker', sel: '.v3-group > h3', fg: '#586161', bg: '#FFFFFF', level: 'AA' },
    { id: 'group lede', sel: '.v3-group > p', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'template name', sel: '.v3-group li b', fg: '#1F2323', bg: '#FFFFFF', level: 'AA' },
    { id: 'template note', sel: '.v3-group li span', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'journey timestamp', sel: '.v3-journey-when', fg: '#586161', bg: '#FFFFFF', level: 'AA' },
    { id: 'journey body', sel: '.v3-journey-what', fg: '#1F2323', bg: '#FFFFFF', level: 'AA' },
    { id: 'journey sub', sel: '.v3-journey-what em', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'journey won chip', sel: '.v3-journey-row--won .v3-journey-val', fg: '#1F2323', bg: '#CCF03F', level: 'AA' },
    // Dark band — cards keep their paper-card fill, band text is its own pair.
    { id: 'dark band title', sel: '.v3-section--dark .v3-section-title', fg: '#F2F4F3', bg: '#141818', level: 'AA-large' },
    { id: 'dark band lede', sel: '.v3-section--dark .v3-section-lede', fg: '#A8AFAF', bg: '#141818', level: 'AA' },
    { id: 'card h3 on dark band', sel: '.v3-section--dark .v3-card h3', fg: '#1F2323', bg: '#FFFFFF', level: 'AA' },
    { id: 'card body on dark band', sel: '.v3-section--dark .v3-card p', fg: '#647070', bg: '#FFFFFF', level: 'AA' },
    { id: 'quiet link on paper', sel: '.v3-link-quiet', fg: '#1F2323', bg: '#FAFAF7', level: 'AA' },
    { id: 'CTA close heading', sel: '.v3-cta-close h2', fg: '#1F2323', bg: '#FAFAF7', level: 'AA-large' },
    { id: 'CTA button ink on lime', sel: '.v3-btn-accent', fg: '#1F2323', bg: '#CCF03F', level: 'AA' }
  ],
}

// Pages that exist in the build and must therefore be registered above.
// Populated as v3 pages land; a page here with no pairs is an error, not a skip.
// PROMOTED ROUTES. These were '/v3/*' until the cutover; the pages now serve at the site
// root. The list is repointed rather than dropped: dist/v3/* still exists but holds only
// meta-refresh redirect stubs, and auditing a stub would return "no colours, no problems"
// — a clean report from a file with nothing in it. Keys in V3_PAGE_PAIRS above must match
// these exactly, or the coverage check below fails loudly (which is how this list was
// found: the pairs map was repointed first and every route reported NO PAIRS).
export const V3_ROUTES = [
  '/', '/pricing', '/compare/ga4',
  '/product', '/attribution', '/ai-referral-tracking',
  '/use-cases-saas', '/use-cases-ecommerce', '/report-builder'
]

const DIST = 'dist'
let fails = 0

// ── SCORING ──────────────────────────────────────────────────────────────────
// ⚠️ ADDED AFTER THE TOKEN DEFECT. Until now this script resolved SELECTORS and
// nothing else — every `fg`/`bg` in the registry above was declared and never
// computed. That is 29 asserted ratios (68 once Phase 4/5 land) that no check
// could contradict, and it is why --v3-accent could resolve to NOTHING across
// #660, #661 and #662 while this script printed "registry clean" every time.
//
// It is the same class as `.hero-text > mark` orphaning itself while every
// numeric check passed: a number that looks answered and is not. The fix is not
// a corrected constant, it is a control that fails loudly.
//
// Unresolvable colours FAIL rather than skip. Unmeasured has to be louder than
// passing or the gap silently reopens.
//
// ⚠️ KNOWN LIMIT OF THE PAIR SCORER — READ BEFORE TRUSTING A GREEN RUN.
// This scorer only computes what a pair DECLARES. A pair written with literal
// hexes — { fg: '#1F2323', bg: '#CCF03F' } — scores green whether or not the
// element's real CSS token is alive, because the scorer never looks at the rule
// that styles the element. It checks that the SELECTOR exists and that the
// DECLARED colours contrast; it does not check that the declared colours are
// what the element actually renders.
//
// That is exactly how --v3-accent stayed dead for three PRs: most pairs declare
// hexes, so they kept passing while the token feeding those elements resolved to
// nothing. Only the pair that happened to declare `var(--v3-ink)` /
// `var(--v3-paper)` ever failed.
//
// The TOKEN RESOLUTION block at the bottom is what closes this. It checks every
// --v3-* token independently of how any pair is written. NEITHER GUARD IS
// SUFFICIENT ALONE — a green pair run does not mean the page renders correctly,
// and a clean token run does not mean the contrast is adequate. Both must pass,
// and a future edit that removes either one reopens the hole.
//
// (Documented here rather than in a review comment on purpose: a limit that
// lives only in a chat message is the fictional-guard pattern in reverse — the
// next reader inherits the check without inheriting what it cannot do.)
const THRESHOLD = { AA: 4.5, 'AA-large': 3, AAA: 7 }

function hexToRgb (hex) {
  const h = String(hex).trim().replace(/^#/, '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  return /^[0-9a-fA-F]{6}$/.test(full) ? [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) : null
}

function luminance ([r, g, b]) {
  const f = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function ratio (fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

function readVars (css) {
  const vars = {}
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)[;}]/gi)) {
    if (!(m[1].trim() in vars)) vars[m[1].trim()] = m[2].trim()
  }
  return vars
}

// Returns null when a var() names a property that does not exist and has no
// fallback — which is exactly what the browser does with it (guaranteed-invalid
// -> the declaration is invalid at computed-value time). Silently treating that
// as "some colour" is the bug this whole block exists to prevent.
function resolveVar (value, vars, depth = 0) {
  if (depth > 10 || typeof value !== 'string') return value
  const m = value.match(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)/i)
  if (!m) return value
  const next = vars[m[1]] ?? m[2]
  if (next === undefined) return null
  return resolveVar(value.replace(m[0], next.trim()), vars, depth + 1)
}

const toRgb = (v, vars) => {
  const r = resolveVar(String(v).trim(), vars)
  return r === null ? null : hexToRgb(r.trim())
}

const cssFiles = () => {
  try {
    return readdirSync(join(DIST, '_astro')).filter(f => f.endsWith('.css'))
      .map(f => join(DIST, '_astro', f))
  } catch { return [] }
}

// ⚠️ INLINE <style> BLOCKS COUNT. Astro's `inlineStylesheets: 'auto'` emits small
// stylesheets INTO THE HTML rather than as a bundle — v3-pages.css never appears
// in dist/_astro at all, so its billing toggle, compare split, plan badge and
// featured-plan border live only in inline <style>. Reading just dist/_astro/*.css
// makes every one of those rules, and any custom property declared alongside
// them, invisible to this script.
//
// That is the same blindness this whole file exists to close, one level down: a
// harness that reports green because it never opened the place the CSS actually
// is. Found while confirming .v3-plan-badge and .v3-plan--featured — both of
// which are inline-only and were dead on main.
const inlineStyles = () => {
  const out = []
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name))
      else if (e.name.endsWith('.html')) {
        const html = readFileSync(join(dir, e.name), 'utf8')
        for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) out.push(m[1])
      }
    }
  }
  try { walk(DIST) } catch { /* no dist yet — caller already handles that */ }
  return out
}

const ALL_CSS = [
  ...cssFiles().map(f => readFileSync(f, 'utf8')),
  ...inlineStyles()
].join('\n')
const VARS = readVars(ALL_CSS)

// ── run only when invoked directly ───────────────────────────────────────────
// ⚠️ contrast-audit.mjs IMPORTS this file to verify no built v3 page is left
// unaudited. Without this guard that import executes the whole runner and hits
// process.exit, so the importing script dies mid-audit — a scope guard that
// kills its own caller is worse than no scope guard.
const IS_MAIN = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (IS_MAIN) {

console.log('V3 per-page contrast-pair registry\n')

if (!existsSync(DIST)) {
  console.error('no dist/ — run `npx astro build` first')
  process.exit(2)
}

// ── coverage check: every registered route must exist, every built v3 route registered ──
for (const route of V3_ROUTES) {
  const p = route === '/' ? join(DIST, 'index.html') : join(DIST, route.replace(/^\//, ''), 'index.html')
  if (!existsSync(p)) {
    console.error(`  ✗ ${route}: registered but NOT BUILT (${p})`)
    fails++
    continue
  }
  const pairs = V3_PAGE_PAIRS[route]
  if (!pairs || !pairs.length) {
    console.error(`  ✗ ${route}: built but has NO PAIRS — unmeasured, not passing`)
    fails++
    continue
  }
  // Necessary condition: every class/id token a selector requires must exist in that page.
  // Tailwind arbitrary values arrive escaped in a selector and unescaped in the attribute,
  // so tokens are unescaped before comparison — getting that backwards makes every
  // arbitrary-value pair look orphaned.
  const html = readFileSync(p, 'utf8')
  const domTokens = new Set()
  for (const m of html.matchAll(/\b(?:class|id)="([^"]*)"/g)) {
    for (const t of m[1].split(/\s+/)) if (t) domTokens.add(t)
  }
  const selTokens = sel => (sel.match(/[.#]((?:\\.|[A-Za-z0-9_-])+)/g) || [])
    .map(t => t.slice(1).replace(/\\(.)/g, '$1'))
  let orphans = 0
  let bad = 0
  for (const pair of pairs) {
    const missing = selTokens(pair.sel).filter(t => !domTokens.has(t))
    if (missing.length) {
      console.error(`  ✗ ${route}  ${pair.id}: sel='${pair.sel}' misses ${missing.join(', ')}`)
      orphans++
    }
    // Actually COMPUTE the declared colours. Unresolvable is a failure, not a skip.
    const fg = toRgb(pair.fg, VARS)
    const bg = toRgb(pair.bg, VARS)
    if (!fg || !bg) {
      console.error(`  ✗ ${route}  ${pair.id}: UNRESOLVED colour (fg='${pair.fg}' bg='${pair.bg}') — unmeasured, not passing`)
      bad++
      continue
    }
    const r = ratio(fg, bg)
    const need = THRESHOLD[pair.level] ?? 4.5
    if (r < need) {
      console.error(`  ✗ ${route}  ${pair.id}: ${r.toFixed(2)} < ${need} (${pair.level})`)
      bad++
    }
  }
  if (orphans || bad) fails += orphans + bad
  else console.log(`  ✓ ${route}: ${pairs.length} pair(s), selectors resolve + ratios pass`)
}

if (!V3_ROUTES.length) {
  console.log('  (no v3 routes registered yet — Phase 1 ships the scaffold, pages register as they land)')
}

// ── positive control: the coverage check must be able to fail ────────────────
{
  const fakeTokens = new Set(['real-class'])
  const selTokens = sel => (sel.match(/[.#]((?:\\.|[A-Za-z0-9_-])+)/g) || []).map(t => t.slice(1))
  const missing = selTokens('.definitely-not-present').filter(t => !fakeTokens.has(t))
  console.log(`\n  positive control: fake selector detected as orphan -> ${missing.length ? 'YES ✓' : 'NO ✗ (guard broken)'}`)
  if (!missing.length) fails++
  const ok = selTokens('.real-class').filter(t => !fakeTokens.has(t))
  console.log(`  negative control: known-present selector not flagged -> ${ok.length === 0 ? 'YES ✓' : 'NO ✗ (over-fires)'}`)
  if (ok.length) fails++
}

// ── controls on the SCORER ───────────────────────────────────────────────────
// The coverage controls above say nothing about whether a RATIO can fail. These
// do. Without them the scorer could return a constant and the run would look
// identical to a real pass.
{
  const lime = ratio(hexToRgb('#CCF03F'), hexToRgb('#ffffff'))
  const bw = ratio(hexToRgb('#000000'), hexToRgb('#ffffff'))
  console.log(`\n  scorer positive control: lime on white = ${lime.toFixed(2)} vs 4.5 -> ${lime < 4.5 ? 'FAILS correctly ✓' : 'PASSES ✗ (scorer broken)'}`)
  if (lime >= 4.5) fails++
  console.log(`  scorer negative control: black on white = ${bw.toFixed(2)} -> ${Math.abs(bw - 21) < 0.01 ? 'correct ✓' : 'wrong ✗'}`)
  if (Math.abs(bw - 21) >= 0.01) fails++
}

// ── INLINE STYLE GUARD — closes blind spot #7 ────────────────────────────────
// ⚠️ THIS EXISTS BECAUSE A CONVENTION IN A COMMENT ENFORCES NOTHING. "Keep
// colours out of style attributes" written as prose is the fictional-guard
// pattern — a rule with nothing behind it — which is the same failure family as
// everything else this file guards. So it is a check, not a note.
//
// A colour in a style="" attribute is not merely unmeasured, it is UNDETECTABLE:
// there is no selector to register a pair against, so the zero-match guard has
// nothing to orphan and every other check here passes in silence. Six such
// declarations shipped on /v3 and /v3/pricing (the plan blurb, 3x per page) and
// nothing could have reported them.
//
// Layout-only inline styles are fine and common (grid-column, opacity, transform,
// font-size) — only PAINT properties are barred, because only those need a
// contrast pair.
{
  console.log('\nINLINE STYLE GUARD — no paint properties in style="" on a v3 route')
  const PAINT = /(^|[;\s])(color|background|background-color|border-color|fill|stroke|outline-color)\s*:/i
  const scan = html => [...html.matchAll(/style="([^"]*)"/g)].map(m => m[1]).filter(v => PAINT.test(v))

  let offenders = 0, total = 0
  for (const route of V3_ROUTES) {
    const p = join(DIST, route.replace(/^\//, ''), 'index.html')
    if (!existsSync(p)) continue
    const html = readFileSync(p, 'utf8')
    total += [...html.matchAll(/style="([^"]*)"/g)].length
    for (const v of scan(html)) {
      console.error(`  ✗ ${route}: paint in a style attribute -> style="${v}"  (move it to a class; no pair can be registered against this)`)
      offenders++
    }
  }
  fails += offenders
  console.log(`  ${total} inline style attribute(s) across ${V3_ROUTES.length} route(s), ${offenders} paint-bearing`)
  if (!offenders) console.log('  clean ✓ — every inline style is layout-only')

  // Positive control: the exact declaration that shipped must be detected.
  const shipped = 'margin:14px 0 0;color:var(--v3-gray-600);font-size:15px'
  console.log(`  positive control (the shipped plan-blurb style) -> ${PAINT.test(shipped) ? 'DETECTED ✓' : 'MISSED ✗'}`)
  if (!PAINT.test(shipped)) fails++
  // Negative control: a layout-only inline style must NOT fire.
  const layout = 'grid-column: span 7'
  console.log(`  negative control (grid-column: span 7) -> ${PAINT.test(layout) ? 'over-fires ✗' : 'not flagged ✓'}`)
  if (PAINT.test(layout)) fails++
  // Negative control: a property merely CONTAINING a paint word must not fire.
  const nearMiss = 'background-position: center'
  console.log(`  negative control (background-position: center) -> ${PAINT.test(nearMiss) ? 'over-fires ✗' : 'not flagged ✓'}`)
  if (PAINT.test(nearMiss)) fails++
}

// ── STYLESHEET LINK GUARD — closes blind spot #8 ─────────────────────────────
// ⚠️ The route loader in contrast-audit.mjs matches href="/_astro/...". A plain
// <link rel="stylesheet" href="/x.css"> — anything copied verbatim out of
// public/ — would therefore be SKIPPED SILENTLY rather than flagged. Zero such
// files exist today, which is exactly why this is worth pinning: the check
// currently passes because there is nothing to miss, not because it would notice.
// An unrecognised stylesheet must FAIL, not be ignored.
{
  console.log('\nSTYLESHEET LINK GUARD — every linked stylesheet must be one this harness reads')
  const recognised = /^\/_astro\/.+\.css$/
  let unknown = 0, seen = 0
  for (const route of V3_ROUTES) {
    const p = join(DIST, route.replace(/^\//, ''), 'index.html')
    if (!existsSync(p)) continue
    const html = readFileSync(p, 'utf8')
    for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)) {
      const href = (m[0].match(/href="([^"]+)"/) || [])[1]
      if (!href) continue
      seen++
      if (!recognised.test(href)) {
        console.error(`  ✗ ${route}: stylesheet NOT read by this harness -> ${href}`)
        unknown++
      }
    }
  }
  fails += unknown
  console.log(`  ${seen} linked stylesheet(s), ${unknown} unrecognised`)
  if (!unknown) console.log('  clean ✓ — every linked stylesheet is under /_astro and is read')

  // Positive control: a public/ stylesheet link must be detected, not ignored.
  console.log(`  positive control (<link href="/x.css">) -> ${!recognised.test('/x.css') ? 'DETECTED ✓' : 'MISSED ✗'}`)
  if (recognised.test('/x.css')) fails++
  console.log(`  positive control (a CDN href) -> ${!recognised.test('https://cdn.example/x.css') ? 'DETECTED ✓' : 'MISSED ✗'}`)
  if (recognised.test('https://cdn.example/x.css')) fails++
  // Negative control: a real bundle must not be flagged.
  console.log(`  negative control (/_astro/v3-home.abc123.css) -> ${recognised.test('/_astro/v3-home.abc123.css') ? 'not flagged ✓' : 'over-fires ✗'}`)
  if (!recognised.test('/_astro/v3-home.abc123.css')) fails++
}

// ── TOKEN RESOLUTION — the check that would have caught the #660 defect ──────
// ⚠️ THIS IS THE REGRESSION GUARD FOR THE ACTUAL BUG. Seven of nine Tier-2
// aliases in v3-tokens.css named custom properties that do not exist
// (--color-bg, --color-surface, --color-accent, --color-accent-text,
// --color-spend, --color-spend-text, --color-danger). Every one silently became
// `unset`, so --v3-accent painted NOTHING — the full-bleed CTA band measured for
// the §2.6 ruling was transparent, not lime — and three PRs shipped green.
//
// Broader than the pair scorer above, which only sees tokens a pair happens to
// declare. USED-and-dead fails. UNUSED-and-dead is printed BY NAME, because
// silence is what let this run for three PRs.
//
// The positive control below reconstructs the exact #660 defect — an alias
// pointing at a non-existent --color-* name — and asserts it is detected. That
// is the "proves it can fail on exactly this" requirement.
{
  console.log('\nTOKEN RESOLUTION — every --v3-* colour token must resolve')
  const skip = /(radius|shadow|gutter|max|ease|font)/
  const names = Object.keys(VARS).filter(n => n.startsWith('--v3-') && !skip.test(n))
  const usedBy = n => (ALL_CSS.match(new RegExp(`var\\(\\s*${n}\\b`, 'g')) || []).length
  const dead = names.filter(n => toRgb(`var(${n})`, VARS) === null)
  const deadUsed = dead.filter(n => usedBy(n) > 0)
  const deadUnused = dead.filter(n => usedBy(n) === 0)

  console.log(`  ${names.length} colour token(s) checked`)
  for (const n of deadUsed) console.error(`  ✗ ${n}: ${VARS[n]} -> UNRESOLVABLE, used ${usedBy(n)}x (renders as unset)`)
  for (const n of deadUnused) console.log(`  ⚠ ${n}: ${VARS[n]} -> unresolved, 0 uses (declared-only; see v3-tokens.css)`)
  fails += deadUsed.length
  if (!deadUsed.length) console.log('  clean ✓ — every token that is USED resolves to a concrete colour')

  // Positive control: the #660 defect itself, reconstructed.
  const probe = { ...VARS, '--v3-probe-accent': 'var(--color-accent)' }   // the real dead alias
  const caught = toRgb('var(--v3-probe-accent)', probe) === null
  console.log(`  positive control (#660 defect: --v3-accent -> var(--color-accent)) -> ${caught ? 'DETECTED ✓' : 'MISSED ✗ (guard broken)'}`)
  if (!caught) fails++
  // Negative control: a real alias chain must still resolve.
  const live = toRgb('var(--v3-accent)', VARS)
  console.log(`  negative control (--v3-accent resolves today) -> ${live ? `#${live.map(v => v.toString(16).padStart(2, '0')).join('')} ✓` : 'UNRESOLVED ✗'}`)
  if (!live) fails++
}

console.log(fails ? `\n${fails} problem(s)` : '\nregistry clean')
process.exit(fails ? 1 : 0)

}