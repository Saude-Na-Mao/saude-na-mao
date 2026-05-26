import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/store'
import { deliveryService, orderService } from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import Modal from '../components/Modal'
import {
  Truck, Package, MapPin, Clock, CheckCircle, XCircle,
  Navigation, ChevronRight, RefreshCw, Filter, Star, QrCode
} from 'lucide-react'

const STATUS_CONFIG = {
  disponivel: { label: 'Disponível', color: 'bg-blue-100 text-blue-800', icon: Package },
  aceita: { label: 'Aceita', color: 'bg-indigo-100 text-indigo-800', icon: CheckCircle },
  coletando: { label: 'Coletando', color: 'bg-yellow-100 text-yellow-800', icon: Navigation },
  coletada: { label: 'Coletada', color: 'bg-orange-100 text-orange-800', icon: Package },
  em_transito: { label: 'Em Trânsito', color: 'bg-purple-100 text-purple-800', icon: Truck },
  entregue: { label: 'Entregue', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-800', icon: XCircle },
}

const NEXT_STATUS = {
  aceita: 'coletando',
  coletando: 'coletada',
  coletada: 'em_transito',
}

const NEXT_STATUS_LABEL = {
  aceita: 'Iniciar Coleta',
  coletando: 'Confirmar Coleta',
  coletada: 'Iniciar Entrega',
}

function formatAddress(addr) {
  if (!addr) return 'Endereço não disponível'
  const parts = [addr.logradouro, addr.numero, addr.bairro, addr.cidade, addr.estado].filter(Boolean)
  return parts.join(', ') || 'Endereço não disponível'
}

function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function Entregas() {
  const navigate = useNavigate()
  const { token, user } = useAuthStore()
  const [tab, setTab] = useState('available')
  const [deliveries, setDeliveries] = useState([])
  const [myDeliveries, setMyDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [statusFilter, setStatusFilter] = useState('todos')
  const [confirmModal, setConfirmModal] = useState(null)
  const [confirmCode, setConfirmCode] = useState('')
  const [qrToken, setQrToken] = useState('')
  const [qrConfirmLoading, setQrConfirmLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    if (user?.role !== 'entregador') {
      navigate('/')
      return
    }
    loadData()
  }, [token, user, navigate])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [availRes, myRes] = await Promise.all([
        deliveryService.getAvailable().catch(() => ({ data: { data: [] } })),
        deliveryService.getMy().catch(() => ({ data: { data: [] } })),
      ])
      const avail = availRes.data?.data
      setDeliveries(Array.isArray(avail) ? avail : (avail?.entregas || avail?.docs || []))
      const my = myRes.data?.data
      setMyDeliveries(Array.isArray(my) ? my : (my?.entregas || my?.docs || []))
    } catch (err) {
      setError('Erro ao carregar entregas')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleAccept = async (id) => {
    try {
      setActionLoading(id)
      setError(null)
      await deliveryService.accept(id)
      setSuccess('Entrega aceita com sucesso!')
      await loadData()
      setTab('my')
    } catch (err) {
      setError(err.response?.data?.message || 'Erro ao aceitar entrega')
    } finally {
      setActionLoading(null)
    }
  }

  const handleAdvanceStatus = async (id, novoStatus) => {
    try {
      setActionLoading(id)
      setError(null)
      await deliveryService.updateStatus(id, { novoStatus })
      setSuccess(`Status atualizado para: ${STATUS_CONFIG[novoStatus]?.label || novoStatus}`)
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || 'Erro ao atualizar status')
    } finally {
      setActionLoading(null)
    }
  }

  const handleConfirmDelivery = async () => {
    if (!confirmModal || !confirmCode.trim()) return
    try {
      setActionLoading(confirmModal)
      setError(null)
      await deliveryService.confirm(confirmModal, { codigoConfirmacao: confirmCode.trim() })
      setSuccess('Entrega confirmada com sucesso!')
      setConfirmModal(null)
      setConfirmCode('')
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || 'Código inválido')
    } finally {
      setActionLoading(null)
    }
  }

  const handleConfirmByQR = async () => {
    if (!confirmModal || !qrToken.trim()) return
    try {
      setQrConfirmLoading(true)
      setError(null)
      await orderService.confirmQR(confirmModal, qrToken.trim())
      setSuccess('Entrega confirmada via QR Code!')
      setConfirmModal(null)
      setQrToken('')
      setConfirmCode('')
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || 'Token QR inválido')
    } finally {
      setQrConfirmLoading(false)
    }
  }

  const handleCancel = async (id) => {
    if (!window.confirm('Tem certeza que deseja cancelar esta entrega?')) return
    try {
      setActionLoading(id)
      setError(null)
      await deliveryService.cancel(id, { motivo: 'Cancelado pelo entregador' })
      setSuccess('Entrega cancelada')
      await loadData()
    } catch (err) {
      setError(err.response?.data?.message || 'Erro ao cancelar entrega')
    } finally {
      setActionLoading(null)
    }
  }

  const filteredMyDeliveries = statusFilter === 'todos'
    ? myDeliveries
    : myDeliveries.filter(d => d.status === statusFilter)

  if (loading) return <LoadingSpinner />

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Truck className="w-8 h-8 text-blue-600" />
            Painel de Entregas
          </h1>
          <p className="text-gray-600 mt-1">Gerencie suas entregas e encontre novas</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Alerts */}
      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-blue-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{deliveries.length}</p>
          <p className="text-sm text-blue-600">Disponíveis</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-yellow-700">
            {myDeliveries.filter(d => ['aceita', 'coletando', 'coletada', 'em_transito'].includes(d.status)).length}
          </p>
          <p className="text-sm text-yellow-600">Em Andamento</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-700">
            {myDeliveries.filter(d => d.status === 'entregue').length}
          </p>
          <p className="text-sm text-green-600">Entregues</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-purple-700">
            R$ {myDeliveries.filter(d => d.status === 'entregue').reduce((sum, d) => sum + (d.valor_entrega || 0), 0).toFixed(2)}
          </p>
          <p className="text-sm text-purple-600">Ganhos</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        <button
          onClick={() => setTab('available')}
          className={`px-6 py-3 font-medium transition border-b-2 ${
            tab === 'available'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Package className="w-4 h-4 inline mr-2" />
          Disponíveis ({deliveries.length})
        </button>
        <button
          onClick={() => setTab('my')}
          className={`px-6 py-3 font-medium transition border-b-2 ${
            tab === 'my'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Truck className="w-4 h-4 inline mr-2" />
          Minhas Entregas ({myDeliveries.length})
        </button>
      </div>

      {/* Tab: Available */}
      {tab === 'available' && (
        <>
          {deliveries.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-lg">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg mb-2">Nenhuma entrega disponível no momento</p>
              <p className="text-gray-500 text-sm">Novas entregas aparecerão aqui automaticamente</p>
            </div>
          ) : (
            <div className="space-y-4">
              {deliveries.map((delivery) => (
                <div key={delivery._id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition border-l-4 border-blue-500">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-gray-500">
                          #{(delivery._id || '').slice(-8).toUpperCase()}
                        </span>
                        {delivery.distancia_km && (
                          <span className="text-sm bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                            {delivery.distancia_km.toFixed(1)} km
                          </span>
                        )}
                        {delivery.valor_entrega > 0 && (
                          <span className="text-sm bg-green-50 text-green-700 px-2 py-0.5 rounded font-semibold">
                            R$ {delivery.valor_entrega.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-500">Coleta</p>
                            <p className="text-gray-700">{formatAddress(delivery.endereco_coleta)}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-500">Entrega</p>
                            <p className="text-gray-700">{formatAddress(delivery.endereco_entrega)}</p>
                          </div>
                        </div>
                      </div>
                      {delivery.tempo_estimado_min && (
                        <p className="text-sm text-gray-500 flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          Tempo estimado: {delivery.tempo_estimado_min} min
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleAccept(delivery._id)}
                      disabled={actionLoading === delivery._id}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                    >
                      {actionLoading === delivery._id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Aceitar Entrega
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab: My Deliveries */}
      {tab === 'my' && (
        <>
          {/* Status Filter */}
          <div className="mb-4 flex flex-wrap gap-2">
            {['todos', 'aceita', 'coletando', 'coletada', 'em_transito', 'entregue', 'cancelada'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  statusFilter === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s === 'todos' ? 'Todos' : STATUS_CONFIG[s]?.label || s}
              </button>
            ))}
          </div>

          {filteredMyDeliveries.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-lg">
              <Truck className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg mb-2">Nenhuma entrega encontrada</p>
              <button
                onClick={() => { setStatusFilter('todos'); setTab('available'); }}
                className="text-blue-600 hover:underline"
              >
                Ver entregas disponíveis
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredMyDeliveries.map((delivery) => {
                const config = STATUS_CONFIG[delivery.status] || STATUS_CONFIG.disponivel
                const StatusIcon = config.icon
                const nextStatus = NEXT_STATUS[delivery.status]
                const nextLabel = NEXT_STATUS_LABEL[delivery.status]
                const isActive = ['aceita', 'coletando', 'coletada', 'em_transito'].includes(delivery.status)

                return (
                  <div
                    key={delivery._id}
                    className={`bg-white rounded-lg shadow-md p-6 transition ${
                      isActive ? 'border-l-4 border-yellow-500 hover:shadow-lg' : ''
                    }`}
                  >
                    <div className="flex flex-col gap-4">
                      {/* Header */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono text-gray-500">
                            #{(delivery._id || '').slice(-8).toUpperCase()}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${config.color}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {config.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Clock className="w-4 h-4" />
                          {formatDate(delivery.createdAt)}
                        </div>
                      </div>

                      {/* Addresses */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-start gap-2 bg-green-50 p-3 rounded-lg">
                          <MapPin className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-green-700">Coleta</p>
                            <p className="text-gray-700">{formatAddress(delivery.endereco_coleta)}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 bg-red-50 p-3 rounded-lg">
                          <MapPin className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-red-700">Entrega</p>
                            <p className="text-gray-700">{formatAddress(delivery.endereco_entrega)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Info row */}
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                        {delivery.distancia_km > 0 && (
                          <span className="flex items-center gap-1">
                            <Navigation className="w-4 h-4" />
                            {delivery.distancia_km.toFixed(1)} km
                          </span>
                        )}
                        {delivery.valor_entrega > 0 && (
                          <span className="flex items-center gap-1 font-semibold text-green-700">
                            R$ {delivery.valor_entrega.toFixed(2)}
                          </span>
                        )}
                        {delivery.tempo_estimado_min > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            ~{delivery.tempo_estimado_min} min
                          </span>
                        )}
                        {delivery.avaliacao_cliente?.nota && (
                          <span className="flex items-center gap-1 text-yellow-600">
                            <Star className="w-4 h-4 fill-current" />
                            {delivery.avaliacao_cliente.nota}/5
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      {isActive && (
                        <div className="flex flex-wrap gap-3 pt-2 border-t">
                          {nextStatus && (
                            <button
                              onClick={() => handleAdvanceStatus(delivery._id, nextStatus)}
                              disabled={actionLoading === delivery._id}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 flex items-center gap-2"
                            >
                              {actionLoading === delivery._id ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                              {nextLabel}
                            </button>
                          )}
                          {delivery.status === 'em_transito' && (
                            <button
                              onClick={() => setConfirmModal(delivery._id)}
                              disabled={actionLoading === delivery._id}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 flex items-center gap-2"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Confirmar Entrega
                            </button>
                          )}
                          <button
                            onClick={() => handleCancel(delivery._id)}
                            disabled={actionLoading === delivery._id}
                            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition font-medium disabled:opacity-50 flex items-center gap-2"
                          >
                            <XCircle className="w-4 h-4" />
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Confirm Delivery Modal */}
      <Modal isOpen={!!confirmModal} onClose={() => { setConfirmModal(null); setConfirmCode(''); setQrToken(''); }} title="Confirmar Entrega" size="sm">
        <p className="text-gray-600 text-sm mb-4">
          Escolha uma das opções para confirmar a entrega:
        </p>

        {/* Option 1: Confirmation Code */}
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm font-medium text-gray-700 mb-2">Código de 6 dígitos</p>
          <input
            type="text"
            value={confirmCode}
            onChange={(e) => setConfirmCode(e.target.value)}
            placeholder="000000"
            maxLength={6}
            className="w-full px-4 py-3 border rounded-lg text-center text-2xl tracking-widest font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="Código de confirmação"
          />
          <button
            onClick={handleConfirmDelivery}
            disabled={confirmCode.length < 6 || actionLoading === confirmModal}
            className="w-full mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {actionLoading === confirmModal ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Confirmar com Código
          </button>
        </div>

        {/* Option 2: QR Token */}
        <div className="p-4 bg-emerald-50 rounded-lg">
          <p className="text-sm font-medium text-emerald-700 mb-2 flex items-center gap-1">
            <QrCode className="w-4 h-4" /> Token do QR Code
          </p>
          <input
            type="text"
            value={qrToken}
            onChange={(e) => setQrToken(e.target.value)}
            placeholder="Cole o token do QR Code aqui"
            className="w-full px-4 py-3 border border-emerald-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            aria-label="Token QR Code"
          />
          <button
            onClick={handleConfirmByQR}
            disabled={!qrToken.trim() || qrConfirmLoading}
            className="w-full mt-3 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {qrConfirmLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
            Confirmar via QR
          </button>
        </div>

        <button
          onClick={() => { setConfirmModal(null); setConfirmCode(''); setQrToken(''); }}
          className="w-full mt-4 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
        >
          Cancelar
        </button>
      </Modal>
    </div>
  )
}
