import { Link, NavLink, Outlet } from 'react-router-dom'
import { LanguageSwitcher } from './LanguageSwitcher.jsx'
import { UiSettings } from './UiSettings.jsx'
import { UserMenu } from './UserMenu.jsx'
import { useIsAdmin } from '../store/authStore.js'
import { useLocale } from '../store/localeStore.js'
import { hanziiHomeUrl } from '../lib/hanzii.js'
import { cn } from '../lib/cn.js'

const navLinkClass = ({ isActive, isExternal = false }) =>
  cn(
    'flex items-center gap-1.5 px-3.5 py-2 rounded-lg no-underline text-text-muted text-sm font-medium transition-[background,color] duration-150 hover:bg-accent-bg hover:text-text-h',
    isActive && 'bg-accent-bg text-accent',
    isExternal &&
      "after:content-['↗'] after:text-[0.6875rem] after:opacity-65",
  )

export function Layout() {
  const { t, locale } = useLocale()
  const isAdmin = useIsAdmin()

  return (
    <div className="min-h-svh flex flex-col">
      <header className="flex items-center gap-4 px-6 py-4 bg-surface border-b border-border sticky top-0 z-10 max-[640px]:flex-wrap max-[640px]:gap-3">
        <Link
          to="/"
          className="flex items-center gap-2.5 shrink-0 no-underline text-text-h"
        >
          <span
            className="flex items-center justify-center w-9 h-9 bg-gradient-to-br from-accent to-teal-600 text-white rounded-[10px] text-base font-bold shadow-[0_2px_8px_rgb(13_148_136/35%)]"
            aria-hidden="true"
          >
            粵
          </span>
          <span className="flex flex-col leading-[1.15]">
            <span className="text-[1.0625rem] font-bold tracking-tight text-text-h">
              {t.brand}
            </span>
            <span className="text-[0.6875rem] font-medium tracking-wide uppercase text-accent">
              {t.brandTagline}
            </span>
          </span>
        </Link>
        <nav
          className="flex flex-1 flex-wrap gap-1 min-w-0 max-[640px]:order-3 max-[640px]:basis-full max-[640px]:justify-center"
          aria-label="Main"
        >
          <NavLink to="/words" className={({ isActive }) => navLinkClass({ isActive })}>
            <span aria-hidden="true">☰</span> {t.nav.wordBank}
          </NavLink>
          <NavLink to="/grammar" className={({ isActive }) => navLinkClass({ isActive })}>
            <span aria-hidden="true">¶</span> {t.nav.grammarBank}
          </NavLink>
          <NavLink to="/sentences" className={({ isActive }) => navLinkClass({ isActive })}>
            <span aria-hidden="true">💬</span> {t.nav.sentenceBank}
          </NavLink>
          <NavLink to="/lessons" className={({ isActive }) => navLinkClass({ isActive })}>
            <span aria-hidden="true">📖</span> {t.nav.lessons}
          </NavLink>
          <NavLink to="/flashcard" className={({ isActive }) => navLinkClass({ isActive })}>
            <span aria-hidden="true">🃏</span> {t.nav.flashcard}
          </NavLink>
          <NavLink to="/lookup" className={({ isActive }) => navLinkClass({ isActive })}>
            <span aria-hidden="true">字</span> {t.nav.hanLookup}
          </NavLink>
          <a
            href={hanziiHomeUrl(locale)}
            className={navLinkClass({ isActive: false, isExternal: true })}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.nav.hanzii}
          </a>
          <a
            href="https://jyutdictionary.com/"
            className={navLinkClass({ isActive: false, isExternal: true })}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.nav.jyutdictionary}
          </a>
        </nav>
        <div className="flex items-center gap-2 shrink-0 ml-auto max-[640px]:ml-auto">
          <LanguageSwitcher />
          <UiSettings />
          <UserMenu />
        </div>
      </header>

      <Outlet context={{ isAdmin }} />
    </div>
  )
}
