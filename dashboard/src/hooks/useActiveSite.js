import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useSite } from '../contexts/SiteContext'

// The page's working `site` ALWAYS comes from the SiteContext selector (activeSite) —
// never a mount-time `.limit(1)` that grabs the first site and ignores the selector.
//
// `extraColumns` (optional, a Postgres select string) covers pages that read a `sites`
// column the /sites endpoint behind SiteContext doesn't return — e.g. cookieless_mode,
// cross_domain_domains, cross_domain_cookie_domain, custom_url_params. Those columns are
// fetched scoped to the ACTIVE site's id (`.eq('id', activeSite.id)`, never `.limit(1)`),
// keyed on that id so a site switch re-fetches, and merged onto activeSite.
//
// Race safety: the extra-columns query is gated on `activeSite?.id`, so it never fires
// while the context is still resolving. There is no "fallback started under a null context
// that resolves last and overwrites the correct site" — the fetch is strictly downstream of
// the selector, and react-query drops a stale result the moment the active-site id changes.
export function useActiveSite(extraColumns = null) {
  const { activeSite, loading: siteLoading } = useSite()

  const { data: extra } = useQuery({
    queryKey: ['active-site-extra', activeSite?.id, extraColumns],
    queryFn: async () => {
      const { data } = await supabase
        .from('sites')
        .select(extraColumns)
        .eq('id', activeSite.id)
        .maybeSingle()
      return data
    },
    enabled: !!activeSite?.id && !!extraColumns,
  })

  const site = activeSite ? (extra ? { ...activeSite, ...extra } : activeSite) : null
  return { site, activeSite, siteLoading }
}
