import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUiStore, useAuthStore, usePrescriptionStore } from '../stores/store'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { io } from 'socket.io-client'
import { getSocketUrl, SOCKET_TRANSPORTS } from '../config/env'
import { getClientOrderStatusPresentation } from '../utils/orderStatusDisplay'
import {
  buildSupportToastMessage,
  shouldSuppressSupportToast,
} from '../utils/supportTicketStorage'
import {
  buildOrderNotificationAction,
  buildSupportNotificationAction,
  buildPrescriptionNotificationAction,
  buildPrescriptionChatNotificationAction,
  resolveNotificationPath,
} from '../utils/notificationNavigation'

const ICON_MAP = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const COLOR_MAP = {
  success: 'bg-emerald-50 border-emerald-400 text-emerald-800',
  error: 'bg-red-50 border-red-400 text-red-800',
  warning: 'bg-yellow-50 border-yellow-400 text-yellow-800',
  info: 'bg-blue-50 border-blue-400 text-blue-800',
}

export default function NotificationToast() {
  const navigate = useNavigate()
  const { notifications, removeNotification, addNotification } = useUiStore()
  const { token, user } = useAuthStore()
  const atualizarStatusPorId = usePrescriptionStore(
    (s) => s.atualizarStatusPorId,
  )

  const onToastClick = useCallback(
    (notification) => {
      const target = resolveNotificationPath(notification.action)
      if (!target) return
      removeNotification(notification.id)
      navigate(target.pathname, { state: target.state })
    },
    [navigate, removeNotification],
  )

  useEffect(() => {
    if (!token || !user?.id) return

    const socket = io(getSocketUrl(), {
      auth: { token },
      transports: SOCKET_TRANSPORTS,
    })

    socket.on('connect', () => {
      socket.emit('join:user', user.id)
    })

    socket.on('order:status', (data) => {
      const novoStatus = data?.novoStatus || data?.status
      if (!novoStatus) return
      const { label } = getClientOrderStatusPresentation({ status: novoStatus })
      const orderRef = data?.orderId
        ? `#${String(data.orderId).slice(-8).toUpperCase()}`
        : ''
      const terminal = ['cancelado', 'rejeitado'].includes(novoStatus)
      addNotification({
        type: terminal ? 'error' : 'success',
        title: 'Pedido atualizado',
        message: orderRef
          ? `Pedido ${orderRef}: ${label}`
          : `Seu pedido está: ${label}`,
        action: buildOrderNotificationAction(data?.orderId),
      })
    })

    // Novo evento padronizado de roteamento
    socket.on('prescription:status', (data) => {
      const { prescriptionId, novoStatus, observacoes, validade } = data || {}

      if (novoStatus === 'Aprovada') {
        addNotification({
          type: 'success',
          title: '✅ Receita aprovada!',
          message: 'Sua receita foi aprovada. Agora você pode finalizar a compra.',
          duration: 8000,
          action: buildPrescriptionNotificationAction(prescriptionId),
        })
      } else if (novoStatus === 'Rejeitada') {
        addNotification({
          type: 'error',
          title: '❌ Receita rejeitada',
          message: observacoes || 'Sua receita foi rejeitada. Envie uma nova.',
          duration: 10000,
          action: buildPrescriptionNotificationAction(prescriptionId),
        })
      } else if (novoStatus === 'Expirada') {
        addNotification({
          type: 'warning',
          title: 'Receita expirada',
          message: 'Sua receita venceu. Por favor envie uma nova.',
          duration: 8000,
          action: buildPrescriptionNotificationAction(prescriptionId),
        })
      }

      // Atualiza o store local — Carrinho re-renderiza automaticamente
      if (prescriptionId) {
        atualizarStatusPorId(prescriptionId, {
          status: novoStatus,
          observacoes,
          validade,
        })
      }
    })

    socket.on('prescription:chat_message', (data) => {
      const preview = String(data?.texto || '').trim()
      addNotification({
        type: 'info',
        title: 'Nova mensagem na receita',
        message: preview
          ? preview.slice(0, 120) + (preview.length > 120 ? '…' : '')
          : 'O farmacêutico enviou uma mensagem na validação da sua receita.',
        duration: 8000,
        action: buildPrescriptionChatNotificationAction(data?.prescriptionId),
      })
    })

    socket.on('support:message', (data) => {
      const mensagem = data?.mensagem
      const evtTicketId = data?.ticketId
      const tipo = mensagem?.tipoRemetente ?? mensagem?.tipo_remetente
      if (!mensagem || tipo === 'usuario') return
      if (shouldSuppressSupportToast(evtTicketId)) return

      addNotification({
        type: 'info',
        title: 'Nova mensagem no suporte',
        message: buildSupportToastMessage(mensagem),
        duration: 8000,
        action: buildSupportNotificationAction(evtTicketId),
      })
    })

    return () => {
      socket.disconnect()
    }
  }, [token, user?.id, addNotification, atualizarStatusPorId])

  if (notifications.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {notifications.map((n) => {
        const Icon = ICON_MAP[n.type] || Info
        const colors = COLOR_MAP[n.type] || COLOR_MAP.info
        const clickable = Boolean(n.action && resolveNotificationPath(n.action))
        return (
          <div
            key={n.id}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? () => onToastClick(n) : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onToastClick(n)
                    }
                  }
                : undefined
            }
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-lg animate-slide-in ${colors} ${
              clickable ? 'cursor-pointer hover:opacity-95' : ''
            }`}
          >
            <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              {n.title && <p className="font-semibold text-sm">{n.title}</p>}
              <p className="text-sm opacity-90">{n.message}</p>
              {clickable && (
                <p className="text-xs mt-1 opacity-70 underline">Toque para abrir</p>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeNotification(n.id)
              }}
              className="flex-shrink-0 hover:opacity-70 transition"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
