import { ROUTES } from '../constants'

export const NOTIFICATION_ACTION = {
  ORDER: 'order',
  SUPPORT: 'support',
  PRESCRIPTION: 'prescription',
  PRESCRIPTION_CHAT: 'prescription_chat',
}

export function resolveNotificationPath(action) {
  if (!action?.kind) return null

  switch (action.kind) {
    case NOTIFICATION_ACTION.ORDER:
      if (action.orderId) {
        return {
          pathname: ROUTES.TRACKING.replace(':id', String(action.orderId)),
        }
      }
      return { pathname: ROUTES.ORDERS }

    case NOTIFICATION_ACTION.SUPPORT:
      if (action.ticketId) {
        return {
          pathname: ROUTES.CHATS,
          state: {
            openTicketId: String(action.ticketId),
          },
        }
      }
      return {
        pathname: ROUTES.CHATS,
      }

    case NOTIFICATION_ACTION.PRESCRIPTION:
      return { pathname: '/receita' }

    case NOTIFICATION_ACTION.PRESCRIPTION_CHAT:
      return {
        pathname: '/receita',
        state: action.prescriptionId
          ? { prescriptionId: String(action.prescriptionId) }
          : undefined,
      }

    default:
      return null
  }
}

export function buildOrderNotificationAction(orderId) {
  return {
    kind: NOTIFICATION_ACTION.ORDER,
    orderId: orderId != null ? String(orderId) : undefined,
  }
}

export function buildSupportNotificationAction(ticketId) {
  return {
    kind: NOTIFICATION_ACTION.SUPPORT,
    ticketId: ticketId != null ? String(ticketId) : undefined,
  }
}

export function buildPrescriptionNotificationAction(prescriptionId) {
  return {
    kind: NOTIFICATION_ACTION.PRESCRIPTION,
    prescriptionId:
      prescriptionId != null ? String(prescriptionId) : undefined,
  }
}

export function buildPrescriptionChatNotificationAction(prescriptionId) {
  return {
    kind: NOTIFICATION_ACTION.PRESCRIPTION_CHAT,
    prescriptionId:
      prescriptionId != null ? String(prescriptionId) : undefined,
  }
}
