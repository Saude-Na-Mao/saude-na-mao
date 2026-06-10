import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import { getSocketUrl, SOCKET_TRANSPORTS } from '../config/env'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../stores/store'
import { useUiStore } from '../stores/store'
import { orderService, paymentService } from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import ReviewModal from '../components/ReviewModal'
import DeliveryReviewModal from '../components/DeliveryReviewModal'
import { Package, MapPin, Calendar, Truck, FileText, RefreshCw, AlertCircle, Star, RotateCcw, CheckCircle, Clock } from 'lucide-react'
import {
  PEDIDOS_TAB,
  orderMatchesPedidosTab,
  getClientOrderStatusPresentation,
  getOrderCancellationReason,
  getOrderProgressSteps,
} from '../utils/orderStatusDisplay'

const REFRESH_INTERVAL_MS = 30000
const TERMINAL_ORDER_STATUSES = ['entregue', 'cancelado', 'rejeitado']

function resolveOrderId(order) {
  const raw = order?._id ?? order?.id
  if (raw == null || raw === '') return ''
  if (typeof raw === 'object') {
    if (raw.$oid) return String(raw.$oid)
    try {
      return String(raw)
    } catch {
      return ''
    }
  }
  return String(raw)
}

function isPedidoRetiradaOuDriveThru(order) {
  const t = String(order?.tipo_entrega || '')
    .trim()
    .toLowerCase()
  return t === 'retirada' || t === 'drive-thru'
}

function resolveDeliveryId(order) {
  const raw = order?.id_entrega
  if (raw == null || raw === '') return ''
  if (typeof raw === 'object') {
    const id = raw._id ?? raw.id
    if (id != null && id !== '') return String(id)
  }
  return String(raw)
}

function needsDeliveryRatingForOrder(order) {
  const id = resolveDeliveryId(order)
  return Boolean(id) && !isPedidoRetiradaOuDriveThru(order)
}

/** Só a avaliação na entrega (Delivery); não usar `order.avaliado_em` — legado/seed marcava pedido sem avaliação real na entrega. */
function isDeliveryRatedByClient(order) {
  return Boolean(order?.id_entrega?.avaliacao_cliente?.avaliado_em)
}

/** Farmácia concluída para este pedido: campo novo OU legado (review global + retirada OU + entrega avaliada). */
function pharmacyStepCompleteForOrder(order) {
  const v = order?.farmacia_avaliada_em
  if (v != null && v !== '') return true
  if (order?.cliente_avaliou_farmacia !== true) return false
  if (isPedidoRetiradaOuDriveThru(order)) return true
  return isDeliveryRatedByClient(order)
}

/** Farmácia + entrega (quando houver entrega) já avaliados — esconder o botão Avaliar. */
function isOrderRatingComplete(order) {
  if (order?.status !== 'entregue') return true
  const pharmacyOk = pharmacyStepCompleteForOrder(order)
  const deliveryOk = !needsDeliveryRatingForOrder(order) || isDeliveryRatedByClient(order)
  return pharmacyOk && deliveryOk
}

function shouldShowAvaliarButton(order) {
  return String(order?.status || '').trim() === 'entregue' && !isOrderRatingComplete(order)
}

function openRatingFlow(order, setReviewOrder, setDeliveryReview) {
  const pharmacyOk = pharmacyStepCompleteForOrder(order)
  const needDelivery = needsDeliveryRatingForOrder(order)
  const deliveryOk = isDeliveryRatedByClient(order)

  if (!pharmacyOk) {
    setReviewOrder(order)
    return
  }
  if (needDelivery && !deliveryOk) {
    setDeliveryReview({
      deliveryId: resolveDeliveryId(order),
      driverName:
        order.entregador?.nome || order.id_entrega?.entregador?.nome || 'Entregador',
    })
  }
}

