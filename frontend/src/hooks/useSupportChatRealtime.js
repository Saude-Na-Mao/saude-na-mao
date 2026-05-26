import { useState, useEffect, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'
import { supportService } from '../services/api'
import { useUiStore } from '../stores/store'
import { getSocketUrl, SOCKET_TRANSPORTS } from '../config/env'
import {
  buildSupportToastMessage,
  setSupportToastSuppressed,
} from '../utils/supportTicketStorage'
import { buildSupportNotificationAction } from '../utils/notificationNavigation'

const UNREAD_POLL_MS = 30000
const FALLBACK_TICKET_POLL_MS = 15000

function mapStaffMessage(mensagem) {
  const tipo = mensagem?.tipoRemetente ?? mensagem?.tipo_remetente
  const texto = mensagem?.texto || ''
  if (tipo === 'sistema') {
    return { type: 'bot', text: texto, timestamp: new Date(mensagem?.enviado_em || Date.now()) }
  }
  return {
    type: 'bot',
    text: `👨‍⚕️ Farmacêutico: ${texto}`,
    timestamp: new Date(mensagem?.enviado_em || Date.now()),
  }
}

function shouldNotifyUser(isChatOpen) {
  if (!isChatOpen) return true
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return true
  }
  return false
}

/**
 * Socket + unread para chat de suporte (cliente).
 */
export function useSupportChatRealtime({
  token,
  userId,
  ticketId,
  isChatOpen,
  onStaffMessage,
  onTicketClosed,
}) {
  const addNotification = useUiStore((s) => s.addNotification)
  const [unreadCount, setUnreadCount] = useState(0)
  const onStaffMessageRef = useRef(onStaffMessage)
  const onTicketClosedRef = useRef(onTicketClosed)
  const isChatOpenRef = useRef(isChatOpen)
  const lastMsgCountRef = useRef(0)
  const prevUnreadRef = useRef(0)

  useEffect(() => {
    onStaffMessageRef.current = onStaffMessage
    onTicketClosedRef.current = onTicketClosed
    isChatOpenRef.current = isChatOpen
  }, [onStaffMessage, onTicketClosed, isChatOpen])

  useEffect(() => {
    const visible = isChatOpen && document.visibilityState === 'visible'
    setSupportToastSuppressed(ticketId, visible)
    return () => setSupportToastSuppressed(ticketId, false)
  }, [isChatOpen, ticketId])

  const notifyNewStaffMessage = useCallback(
    (mensagem, evtTicketId) => {
      if (!shouldNotifyUser(isChatOpenRef.current)) {
        return
      }
      const tid = evtTicketId ?? ticketId
      addNotification({
        type: 'info',
        title: 'Nova mensagem no suporte',
        message: buildSupportToastMessage(mensagem),
        duration: 8000,
        action: buildSupportNotificationAction(tid),
      })
    },
    [addNotification, ticketId],
  )

  const refreshUnread = useCallback(async () => {
    if (!token) {
      setUnreadCount(0)
      prevUnreadRef.current = 0
      return
    }
    try {
      const res = await supportService.getUnread()
      const n = Number(res.data?.data?.nao_lidas ?? res.data?.nao_lidas ?? 0) || 0
      const prev = prevUnreadRef.current
      if (n > prev && shouldNotifyUser(isChatOpenRef.current)) {
        addNotification({
          type: 'info',
          title: 'Nova mensagem no suporte',
          message: 'Você tem uma nova resposta do farmacêutico.',
          duration: 8000,
          action: buildSupportNotificationAction(ticketId),
        })
      }
      prevUnreadRef.current = n
      setUnreadCount(n)
    } catch {
      /* ignore */
    }
  }, [token, addNotification])

  const markTicketRead = useCallback(async () => {
    if (!ticketId || !token) return
    try {
      await supportService.getById(ticketId)
      await refreshUnread()
    } catch {
      /* ignore */
    }
  }, [ticketId, token, refreshUnread])

  const syncTicketFromApi = useCallback(
    async (id) => {
      if (!id || !token) return
      try {
        const res = await supportService.getById(id)
        const ticket = res.data?.data?.ticket || res.data?.data
        if (!ticket) return

        const msgs = ticket.mensagens || []
        if (msgs.length > lastMsgCountRef.current) {
          const newMsgs = msgs.slice(lastMsgCountRef.current)
          const staffMsgs = newMsgs.filter((m) => m.tipo_remetente !== 'usuario')
          staffMsgs.forEach((m) => {
            onStaffMessageRef.current?.(mapStaffMessage(m))
          })
          if (staffMsgs.length > 0) {
            notifyNewStaffMessage(staffMsgs[staffMsgs.length - 1], id)
          }
          lastMsgCountRef.current = msgs.length
        }

        if (ticket.status === 'encerrada' || ticket.status === 'resolvida') {
          onTicketClosedRef.current?.()
        }
      } catch {
        /* ignore */
      }
    },
    [token, notifyNewStaffMessage],
  )

  useEffect(() => {
    if (!token) return
    refreshUnread()
    const id = setInterval(refreshUnread, UNREAD_POLL_MS)
    return () => clearInterval(id)
  }, [token, refreshUnread])

  useEffect(() => {
    if (!token || !userId || !ticketId) return

    const socket = io(getSocketUrl(), {
      auth: { token },
      transports: SOCKET_TRANSPORTS,
    })

    const onConnect = () => {
      socket.emit('join:support', { ticketId, userId })
    }

    const onMessage = ({ mensagem, ticketId: evtTicketId }) => {
      if (evtTicketId && String(evtTicketId) !== String(ticketId)) return
      const tipo = mensagem?.tipoRemetente ?? mensagem?.tipo_remetente
      if (!mensagem || tipo === 'usuario') return

      onStaffMessageRef.current?.(mapStaffMessage(mensagem))
      lastMsgCountRef.current += 1

      if (shouldNotifyUser(isChatOpenRef.current)) {
        notifyNewStaffMessage(mensagem, evtTicketId)
        refreshUnread()
      } else {
        markTicketRead()
      }
    }

    socket.on('connect', onConnect)
    socket.on('support:message', onMessage)

    const fallbackId = setInterval(() => syncTicketFromApi(ticketId), FALLBACK_TICKET_POLL_MS)

    return () => {
      clearInterval(fallbackId)
      socket.off('connect', onConnect)
      socket.off('support:message', onMessage)
      socket.disconnect()
    }
  }, [
    token,
    userId,
    ticketId,
    notifyNewStaffMessage,
    refreshUnread,
    markTicketRead,
    syncTicketFromApi,
  ])

  useEffect(() => {
    if (isChatOpen && ticketId) {
      markTicketRead()
    }
  }, [isChatOpen, ticketId, markTicketRead])

  return {
    unreadCount,
    refreshUnread,
    markTicketRead,
    syncTicketFromApi,
    setLastMsgCount: (valueOrUpdater) => {
      if (typeof valueOrUpdater === 'function') {
        lastMsgCountRef.current = valueOrUpdater(lastMsgCountRef.current)
      } else {
        lastMsgCountRef.current = valueOrUpdater
      }
    },
  }
}
