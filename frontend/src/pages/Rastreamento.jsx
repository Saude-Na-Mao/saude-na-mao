import { useState, useEffect, lazy, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/store'
import { orderService, deliveryService } from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { Package, MapPin, Truck, CheckCircle, Clock, XCircle, CreditCard } from 'lucide-react'
import { io } from 'socket.io-client'
import { getSocketUrl, SOCKET_TRANSPORTS } from '../config/env'

const DeliveryMap = lazy(() => import('../components/DeliveryMap'))

function pointToLatLng(location) {
  const coords = location?.coordinates
  if (!Array.isArray(coords) || coords.length !== 2) return null
  const [lng, lat] = coords.map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return [lat, lng]
}

function userLocationToLatLng(userLocation) {
  const coords = userLocation?.coordinates
  if (!Array.isArray(coords) || coords.length !== 2) return null
  const [lng, lat] = coords.map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return [lat, lng]
}

function historyPointToLatLng(item) {
  const lat = Number(item?.localizacao?.latitude)
  const lng = Number(item?.localizacao?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return [lat, lng]
}

function latestRoutePoint(delivery) {
  const history = Array.isArray(delivery?.historico_status)
    ? [...delivery.historico_status]
    : []
  history.sort((a, b) => new Date(a?.alterado_em || 0) - new Date(b?.alterado_em || 0))
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const point = historyPointToLatLng(history[i])
    if (point) return point
  }
  return null
}

function addressText(address) {
  if (!address || typeof address !== 'object') return undefined
  return [address.logradouro, address.numero, address.bairro, address.cidade, address.estado]
    .filter(Boolean)
    .join(', ')
}

export default function Rastreamento() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useAuthStore()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [driverLocation, setDriverLocation] = useState(null)
  const [qrCode, setQrCode] = useState(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [deliveryDetail, setDeliveryDetail] = useState(null)

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    loadOrder()
  }, [id, token, navigate])

  // Real-time socket for driver location
  useEffect(() => {
    if (!order || !id) return
    if (['cancelado', 'entregue'].includes(order.status)) return

    const socket = io(getSocketUrl(), {
      auth: { token },
      transports: SOCKET_TRANSPORTS,
    })
    socket.emit('join:order', { orderId: id })
    socket.on('delivery:location', (data) => {
      if (data.latitude && data.longitude) {
        setDriverLocation([data.latitude, data.longitude])
      }
    })
    const onStatus = (data) => {
      const next = data?.novoStatus || data?.status
      if (next) {
        setOrder((prev) => (prev ? { ...prev, status: next } : prev))
      }
    }
    socket.on('order:status', onStatus)
    socket.on('order:status:updated', onStatus)
    return () => socket.disconnect()
  }, [order?.status, id])

  const loadOrder = async () => {
    try {
      setLoading(true)
      const response = await orderService.getById(id)
      const d = response.data?.data
      const pedido = d?.pedido || d || null
      setOrder(pedido)

      const entregaEmb = pedido?.id_entrega && typeof pedido.id_entrega === 'object' ? pedido.id_entrega : null
      const codigoEmb = entregaEmb?.codigo_confirmacao
      const entregaId = pedido?.id_entrega?._id || pedido?.id_entrega

      if (entregaEmb) {
        setDeliveryDetail(entregaEmb)
      } else if (entregaId) {
        try {
          const dr = await deliveryService.getById(String(entregaId))
          setDeliveryDetail(dr.data?.data?.entrega ?? null)
        } catch (err) {
          console.warn('Entrega (código confirmação):', err?.message || err)
          setDeliveryDetail(null)
        }
      } else {
        setDeliveryDetail(null)
      }
    } catch (err) {
      console.error('Erro ao carregar pedido:', err)
      setOrder(null)
      setDeliveryDetail(null)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingSpinner />

  if (!order) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <Alert type="error" message="Pedido não encontrado" />
      </div>
    )
  }

  const codigoParaEntregador =
    (typeof order.id_entrega === 'object' && order.id_entrega?.codigo_confirmacao) ||
    deliveryDetail?.codigo_confirmacao

  const pharmacyLocation =
    pointToLatLng(deliveryDetail?.endereco_coleta?.location) ||
    pointToLatLng(order.id_farmacia?.location)
  const destinationLocation =
    pointToLatLng(deliveryDetail?.endereco_entrega?.location) ||
    pointToLatLng(order.endereco_entrega?.location) ||
    (order.endereco_entrega?.coordenadas
      ? [order.endereco_entrega.coordenadas.lat, order.endereco_entrega.coordenadas.lng]
      : null)
  const fallbackDriverLocation =
    latestRoutePoint(deliveryDetail) ||
    userLocationToLatLng(deliveryDetail?.id_entregador?.dados_entregador?.localizacao_atual) ||
    (order.entregador?.localizacao_atual?.latitude && order.entregador?.localizacao_atual?.longitude
      ? [order.entregador.localizacao_atual.latitude, order.entregador.localizacao_atual.longitude]
      : null)
  const mapDriverLocation = driverLocation || fallbackDriverLocation

  const getStepStatus = (step, currentStatus) => {
    const steps = ['confirmado', 'enviado', 'a_caminho', 'entregue']
    const currentIndex = steps.indexOf(currentStatus)
    const stepIndex = steps.indexOf(step)
    
    if (stepIndex < currentIndex) return 'completed'
    if (stepIndex === currentIndex) return 'current'
    return 'pending'
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <button
        onClick={() => navigate('/pedidos')}
        className="mb-6 text-primary hover:text-secondary font-medium"
      >
        ← Voltar aos Pedidos
      </button>

      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="mb-8 pb-8 border-b">
          <h1 className="text-3xl font-bold mb-4">Rastreamento do Pedido</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-gray-600 text-sm">Número do Pedido</p>
              <p className="font-bold text-lg">#{(order._id || order.id || '').slice(-8).toUpperCase()}</p>
            </div>
            <div>
              <p className="text-gray-600 text-sm">Data do Pedido</p>
              <p className="font-bold text-lg">
                {new Date(order.createdAt || order.dataPedido).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </p>
            </div>
            <div>
              <p className="text-gray-600 text-sm">Valor Total</p>
              <p className="font-bold text-lg text-primary">
                R$ {(order.total || order.valorTotal || 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-8">Status da Entrega</h2>

          {order.status === 'cancelado' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6 flex items-center gap-4">
              <XCircle className="w-10 h-10 text-red-500 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-red-800 text-lg">Pedido Cancelado</h3>
                <p className="text-sm text-red-600">Este pedido foi cancelado e não será entregue.</p>
              </div>
            </div>
          )}

          {order.status === 'aguardando_pagamento' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6 flex items-center gap-4">
              <CreditCard className="w-10 h-10 text-yellow-500 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-yellow-800 text-lg">Aguardando Pagamento</h3>
                <p className="text-sm text-yellow-600">O pedido será processado assim que o pagamento for confirmado.</p>
              </div>
            </div>
          )}

          {order.status === 'em_processamento' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6 flex items-center gap-4">
              <Clock className="w-10 h-10 text-blue-500 flex-shrink-0 animate-pulse" />
              <div>
                <h3 className="font-bold text-blue-800 text-lg">Em Processamento</h3>
                <p className="text-sm text-blue-600">A farmácia está preparando seu pedido.</p>
              </div>
            </div>
          )}
          
          <div className="space-y-6 max-w-2xl">
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  getStepStatus('confirmado', order.status) === 'completed'
                    ? 'bg-green-500 text-white'
                    : getStepStatus('confirmado', order.status) === 'current'
                    ? 'bg-primary text-white animate-pulse'
                    : 'bg-gray-300 text-gray-600'
                }`}>
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div className={`w-1 h-12 ${
                  getStepStatus('enviado', order.status) === 'completed'
                    ? 'bg-green-500'
                    : 'bg-gray-300'
                }`} />
              </div>
              <div className="pt-2">
                <h3 className="font-bold text-lg">Pedido Confirmado</h3>
                <p className="text-gray-600">Seu pedido foi confirmado e está sendo preparado</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  getStepStatus('enviado', order.status) === 'completed'
                    ? 'bg-green-500 text-white'
                    : getStepStatus('enviado', order.status) === 'current'
                    ? 'bg-primary text-white animate-pulse'
                    : 'bg-gray-300 text-gray-600'
                }`}>
                  <Package className="w-6 h-6" />
                </div>
                <div className={`w-1 h-12 ${
                  getStepStatus('a_caminho', order.status) === 'completed' ||
                  getStepStatus('a_caminho', order.status) === 'current'
                    ? 'bg-green-500'
                    : 'bg-gray-300'
                }`} />
              </div>
              <div className="pt-2">
                <h3 className="font-bold text-lg">Enviado para Entrega</h3>
                <p className="text-gray-600">Seu pedido saiu para entrega</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  getStepStatus('a_caminho', order.status) === 'completed'
                    ? 'bg-green-500 text-white'
                    : getStepStatus('a_caminho', order.status) === 'current'
                    ? 'bg-primary text-white animate-pulse'
                    : 'bg-gray-300 text-gray-600'
                }`}>
                  <Truck className="w-6 h-6" />
                </div>
                <div className={`w-1 h-12 ${
                  getStepStatus('entregue', order.status) === 'completed'
                    ? 'bg-green-500'
                    : 'bg-gray-300'
                }`} />
              </div>
              <div className="pt-2">
                <h3 className="font-bold text-lg">A Caminho</h3>
                <p className="text-gray-600">Seu pedido está a caminho do endereço de entrega</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  getStepStatus('entregue', order.status) === 'completed'
                    ? 'bg-green-500 text-white'
                    : getStepStatus('entregue', order.status) === 'current'
                    ? 'bg-primary text-white animate-pulse'
                    : 'bg-gray-300 text-gray-600'
                }`}>
                  <CheckCircle className="w-6 h-6" />
                </div>
              </div>
              <div className="pt-2">
                <h3 className="font-bold text-lg">Entregue</h3>
                <p className="text-gray-600">Seu pedido foi entregue com sucesso</p>
              </div>
            </div>
          </div>
        </div>

        {/* Mapa de rastreamento em tempo real */}
        {order.status !== 'cancelado' && order.status !== 'entregue' && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Rastreamento em Tempo Real
            </h2>
            <Suspense fallback={
              <div className="h-[350px] bg-gray-100 rounded-xl animate-pulse flex items-center justify-center">
                <p className="text-gray-400">Carregando mapa...</p>
              </div>
            }>
              <DeliveryMap
                driverLocation={mapDriverLocation}
                pharmacyLocation={pharmacyLocation}
                destinationLocation={destinationLocation}
                pharmacyName={order.id_farmacia?.nome || order.farmacia?.nome || order.nome_farmacia}
                destinationAddress={
                  addressText(deliveryDetail?.endereco_entrega) ||
                  addressText(order.endereco_entrega)
                }
                status={order.status}
                className="h-[350px]"
              />
            </Suspense>
            {!driverLocation && order.status === 'a_caminho' && (
              <p className="text-xs text-gray-400 mt-2 text-center">
                Aguardando localização do entregador...
              </p>
            )}
          </div>
        )}

        <div className="bg-blue-50 rounded-lg p-6 mb-8">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5" /> Endereço de Entrega
          </h3>
          {typeof order.endereco_entrega === 'object' && order.endereco_entrega ? (
            <>
              <p className="text-gray-700 mb-2">
                {order.endereco_entrega.logradouro}, {order.endereco_entrega.numero}
                {order.endereco_entrega.complemento ? ` - ${order.endereco_entrega.complemento}` : ''}
              </p>
              <p className="text-gray-600 text-sm">
                {order.endereco_entrega.bairro} - {order.endereco_entrega.cidade || 'Goiânia'}/{order.endereco_entrega.estado || 'GO'}
              </p>
            </>
          ) : (
            <p className="text-gray-700">{order.endereco_entrega || 'Retirada na farmácia'}</p>
          )}
        </div>

        {codigoParaEntregador &&
          order.status !== 'entregue' &&
          order.status !== 'cancelado' && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6 mb-8 text-center">
              <p className="text-sm font-medium text-amber-900 mb-2">Código para o entregador confirmar</p>
              <p
                className="text-4xl font-mono font-bold tracking-[0.35em] text-amber-950 mb-2"
                aria-label="Código de confirmação de seis dígitos"
              >
                {codigoParaEntregador}
              </p>
              <p className="text-sm text-amber-800">
                Informe estes 6 dígitos ao entregador quando ele entregar o pedido. Você também pode
                usar o QR Code abaixo, se preferir.
              </p>
            </div>
          )}

        {/* QR Code para confirmação de entrega */}
        {order.status === 'a_caminho' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 mb-8 text-center">
            <h3 className="font-bold text-emerald-800 mb-2 flex items-center justify-center gap-2">
              📱 QR Code de Confirmação
            </h3>
            <p className="text-sm text-emerald-600 mb-4">
              Mostre este QR Code ao entregador para confirmar o recebimento
            </p>
            {qrCode ? (
              <div className="inline-block bg-white p-4 rounded-xl shadow-sm">
                <img src={qrCode} alt="QR Code de entrega" className="w-48 h-48 mx-auto" />
              </div>
            ) : (
              <button
                onClick={async () => {
                  try {
                    setQrLoading(true)
                    const res = await orderService.generateQR(id)
                    setQrCode(res.data?.data?.qrDataUrl)
                  } catch { /* ignore */ } finally { setQrLoading(false) }
                }}
                disabled={qrLoading}
                className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {qrLoading ? 'Gerando...' : 'Gerar QR Code'}
              </button>
            )}
          </div>
        )}

        <div className="mb-8">
          <h3 className="font-bold text-lg mb-4">Itens do Pedido</h3>
          <div className="space-y-3">
            {order.itens?.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center border-b pb-3">
                <span className="font-medium">{item.nome_produto || item.nome || `Item ${idx + 1}`}</span>
                <div className="text-right">
                  <p className="font-semibold">R$ {(item.preco_unitario || item.preco || 0).toFixed(2)}</p>
                  <p className="text-sm text-gray-600">Qty: {item.quantidade || 1}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="font-bold mb-4">Dúvidas?</h3>
          <p className="text-gray-700 mb-4">
            Entre em contato com nosso suporte caso tenha alguma dúvida sobre seu pedido
          </p>
          <div className="flex gap-4">
            <a
              href="tel:0800123456"
              className="px-4 py-2 border border-primary text-primary rounded-lg hover:bg-blue-50 transition font-medium"
            >
              0800 123 456
            </a>
            <button
              onClick={() => navigate('/suporte')}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-secondary transition font-medium"
            >
              Chat com Suporte
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