export default function Pedidos() {
  const navigate = useNavigate()
  const { token, user } = useAuthStore()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState(PEDIDOS_TAB.todos)
  const [reviewOrder, setReviewOrder] = useState(null)
  const [deliveryReview, setDeliveryReview] = useState(null)
  const [processingPaymentOrderId, setProcessingPaymentOrderId] = useState(null)
  const addNotification = useUiStore(s => s.addNotification)

  const loadOrders = useCallback(async ({ silent } = {}) => {
    try {
      if (!silent) setLoading(true)
      const response = await orderService.getAll(
        silent ? { _nc: Date.now() } : {},
      )
      const data = response.data?.data
      const list = Array.isArray(data) ? data : (data?.pedidos || data?.docs || [])
      setOrders(list)
    } catch (err) {
      console.error('Erro ao carregar pedidos:', err)
      setError(err?.message || 'Não foi possível carregar seus pedidos')
      setOrders([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const loadOrdersRef = useRef(loadOrders)
  const hasActiveOrdersRef = useRef(false)

  useEffect(() => {
    loadOrdersRef.current = loadOrders
  }, [loadOrders])

  useEffect(() => {
    hasActiveOrdersRef.current = orders.some(
      (o) => !TERMINAL_ORDER_STATUSES.includes(String(o?.status || '').trim()),
    )
  }, [orders])

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    loadOrders()
  }, [token, navigate, loadOrders])

  useEffect(() => {
    if (!token || !user?.id) return

    const socket = io(getSocketUrl(), {
      auth: { token },
      transports: SOCKET_TRANSPORTS,
    })

    socket.on('connect', () => {
      socket.emit('join:user', user.id)
    })

    socket.on('order:status', () => {
      loadOrdersRef.current?.({ silent: true })
    })

    return () => {
      socket.disconnect()
    }
  }, [token, user?.id])

  useEffect(() => {
    if (!token) return

    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (!hasActiveOrdersRef.current) return
      loadOrdersRef.current?.({ silent: true })
    }

    const intervalId = setInterval(tick, REFRESH_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [token])

  const filteredOrders = orders.filter((o) => orderMatchesPedidosTab(o, filter))

  const handleTestPayment = async (orderId) => {
    const id = orderId != null ? String(orderId) : ''
    if (!id || id === 'undefined') {
      setError('Pedido inválido. Recarregue a página e tente de novo.')
      return
    }
    try {
      setError(null)
      setProcessingPaymentOrderId(id)
      const res = await paymentService.confirmTest(id)
      const pedidoResp = res.data?.data?.pedido
      const st = pedidoResp?.status
      let msg =
        'Pagamento registrado. Aguarde a farmácia validar o pedido; depois ela cria a entrega para o entregador aceitar.'
      if (st === 'em_processamento') {
        msg =
          'Pagamento ok. A farmácia confirmou a separação. A entrega deve aparecer para o entregador; ao aceitar, o status passa a “Enviado”.'
      } else if (st === 'confirmado') {
        msg = 'Entregador atribuído. Acompanhe em “Enviado”.'
      } else if (pedidoResp?.status_pagamento === 'aprovado' && st === 'aguardando_pagamento') {
        msg =
          'Pagamento ok. O pedido ainda aguarda a validação do farmacêutico antes de liberar a entrega.'
      }
      addNotification({
        type: 'success',
        title: 'Pagamento confirmado',
        message: msg,
        duration: 10000,
      })
      setFilter(PEDIDOS_TAB.todos)
      await loadOrders({ silent: true })
    } catch (err) {
      console.error('confirmTestPayment', err)
      setError(err?.message || 'Não foi possível confirmar pagamento')
    } finally {
      setProcessingPaymentOrderId(null)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Meus Pedidos</h1>

      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { key: PEDIDOS_TAB.todos, label: 'Todos' },
          { key: PEDIDOS_TAB.aguardando, label: 'Aguardando' },
          { key: PEDIDOS_TAB.farmaciaConfirmada, label: 'Confirmado' },
          { key: PEDIDOS_TAB.enviado, label: 'Enviado' },
          { key: PEDIDOS_TAB.entregue, label: 'Entregue' },
          { key: PEDIDOS_TAB.cancelado, label: 'Cancelado' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              filter === key
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-700 font-medium mb-3">{error}</p>
          <button
            onClick={() => { setError(null); loadOrders() }}
            className="inline-flex items-center gap-2 bg-red-600 text-white px-5 py-2 rounded-lg hover:bg-red-700 transition"
          >
            <RefreshCw className="w-4 h-4" /> Tentar novamente
          </button>
        </div>
      )}

      {filteredOrders.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-lg">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg mb-4">
            Nenhum pedido encontrado
          </p>
          <Link
            to="/produtos"
            className="inline-block bg-primary text-white px-6 py-2 rounded-lg hover:bg-secondary transition"
          >
            Começar Compra
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const oid = resolveOrderId(order)
            const statusUi = getClientOrderStatusPresentation(order)
            const cancelReason =
              order.status === 'cancelado' || order.status === 'rejeitado'
                ? getOrderCancellationReason(order)
                : null
            return (
            <div
              key={oid || order._id || order.id}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition"
            >
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                <div>
                  <p className="text-sm text-gray-600">Pedido</p>
                  <p className="text-lg font-bold">
                    #{oid ? oid.slice(-8).toUpperCase() : '—'}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-600 flex items-center gap-1">
                    <Calendar className="w-4 h-4" /> Data
                  </p>
                  <p className="font-semibold">
                    {new Date(order.createdAt || order.dataPedido).toLocaleDateString('pt-BR')}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-600">Total</p>
                  <p className="text-lg font-bold text-primary">
                    R$ {(order.total || order.valorTotal || 0).toFixed(2)}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${statusUi.color}`}>
                    {statusUi.label}
                  </span>
                  {cancelReason && (
                    <p className="mt-2 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-left max-w-md">
                      <span className="font-semibold text-gray-700">Motivo do cancelamento:</span>{' '}
                      {cancelReason}
                    </p>
                  )}
                </div>

                <div className="text-right space-y-2">
                  <Link
                    to={`/pedido/${oid}/comprovante`}
                    className="inline-flex items-center gap-2 border border-primary text-primary px-4 py-2 rounded-lg hover:bg-primary/5 transition w-full justify-center"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Comprovante</span>
                  </Link>
                  <Link
                    to={`/rastreamento/${oid}`}
                    className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-secondary transition w-full justify-center"
                  >
                    <Truck className="w-4 h-4" />
                    <span>Rastrear</span>
                  </Link>
                  {shouldShowAvaliarButton(order) && (
                    <button
                      type="button"
                      onClick={() => openRatingFlow(order, setReviewOrder, setDeliveryReview)}
                      className="inline-flex items-center gap-2 border border-yellow-400 text-yellow-700 px-4 py-2 rounded-lg hover:bg-yellow-50 transition w-full justify-center"
                    >
                      <Star className="w-4 h-4" />
                      <span>Avaliar</span>
                    </button>
                  )}
                  {order.status === 'entregue' && (
                    <button
                      onClick={() => {
                        const reorderItems = (order.itens || []).map(i => ({
                          id: i.id_produto,
                          nome: i.nome_produto || i.nome,
                          preco: i.preco_unitario,
                          quantity: i.quantidade,
                          id_farmacia: order.id_farmacia?._id || order.id_farmacia,
                        }))
                        localStorage.setItem('reorder_items', JSON.stringify(reorderItems))
                        navigate('/carrinho')
                      }}
                      className="inline-flex items-center gap-2 border border-emerald-400 text-emerald-700 px-4 py-2 rounded-lg hover:bg-emerald-50 transition w-full justify-center"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Reordenar</span>
                    </button>
                  )}
                  {order.status === 'aguardando_pagamento' &&
                    order.status_pagamento !== 'aprovado' && (
                    <div className="w-full space-y-1.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                          <Clock className="w-3 h-3" />
                          Pagamento pendente
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTestPayment(oid)}
                        disabled={processingPaymentOrderId === oid}
                        className="inline-flex items-center justify-center gap-2 bg-primary text-white px-4 py-2.5 rounded-lg hover:bg-secondary transition w-full disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm font-semibold">
                          {processingPaymentOrderId === oid ? 'Processando...' : 'Confirmar pagamento'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {!['cancelado', 'rejeitado'].includes(String(order.status || '').trim()) && (
                <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-3">Status do pedido</p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {getOrderProgressSteps(order).map((step) => (
                      <div
                        key={step.id}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold border ${
                          step.state === 'completed'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : step.state === 'current'
                            ? 'bg-primary/10 border-primary/20 text-primary'
                            : 'bg-white border-gray-200 text-gray-500'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {step.state === 'completed' ? (
                            <CheckCircle className="w-3.5 h-3.5" />
                          ) : (
                            <Clock className="w-3.5 h-3.5" />
                          )}
                          <span>{step.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isPedidoRetiradaOuDriveThru(order) &&
                order.status === 'em_processamento' &&
                order.status_pagamento === 'aprovado' && (
                <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                  <p className="text-sm font-semibold text-emerald-900">Código para retirar na farmácia</p>
                  <p className="text-3xl font-mono font-bold tracking-[0.2em] text-emerald-800 mt-2">
                    {order.codigo_retirada || '···'}
                  </p>
                  {!order.codigo_retirada && (
                    <p className="text-xs text-emerald-900/80 mt-2">
                      Se ainda não apareceu, aguarde a farmácia confirmar a separação ou atualize a página.
                    </p>
                  )}
                  {order.codigo_retirada && (
                    <p className="text-xs text-emerald-800/80 mt-2">Mostre este número no balcão ao retirar.</p>
                  )}
                </div>
              )}

              {isPedidoRetiradaOuDriveThru(order) &&
                order.status === 'aguardando_pagamento' &&
                order.status_pagamento === 'aprovado' && (
                <div className="mt-4 text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
                  Quando a farmácia confirmar a separação, seu <strong>código de retirada</strong> aparecerá aqui.
                </div>
              )}

              {!isPedidoRetiradaOuDriveThru(order) &&
                typeof order.id_entrega === 'object' &&
                order.id_entrega?.codigo_confirmacao &&
                !['entregue', 'cancelado', 'rejeitado'].includes(order.status) && (
                <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-sm font-semibold text-amber-900">Código para o entregador (entrega)</p>
                  <p className="text-3xl font-mono font-bold tracking-[0.35em] text-amber-950 mt-2">
                    {order.id_entrega.codigo_confirmacao}
                  </p>
                  <p className="text-xs text-amber-900/85 mt-2">
                    Informe estes 6 dígitos ao entregador ao receber o pedido. O mesmo código aparece em{' '}
                    <strong>Rastrear</strong>.
                  </p>
                </div>
              )}

              {order.itens && order.itens.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-600 mb-2">
                    {order.itens.length} item{order.itens.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {order.itens.slice(0, 3).map((item, idx) => (
                      <span
                        key={idx}
                        className="text-xs bg-gray-100 px-2 py-1 rounded truncate max-w-xs"
                      >
                        {item.nome_produto || item.nome || `Item ${idx + 1}`}
                      </span>
                    ))}
                    {order.itens.length > 3 && (
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                        +{order.itens.length - 3} mais
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}

      {reviewOrder && (
        <ReviewModal
          pharmacyId={reviewOrder.id_farmacia?._id || reviewOrder.id_farmacia}
          pharmacyName={reviewOrder.id_farmacia?.nome || 'Farmácia'}
          orderId={resolveOrderId(reviewOrder) || undefined}
          onClose={() => setReviewOrder(null)}
          onSuccess={() => {
            addNotification({
              type: 'success',
              title: 'Avaliação enviada!',
              message: 'Obrigado pelo seu feedback',
            })
            const deliveryId = resolveDeliveryId(reviewOrder)
            if (deliveryId && !isPedidoRetiradaOuDriveThru(reviewOrder)) {
              const driverName =
                reviewOrder.entregador?.nome ||
                reviewOrder.id_entrega?.entregador?.nome ||
                'Entregador'
              setDeliveryReview({ deliveryId, driverName })
            }
            void loadOrders({ silent: true })
          }}
        />
      )}

      {deliveryReview && (
        <DeliveryReviewModal
          deliveryId={deliveryReview.deliveryId}
          driverName={deliveryReview.driverName}
          onClose={() => setDeliveryReview(null)}
          onSuccess={() => {
            addNotification({
              type: 'success',
              title: 'Entregador avaliado!',
              message: 'Obrigado por avaliar a entrega',
            })
            void loadOrders({ silent: true })
          }}
        />
      )}
    </div>
  )
}
