import { PostHog } from 'posthog-node'

const flushAt = process.env.POSTHOG_FLUSH_AT
  ? parseInt(process.env.POSTHOG_FLUSH_AT, 10)
  : (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' ? 20 : 1)

const flushInterval = process.env.POSTHOG_FLUSH_INTERVAL_MS
  ? parseInt(process.env.POSTHOG_FLUSH_INTERVAL_MS, 10)
  : (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' ? 10000 : 0)

export const ph = new PostHog(process.env.POSTHOG_API_KEY, {
  host: process.env.POSTHOG_HOST,
  flushAt,
  flushInterval
})

process.on('exit', () => ph.shutdown())
process.on('SIGTERM', async () => {
  await ph.shutdown()
  process.exit(0)
})

export async function queryHogQL(sql, queryName = 'trackiq') {
  try {
    const host = process.env.POSTHOG_HOST.replace(/\/$/, '')
    const projectId = process.env.POSTHOG_PROJECT_ID
    const url = `${host}/api/projects/${projectId}/query/`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: {
          kind: 'HogQLQuery',
          query: sql
        }
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const raw = await res.text()
      // Strip HTML tags and truncate to avoid leaking huge HTML bodies into error messages
      const cleaned = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      const snippet = cleaned.length > 200 ? cleaned.slice(0, 200) + '…' : cleaned
      throw new Error(`HogQL ${queryName} failed (${res.status}): ${snippet}`)
    }

    const data = await res.json()
    return data.results || []
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`HogQL ${queryName} timed out`)
    }
    throw err
  }
}
