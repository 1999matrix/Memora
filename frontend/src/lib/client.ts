import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

import type { ApiSuccess } from '../types'

export const API_ORIGIN = import.meta.env.VITE_API_BASE_URL || 'http://localhost:7000'
export const API_V1 = `${API_ORIGIN}/api/v1`

const ACCESS_KEY = 'memora.accessToken'
const REFRESH_KEY = 'memora.refreshToken'

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean }

let accessToken = sessionStorage.getItem(ACCESS_KEY)
let refreshToken = localStorage.getItem(REFRESH_KEY)
let onSessionLost: (() => void) | null = null

export function getAccessToken() {
  return accessToken
}

export function persistTokens(access: string, refresh: string) {
  accessToken = access
  refreshToken = refresh
  sessionStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens() {
  accessToken = null
  refreshToken = null
  sessionStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export function setSessionLostHandler(fn: (() => void) | null) {
  onSessionLost = fn
}

export const http = axios.create({
  baseURL: API_V1,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  config.headers['x-correlation-id'] = crypto.randomUUID()
  return config
})

let refreshInFlight: Promise<boolean> | null = null

async function refreshSession(): Promise<boolean> {
  if (!refreshToken) return false
  try {
    const { data } = await axios.post<ApiSuccess<{ accessToken: string; refreshToken: string }>>(
      `${API_V1}/auth/refresh`,
      { refreshToken },
    )
    persistTokens(data.data.accessToken, data.data.refreshToken)
    return true
  } catch {
    return false
  }
}

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined
    if (error.response?.status === 401 && config && !config._retry) {
      config._retry = true
      refreshInFlight ??= refreshSession().finally(() => {
        refreshInFlight = null
      })
      const ok = await refreshInFlight
      if (ok) {
        config.headers.Authorization = `Bearer ${accessToken}`
        return http(config)
      }
      clearTokens()
      onSessionLost?.()
    }
    return Promise.reject(error)
  },
)

export function unwrap<T>(body: ApiSuccess<T>): T {
  return body.data
}

export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as { message?: string | string[] } | undefined)?.message
    if (Array.isArray(msg)) return msg.join('. ')
    if (typeof msg === 'string' && msg) return msg
    if (err.response?.status === 429) return 'Too many requests. Wait a moment and try again.'
    return err.message
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}
