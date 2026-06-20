export function isSupportPreviewActive() {
  if (typeof window === 'undefined') return false
  const previewRaw = window.sessionStorage.getItem('sourcetrack_admin_preview')
  if (!previewRaw) return false
  try {
    const data = JSON.parse(previewRaw)
    return !!data?.site_id
  } catch (e) {
    return false
  }
}

export function getSupportPreviewSite() {
  if (typeof window === 'undefined') return null
  const previewRaw = window.sessionStorage.getItem('sourcetrack_admin_preview')
  if (!previewRaw) return null
  try {
    const data = JSON.parse(previewRaw)
    if (!data?.site_id) return null
    return {
      site_id: data.site_id,
      site_name: data.site_name || null,
      site_domain: data.site_domain || null
    }
  } catch (e) {
    return null
  }
}
