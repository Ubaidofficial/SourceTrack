import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsCodeBlock from '../../components/docs/DocsCodeBlock'
import DocsCallout from '../../components/docs/DocsCallout'

export default function DocsGoogleAds() {
  return (
    <DocsLayout>
      <Helmet>
        <title>Google Ads Setup Guide | SourceTrack Docs</title>
        <meta name="description" content="Learn how to configure Google Ads ValueTrack tracking template and parameters for accurate multi-touch attribution and cost sync." />
        <link rel="canonical" href="https://www.sourcetrack.ai/docs/platforms/google-ads" />
      </Helmet>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-dark-primary tracking-tight">
            Google Ads Setup Guide
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2 text-base leading-relaxed">
            Configure Google Ads with our tracking template to capture Google Click IDs, ValueTrack parameters, and entity details for accurate attribution.
          </p>
        </div>

        {/* 1. Who this is for */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Who This Is For
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            This guide is for advertisers, agencies, and founders running campaigns on Google Ads. Injecting the SourceTrack ValueTrack template is essential to map campaign names, ad groups, creatives, devices, and networks to conversions.
          </p>
        </section>

        {/* 2. Tracking Template Explainer */}
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            The SourceTrack ValueTrack Template
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Copy and paste this template into your Google Ads Account, Campaign, or Ad Group level tracking settings.
          </p>
          <DocsCodeBlock lang="text">
{`{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_id={campaignid}&utm_content={creative}&utm_term={keyword}&st_campaign_id={campaignid}&st_adgroup_id={adgroupid}&st_ad_id={creative}&st_target_id={targetid}&st_network={network}&st_device={device}&st_matchtype={matchtype}`}
          </DocsCodeBlock>
        </section>

        {/* Keywordless Traffic Callout */}
        <DocsCallout type="info">
          <h4 className="font-extrabold text-blue-900 dark:text-blue-300 mb-1">Performance Max & Keywordless Traffic:</h4>
          <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            For modern Google Ads campaigns like <strong>Performance Max (PMax)</strong> or Dynamic Search Ads (DSA), Google does not use keywords. Therefore, the <code>{`{keyword}`}</code> placeholder will often resolve to a blank value.
            By capturing <code>st_campaign_id</code>, <code>st_adgroup_id</code>, and <code>st_ad_id</code> directly from Google's ValueTrack macro engine, SourceTrack can still attribute conversions to the exact campaign and asset groups without relying on keyword strings.
          </p>
        </DocsCallout>

        {/* 3. Steps */}
        <section className="space-y-6">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            How to Install the Tracking Template
          </h2>

          <div className="space-y-4">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">Option A: Account-Level Setup (Recommended)</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Applying the template at the Account Level automatically covers all current and future campaigns in your Google Ads account:
            </p>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li>Log in to your <strong>Google Ads account</strong>.</li>
              <li>In the left navigation menu, click <strong>Settings</strong> &rarr; <strong>Account settings</strong>.</li>
              <li>Expand the <strong>Tracking</strong> section.</li>
              <li>Paste the SourceTrack tracking template into the <strong>Tracking template</strong> field.</li>
              <li>Click <strong>Save</strong>.</li>
            </ol>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-dark-primary">Option B: Campaign-Level Setup</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              If you only want to track specific campaigns with SourceTrack:
            </p>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li>Go to the <strong>Campaigns</strong> list.</li>
              <li>Select the campaign you want to track, then click <strong>Settings</strong>.</li>
              <li>Expand <strong>Additional settings</strong> at the bottom.</li>
              <li>Click on <strong>Campaign URL options</strong>.</li>
              <li>Paste the template into the <strong>Tracking template</strong> field and click <strong>Save</strong>.</li>
            </ol>
          </div>
        </section>

        {/* 4. Verification */}
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-gray-950 dark:text-dark-primary border-b border-gray-100 dark:border-gray-800 pb-2">
            Verifying Your Setup
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            You can verify your setup using the Google Ads Setup Checklist in the SourceTrack dashboard:
          </p>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <li>Open the <Link to="/app/integrations" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">Integrations</Link> page.</li>
            <li>Look at the <strong>Google Ads Setup Checklist</strong> card.</li>
            <li>Click your Google Ads links or send test traffic using a GCLID (e.g. <code>https://yourdomain.com/?gclid=test_gclid_123</code>).</li>
            <li>Refresh the checklist or visit the <strong>Event Debugger</strong> to verify that click IDs and parameters are captured.</li>
          </ol>
        </section>
      </div>
    </DocsLayout>
  )
}
