export const ACTIVE_SUPPORT_TICKET_KEY = 'ssm_active_support_ticket'

export function setActiveSupportTicket(ticketId) {
  if (ticketId == null || ticketId === '') return
  try {
    sessionStorage.setItem(ACTIVE_SUPPORT_TICKET_KEY, String(ticketId))
  } catch {
    /* ignore */
  }
}

export function getActiveSupportTicket() {
  try {
    return sessionStorage.getItem(ACTIVE_SUPPORT_TICKET_KEY) || null
  } catch {
    return null
  }
}

export function clearActiveSupportTicket() {
  try {
    sessionStorage.removeItem(ACTIVE_SUPPORT_TICKET_KEY)
  } catch {
    /* ignore */
  }
}

let suppressToastTicketId = null

/** Evita toast duplicado quando o chat do mesmo ticket está aberto e visível. */
export function setSupportToastSuppressed(ticketId, suppressed) {
  suppressToastTicketId = suppressed && ticketId ? String(ticketId) : null
}

export function shouldSuppressSupportToast(ticketId) {
  if (!suppressToastTicketId || !ticketId) return false
  return suppressToastTicketId === String(ticketId)
}

export function buildSupportToastMessage(mensagem) {
  const tipo = mensagem?.tipoRemetente ?? mensagem?.tipo_remetente
  const texto = String(mensagem?.texto || '').trim()
  const raw =
    tipo === 'sistema' ? texto : `Farmacêutico: ${texto}`
  if (!raw) return 'Você tem uma nova resposta do farmacêutico.'
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw
}
