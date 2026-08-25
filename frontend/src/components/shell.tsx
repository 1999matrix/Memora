import {
  Books,
  ChatsCircle,
  GearSix,
  MagnifyingGlass,
  PlugsConnected,
  SignOut,
  SquaresFour,
  Moon,
  Sun,
  UserCircle,
} from '@phosphor-icons/react'
import { type ReactNode } from 'react'
import { Navigate, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { cn, fullName, initials } from '../lib/format'
import { useTheme } from '../lib/theme'
import { Button } from './ui'

const nav = [
  { to: 'chat', label: 'Chat', icon: ChatsCircle },
  { to: 'documents', label: 'Documents', icon: Books },
  { to: 'connectors', label: 'Connectors', icon: PlugsConnected },
  { to: 'summaries', label: 'Summaries', icon: SquaresFour },
  { to: 'search', label: 'Search', icon: MagnifyingGlass },
  { to: 'settings', label: 'Settings', icon: GearSix },
]

export function WorkspaceShell() {
  const { workspaceId } = useParams()
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  return (
    <div className="h-[100dvh] overflow-hidden bg-paper text-ink dark:bg-[#0e1116] dark:text-[#e8eaed]">
      <div className="flex h-full">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-ink/8 bg-surface/80 px-3 py-4 dark:border-white/8 dark:bg-[#12161c] md:flex">
          <button
            type="button"
            onClick={() => navigate('/orgs')}
            className="mb-6 px-2 text-left text-[15px] font-semibold tracking-tight"
          >
            Memora
          </button>
          <nav className="flex flex-1 flex-col gap-0.5">
            {nav.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={`/w/${workspaceId}/${item.to}`}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                      isActive
                        ? 'bg-accent-soft text-accent dark:bg-accent/20 dark:text-[#9ad4c7]'
                        : 'text-ink/65 hover:bg-ink/5 hover:text-ink dark:text-white/60 dark:hover:bg-white/6 dark:hover:text-white',
                    )
                  }
                >
                  <Icon size={18} weight="regular" />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
          <div className="mt-4 space-y-2 border-t border-ink/8 pt-4 dark:border-white/8">
            {user?.role === 'SUPER_ADMIN' ? (
              <NavLink
                to="/admin"
                className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-ink/65 hover:bg-ink/5 dark:text-white/60"
              >
                Platform
              </NavLink>
            ) : null}
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="flex min-w-0 items-center gap-2 text-left"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[11px] font-medium text-white dark:bg-white dark:text-ink">
                  {user ? initials(user) : ''}
                </span>
                <span className="truncate text-xs text-ink/70 dark:text-white/60">
                  {user ? fullName(user) : ''}
                </span>
              </button>
              <div className="flex">
                <button
                  type="button"
                  aria-label="Toggle theme"
                  onClick={toggle}
                  className="rounded-lg p-1.5 text-ink/55 hover:bg-ink/5 dark:text-white/50"
                >
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                <button
                  type="button"
                  aria-label="Sign out"
                  onClick={() => {
                    void logout().then(() => navigate('/login'))
                  }}
                  className="rounded-lg p-1.5 text-ink/55 hover:bg-ink/5 dark:text-white/50"
                >
                  <SignOut size={16} />
                </button>
              </div>
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-ink/8 px-4 py-3 md:hidden dark:border-white/8">
            <span className="font-semibold">Memora</span>
            <Button variant="ghost" onClick={() => navigate('/orgs')}>
              Workspaces
            </Button>
          </header>
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </main>
          <nav className="grid grid-cols-5 border-t border-ink/8 bg-surface px-1 py-2 md:hidden dark:border-white/8 dark:bg-[#12161c]">
            {nav.slice(0, 5).map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={`/w/${workspaceId}/${item.to}`}
                  className={({ isActive }) =>
                    cn(
                      'flex flex-col items-center gap-1 py-1 text-[10px]',
                      isActive ? 'text-accent' : 'text-ink/50 dark:text-white/45',
                    )
                  }
                >
                  <Icon size={18} />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
        </div>
      </div>
    </div>
  )
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-paper dark:bg-[#0e1116]">
        <div className="h-8 w-8 animate-pulse rounded-full bg-accent/30" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return children
}

export function GuestGate({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-paper dark:bg-[#0e1116]">
        <div className="h-8 w-8 animate-pulse rounded-full bg-accent/30" />
      </div>
    )
  }

  if (user) return <Navigate to="/orgs" replace />

  return children
}

export function TopBar({ title }: { title: string }) {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  return (
    <header className="flex h-16 items-center justify-between px-6">
      <button type="button" className="text-[15px] font-semibold tracking-tight" onClick={() => navigate('/')}>
        Memora
      </button>
      <div className="flex items-center gap-2">
        <span className="hidden text-sm text-ink/55 sm:block dark:text-white/50">{title}</span>
        <button type="button" aria-label="Toggle theme" onClick={toggle} className="rounded-lg p-2 hover:bg-ink/5">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {user ? (
          <>
            <button type="button" className="rounded-lg p-2 hover:bg-ink/5" onClick={() => navigate('/profile')}>
              <UserCircle size={18} />
            </button>
            <Button
              variant="ghost"
              onClick={() => {
                void logout().then(() => navigate('/login'))
              }}
            >
              Sign out
            </Button>
          </>
        ) : null}
      </div>
    </header>
  )
}
