import React, { useState } from 'react'
import MarketingHeader from '../MarketingHeader'
import MarketingFooter from '../MarketingFooter'
import DocsSidebar from './DocsSidebar'

class DocsErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true }
  }
  componentDidCatch(error, errorInfo) {
    console.error("Docs render crash:", error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="py-24 text-center px-4 bg-white dark:bg-[#1A1D1D] rounded-2xl border border-gray-100 dark:border-gray-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-dark-primary mb-2">Docs failed to load</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Please refresh or contact support.</p>
        </div>
      )
    }
    return this.props.children
  }
}

export default function DocsLayout({ children, isDeveloper = false }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col bg-[#F9FAFB] dark:bg-[#111414] text-gray-900 dark:text-dark-primary transition-colors duration-150">
      <MarketingHeader />

      {/* Main layout container */}
      <div className="flex-1 max-w-[1320px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex gap-8">
        {/* Desktop Sidebar */}
        <aside className="hidden md:block w-64 shrink-0">
          <div className="sticky top-[108px] max-h-[calc(100vh-140px)] overflow-y-auto pr-4">
            <DocsSidebar isDeveloper={isDeveloper} />
          </div>
        </aside>

        {/* Mobile floating sidebar button */}
        <div className="md:hidden fixed bottom-6 right-6 z-40">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="flex items-center gap-2 bg-[#1F2323] text-white dark:bg-[#CCF03F] dark:text-[#1F2323] px-5 py-3 rounded-full shadow-xl font-extrabold text-sm tracking-wide transition-all active:scale-95"
          >
            Menu
          </button>
        </div>

        {/* Mobile sidebar modal */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 md:hidden bg-black/60 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)}>
            <div
              className="absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-[#1A1D1D] p-6 overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <span className="font-black text-xs uppercase tracking-widest text-gray-400 dark:text-gray-500">Navigation</span>
                <button
                  onClick={() => setMobileNavOpen(false)}
                  className="p-1 rounded text-gray-500 hover:text-gray-800 dark:hover:text-white text-xs font-bold"
                >
                  Close
                </button>
              </div>
              <DocsSidebar isDeveloper={isDeveloper} onItemClick={() => setMobileNavOpen(false)} />
            </div>
          </div>
        )}

        {/* Document Content */}
        <main className="flex-1 min-w-0 max-w-3xl">
          <DocsErrorBoundary>
            {children}
          </DocsErrorBoundary>
        </main>
      </div>

      <MarketingFooter />
    </div>
  )
}
