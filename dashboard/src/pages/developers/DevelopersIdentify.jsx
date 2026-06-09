import { Helmet } from 'react-helmet-async'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DevelopersIdentify() {
  return (
    <DocsLayout isDeveloper={true}>
      <Helmet>
        <title>User Stitching (Identify) SDK Reference | SourceTrack Docs</title>
        <meta name="description" content="Technical details for the user identification method. Stitch anonymous pre-signup visitor paths with post-signup conversions." />
        <link rel="canonical" href="https://sourcetrack.ai/developers/identify" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            User Identification
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Stitch anonymous pre-login journeys with registered profile records using the JavaScript SDK.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            The Identify Concept
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            When a visitor lands on your site, they are assigned a random tracking ID (<code>st_aid</code>). When they sign up or log in, call the <code>identify</code> method. SourceTrack creates an internal alias link, mapping the anonymous tracking session with your internal user ID. This ensures that their complete pre-login marketing path (UTMs, referrers, campaigns) is stitched to future purchases or billing events.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            JavaScript SDK Signature
          </h2>
          <DocsCodeBlock lang="js">
{`window.sourcetrack.identify(userId, traits);`}
          </DocsCodeBlock>
          <ul className="space-y-3 text-sm text-gray-750 dark:text-gray-350">
            <li>
              <strong>userId</strong> <span className="text-xs text-[#00AA57] font-mono">string</span> (required):
              <p className="mt-0.5">
                Your internal database user identifier (e.g. <code>usr_550e8400</code> or <code>12345</code>). This will serve as the primary key for future conversions and backend mapping.
              </p>
            </li>
            <li>
              <strong>traits</strong> <span className="text-xs text-[#00AA57] font-mono">object</span> (optional):
              <p className="mt-0.5">
                Key-value traits to attach to the user profile (e.g. <code>email</code>, <code>name</code>, <code>plan_type</code>).
              </p>
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-2">
            Code Example
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Invoke this call inside your registration or authentication success handlers:
          </p>
          <DocsCodeBlock lang="js">
{`// Call upon successful login or user registration
if (window.sourcetrack) {
  window.sourcetrack.identify('usr_99283471', {
    email: 'user@domain.com',
    name: 'John Doe',
    company: 'Acme Corp'
  });
}`}
          </DocsCodeBlock>
        </section>

        <DocsCallout type="info">
          Stitching is retrospective. Once an identify link is created, all historical pageviews and acquisition touchpoints captured under the visitor\'s anonymous tracking ID will be associated with their user profile.
        </DocsCallout>
      </div>
    </DocsLayout>
  )
}
