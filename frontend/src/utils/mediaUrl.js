import { getSocketUrl } from '../config/env'

/**
 * Resolve paths locais (/uploads/...) para URL absoluta do backend.
 * URLs http(s) externas permanecem inalteradas.
 */
export function resolveMediaUrl(src) {
  if (!src || typeof src !== 'string') return ''
  const trimmed = src.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed
  }
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (path.startsWith('/uploads')) {
    return `${getSocketUrl()}${path}`
  }
  return trimmed
}
