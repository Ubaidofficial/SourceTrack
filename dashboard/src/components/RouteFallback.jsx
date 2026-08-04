// The single route-level "the app is resolving what to show" spinner.
//
// Extracted from the two identical copies that already lived in App.jsx (the
// ProtectedRoute onboarding-in-flight gate and AppRootRedirect's auth-resolving
// gate) so that a lazily-loaded route chunk and the gate that runs immediately
// after it render the SAME spinner. That matters: a forced redirect
// (ProtectedRoute -> /onboarding, super_admin -> /ops) now shows a chunk fetch
// followed by a gate check, and reusing one spinner makes that read as a single
// continuous load instead of two different loading UIs flashing in sequence.
//
// motion-reduce:animate-none follows Analytics.jsx's spinner — worth honouring
// now that this renders on every route rather than a few isolated spots.
//
// NOT a design.md §8.11 skeleton: those mirror a page's real layout (KPI tiles,
// chart block, table rows) and belong to a page's own data-loading state. At
// chunk-load time the code that defines the layout has not arrived yet, so
// there is nothing to mirror.
export default function RouteFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-dark-bg">
      <div className="animate-spin motion-reduce:animate-none rounded-full h-8 w-8 border-b-2 border-st-black dark:border-st-lime" />
    </div>
  )
}
