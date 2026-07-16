import { Link, useLocation } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { SECTIONS, bySection } from './docsManifest'
import LogoChip from './LogoChip'

// Nav derives from docsManifest (SECTIONS + bySection) — no duplicate lists.
// User docs show the 'user' sections; the developer portal shows 'dev' sections
// plus a backlink to the user docs home.
const USER_SECTIONS = SECTIONS.filter((s) => s.sidebar === 'user')
const DEV_SECTIONS = SECTIONS.filter((s) => s.sidebar === 'dev')
const DEV_BACKLINK = { label: 'Guides', links: [{ to: '/docs', title: 'User Docs Home', icon: BookOpen }] }

function NavItem({ entry, active, onItemClick }) {
  const Icon = entry.icon
  return (
    <Link
      to={entry.to}
      onClick={onItemClick}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2.5 min-h-[44px] px-3 py-2 rounded-lg text-[13px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-st-lime focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-dark-bg ${
        active
          ? 'bg-st-lime/15 dark:bg-st-lime/10 text-st-black dark:text-st-lime font-bold'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover'
      }`}
    >
      {entry.logoDomain ? (
        <LogoChip domain={entry.logoDomain} name={entry.title} variant="sidebar" />
      ) : Icon ? (
        <Icon className="w-[15px] h-[15px] shrink-0" aria-hidden="true" />
      ) : null}
      <span className="truncate">{entry.title || entry.label}</span>
    </Link>
  )
}

function Group({ label, entries, pathname, onItemClick }) {
  return (
    <div>
      <h4 className="px-3 text-[11px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
        {label}
      </h4>
      <nav className="space-y-1">
        {entries.map((entry) => (
          <NavItem key={entry.to} entry={entry} active={pathname === entry.to} onItemClick={onItemClick} />
        ))}
      </nav>
    </div>
  )
}

export default function DocsSidebar({ isDeveloper = false, onItemClick }) {
  const { pathname } = useLocation()

  return (
    <div className="space-y-6">
      {isDeveloper ? (
        <>
          {DEV_SECTIONS.map((sec) => (
            <Group key={sec.id} label={sec.label} entries={bySection(sec.id)} pathname={pathname} onItemClick={onItemClick} />
          ))}
          <Group label={DEV_BACKLINK.label} entries={DEV_BACKLINK.links} pathname={pathname} onItemClick={onItemClick} />
        </>
      ) : (
        USER_SECTIONS.map((sec) => (
          <Group key={sec.id} label={sec.label} entries={bySection(sec.id)} pathname={pathname} onItemClick={onItemClick} />
        ))
      )}
    </div>
  )
}
