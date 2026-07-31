// The scope checkboxes on Settings → Advanced → API tokens.
//
// ── Why this list lives in a FILE OF ITS OWN and not inline in Settings.jsx ───────────
// It has to be importable by a test, and node --test cannot import JSX. While it sat
// inline in Settings.jsx it was unguardable by anything except a comment saying "must stay
// in sync" — and that comment failed as enforcement: #523 split `read:analytics` into
// read:diagnostics + read:volume, its grep excluded *.jsx, and this array kept offering the
// REMOVED scope while offering neither replacement. Consequences, both live:
//   · checking read:analytics 400s on submit (the create path rejects it — app-only
//     validation, api/lib/api-key-scopes.js), and
//   · the two scopes every API-key-authed MCP tool requires were UNMINTABLE, because this
//     modal is the only place a customer can mint a key. Seven working tools, no way to
//     issue a credential for them.
// api/tests/api-token-scopes-sync.test.js now pins this array to the server vocabulary by
// import, so the next vocabulary change fails a test instead of shipping.
//
// ── Why it is a COPY of VALID_API_KEY_SCOPES rather than an import of it ──────────────
// It cannot import api/lib/api-key-scopes.js: Railway builds the Dashboard service with
// rootDirectory=/dashboard, so nothing under dashboard/src may reach outside dashboard/
// (#252 shipped exactly that import, passed CI — which builds from the repo root — and
// broke the prod deploy; api/tests/dashboard-build-root.test.js is the structural guard).
// The safe direction is the inverse, api/ → dashboard/, which is why the shared constants
// in dashboard/src/lib/gate-constants.js are arranged the same way. So the duplication is
// forced by the build topology; the anti-drift mechanism is the test, not the import.
//
// ── Descriptions are literal about what each scope does TODAY ────────────────────────
// No scope is described as if it unlocks something it does not, and none is described as
// implying another — they are siblings, not a hierarchy (a read:diagnostics key is 403 on
// a volume route and vice versa). See api/lib/api-key-scopes.js for the full rationale and
// docs/mcp_tool_policy.md §5 for the split's decision record.
export const API_TOKEN_SCOPES = [
  {
    value: 'write:events',
    description: 'Send server-side events to POST /api/server/event.'
  },
  {
    value: 'write:crawler_hits',
    description: 'Report AI/search crawler fetches to POST /api/server/crawler-hit. Does not grant event access.'
  },
  {
    value: 'read:diagnostics',
    description: 'Read pipeline and installation state — workspace context, site health, data quality, data flow, event verification. No traffic, revenue or campaign figures. Required by the MCP setup and debugging tools.'
  },
  {
    value: 'read:volume',
    description: 'Read counts of your own leads and campaigns. Counts only — no revenue, cost or attribution model. Not granted by read:diagnostics; a token needs this scope explicitly.'
  }
]
