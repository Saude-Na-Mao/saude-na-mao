const DEFAULT_API_BASE_URL = '/api'
const DEFAULT_GOOGLE_CLIENT_ID =
  '884559887672-inou94ddfh737nk84msnemt1hdkfme94.apps.googleusercontent.com'

const requiredEnvVars = []

export const validateEnv = () => {
  const missing = []

  requiredEnvVars.forEach((envVar) => {
    if (!import.meta.env[envVar]) {
      missing.push(envVar)
    }
  })

  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(', ')}`
    console.error(message)
    throw new Error(message)
  }

  console.info('✅ Environment variables validated')
}

export const getConfig = () => {
  return {
    apiBaseUrl: getApiBaseUrl(),
    googleClientId: getGoogleClientId(),
    appName: import.meta.env.VITE_APP_NAME || 'Saúde na Mão',
    logLevel: import.meta.env.VITE_LOG_LEVEL || 'info',
    isDev: import.meta.env.DEV,
    isProd: import.meta.env.PROD,
  }
}

export function getGoogleClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID
}

export function getApiBaseUrl() {
  const explicitBase = import.meta.env.VITE_API_BASE_URL
  const backendUrl = import.meta.env.VITE_API_URL

  if (explicitBase) return explicitBase.replace(/\/$/, '')

  if (backendUrl) {
    const cleanBackendUrl = backendUrl.replace(/\/$/, '')
    if (/\/api(\/v\d+)?$/.test(cleanBackendUrl)) return cleanBackendUrl
    return `${cleanBackendUrl}/api/v1`
  }

  return DEFAULT_API_BASE_URL
}

export function apiUrl(path = '') {
  const base = getApiBaseUrl()
  const cleanPath = String(path || '').replace(/^\/+/, '')
  return cleanPath ? `${base}/${cleanPath}` : base
}

/** URL do servidor Socket.io (porta do backend, não o proxy /api do Vite). */
export function getSocketUrl() {
  const fromEnv = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location
    const host = hostname === 'localhost' ? 'localhost:5000' : hostname
    const scheme = protocol === 'https:' ? 'https' : 'http'
    return `${scheme}://${host}`
  }
  return 'http://localhost:5000'
}

export const SOCKET_TRANSPORTS = ['websocket', 'polling']
