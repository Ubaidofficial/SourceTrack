// /docs/mcp — connecting an AI client to SourceTrack over the Model Context Protocol.
//
// The tool table is RENDERED FROM dashboard/src/lib/mcpTools.js, which is the same array
// mcp/server.js builds its TOOLS from. Nothing on this page re-describes a tool in its own
// words. That is deliberate and it is the lesson from the Shopify walkthrough: two
// hand-written descriptions of one thing drift, and the customer-facing copy is the one
// that goes stale silently. If a tool's description changes, this page changes with it or
// the server refuses to start.
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'
import { MCP_TOOL_CATALOG } from '../../lib/mcpTools'

const MCP_URL = 'https://api.srctk.com/api/mcp'

const CREDENTIAL_LABEL = {
  none: 'None',
  user_jwt: 'Signed-in session',
  api_key: 'API token'
}

export default function DocsMCP() {
  const keyed = MCP_TOOL_CATALOG.filter((t) => t.credential === 'api_key')
  const open = MCP_TOOL_CATALOG.filter((t) => t.credential !== 'api_key')

  return (
    <DocsLayout>
      <Helmet>
        <title>Connect an AI assistant over MCP | SourceTrack Docs</title>
        <meta name="description" content="Connect Claude or ChatGPT to SourceTrack over the Model Context Protocol. Setup diagnostics and lead volume, read-only, scoped by API token." />
        <link rel="canonical" href="https://www.sourcetrack.ai/docs/mcp" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-dark-primary tracking-tight">
            Connect an AI Assistant (MCP)
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Ask Claude or ChatGPT about your SourceTrack setup — is the tracker firing, is
            attribution coverage healthy, how many leads came from which campaign — without
            leaving the chat. Read-only, and scoped by a token you issue.
          </p>
        </div>

        {/* 1. Connection */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Connection URL
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Add this as a remote MCP server in your AI client. It is a single endpoint that
            accepts POST; there is nothing to install and nothing to run locally.
          </p>
          <DocsCodeBlock lang="text">{MCP_URL}</DocsCodeBlock>
        </section>

        {/* 2. Clients */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Which Clients Work
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="py-2 pr-4 font-extrabold text-gray-900 dark:text-dark-primary">Client</th>
                  <th className="py-2 pr-4 font-extrabold text-gray-900 dark:text-dark-primary">How it connects</th>
                  <th className="py-2 font-extrabold text-gray-900 dark:text-dark-primary">Status</th>
                </tr>
              </thead>
              <tbody className="text-gray-700 dark:text-gray-300">
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-4 font-semibold">Claude Desktop / Claude Code</td>
                  <td className="py-2 pr-4">Local process, or the URL above</td>
                  <td className="py-2">Works</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-4 font-semibold">ChatGPT (Developer Mode)</td>
                  <td className="py-2 pr-4">The URL above</td>
                  <td className="py-2">Works</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-semibold">Other MCP clients</td>
                  <td className="py-2 pr-4">The URL above</td>
                  <td className="py-2">Works if the client speaks Streamable HTTP</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            Both the current stateless revision of the protocol and the earlier
            handshake-based revisions are served on the same URL, so a client does not need
            to be on a particular version. Clients that only speak the deprecated
            2024-11-05 HTTP+SSE transport are not supported.
          </p>
        </section>

        {/* 3. Token */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Issue a Token
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Most tools need a SourceTrack API token. Generate one at{' '}
            <Link to="/app/settings?tab=advanced" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
              Settings &rarr; Advanced &rarr; API tokens
            </Link>
            , then paste it into your AI client&rsquo;s configuration for this server, or set
            it as <code>SOURCETRACK_API_KEY</code>.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Grant only the scope the tools you want actually need. The two read scopes are
            siblings, not a hierarchy &mdash; a <code>read:diagnostics</code> token is refused
            by the volume tools, and a <code>read:volume</code> token is refused by the
            diagnostic ones. A token can hold both if you want both.
          </p>
          <DocsCallout type="info">
            <strong>One token, one site.</strong> The site is resolved from the token
            itself. There is no site argument on any tool, so a token can never read a site
            it was not issued for &mdash; and an assistant cannot be talked into naming a
            different one.
          </DocsCallout>
        </section>

        {/* 4. Tools — rendered from the shared catalogue, never re-typed */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Available Tools
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            These descriptions are the exact text your AI client is given, not a summary of
            it &mdash; so what you read here is what the model reads.
          </p>

          <div className="space-y-3">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">Require an API token</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-4 font-extrabold text-gray-900 dark:text-dark-primary whitespace-nowrap">Tool</th>
                    <th className="py-2 pr-4 font-extrabold text-gray-900 dark:text-dark-primary whitespace-nowrap">Scope</th>
                    <th className="py-2 font-extrabold text-gray-900 dark:text-dark-primary">What it returns</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700 dark:text-gray-300 align-top">
                  {keyed.map((tool) => (
                    <tr key={tool.name} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-4"><code className="whitespace-nowrap">{tool.name}</code></td>
                      <td className="py-2 pr-4"><code className="whitespace-nowrap">{tool.scope}</code></td>
                      <td className="py-2 leading-relaxed">{tool.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">No token required</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-4 font-extrabold text-gray-900 dark:text-dark-primary whitespace-nowrap">Tool</th>
                    <th className="py-2 pr-4 font-extrabold text-gray-900 dark:text-dark-primary whitespace-nowrap">Credential</th>
                    <th className="py-2 font-extrabold text-gray-900 dark:text-dark-primary">What it returns</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700 dark:text-gray-300 align-top">
                  {open.map((tool) => (
                    <tr key={tool.name} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-4"><code className="whitespace-nowrap">{tool.name}</code></td>
                      <td className="py-2 pr-4 whitespace-nowrap">{CREDENTIAL_LABEL[tool.credential]}</td>
                      <td className="py-2 leading-relaxed">{tool.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 5. What it deliberately cannot do */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            What This Server Will Not Tell an AI
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Stated up front rather than left to be discovered as a gap. No tool returns
            revenue, order value, cost, ad spend, ROAS, CPL or CAC, and no tool accepts an
            attribution-model argument. Lead and campaign figures are counts, always
            first-touch, and every response says so inline.
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            This is a product decision, not a gap to be filled later: an assistant that
            holds your revenue numbers is one convincing prompt away from repeating them
            somewhere it should not. Every tool here is read-only &mdash; nothing an
            assistant does through this server can change your data, your billing, or your
            settings.
          </p>
        </section>
      </div>
    </DocsLayout>
  )
}
