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
