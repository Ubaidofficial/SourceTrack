export function getAuthAppRole(user) {
  if (!user) return null
  return user.app_metadata?.role || user.raw_app_meta_data?.role
}
