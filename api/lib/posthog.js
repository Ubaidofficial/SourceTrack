import { PostHog } from 'posthog-node'

export const ph = new PostHog(process.env.POSTHOG_API_KEY, {
  host: process.env.POSTHOG_HOST,
  flushAt: 1,
  flushInterval: 0
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
      const text = await res.text()
      throw new Error(`HogQL ${queryName} failed (${res.status}): ${text}`)
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
