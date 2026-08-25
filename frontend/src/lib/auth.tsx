import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { authApi } from '../lib/api'
import {
  clearTokens,
  getAccessToken,
  persistTokens,
  setSessionLostHandler,
} from '../lib/client'
import type { SafeUser } from '../types'

type AuthContextValue = {
  user: SafeUser | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  register: (input: {
    email: string
    password: string
    firstName: string
    lastName: string
  }) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setSessionLostHandler(() => {
      setUser(null)
    })
    return () => setSessionLostHandler(null)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      if (!getAccessToken()) {
        setReady(true)
        return
      }
      try {
        const me = await authApi.me()
        if (!cancelled) setUser(me)
      } catch {
        clearTokens()
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      async login(email, password) {
        const payload = await authApi.login({ email, password })
        persistTokens(payload.accessToken, payload.refreshToken)
        setUser(payload.user)
      },
      async register(input) {
        const payload = await authApi.register(input)
        persistTokens(payload.accessToken, payload.refreshToken)
        setUser(payload.user)
      },
      async logout() {
        try {
          await authApi.logout()
        } catch {
          /* still clear locally */
        }
        clearTokens()
        setUser(null)
      },
      async refreshUser() {
        const me = await authApi.me()
        setUser(me)
      },
    }),
    [user, ready],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
})

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}
