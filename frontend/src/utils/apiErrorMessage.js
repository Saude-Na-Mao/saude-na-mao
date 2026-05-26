import { ERROR_MESSAGES } from '../constants'

/**
 * Normaliza erro vindo do interceptor do Axios ( objeto { status, message, data } ).
 */
export function getApiErrorMessage(error, fallbackMessage = ERROR_MESSAGES.GENERIC) {
  if (!error) return fallbackMessage
  if (error.status === 'NETWORK_ERROR') {
    return error.message || ERROR_MESSAGES.NETWORK
  }
  const data = error.data
  if (data?.errors?.length) {
    return data.errors
      .map((e) => (typeof e.msg === 'string' ? e.msg : e.message || String(e.msg || '')))
      .filter(Boolean)
      .join('; ')
  }
  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message
  }
  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }
  return fallbackMessage
}
