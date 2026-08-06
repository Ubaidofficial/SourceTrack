# V3 measurement gates

Any §2.6 or geometry figure quoted for a v3 page must come from a browser run that passed
the gates in `v3-sanity-gates.json`. **Analytic figures do not close a claim.**

## Why the gates exist

A whole measurement round was voided when `devicePixelRatio 0.8` made a nominal 390px
viewport render at ~625px CSS pixels. Every rect in that run was real; the viewport was not
what it was believed to be. The h1 looked like it overflowed by 235px, and the conclusion —
"the branch ships a mobile layout bug" — was wrong. It cost four rounds.

A gate is one element whose width is **derivable from CSS**, so a mismatch proves the
viewport is wrong before any figure is taken.

## ⚠️ The emulate argument is NOT hardcoded, deliberately

An earlier instruction fixed it at `1152x720x1` to yield a real 1440. That was
**environment-specific** — it compensated for one machine's `devicePixelRatio 0.8` — and
was later contradicted: on the live site, `1440x900x1` yields a real 1440.

**Both figures are right somewhere and wrong somewhere else.** So `emulateArg` starts
`null` and is filled by measuring what the tool actually produces:

1. Set a viewport, read `window.innerWidth`, record both.
2. If `innerWidth` != `expectedInnerWidth`, the argument is wrong for this environment —
   adjust and repeat. Do not proceed.
3. Read the gate selector's width and compare to `derivedExpectation`.
4. Only when both match, record `measuredValue`, `measuredAt`, `measuredRef` and set
   `status` to `MEASURED`.

Re-measure whenever the container CSS or `--v3-max` changes. `measuredRef` is what makes
staleness detectable: a gate recorded against a ref that is no longer HEAD is a gate that
describes markup which may no longer exist.

## Method rules, learned the hard way

- **`getClientRects()`, never `getBoundingClientRect()`** for anything that can wrap. On a
  multi-line inline the latter returns the union box, which made a two-fragment highlight
  read as one and produced a figure that was wrong by ~2x.
- **Report `window.innerWidth` and `innerHeight` beside every value.** A rect without its
  viewport is not interpretable.
- **Measure the element that carries the property.** A gradient's geometry derives from the
  box painting it, not from the screen. Measuring the viewport where the hero was painted
  reported 8.1% for a surface that is really ~26.9%.
