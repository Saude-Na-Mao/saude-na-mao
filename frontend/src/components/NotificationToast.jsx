import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUiStore, useAuthStore, usePrescriptionStore, useCartStore } from '../stores/store'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { io } from 'socket.io-client'
import { getSocketUrl, SOCKET_TRANSPORTS } from '../config/env'
import { productService } from '../services/api'
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

function getPharmacyId(pharmacyOrId) {
  return pharmacyOrId?._id || pharmacyOrId?.id || pharmacyOrId || null
}

function normalizePrescriptionCartProduct(produto, fallbackPharmacyId) {
  if (!produto) return null
  const pharmacy = produto.id_farmacia
  const precoBase = Number(produto.preco || 0)
  const precoPromo = Number(produto.preco_promocional)
  const preco =
    Number.isFinite(precoPromo) && precoPromo > 0 && precoPromo < precoBase
      ? precoPromo
      : precoBase

  return {
    id: produto._id || produto.id,
    nome: produto.nome,
    preco,
    imagem: produto.imagem || produto.imagem_url || produto.imagens?.[0],
    controlado: produto.controlado,
    receita_obrigatoria: produto.receita_obrigatoria,
    classificacao_receita: produto.classificacao_receita || 'sem_receita',
    id_farmacia: getPharmacyId(pharmacy) || fallbackPharmacyId,
    nome_farmacia: pharmacy?.nome || 'Farmácia',
    quantity: 1,
  }
}

export default function NotificationToast() {
  const navigate = useNavigate()
  const { notifications, removeNotification, addNotification } = useUiStore()
  const { token, user } = useAuthStore()
  const atualizarStatusPorId = usePrescriptionStore(
    (s) => s.atualizarStatusPorId,
  )
  const setPrescricaoFarmacia = usePrescriptionStore(
    (s) => s.setPrescricaoFarmacia,
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
        if (data?.id_produto) {
          productService
            .getById(data.id_produto)
            .then((response) => {
              const produto =
                response?.data?.data?.produto || response?.data?.data || response?.data
              const cartProduct = normalizePrescriptionCartProduct(
                produto,
                data?.id_farmacia,
              )
              if (!cartProduct?.id) return

              const cartState = useCartStore.getState()
              const alreadyInCart = cartState.items.some(
                (item) => String(item.id) === String(cartProduct.id),
              )
              if (alreadyInCart) return

              const result = cartState.addItem(cartProduct)
              if (result?.pharmacyConflict) {
                cartState.replaceCartWithItem(cartProduct)
              }
            })
            .catch(() => {})
        }

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
      if (data?.id_farmacia && prescriptionId) {
        setPrescricaoFarmacia(data.id_farmacia, {
          _id: prescriptionId,
          status: novoStatus,
          observacoes,
          validade,
          id_farmacia: data.id_farmacia,
          id_produto: data?.id_produto || null,
          disponivel_para_novo_pedido:
            data?.disponivel_para_novo_pedido !== false,
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
  }, [
    token,
    user?.id,
    addNotification,
    atualizarStatusPorId,
    setPrescricaoFarmacia,
  ])

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
