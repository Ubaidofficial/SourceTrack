import { MoreHorizontal } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export default function DashboardCard({ title, subtitle, action, menuItems, children, className = '' }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  return (
    <div className={`bg-white dark:bg-[#1A1D1D] rounded-xl border border-gray-200 dark:border-[#333838] shadow-sm overflow-hidden ${className}`}>
      {(title || action || menuItems) && (
        <div className="px-5 py-4 border-b border-gray-100 dark:border-[#2A2E2E] flex items-center justify-between">
          <div>
            {title && <h3 className="text-sm font-semibold text-st-black">{title}</h3>}
            {subtitle && <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {action}
            {menuItems && menuItems.length > 0 && (
              <div className="relative" ref={menuRef}>
                <button onClick={() => setMenuOpen(!menuOpen)} className="p-1 text-st-gray dark:text-gray-400 hover:text-gray-600 rounded">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-7 z-10 w-40 bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#333838] rounded-lg shadow-lg py-1">
                    {menuItems.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => { setMenuOpen(false); item.onClick?.() }}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#252929] flex items-center gap-2"
                      >
                        {item.icon && <item.icon className="w-3.5 h-3.5" />}
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="p-5">
        {children}
      </div>
    </div>
  )
}
