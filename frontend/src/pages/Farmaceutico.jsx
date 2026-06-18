import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore, useUiStore } from '../stores/store'
import {
  prescriptionService,
  supportService,
  pharmacyOwnerService,
  medicineCatalogService,
  productService,
  pharmacistService,
  authService,
  pharmacyService,
  orderService,
  reviewService,
} from '../services/api'
import Alert from '../components/Alert'
import FarmaciaEnderecoPanel from '../components/FarmaciaEnderecoPanel'
import ImageCropUploadField from '../components/ImageCropUploadField'
import {
  FileText, MessageSquare, Clock, ChevronDown, ChevronUp, User,
  RefreshCw, Package, ShoppingCart, Plus, Edit2, XCircle, Users, AlertTriangle,
  ClipboardList, Eye, MapPin, Star, LayoutDashboard, TrendingUp, DollarSign, Search, Menu, X,
  BarChart3, Download, ArrowUpDown,
} from 'lucide-react'
import {
  ConversionFunnelCard,
  DeliveryTypeChart,
  MonthlyRevenueChart,
  OrdersByStatusChart,
  PrescriptionMixChart,
} from '../components/owner/OwnerAnalyticsBlocks'
import {
  CATEGORIAS_MEDICAMENTO,
  CATEGORIAS_OUTROS_ITENS,
  productTipoLabel,
} from '../constants/produtoCadastro'
import {
  getOrderDisplayStatusKey,
  getOrderCancellationReason,
  isPreparandoEnvioSemEntregador,
} from '../utils/orderStatusDisplay'
import { isSngpcProduct } from '../utils/compliance'
import { io } from 'socket.io-client'
import { getSocketUrl } from '../config/env'

const PHARMACY_ORDERS_SOCKET_REFRESH = 'ssm:pharmacy-orders-refresh'

const OWNER_NAV_GROUPS = [
  {
    title: 'Visão geral',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Loja',
    items: [
      { id: 'historico', label: 'Histórico', icon: ShoppingCart },
      { id: 'endereco', label: 'Endereço da loja', icon: MapPin },
      { id: 'produtos', label: 'Estoque / Cadastrar Produtos', icon: Package },
      { id: 'farmaceuticos', label: 'Farmacêuticos', icon: Users },
    ],
  },
  {
    title: 'Históricos',
    items: [
      { id: 'chats', label: 'Chats dos farmacêuticos', icon: MessageSquare },
      { id: 'receitas', label: 'Receitas', icon: FileText },
      { id: 'avaliacoes', label: 'Avaliações', icon: Star },
    ],
  },
]

export default function Farmaceutico() {
  const navigate = useNavigate()
  const { user, token, isAuthenticated, setUser } = useAuthStore()
  const isOwner = user?.role === 'dono_farmacia'
  const [activeTab, setActiveTab] = useState(isOwner ? 'dashboard' : 'historico')
  const [resolvedPharmacyId, setResolvedPharmacyId] = useState(null)
  const [resolvingPharmacy, setResolvingPharmacy] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const extractPharmacyId = (targetUser) => {
    const ownerFarm = targetUser?.dados_dono_farmacia?.id_farmacia
    const pharmacistFarm = targetUser?.dados_farmaceutico?.id_farmacia
    const directFarm = targetUser?.id_farmacia
    const raw = ownerFarm || pharmacistFarm || directFarm || null
    if (!raw) return null
    if (typeof raw === 'object') return raw?._id || raw?.id || null
    return raw
  }

  const pharmacyId = resolvedPharmacyId || extractPharmacyId(user)

  useEffect(() => {
    if (!token || !pharmacyId) return undefined

    const socket = io(getSocketUrl(), {
      auth: { token },
      transports: ['websocket'],
    })

    const onConnect = () => {
      socket.emit('join:pharmacy', { pharmacyId: String(pharmacyId) })
    }
    socket.on('connect', onConnect)

    const onPending = () => {
      useUiStore.getState().addNotification({
        type: 'info',
        title: 'Novo pedido na fila',
        message: 'Abra o Histórico de pedidos para confirmar ou rejeitar.',
        duration: 9000,
      })
      window.dispatchEvent(new CustomEvent(PHARMACY_ORDERS_SOCKET_REFRESH))
    }
    const onUpdated = () => {
      window.dispatchEvent(new CustomEvent(PHARMACY_ORDERS_SOCKET_REFRESH))
    }
    socket.on('pharmacy:order:pending', onPending)
    socket.on('pharmacy:order:updated', onUpdated)

    return () => {
      socket.off('connect', onConnect)
      socket.off('pharmacy:order:pending', onPending)
      socket.off('pharmacy:order:updated', onUpdated)
      socket.disconnect()
    }
  }, [token, pharmacyId])

  useEffect(() => {
    if (!isAuthenticated() || !['dono_farmacia', 'farmaceutico', 'administrador'].includes(user?.role)) {
      navigate('/')
    }
  }, [user, isAuthenticated, navigate])

  useEffect(() => {
    if (user?.role === 'dono_farmacia') {
      setActiveTab((tab) => (tab === 'historico' ? 'dashboard' : tab))
    }
  }, [user?.role])

  useEffect(() => {
    const fromStore = extractPharmacyId(user)
    if (fromStore) {
      setResolvedPharmacyId(fromStore)
      setResolvingPharmacy(false)
      return
    }
    if (!token) return

    const loadMe = async () => {
      setResolvingPharmacy(true)
      try {
        const res = await authService.getCurrentUser()
        const me = res.data?.data?.user || res.data?.data || null
        if (me) {
          const resolved = extractPharmacyId(me)
          if (resolved) {
            setResolvedPharmacyId(resolved)
            setUser(me)
            return
          }
        }

        const ownerId = user?.id || user?._id || me?.id || me?._id
        if (ownerId) {
          const pharmRes = await pharmacyService.getAll({ limit: 300 })
          const payload = pharmRes.data?.data
          const list = Array.isArray(payload) ? payload : payload?.docs || []
          const mine = list.find((farm) => String(farm?.id_dono) === String(ownerId))
          if (mine?._id) {
            setResolvedPharmacyId(mine._id)
          }
        }
      } catch {
        // mantém fallback silencioso
      } finally {
        setResolvingPharmacy(false)
      }
    }

    loadMe()
  }, [token, user, setUser])

  useEffect(() => {
    if (!drawerOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  const selectOwnerTab = (tabId) => {
    setActiveTab(tabId)
    setDrawerOpen(false)
  }

  const activeTabMeta = [
    ...OWNER_NAV_GROUPS.flatMap((g) => g.items),
    ...(isOwner ? [] : [
      { id: 'historico', label: 'Histórico' },
      { id: 'endereco', label: 'Endereço da loja' },
      { id: 'produtos', label: 'Estoque / Cadastrar Produtos' },
      { id: 'farmaceuticos', label: 'Farmacêuticos' },
      { id: 'chats', label: 'Chats' },
      { id: 'receitas', label: 'Receitas' },
      { id: 'avaliacoes', label: 'Avaliações' },
    ]),
  ].find((t) => t.id === activeTab)

  const tabs = [
    ...(isOwner ? [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }] : []),
    { id: 'historico', label: 'Histórico', icon: ShoppingCart },
    { id: 'endereco', label: 'Endereço da loja', icon: MapPin },
    { id: 'produtos', label: 'Estoque / Cadastrar Produtos', icon: Package },
    { id: 'farmaceuticos', label: 'Adicionar Farmacêutico / Gerenciar', icon: Users },
    { id: 'chats', label: 'Histórico de Chats dos Farmacêuticos', icon: MessageSquare },
    { id: 'receitas', label: 'Histórico das Receitas', icon: FileText },
    { id: 'avaliacoes', label: 'Avaliações dos clientes', icon: Star },
  ]

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-12">
      <div className="w-full px-3 sm:px-4 lg:px-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {isOwner && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="mb-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm"
                aria-label="Abrir menu"
              >
                <Menu className="w-5 h-5" />
                Menu
              </button>
            )}
            <h1 className="text-2xl font-bold text-gray-900">
              {isOwner ? 'Dashboard da Farmácia' : 'Painel da Farmácia'}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Bem-vindo, {user?.nome?.split(' ')[0]}!
              {isOwner && activeTabMeta?.label && (
                <span className="text-gray-400"> · {activeTabMeta.label}</span>
              )}
            </p>
          </div>
        </div>

        {isOwner && drawerOpen && (
          <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true">
            <button
              type="button"
              className="flex-1 bg-black/40"
              aria-label="Fechar menu"
              onClick={() => setDrawerOpen(false)}
            />
            <aside className="w-72 max-w-[85vw] bg-white shadow-xl flex flex-col h-full">
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <span className="font-bold text-gray-900">Navegação</span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3 space-y-5">
                {OWNER_NAV_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {group.title}
                    </p>
                    <ul className="space-y-1">
                      {group.items.map((item) => {
                        const Icon = item.icon
                        const active = activeTab === item.id
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => selectOwnerTab(item.id)}
                              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition ${
                                active
                                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                                  : 'text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              <Icon className="w-4 h-4 shrink-0" />
                              <span className="text-left">{item.label}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
            </aside>
          </div>
        )}

        {!isOwner && (
          <div className="flex gap-2 mb-6 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-primary text-white shadow-md shadow-primary/20'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Content */}
        {activeTab === 'dashboard' && isOwner && (
          <OwnerDashboardPanel pharmacyId={pharmacyId} resolvingPharmacy={resolvingPharmacy} />
        )}
        {activeTab === 'historico' && <HistoricoPanel pharmacyId={pharmacyId} resolvingPharmacy={resolvingPharmacy} />}
        {activeTab === 'endereco' && (
          <FarmaciaEnderecoPanel pharmacyId={pharmacyId} resolvingPharmacy={resolvingPharmacy} />
        )}
        {activeTab === 'produtos' && <ProdutosPanel pharmacyId={pharmacyId} resolvingPharmacy={resolvingPharmacy} />}
        {activeTab === 'farmaceuticos' && <FarmaceuticosPanel pharmacyId={pharmacyId} resolvingPharmacy={resolvingPharmacy} />}
        {activeTab === 'chats' && <ChatsHistoryPanel />}
        {activeTab === 'receitas' && <ReceitasHistoryPanel />}
        {activeTab === 'avaliacoes' && (
          <AvaliacoesRespostasPanel pharmacyId={pharmacyId} resolvingPharmacy={resolvingPharmacy} />
        )}
      </div>
    </div>
  )
}

/* ────────── Avaliações e respostas da loja ────────── */
function AvaliacoesRespostasPanel({ pharmacyId, resolvingPharmacy = false }) {
  const { token } = useAuthStore()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [avgRating, setAvgRating] = useState(null)
  const [replyDraft, setReplyDraft] = useState({})
  const [savingId, setSavingId] = useState(null)

  const reviewKey = (r) => String(r?._id ?? r?.id ?? '')

  const loadReviews = useCallback(async () => {
    if (!pharmacyId) {
      setReviews([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const res = await reviewService.list(pharmacyId, { page, limit: 20 })
      const data = res.data?.data
      setReviews(Array.isArray(data?.reviews) ? data.reviews : [])
      setTotalPages(Math.max(1, data?.totalPages || 1))
      setTotal(typeof data?.total === 'number' ? data.total : 0)
      setAvgRating(typeof data?.avgRating === 'number' ? data.avgRating : null)
    } catch (err) {
      const msg = err.response?.data?.message || err.message
      setError(msg || 'Erro ao carregar avaliações')
      setReviews([])
    } finally {
      setLoading(false)
    }
  }, [pharmacyId, page])

  useEffect(() => {
    if (pharmacyId) loadReviews()
    else setLoading(false)
  }, [pharmacyId, loadReviews])

  const setDraft = (id, value) => {
    const k = String(id)
    setReplyDraft((prev) => ({ ...prev, [k]: value }))
  }

  const handlePublish = async (review) => {
    if (!pharmacyId || !token) return
    const rid = reviewKey(review)
    if (!rid) return
    const texto = String(replyDraft[rid] ?? review?.resposta_loja ?? '').trim()
    if (!texto) {
      setError('Escreva uma resposta antes de publicar.')
      return
    }
    setSavingId(rid)
    setError(null)
    try {
      await reviewService.reply(pharmacyId, rid, texto)
      useUiStore.getState().addNotification({
        type: 'success',
        title: 'Resposta publicada',
        message: 'A resposta aparece na página pública da farmácia junto desta avaliação.',
        duration: 5500,
      })
      await loadReviews()
    } catch (err) {
      const msg = err.response?.data?.message || err.message
      setError(msg || 'Erro ao publicar resposta')
    } finally {
      setSavingId(null)
    }
  }

  const renderStars = (nota) =>
    Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 shrink-0 ${i < Number(nota || 0) ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
      />
    ))

  if (resolvingPharmacy) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500">Identificando farmácia vinculada...</p>
      </div>
    )
  }

  if (!pharmacyId) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <Star className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Nenhuma farmácia vinculada.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5 border-b border-gray-100">
        <div>
          <h2 className="font-bold text-gray-900">Avaliações dos clientes</h2>
          <p className="text-xs text-gray-500 mt-1">
            Responda às notas e comentários como em apps de entrega: a resposta é pública na página da sua farmácia.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {avgRating != null && (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-gray-800">{avgRating.toFixed(1)}</span>
              <div className="flex">{renderStars(Math.round(avgRating))}</div>
              <span className="text-gray-500">({total})</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => loadReviews()}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="px-5 pt-4">
          <Alert type="error" message={error} onClose={() => setError(null)} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-16 px-4">
          <Star className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Ainda não há avaliações</p>
          <p className="text-sm text-gray-500 mt-1">Quando clientes avaliarem pedidos entregues, aparecem aqui.</p>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {reviews.map((r) => {
            const rid = reviewKey(r)
            const draft = replyDraft[rid] !== undefined ? replyDraft[rid] : (r.resposta_loja ?? '')
            return (
              <div
                key={rid}
                className="border border-gray-100 rounded-xl p-4 bg-gray-50/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">{r.nome_usuario || 'Cliente'}</p>
                    <p className="text-xs text-gray-500">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString('pt-BR') : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">{renderStars(r.nota)}</div>
                </div>
                {r.comentario ? (
                  <p className="text-sm text-gray-700 mb-3 whitespace-pre-wrap">{r.comentario}</p>
                ) : (
                  <p className="text-sm text-gray-500 italic mb-3">Sem comentário escrito — só nota.</p>
                )}
                {r.resposta_loja && r.resposta_loja_em && (
                  <div className="mb-3 rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-sm">
                    <p className="text-xs font-semibold text-emerald-900 mb-1">Resposta da loja</p>
                    <p className="text-emerald-950 whitespace-pre-wrap">{r.resposta_loja}</p>
                    <p className="text-[10px] text-emerald-800/80 mt-1">
                      Publicada em {new Date(r.resposta_loja_em).toLocaleString('pt-BR')}
                    </p>
                  </div>
                )}
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  {r.resposta_loja ? 'Editar resposta' : 'Sua resposta'}
                </label>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(rid, e.target.value)}
                  rows={3}
                  maxLength={1000}
                  disabled={!token || savingId === rid}
                  placeholder="Ex.: Obrigado pelo feedback! Já reforçamos o cuidado na embalagem."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/25 focus:border-primary disabled:bg-gray-100"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-gray-400">{draft.length}/1000</span>
                  <button
                    type="button"
                    disabled={!token || savingId === rid || !String(draft).trim()}
                    onClick={() => handlePublish(r)}
                    className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingId === rid ? 'Publicando...' : r.resposta_loja ? 'Atualizar resposta' : 'Publicar resposta'}
                  </button>
                </div>
              </div>
            )
          })}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-3 pt-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-600">
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const SALES_PERIOD_OPTIONS = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'custom', label: 'Intervalo' },
]

function pad2(value) {
  return String(value).padStart(2, '0')
}

function toDateInputValue(value = new Date()) {
  const date = new Date(value)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function startOfDay(value) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function endOfDay(value) {
  const date = new Date(value)
  date.setHours(23, 59, 59, 999)
  return date
}

function getSalesPeriodRange(period, customStart, customEnd) {
  const now = new Date()

  if (period === 'today') {
    return { start: startOfDay(now), end: endOfDay(now) }
  }

  if (period === '7d' || period === '30d') {
    const days = period === '7d' ? 6 : 29
    const start = new Date(now)
    start.setDate(now.getDate() - days)
    return { start: startOfDay(start), end: endOfDay(now) }
  }

  if (period === 'custom') {
    return {
      start: customStart ? startOfDay(`${customStart}T00:00:00`) : new Date(0),
      end: customEnd ? endOfDay(`${customEnd}T00:00:00`) : endOfDay(now),
    }
  }

  const start = new Date(now)
  start.setDate(now.getDate() - 29)
  return { start: startOfDay(start), end: endOfDay(now) }
}

function getOrderCreatedDate(order) {
  const raw = order?.createdAt || order?.dataPedido || order?.created_at
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

function orderIsInRange(order, range) {
  const date = getOrderCreatedDate(order)
  if (!date) return false
  return date >= range.start && date <= range.end
}

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))
}

function numberValue(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function getOrderTotal(order) {
  return numberValue(order?.total ?? order?.valorTotal)
}

function getOrderItems(order) {
  return Array.isArray(order?.itens) ? order.itens : []
}

function getProductName(item) {
  return String(item?.nome_produto || item?.nome || item?.produto?.nome || 'Item').trim()
}

function getProductKey(item, name) {
  const rawId = item?.id_produto?._id || item?.id_produto || item?.produto?._id || item?.produto?.id || name
  return String(rawId || name).toLowerCase()
}

function getItemQuantity(item) {
  return Math.max(1, numberValue(item?.quantidade ?? item?.quantity, 1))
}

function getItemRevenue(item) {
  const subtotal = numberValue(item?.subtotal, NaN)
  if (Number.isFinite(subtotal)) return subtotal
  return getItemQuantity(item) * numberValue(item?.preco_unitario ?? item?.preco)
}

function isRevenueOrder(order) {
  const status = getOrderDisplayStatusKey(order)
  const paymentStatus = String(order?.status_pagamento || '').trim()
  const blocked = ['cancelado', 'rejeitado'].includes(status)
  const paid = paymentStatus === 'aprovado'
  const activeSale = ['confirmado', 'em_processamento', 'a_caminho', 'entregue'].includes(status)
  return !blocked && (paid || activeSale)
}

function buildSalesAnalysis(orders, range) {
  const periodOrders = (orders || []).filter((order) => orderIsInRange(order, range))
  const statusCounts = {}
  const productsByKey = new Map()
  let revenueOrders = 0
  let totalRevenue = 0

  periodOrders.forEach((order) => {
    const status = getOrderDisplayStatusKey(order) || 'sem_status'
    statusCounts[status] = (statusCounts[status] || 0) + 1

    if (!isRevenueOrder(order)) return

    revenueOrders += 1
    totalRevenue += getOrderTotal(order)

    const seenInOrder = new Set()
    getOrderItems(order).forEach((item) => {
      const name = getProductName(item)
      const key = getProductKey(item, name)
      const current = productsByKey.get(key) || {
        key,
        name,
        orderCount: 0,
        quantity: 0,
        revenue: 0,
      }

      if (!seenInOrder.has(key)) {
        current.orderCount += 1
        seenInOrder.add(key)
      }

      current.quantity += getItemQuantity(item)
      current.revenue += getItemRevenue(item)
      productsByKey.set(key, current)
    })
  })

  const products = [...productsByKey.values()]

  return {
    periodOrders,
    totalOrders: periodOrders.length,
    statusCounts,
    deliveredOrders: statusCounts.entregue || 0,
    rejectedOrders: (statusCounts.rejeitado || 0) + (statusCounts.cancelado || 0),
    awaitingPaymentOrders: statusCounts.aguardando_pagamento || 0,
    revenueOrders,
    totalRevenue,
    averageTicket: revenueOrders > 0 ? totalRevenue / revenueOrders : 0,
    products,
    byOrders: [...products].sort((a, b) => b.orderCount - a.orderCount || b.revenue - a.revenue),
    byQuantity: [...products].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue),
    byRevenue: [...products].sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity),
  }
}

function escapeCsv(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function exportProductsCsv(products) {
  const rows = [
    ['Produto', 'Pedidos em que apareceu', 'Unidades vendidas', 'Receita gerada'],
    ...products.map((product) => [
      product.name,
      product.orderCount,
      product.quantity,
      product.revenue.toFixed(2).replace('.', ','),
    ]),
  ]
  const csv = rows.map((row) => row.map(escapeCsv).join(';')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `analise-vendas-${toDateInputValue()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function statusLabelForSales(status, statusLabels = {}) {
  return statusLabels[status] || String(status || 'Sem status').replace(/_/g, ' ')
}

function SummaryMetric({ label, value, tone = 'gray' }) {
  const tones = {
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-900',
    blue: 'border-blue-100 bg-blue-50 text-blue-900',
    amber: 'border-amber-100 bg-amber-50 text-amber-900',
    red: 'border-red-100 bg-red-50 text-red-900',
    gray: 'border-gray-100 bg-white text-gray-900',
  }

  return (
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.gray}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  )
}

function RankingCard({ title, products, value }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      <div className="mt-3 space-y-2">
        {products.slice(0, 5).length === 0 ? (
          <p className="text-sm text-gray-400">Sem dados</p>
        ) : (
          products.slice(0, 5).map((product, index) => (
            <div key={product.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-gray-700">
                {index + 1}. {product.name}
              </span>
              <span className="shrink-0 font-semibold text-gray-900">{value(product)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function TopProductsBarChart({ products }) {
  const top = products.slice(0, 5)
  const max = Math.max(...top.map((product) => product.revenue), 1)

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <h3 className="text-sm font-bold text-gray-900">Top 5 por receita</h3>
      <div className="mt-4 space-y-3">
        {top.length === 0 ? (
          <p className="text-sm text-gray-400">Sem dados</p>
        ) : (
          top.map((product) => (
            <div key={product.key} className="grid grid-cols-[minmax(90px,180px)_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate text-gray-600">{product.name}</span>
              <div className="h-7 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.max(8, (product.revenue / max) * 100)}%` }}
                />
              </div>
              <span className="font-semibold text-gray-900">{formatBRL(product.revenue)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function SalesAnalysisPanel({ analysis, sortedProducts, sortConfig, onSort, statusLabels }) {
  const renderSortIcon = (key) => (
    <ArrowUpDown
      className={`w-3.5 h-3.5 ${sortConfig.key === key ? 'text-primary' : 'text-gray-300'}`}
    />
  )

  return (
    <div className="p-4 sm:p-5 space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <SummaryMetric label="Pedidos" value={analysis.totalOrders} />
        <SummaryMetric label="Entregues" value={analysis.deliveredOrders} tone="emerald" />
        <SummaryMetric label="Rejeitados" value={analysis.rejectedOrders} tone="red" />
        <SummaryMetric label="Aguardando" value={analysis.awaitingPaymentOrders} tone="amber" />
        <SummaryMetric label="Ticket médio" value={formatBRL(analysis.averageTicket)} tone="blue" />
        <SummaryMetric label="Receita" value={formatBRL(analysis.totalRevenue)} tone="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RankingCard
          title="Mais vendidos por pedido"
          products={analysis.byOrders}
          value={(product) => `${product.orderCount} pedido(s)`}
        />
        <RankingCard
          title="Maior quantidade"
          products={analysis.byQuantity}
          value={(product) => `${product.quantity} un.`}
        />
        <RankingCard
          title="Maior receita"
          products={analysis.byRevenue}
          value={(product) => formatBRL(product.revenue)}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {[
                  ['name', 'Produto'],
                  ['orderCount', 'Pedidos'],
                  ['quantity', 'Unidades'],
                  ['revenue', 'Receita'],
                ].map(([key, label]) => (
                  <th key={key} className="px-4 py-3 text-left font-semibold">
                    <button
                      type="button"
                      onClick={() => onSort(key)}
                      className="inline-flex items-center gap-1.5 text-gray-700 hover:text-primary"
                    >
                      {label}
                      {renderSortIcon(key)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    Nenhum produto vendido no período
                  </td>
                </tr>
              ) : (
                sortedProducts.map((product) => (
                  <tr key={product.key} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{product.name}</td>
                    <td className="px-4 py-3">{product.orderCount}</td>
                    <td className="px-4 py-3">{product.quantity}</td>
                    <td className="px-4 py-3 font-semibold">{formatBRL(product.revenue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <TopProductsBarChart products={analysis.byRevenue} />
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <h3 className="text-sm font-bold text-gray-900">Pedidos por status</h3>
            <div className="mt-3 space-y-2">
              {Object.entries(analysis.statusCounts).length === 0 ? (
                <p className="text-sm text-gray-400">Sem dados</p>
              ) : (
                Object.entries(analysis.statusCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-gray-600">{statusLabelForSales(status, statusLabels)}</span>
                      <span className="font-semibold text-gray-900">{count}</span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ────────── Histórico de Pedidos ────────── */
const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
]

const normalizeOrderFileUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw)
      if (url.pathname.startsWith('/uploads/')) {
        return `${url.pathname}${url.search}${url.hash}`
      }
    } catch {
      return raw
    }
    return raw
  }
  return `/${raw.replace(/^\/+/, '').replace(/\\/g, '/')}`
}

const objectIdValue = (value) => {
  const raw = value?._id || value?.id || value
  return raw ? String(raw) : ''
}

const productFromItem = (item) => item?.id_produto || item?.produto || {}

const isControlledOrderItem = (item) => {
  const product = productFromItem(item)
  return Boolean(isSngpcProduct(item) || isSngpcProduct(product))
}

const getControlledItems = (order) => (order?.itens || []).filter(isControlledOrderItem)

const getPrimaryControlledItem = (order) => getControlledItems(order)[0] || null

const getAvailableBatchesForItem = (item) => {
  const product = productFromItem(item)
  return [...(product?.batches || [])]
    .filter((batch) => batch?.active !== false && Number(batch?.quantity || 0) > 0)
    .sort((a, b) => new Date(a.expirationDate || 0) - new Date(b.expirationDate || 0))
}

const formatBatchDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('pt-BR')
}

/**
 * Lotes já escolhidos por outros pedidos ativos (dispensação registrada),
 * para não oferecer o mesmo lote duas vezes. Pedido rejeitado/cancelado libera
 * o lote (o backend devolve a quantidade) e ele volta a aparecer aqui.
 */
const committedBatchNumbers = (orders, { excludeOrderId = null, productId = null } = {}) => {
  const set = new Set()
  const exclude = excludeOrderId ? String(excludeOrderId) : null
  const pid = productId ? String(productId) : null
  for (const o of orders || []) {
    if (['cancelado', 'rejeitado'].includes(String(o?.status || '').trim())) continue
    if (exclude && String(o?._id) === exclude) continue
    const sd = o?.sngpcData
    if (sd?.selectedBatchNumber && (!pid || String(sd.productId || '') === pid)) {
      set.add(String(sd.selectedBatchNumber).trim())
    }
    for (const it of o?.itens || []) {
      const lote = it?.lote_consumido?.batchNumber
      if (!lote) continue
      const itemPid = String(it?.id_produto?._id || it?.id_produto || '')
      if (!pid || itemPid === pid) set.add(String(lote).trim())
    }
  }
  return set
}

const getOrderPrescription = (order) => {
  const itemWithPrescription =
    getControlledItems(order).find((item) => item?.id_receita) ||
    (order?.itens || []).find((item) => item?.id_receita)
  return itemWithPrescription?.id_receita || null
}

const getPrescriptionOcr = (order) => getOrderPrescription(order)?.dados_ocr || {}

const digitalSignatureCodeFromPrescription = (prescription) => {
  const ocr = prescription?.dados_ocr || {}
  return (
    prescription?.digitalSignatureCode ||
    prescription?.codigo_validacao_assinatura ||
    prescription?.hash_assinatura ||
    ocr?.codigo_validacao_assinatura ||
    ocr?.hash_assinatura ||
    prescription?.hash_arquivo ||
    ''
  )
}

function SngpcDispensationPanel({
  order,
  orders = [],
  form,
  setForm,
  onClose,
  onConfirm,
  onReject,
  saving,
}) {
  if (!order) return null
  const item = getPrimaryControlledItem(order)
  const product = productFromItem(item)
  const allBatches = getAvailableBatchesForItem(item)
  const committed = committedBatchNumbers(orders, {
    excludeOrderId: order?._id,
    productId: objectIdValue(item?.id_produto),
  })
  // Tira lotes já escolhidos por outro pedido ativo, mantendo o lote já selecionado nesta tela.
  const batches = allBatches.filter(
    (b) =>
      !committed.has(String(b.batchNumber).trim()) ||
      String(b.batchNumber).trim() === String(form?.selectedBatchNumber || '').trim(),
  )
  const prescription = getOrderPrescription(order)
  const prescriptionUrl = normalizeOrderFileUrl(prescription?.url_arquivo)
  const prescriptionKind = String(prescription?.tipo_arquivo || prescriptionUrl).toLowerCase()
  const isPdf = prescriptionKind.includes('pdf')
  const isXml = prescriptionKind.includes('xml')
  const ocr = getPrescriptionOcr(order)
  const buyer = order?.id_usuario || {}

  return (
    <div className="m-4 rounded-xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-5 py-4 border-b border-gray-100 bg-emerald-50/60">
        <div>
          <h3 className="font-bold text-gray-900">Registro de Dispensação ANVISA / SNGPC</h3>
          <p className="text-xs text-gray-600 mt-1">
            Pedido #{String(order._id || '').slice(-8).toUpperCase()} · {product?.nome || item?.nome_produto || 'Medicamento sujeito ao SNGPC'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="self-start md:self-auto p-2 rounded-lg text-gray-500 hover:bg-white"
          aria-label="Fechar registro"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_440px] min-h-[560px]">
        <div className="p-5 bg-gray-50 border-r border-gray-100">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Documento da prescrição</p>
              <p className="text-xs text-gray-500">{prescription?.nome_arquivo || 'Arquivo vinculado ao pedido'}</p>
            </div>
            {prescriptionUrl && (
              <a
                href={prescriptionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Eye className="w-4 h-4" />
                Abrir
              </a>
            )}
          </div>

          <div className="h-[500px] rounded-xl border border-gray-200 bg-white overflow-hidden flex items-center justify-center">
            {prescriptionUrl ? (
              isPdf ? (
                <iframe title="Prescrição" src={prescriptionUrl} className="w-full h-full" />
              ) : isXml ? (
                <div className="text-center px-6">
                  <FileText className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-800">Receita digital em XML</p>
                  <a
                    href={prescriptionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                  >
                    Abrir XML
                  </a>
                </div>
              ) : (
                <img src={prescriptionUrl} alt="Prescrição" className="w-full h-full object-contain bg-white" />
              )
            ) : (
              <div className="text-center px-6">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600">Nenhum documento vinculado ao pedido</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-800">
              Entra: tarja preta, controle especial e antimicrobianos.
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600">
              Não entra: tarja vermelha comum, MIPs e genérico sem ativo controlado.
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Comprador</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ReadonlyField label="Nome completo" value={buyer?.nome || '-'} />
              <ReadonlyField label="CPF" value={buyer?.cpf || '-'} />
              <ReadonlyField label="RG + órgão emissor" value={buyer?.rg || '-'} />
              <ReadonlyField label="Telefone" value={buyer?.telefone || '-'} />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
              Paciente {prescription?.receita_de_terceiro ? '(receita de terceiro)' : '(mesmo do comprador)'}
            </p>
            {prescription?.receita_de_terceiro ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ReadonlyField label="Nome completo" value={prescription?.paciente?.nome || '-'} />
                <ReadonlyField label="CPF" value={prescription?.paciente?.cpf || '-'} />
                <ReadonlyField label="RG" value={prescription?.paciente?.rg || '-'} />
              </div>
            ) : (
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                O comprador é o próprio paciente.
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Prescritor</p>
            <div className="space-y-3">
              <FormInput
                label="Nome do médico"
                value={form.doctorName}
                placeholder={ocr?.nome_medico || 'Dr. Marcelo Andrade'}
                onChange={(value) => setForm((prev) => ({ ...prev, doctorName: value }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormInput
                  label="CRM"
                  value={form.doctorCrm}
                  placeholder={ocr?.crm || '18452'}
                  onChange={(value) => setForm((prev) => ({ ...prev, doctorCrm: value }))}
                />
                <div>
                  <label className="text-xs text-gray-500">UF do conselho</label>
                  <select
                    value={form.doctorUf}
                    onChange={(e) => setForm((prev) => ({ ...prev, doctorUf: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">{ocr?.uf_crm || 'UF'}</option>
                    {UF_OPTIONS.map((uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
              </div>
              <FormInput
                label="Código da assinatura digital ICP-Brasil"
                value={form.digitalSignatureCode}
                placeholder={(prescription?.hash_arquivo || '').slice(0, 32) || 'Hash ICP-Brasil'}
                onChange={(value) => setForm((prev) => ({ ...prev, digitalSignatureCode: value }))}
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Lote e rastreabilidade</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <ReadonlyField label="Medicamento" value={product?.nome || item?.nome_produto || '-'} />
              <ReadonlyField label="Quantidade de caixas" value={String(item?.quantidade || 1)} />
            </div>
            <label className="text-xs text-gray-500">Número do lote selecionado</label>
            <select
              value={form.selectedBatchNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, selectedBatchNumber: e.target.value }))}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Selecione um lote</option>
              {batches.map((batch) => (
                <option key={batch.batchNumber} value={batch.batchNumber}>
                  {batch.batchNumber} · validade {formatBatchDate(batch.expirationDate)} · {batch.quantity} un.
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-500 mt-2">
              Regra FEFO: vencimento mais próximo primeiro.
            </p>
          </div>

          <div className="pt-4 border-t border-gray-100 flex flex-col gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={
                saving ||
                !form.doctorName ||
                !form.doctorCrm ||
                !form.doctorUf ||
                !form.digitalSignatureCode ||
                !form.selectedBatchNumber
              }
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-secondary disabled:opacity-50"
            >
              <ClipboardList className="w-4 h-4" />
              {saving ? 'Registrando...' : 'Confirmar Dispensação e Rastreabilidade'}
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Rejeitar Notificação
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReadonlyField({ label, value }) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <div className="mt-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-800 min-h-[38px]">
        {value}
      </div>
    </div>
  )
}

function FormInput({ label, value, placeholder, onChange }) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
      />
    </div>
  )
}

function HistoricoPanel({ pharmacyId, resolvingPharmacy = false }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('historico')
  const [statusFilter, setStatusFilter] = useState('')
  const [salesPeriod, setSalesPeriod] = useState('30d')
  const [customStart, setCustomStart] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 29)
    return toDateInputValue(date)
  })
  const [customEnd, setCustomEnd] = useState(() => toDateInputValue())
  const [sortConfig, setSortConfig] = useState({ key: 'revenue', direction: 'desc' })
  const [pickupCompletingId, setPickupCompletingId] = useState(null)
  const [codigoRetiradaPorPedido, setCodigoRetiradaPorPedido] = useState({})
  const [selectedSngpcOrder, setSelectedSngpcOrder] = useState(null)
  const [sngpcForm, setSngpcForm] = useState({
    productId: '',
    doctorName: '',
    doctorCrm: '',
    doctorUf: '',
    digitalSignatureCode: '',
    selectedBatchNumber: '',
  })
  const [sngpcSaving, setSngpcSaving] = useState(false)
  const [rejectingOrder, setRejectingOrder] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectSaving, setRejectSaving] = useState(false)

  const loadOrders = useCallback(async (opts = {}) => {
    const silent = Boolean(opts.silent);
    if (!pharmacyId) {
      setOrders([])
      setLoading(false)
      return
    }
    try {
      if (!silent) setLoading(true)
      const res = await pharmacyOwnerService.getOrders(pharmacyId, { limit: 400 })
      const d = res.data?.data
      setOrders(d?.pedidos || d?.docs || (Array.isArray(d) ? d : []))
    } catch (err) {
      setError('Erro ao carregar pedidos')
      setOrders([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [pharmacyId])

  useEffect(() => {
    if (pharmacyId) loadOrders()
    else setLoading(false)
  }, [pharmacyId, loadOrders])

  useEffect(() => {
    if (!pharmacyId) return undefined
    const onRefresh = () => {
      loadOrders({ silent: true })
    }
    window.addEventListener(PHARMACY_ORDERS_SOCKET_REFRESH, onRefresh)
    return () => window.removeEventListener(PHARMACY_ORDERS_SOCKET_REFRESH, onRefresh)
  }, [pharmacyId, loadOrders])

  const isRetiradaOuDriveThru = (order) =>
    ['retirada', 'drive-thru'].includes(String(order?.tipo_entrega || '').trim())

  const podeFinalizarRetirada = (order) =>
    String(order?.status || '').trim() === 'em_processamento' &&
    isRetiradaOuDriveThru(order) &&
    String(order?.status_pagamento || '').trim() === 'aprovado'

  const marcarRetiradaEntregue = async (order) => {
    if (!pharmacyId || !order?._id || pickupCompletingId) return
    const codigo = String(codigoRetiradaPorPedido[order._id] ?? '').trim()
    if (!codigo) {
      setError('Informe o código de retirada exibido no app do cliente.')
      return
    }
    try {
      setPickupCompletingId(order._id)
      setError(null)
      await orderService.completePharmacyPickup(order._id, { pharmacyId, codigo })
      setCodigoRetiradaPorPedido((prev) => {
        const next = { ...prev }
        delete next[order._id]
        return next
      })
      await loadOrders({ silent: true })
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.message
      setError(apiMsg || 'Erro ao marcar retirada como entregue')
    } finally {
      setPickupCompletingId(null)
    }
  }

  const openSngpcOrder = (order) => {
    const item = getPrimaryControlledItem(order)
    const batches = getAvailableBatchesForItem(item)
    const committed = committedBatchNumbers(orders, {
      excludeOrderId: order?._id,
      productId: objectIdValue(item?.id_produto),
    })
    const livres = batches.filter((b) => !committed.has(String(b.batchNumber).trim()))
    const ocr = getPrescriptionOcr(order)
    const prescription = getOrderPrescription(order)
    setSngpcForm({
      productId: objectIdValue(item?.id_produto),
      doctorName: ocr?.nome_medico || '',
      doctorCrm: ocr?.crm || '',
      doctorUf: String(ocr?.uf_crm || '').toUpperCase(),
      digitalSignatureCode: digitalSignatureCodeFromPrescription(prescription),
      selectedBatchNumber: (livres[0] || batches[0])?.batchNumber || '',
    })
    setSelectedSngpcOrder(order)
    setError(null)
  }

  const confirmarSngpc = async () => {
    if (!selectedSngpcOrder?._id || !pharmacyId || sngpcSaving) return
    try {
      setSngpcSaving(true)
      setError(null)
      await orderService.validateSngpc(selectedSngpcOrder._id, {
        pharmacyId,
        ...sngpcForm,
        doctorUf: String(sngpcForm.doctorUf || '').toUpperCase(),
        buyerRg: selectedSngpcOrder?.id_usuario?.rg || '',
      })
      setSelectedSngpcOrder(null)
      await loadOrders({ silent: true })
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.message
      setError(apiMsg || 'Erro ao registrar dispensação')
    } finally {
      setSngpcSaving(false)
    }
  }

  const openRejectModal = (order) => {
    setRejectingOrder(order)
    setRejectReason('')
    setError(null)
  }

  const confirmarRejeicao = async () => {
    if (!rejectingOrder?._id || !pharmacyId || rejectSaving) return
    const motivo = rejectReason.trim()
    if (!motivo) {
      setError('Informe o motivo da rejeição.')
      return
    }
    try {
      setRejectSaving(true)
      setError(null)
      await orderService.rejectByPharmacist(rejectingOrder._id, pharmacyId, motivo)
      setRejectingOrder(null)
      setSelectedSngpcOrder(null)
      await loadOrders({ silent: true })
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.message
      setError(apiMsg || 'Erro ao rejeitar notificação')
    } finally {
      setRejectSaving(false)
    }
  }

  const STATUS_LABELS = {
    aguardando_pagamento: 'Aguardando Pagamento',
    confirmado: 'Confirmado',
    em_processamento: 'Em Processamento',
    a_caminho: 'A caminho',
    aguardando_confirmacao_receita_farmacia: 'Aguardando receita na farmácia',
    entregue: 'Entregue',
    cancelado: 'Cancelado',
    rejeitado: 'Rejeitado',
  }

  const pedidosPorFiltro = statusFilter
    ? orders.filter((o) => getOrderDisplayStatusKey(o) === statusFilter)
    : orders

  const STATUS_COLORS = {
    aguardando_pagamento: 'bg-blue-100 text-blue-700',
    confirmado: 'bg-emerald-100 text-emerald-700',
    em_processamento: 'bg-yellow-100 text-yellow-700',
    a_caminho: 'bg-purple-100 text-purple-700',
    aguardando_confirmacao_receita_farmacia: 'bg-amber-100 text-amber-900',
    entregue: 'bg-green-100 text-green-700',
    cancelado: 'bg-red-100 text-red-700',
    rejeitado: 'bg-red-100 text-red-700',
  }

  const getOrderStatusChangedAt = (order, status) => {
    const historico = Array.isArray(order?.historico_status)
      ? [...order.historico_status]
      : []
    const match = historico
      .filter((h) => h?.status === status && h?.alterado_em)
      .sort((a, b) => new Date(b.alterado_em) - new Date(a.alterado_em))[0]
    return match?.alterado_em || null
  }

  const formatResolvedWait = (createdAt, resolvedAt = null) => {
    if (!createdAt) return null
    const created = new Date(createdAt)
    const end = resolvedAt ? new Date(resolvedAt) : new Date()
    const diffMin = Math.max(0, Math.floor((end - created) / 60000))
    if (diffMin < 60) return `Aguardou ${diffMin} min`
    return `Aguardou ${Math.floor(diffMin / 60)}h`
  }

  const termo = search.trim().toLowerCase()
  const historicoPedidos = pedidosPorFiltro.filter((o) => {
    if (!termo) return true
    const blob = [
      o?._id,
      o?.status,
      getOrderDisplayStatusKey(o),
      ...(isPreparandoEnvioSemEntregador(o) ? ['preparando envio'] : []),
      o?.id_usuario?.nome,
      o?.id_usuario?.telefone,
      ...(o?.itens || []).map((i) => i?.nome_produto || i?.nome || ''),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return blob.includes(termo)
  })

  const salesRange = useMemo(
    () => getSalesPeriodRange(salesPeriod, customStart, customEnd),
    [salesPeriod, customStart, customEnd]
  )

  const salesAnalysis = useMemo(
    () => buildSalesAnalysis(orders, salesRange),
    [orders, salesRange]
  )

  const sortedProducts = useMemo(() => {
    const direction = sortConfig.direction === 'asc' ? 1 : -1
    return [...salesAnalysis.products].sort((a, b) => {
      if (sortConfig.key === 'name') {
        return direction * a.name.localeCompare(b.name, 'pt-BR')
      }

      const diff = numberValue(a[sortConfig.key]) - numberValue(b[sortConfig.key])
      if (diff !== 0) return direction * diff
      return a.name.localeCompare(b.name, 'pt-BR')
    })
  }, [salesAnalysis.products, sortConfig])

  const handleProductSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  if (resolvingPharmacy) return (
    <div className="bg-white rounded-xl shadow-sm p-12 text-center">
      <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
      <p className="text-gray-500">Identificando farmácia vinculada...</p>
    </div>
  )

  if (!pharmacyId) return (
    <div className="bg-white rounded-xl shadow-sm p-12 text-center">
      <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-500">Nenhuma farmácia vinculada.</p>
    </div>
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 p-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            {viewMode === 'analise' ? (
              <BarChart3 className="w-5 h-5 text-blue-500" />
            ) : (
              <ShoppingCart className="w-5 h-5 text-blue-500" />
            )}
          </div>
          <div>
            <h2 className="font-bold text-gray-900">
              {viewMode === 'analise' ? 'Análise de Vendas' : 'Histórico de Pedidos'}
            </h2>
            <p className="text-xs text-gray-400">
              {viewMode === 'analise'
                ? `${salesAnalysis.totalOrders} pedido(s) no período`
                : `${historicoPedidos.length} pedido(s)`}
            </p>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center gap-2">
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setViewMode('historico')}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
                viewMode === 'historico' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Histórico
            </button>
            <button
              type="button"
              onClick={() => setViewMode('analise')}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
                viewMode === 'analise' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Análise de Vendas
            </button>
          </div>

          {viewMode === 'historico' ? (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar por pedido, cliente, item..."
                className="px-3 py-2 border rounded-lg text-sm w-full sm:w-72"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">Todos</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => loadOrders()}
                disabled={loading}
                className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition"
                title="Atualizar"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center">
              <div className="flex flex-wrap gap-1">
                {SALES_PERIOD_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSalesPeriod(option.value)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition ${
                      salesPeriod === option.value
                        ? 'border-primary bg-primary text-white'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {salesPeriod === 'custom' && (
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="px-3 py-2 border rounded-lg text-sm"
                  />
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => exportProductsCsv(salesAnalysis.products)}
                disabled={salesAnalysis.products.length === 0}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                CSV
              </button>
              <button
                type="button"
                onClick={() => loadOrders()}
                disabled={loading}
                className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition"
                title="Atualizar"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="px-5 pt-4"><Alert type="error" message={error} onClose={() => setError(null)} /></div>}

      {viewMode === 'historico' && selectedSngpcOrder && (
        <SngpcDispensationPanel
          order={selectedSngpcOrder}
          orders={orders}
          form={sngpcForm}
          setForm={setSngpcForm}
          saving={sngpcSaving}
          onClose={() => setSelectedSngpcOrder(null)}
          onConfirm={confirmarSngpc}
          onReject={() => openRejectModal(selectedSngpcOrder)}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : viewMode === 'analise' ? (
        <SalesAnalysisPanel
          analysis={salesAnalysis}
          sortedProducts={sortedProducts}
          sortConfig={sortConfig}
          onSort={handleProductSort}
          statusLabels={STATUS_LABELS}
        />
      ) : historicoPedidos.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nenhum pedido no histórico</p>
        </div>
      ) : (
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Pedido</th>
                <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                <th className="px-4 py-3 text-left font-semibold">Produtos Vendidos</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Total</th>
                <th className="px-4 py-3 text-left font-semibold">Data</th>
                <th className="px-4 py-3 text-left font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {[...historicoPedidos]
                .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                .map((order) => {
                  const displayKey = getOrderDisplayStatusKey(order)
                  const resolvedAt =
                    getOrderStatusChangedAt(order, order.status) ||
                    order.entregue_em ||
                    order.cancelado_em ||
                    order.updatedAt ||
                    null
                  const frozenWait = formatResolvedWait(order.createdAt, resolvedAt)
                  const badgeLabel = isPreparandoEnvioSemEntregador(order)
                    ? 'Preparando envio'
                    : (STATUS_LABELS[displayKey] || String(order.status || '').replace(/_/g, ' '))
                  const cancelReason =
                    order.status === 'cancelado' || order.status === 'rejeitado'
                      ? getOrderCancellationReason(order)
                      : null
                  const hasControlledMedication = getControlledItems(order).length > 0
                  const sngpcRegistered = Boolean(order?.sngpcData?.validatedAt)
                  const sngpcBlocked = ['cancelado', 'rejeitado', 'entregue'].includes(String(order?.status || '').trim())
                  const canOpenSngpc = hasControlledMedication && !sngpcRegistered && !sngpcBlocked
                  return (
                    <tr key={order._id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs">#{(order._id || '').slice(-8).toUpperCase()}</td>
                      <td className="px-4 py-3">{order.id_usuario?.nome || '-'}</td>
                      <td className="px-4 py-3 text-xs text-gray-700 max-w-[320px]">
                        {(order?.itens || []).length > 0
                          ? (order.itens || [])
                            .map((item) => `${item?.nome_produto || item?.nome || 'Item'} x${item?.quantidade || 1}`)
                            .join(' · ')
                          : '-'}
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[displayKey] || 'bg-gray-100 text-gray-700'}`}>
                            {badgeLabel}
                          </span>
                          {frozenWait && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                              {frozenWait}
                            </span>
                          )}
                        </div>
                        {cancelReason && (
                          <p className="mt-1.5 text-xs text-gray-600 leading-snug" title={cancelReason}>
                            <span className="font-semibold text-gray-700">Motivo:</span> {cancelReason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold">R$ {(Number(order.total || order.valorTotal || 0)).toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(order.createdAt).toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5 min-w-[150px]">
                          {canOpenSngpc && (
                            <button
                              type="button"
                              onClick={() => openSngpcOrder(order)}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-emerald-600 text-emerald-900 hover:bg-emerald-50"
                            >
                              Registro ANVISA
                            </button>
                          )}
                          {sngpcRegistered && (
                            <span className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-100 text-center">
                              Rastreabilidade registrada
                            </span>
                          )}
                          {podeFinalizarRetirada(order) && (
                            <>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              placeholder="Código cliente"
                              value={codigoRetiradaPorPedido[order._id] ?? ''}
                              onChange={(e) =>
                                setCodigoRetiradaPorPedido((prev) => ({
                                  ...prev,
                                  [order._id]: e.target.value.replace(/\D/g, '').slice(0, 6),
                                }))
                              }
                              className="px-2 py-1 border border-emerald-200 rounded text-xs font-mono w-full"
                            />
                            <button
                              type="button"
                              onClick={() => marcarRetiradaEntregue(order)}
                              disabled={pickupCompletingId === order._id}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-emerald-600 text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              {pickupCompletingId === order._id ? 'Salvando…' : 'Confirmar retirada'}
                            </button>
                            </>
                          )}
                          {!canOpenSngpc && !sngpcRegistered && !podeFinalizarRetirada(order) && (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ────────── Dashboard do dono ────────── */
function OwnerDashboardPanel({ pharmacyId, resolvingPharmacy = false }) {
  const [stats, setStats] = useState(null)
  const [periodo, setPeriodo] = useState('mes')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [visibleCharts, setVisibleCharts] = useState({
    status: true,
    funil: true,
    meses: true,
    entrega: true,
    receitas: true,
  })

  const loadStats = useCallback(async () => {
    if (!pharmacyId) return
    try {
      setLoading(true)
      setError(null)
      const res = await pharmacyOwnerService.getOwnerDashboard(pharmacyId, { periodo })
      setStats(res.data?.data || null)
    } catch (err) {
      setError(err.message || 'Erro ao carregar dashboard')
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [pharmacyId, periodo])

  useEffect(() => {
    if (pharmacyId) loadStats()
    else setLoading(false)
  }, [pharmacyId, loadStats])

  const formatBRL = (v) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0))

  const toggleChart = (key) => {
    setVisibleCharts((current) => ({ ...current, [key]: !current[key] }))
  }

  if (resolvingPharmacy) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500">Identificando farmácia vinculada...</p>
      </div>
    )
  }

  if (!pharmacyId) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <LayoutDashboard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Nenhuma farmácia vinculada.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Visão geral da loja</h2>
          <p className="text-xs text-gray-500">Métricas de pedidos entregues e avaliações dos clientes</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
          >
            <option value="semana">Última semana</option>
            <option value="mes">Este mês</option>
            <option value="todos">Todo o período</option>
          </select>
          <button
            type="button"
            onClick={loadStats}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ['status', 'Status'],
          ['funil', 'Funil'],
          ['meses', 'Meses'],
          ['entrega', 'Entrega'],
          ['receitas', 'Receitas'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleChart(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              visibleCharts[key]
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-white border-gray-200 text-gray-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {loading && !stats ? (
        <div className="flex justify-center py-16 bg-white rounded-xl shadow-sm">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-3">
                <DollarSign className="w-8 h-8 text-emerald-500" />
                <TrendingUp className="w-4 h-4 text-gray-300" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {formatBRL(stats?.faturamento_periodo)}
              </p>
              <p className="text-sm text-gray-600 mt-1">Faturamento no período</p>
              <p className="text-xs text-gray-400 mt-2">
                Total histórico: {formatBRL(stats?.faturamento_total)}
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-3">
                <ShoppingCart className="w-8 h-8 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats?.pedidos_entregues ?? 0}</p>
              <p className="text-sm text-gray-600 mt-1">Pedidos entregues</p>
              <p className="text-xs text-gray-400 mt-2">
                Hoje (todos os status): {stats?.pedidos_hoje ?? 0}
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <p className="text-2xl font-bold text-gray-900">
                {formatBRL(stats?.ticket_medio_periodo)}
              </p>
              <p className="text-sm text-gray-600 mt-1">Ticket médio (entregues)</p>
              <p className="text-xs text-gray-400 mt-2">
                {stats?.total_pedidos_periodo ?? 0} pedido(s) no período
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`w-5 h-5 ${
                      n <= Math.round(stats?.avaliacao_media || 0)
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-gray-200'
                    }`}
                  />
                ))}
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {(stats?.avaliacao_media ?? 0).toFixed(1)}
              </p>
              <p className="text-sm text-gray-600 mt-1">Avaliação média da farmácia</p>
              <p className="text-xs text-gray-400 mt-2">
                {stats?.total_avaliacoes ?? 0} avaliação(ões)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {visibleCharts.status && <OrdersByStatusChart pedidosPorStatus={stats?.pedidos_por_status} />}
            {visibleCharts.funil && (
              <ConversionFunnelCard
                pedidosPorStatus={stats?.pedidos_por_status}
                totalPedidosPeriodo={stats?.total_pedidos_periodo}
              />
            )}
            {visibleCharts.meses && <MonthlyRevenueChart faturamentoPorMes={stats?.faturamento_por_mes} />}
            {visibleCharts.entrega && <DeliveryTypeChart pedidosPorTipoEntrega={stats?.pedidos_por_tipo_entrega} />}
            {visibleCharts.receitas && <PrescriptionMixChart itensPorClassificacao={stats?.itens_por_classificacao} />}
          </div>
        </>
      )}
    </div>
  )
}

/* ────────── Produtos Panel ────────── */
const emptyProductForm = () => ({
  nome: '',
  descricao: '',
  categoria: '',
  principio_ativo: '',
  fabricante: '',
  dosagem: '',
  forma_farmaceutica: '',
  classificacao_receita: 'sem_receita',
  receita_obrigatoria: false,
  controlado: false,
  validade_receita_dias: '',
  imagem_url: '',
  preco: '',
  preco_promocional: '',
  estoque: '',
})

const PRODUTO_SUB_TABS = [
  { id: 'catalogo', label: 'Medicamentos com receita' },
  { id: 'outros', label: 'Outros itens' },
  { id: 'otc', label: 'Venda livre (OTC)' },
]

const emptyOutroForm = () => ({
  nome: '',
  descricao: '',
  categoria: '',
  preco: '',
  estoque: '',
  imagem_url: '',
})

function ProdutosPanel({ pharmacyId, resolvingPharmacy = false }) {
  const [subTab, setSubTab] = useState('catalogo')
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)

  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogResults, setCatalogResults] = useState([])
  const [catalogSearching, setCatalogSearching] = useState(false)
  const [activateItem, setActivateItem] = useState(null)
  const [activateForm, setActivateForm] = useState({ estoque: '', preco: '' })
  const [stockEditProduct, setStockEditProduct] = useState(null)
  const [stockValue, setStockValue] = useState('')
  const [stockPriceValue, setStockPriceValue] = useState('')

  const [showOtcForm, setShowOtcForm] = useState(false)
  const [showOutroForm, setShowOutroForm] = useState(false)
  const [otcForm, setOtcForm] = useState(emptyProductForm)
  const [outroForm, setOutroForm] = useState(emptyOutroForm)
  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    if (pharmacyId) loadProducts()
    else setLoading(false)
  }, [pharmacyId])

  useEffect(() => {
    if (pharmacyId && subTab === 'catalogo' && catalogResults.length === 0) {
      loadCatalogDefaults()
    }
  }, [pharmacyId, subTab])

  const loadProducts = async () => {
    try {
      setLoading(true)
      const prodRes = await productService.getAll({ id_farmacia: pharmacyId, limit: 500 })
      const d = prodRes.data?.data
      setProducts(d?.produtos || d?.docs || (Array.isArray(d) ? d : []))
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const catalogProducts = products.filter((p) => p.tipo_produto === 'medicamento_catalogo')
  const outrosProducts = products.filter((p) => p.tipo_produto === 'outro')
  const otcProducts = products.filter(
    (p) =>
      p.tipo_produto === 'medicamento_otc' ||
      (!p.tipo_produto && p.classificacao_receita === 'sem_receita'),
  )

  const filteredList =
    subTab === 'catalogo' ? catalogProducts : subTab === 'outros' ? outrosProducts : otcProducts

  const searchCatalog = async () => {
    const q = catalogQuery.trim()
    if (q.length < 2) {
      loadCatalogDefaults()
      return
    }
    try {
      setCatalogSearching(true)
      const res = await medicineCatalogService.search({ q, limit: 20 })
      setCatalogResults(res.data?.data?.itens || [])
    } catch {
      setCatalogResults([])
    } finally {
      setCatalogSearching(false)
    }
  }

  async function loadCatalogDefaults() {
    try {
      setCatalogSearching(true)
      const res = await medicineCatalogService.search({ limit: 20 })
      setCatalogResults(res.data?.data?.itens || [])
    } catch {
      setCatalogResults([])
    } finally {
      setCatalogSearching(false)
    }
  }

  const openActivate = (item) => {
    setActivateItem(item)
    setActivateForm({
      estoque: '',
      preco: item.preco_sugerido != null ? String(item.preco_sugerido) : '',
    })
    setError(null)
  }

  const submitActivate = async (e) => {
    e.preventDefault()
    if (!activateItem) return
    try {
      setSaving(true)
      setError(null)
      await pharmacyOwnerService.activateCatalogProduct(pharmacyId, {
        id_catalogo: activateItem._id,
        estoque: Number(activateForm.estoque),
        preco: activateForm.preco !== '' ? Number(activateForm.preco) : undefined,
      })
      setMessage('Medicamento ativado na loja!')
      setActivateItem(null)
      loadProducts()
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setError(err.message || err.data?.message || 'Erro ao ativar medicamento')
    } finally {
      setSaving(false)
    }
  }

  const submitStockOnly = async (e) => {
    e.preventDefault()
    if (!stockEditProduct) return
    try {
      setSaving(true)
      await pharmacyOwnerService.updateProduct(stockEditProduct._id, {
        estoque: Number(stockValue),
        preco: Number(stockPriceValue),
      })
      setMessage('Estoque e preço atualizados!')
      setStockEditProduct(null)
      setStockPriceValue('')
      loadProducts()
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setError(err.message || 'Erro ao atualizar estoque')
    } finally {
      setSaving(false)
    }
  }

  const buildOtcPayload = () => {
    const preco = Number(otcForm.preco)
    const url = String(otcForm.imagem_url || '').trim()
    return {
      tipo_produto: 'medicamento_otc',
      nome: String(otcForm.nome).trim(),
      descricao: String(otcForm.descricao || '').trim() || undefined,
      principio_ativo: String(otcForm.principio_ativo).trim(),
      categoria: String(otcForm.categoria).trim(),
      fabricante: String(otcForm.fabricante || '').trim() || undefined,
      dosagem: String(otcForm.dosagem || '').trim() || undefined,
      forma_farmaceutica: String(otcForm.forma_farmaceutica || '').trim() || undefined,
      classificacao_receita: 'sem_receita',
      receita_obrigatoria: false,
      controlado: false,
      imagens: url ? [url] : [],
      preco,
      estoque: Number(otcForm.estoque),
      id_farmacia: pharmacyId,
    }
  }

  const buildOutroPayload = () => {
    const url = String(outroForm.imagem_url || '').trim()
    return {
      tipo_produto: 'outro',
      nome: String(outroForm.nome).trim(),
      descricao: String(outroForm.descricao || '').trim() || undefined,
      categoria: String(outroForm.categoria).trim(),
      imagens: url ? [url] : [],
      preco: Number(outroForm.preco),
      estoque: Number(outroForm.estoque),
      id_farmacia: pharmacyId,
    }
  }

  const handleOtcSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      setSaving(true)
      const payload = buildOtcPayload()
      if (editingId) {
        await pharmacyOwnerService.updateProduct(editingId, payload)
        setMessage('Produto OTC atualizado!')
      } else {
        await pharmacyOwnerService.createProduct(payload)
        setMessage('Produto OTC criado!')
      }
      setShowOtcForm(false)
      setOtcForm(emptyProductForm())
      setEditingId(null)
      loadProducts()
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setError(err.message || 'Erro ao salvar produto')
    } finally {
      setSaving(false)
    }
  }

  const handleOutroSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      setSaving(true)
      const payload = buildOutroPayload()
      if (editingId) {
        await pharmacyOwnerService.updateProduct(editingId, payload)
        setMessage('Item atualizado!')
      } else {
        await pharmacyOwnerService.createProduct(payload)
        setMessage('Item cadastrado!')
      }
      setShowOutroForm(false)
      setOutroForm(emptyOutroForm())
      setEditingId(null)
      loadProducts()
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setError(err.message || 'Erro ao salvar item')
    } finally {
      setSaving(false)
    }
  }

  const handleEditOtc = (p) => {
    setOtcForm({
      nome: p.nome || '',
      descricao: p.descricao || '',
      preco: String(p.preco ?? ''),
      estoque: String(p.estoque ?? ''),
      categoria: p.categoria || '',
      principio_ativo: p.principio_ativo || '',
      fabricante: p.fabricante || '',
      dosagem: p.dosagem || '',
      forma_farmaceutica: p.forma_farmaceutica || '',
      classificacao_receita: 'sem_receita',
      receita_obrigatoria: false,
      controlado: false,
      validade_receita_dias: '',
      imagem_url: (Array.isArray(p.imagens) && p.imagens[0]) || '',
      preco_promocional: '',
    })
    setEditingId(p._id)
    setShowOtcForm(true)
    setSubTab('otc')
  }

  const handleEditOutro = (p) => {
    setOutroForm({
      nome: p.nome || '',
      descricao: p.descricao || '',
      categoria: p.categoria || '',
      preco: String(p.preco ?? ''),
      estoque: String(p.estoque ?? ''),
      imagem_url: (Array.isArray(p.imagens) && p.imagens[0]) || '',
    })
    setEditingId(p._id)
    setShowOutroForm(true)
    setSubTab('outros')
  }

  const renderProductTable = (list, { stockOnly = false, onEdit } = {}) => {
    if (list.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500 text-sm">
          Nenhum produto nesta categoria.
        </div>
      )
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Nome</th>
              <th className="px-4 py-3 text-left font-semibold">Tipo</th>
              <th className="px-4 py-3 text-left font-semibold">Categoria</th>
              <th className="px-4 py-3 text-left font-semibold">Preço</th>
              <th className="px-4 py-3 text-left font-semibold">Estoque</th>
              <th className="px-4 py-3 text-left font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p._id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{p.nome}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{productTipoLabel(p.tipo_produto)}</td>
                <td className="px-4 py-3 text-gray-600">{p.categoria || '—'}</td>
                <td className="px-4 py-3">R$ {Number(p.preco || 0).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    (p.estoque ?? 0) > 50 ? 'bg-green-100 text-green-800'
                    : (p.estoque ?? 0) > 10 ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                  }`}>
                    {p.estoque ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {stockOnly ? (
                    <button
                      type="button"
                      onClick={() => {
                        setStockEditProduct(p)
                        setStockValue(String(p.estoque ?? ''))
                        setStockPriceValue(String(p.preco ?? ''))
                      }}
                      className="text-emerald-600 hover:text-emerald-800"
                      title="Ajustar estoque e preço"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onEdit?.(p)}
                      className="text-blue-600 hover:text-blue-800"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (resolvingPharmacy) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500">Identificando farmácia vinculada...</p>
      </div>
    )
  }

  if (!pharmacyId) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Nenhuma farmácia vinculada.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
            <Package className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Estoque / Cadastrar Produtos</h2>
            <p className="text-xs text-gray-400">{products.length} produto(s) no total</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadProducts}
          disabled={loading}
          className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex gap-2 px-5 pt-4 overflow-x-auto border-b border-gray-100 pb-3">
        {PRODUTO_SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setSubTab(t.id)
              setError(null)
              setShowOtcForm(false)
              setShowOutroForm(false)
              setActivateItem(null)
              setEditingId(null)
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              subTab === t.id
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {message && <div className="px-5 pt-4"><Alert type="success" message={message} /></div>}
      {error && <div className="px-5 pt-4"><Alert type="error" message={error} onClose={() => setError(null)} /></div>}

      {subTab === 'catalogo' && (
        <div className="p-5 space-y-4 border-b border-gray-100">
          <p className="text-xs text-gray-500">
            Medicamentos com receita entram pelo catálogo oficial. Busque por nome, princípio ativo ou tarja. Após ativar, só estoque e preço da loja são ajustados.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchCatalog())}
                placeholder="Ex: amoxicilina, clonazepam, azitromicina..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <button
              type="button"
              onClick={searchCatalog}
              disabled={catalogSearching}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold"
            >
              {catalogSearching ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
          {catalogResults.length > 0 && (
            <ul className="border border-gray-200 rounded-lg divide-y max-h-48 overflow-y-auto">
              {catalogResults.map((item) => (
                <li key={item._id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{item.nome}</span>
                    <span className="text-gray-500 ml-2 text-xs">{item.principio_ativo}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openActivate(item)}
                    className="text-primary font-semibold text-xs hover:underline"
                  >
                    Ativar
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!catalogSearching && catalogResults.length === 0 && (
            <p className="text-xs text-gray-400">
              Nenhum item no catálogo. Tente nome do medicamento, princípio ativo ou classificação da receita.
            </p>
          )}
        </div>
      )}

      {editingId && (showOutroForm || showOtcForm) && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => {
            setShowOutroForm(false)
            setShowOtcForm(false)
            setOutroForm(emptyOutroForm())
            setOtcForm(emptyProductForm())
            setEditingId(null)
          }}
        />
      )}

      {subTab === 'outros' && showOutroForm && (
        <form
          onSubmit={handleOutroSubmit}
          className={
            editingId
              ? 'fixed left-1/2 top-1/2 z-50 w-[min(92vw,620px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl space-y-3 max-h-[86vh] overflow-y-auto'
              : 'p-5 border-b border-gray-100 bg-gray-50/50 space-y-3'
          }
        >
          {editingId && <h3 className="font-bold text-gray-900">Editar item</h3>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Nome do item * (ex: fralda geriátrica G)"
              aria-label="Nome do item"
              value={outroForm.nome}
              onChange={(e) => setOutroForm({ ...outroForm, nome: e.target.value })}
              required
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <select
              value={outroForm.categoria}
              onChange={(e) => setOutroForm({ ...outroForm, categoria: e.target.value })}
              required
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="">Categoria *</option>
              {CATEGORIAS_OUTROS_ITENS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <textarea
            rows={2}
            placeholder="Descrição/composição (ex: pacote com 8 unidades)"
            aria-label="Descrição ou composição do item"
            value={outroForm.descricao}
            onChange={(e) => setOutroForm({ ...outroForm, descricao: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Preço em reais * (ex: 19.90)"
              aria-label="Preço em reais"
              value={outroForm.preco}
              onChange={(e) => setOutroForm({ ...outroForm, preco: e.target.value })}
              required
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <input
              type="number"
              min="0"
              placeholder="Estoque em unidades * (ex: 30)"
              aria-label="Estoque em unidades"
              value={outroForm.estoque}
              onChange={(e) => setOutroForm({ ...outroForm, estoque: e.target.value })}
              required
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <ImageCropUploadField
            label="Imagem do item (opcional)"
            value={outroForm.imagem_url}
            onChange={(url) => setOutroForm({ ...outroForm, imagem_url: url })}
            disabled={saving}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-semibold">
              {saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar item'}
            </button>
            <button
              type="button"
              onClick={() => { setShowOutroForm(false); setOutroForm(emptyOutroForm()); setEditingId(null) }}
              className="px-4 py-2 bg-gray-200 rounded-xl text-sm"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {subTab === 'otc' && showOtcForm && (
        <form
          onSubmit={handleOtcSubmit}
          className={
            editingId
              ? 'fixed left-1/2 top-1/2 z-50 w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl space-y-3 max-h-[86vh] overflow-y-auto'
              : 'p-5 border-b border-gray-100 bg-gray-50/50 space-y-3 max-h-[70vh] overflow-y-auto'
          }
        >
          {editingId && <h3 className="font-bold text-gray-900">Editar medicamento OTC</h3>}
          <p className="text-xs text-gray-500">Somente medicamentos de venda livre (sem receita).</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Nome * (ex: Dipirona 500mg)"
              aria-label="Nome do medicamento"
              value={otcForm.nome}
              onChange={(e) => setOtcForm({ ...otcForm, nome: e.target.value })}
              required
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <select
              value={otcForm.categoria}
              onChange={(e) => setOtcForm({ ...otcForm, categoria: e.target.value })}
              required
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="">Categoria *</option>
              {CATEGORIAS_MEDICAMENTO.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="Princípio ativo/composição * (ex: dipirona sódica 500mg)"
            aria-label="Princípio ativo ou composição"
            value={otcForm.principio_ativo}
            onChange={(e) => setOtcForm({ ...otcForm, principio_ativo: e.target.value })}
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <textarea
            rows={2}
            placeholder="Descrição (ex: analgésico e antitérmico de venda livre)"
            aria-label="Descrição do medicamento"
            value={otcForm.descricao}
            onChange={(e) => setOtcForm({ ...otcForm, descricao: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
          />
          <ImageCropUploadField
            label="Imagem do produto (opcional)"
            value={otcForm.imagem_url}
            onChange={(url) => setOtcForm({ ...otcForm, imagem_url: url })}
            disabled={saving}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              step="0.01"
              placeholder="Preço em reais * (ex: 12.90)"
              aria-label="Preço em reais"
              value={otcForm.preco}
              onChange={(e) => setOtcForm({ ...otcForm, preco: e.target.value })}
              required
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <input
              type="number"
              min="0"
              placeholder="Estoque em unidades * (ex: 50)"
              aria-label="Estoque em unidades"
              value={otcForm.estoque}
              onChange={(e) => setOtcForm({ ...otcForm, estoque: e.target.value })}
              required
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-semibold">
              {saving ? 'Salvando...' : editingId ? 'Atualizar OTC' : 'Cadastrar OTC'}
            </button>
            <button
              type="button"
              onClick={() => { setShowOtcForm(false); setOtcForm(emptyProductForm()); setEditingId(null) }}
              className="px-4 py-2 bg-gray-200 rounded-xl text-sm"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="px-5 py-3 flex justify-end gap-2 border-b border-gray-50">
        {subTab === 'outros' && !showOutroForm && (
          <button
            type="button"
            onClick={() => setShowOutroForm(true)}
            className="flex items-center gap-1 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Novo item
          </button>
        )}
        {subTab === 'otc' && !showOtcForm && (
          <button
            type="button"
            onClick={() => setShowOtcForm(true)}
            className="flex items-center gap-1 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Novo OTC
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        renderProductTable(filteredList, {
          stockOnly: subTab === 'catalogo',
          onEdit: subTab === 'otc' ? handleEditOtc : handleEditOutro,
        })
      )}

      {activateItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={submitActivate} className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-gray-900">Ativar na loja</h3>
            <p className="text-sm text-gray-600">{activateItem.nome}</p>
            <div>
              <label className="text-xs text-gray-500">Preço inicial (R$) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={activateForm.preco}
                onChange={(e) => setActivateForm({ ...activateForm, preco: e.target.value })}
                required
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Estoque *</label>
              <input
                type="number"
                min="0"
                value={activateForm.estoque}
                onChange={(e) => setActivateForm({ ...activateForm, estoque: e.target.value })}
                required
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-semibold">
                {saving ? 'Ativando...' : 'Confirmar'}
              </button>
              <button type="button" onClick={() => setActivateItem(null)} className="px-4 py-2 bg-gray-200 rounded-xl text-sm">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {stockEditProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={submitStockOnly} className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6 space-y-4">
            <h3 className="font-bold text-gray-900">Ajustar estoque e preço</h3>
            <p className="text-sm text-gray-600">{stockEditProduct.nome}</p>
            <p className="text-xs text-amber-700">Produto do catálogo: nome, composição e tarja não podem ser alterados.</p>
            <div>
              <label className="text-xs text-gray-500">Preço da loja (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={stockPriceValue}
                onChange={(e) => setStockPriceValue(e.target.value)}
                required
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Estoque em unidades</label>
              <input
                type="number"
                min="0"
                value={stockValue}
                onChange={(e) => setStockValue(e.target.value)}
                required
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-semibold">
                Salvar
              </button>
              <button
                type="button"
                onClick={() => {
                  setStockEditProduct(null)
                  setStockPriceValue('')
                }}
                className="px-4 py-2 bg-gray-200 rounded-xl text-sm"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/* ────────── Farmacêuticos ────────── */
function FarmaceuticosPanel({ pharmacyId, resolvingPharmacy = false }) {
  const [pharmacists, setPharmacists] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    nome: '',
    email: '',
    telefone: '',
    crm: '',
    senha: '',
    disponivel_chat: true,
  })

  const loadPharmacists = async () => {
    if (!pharmacyId) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const res = await pharmacistService.getByPharmacy(pharmacyId)
      setPharmacists(res.data?.data?.pharmacists || [])
    } catch (err) {
      setError(err.message || err.response?.data?.message || 'Erro ao carregar farmacêuticos')
      setPharmacists([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPharmacists()
  }, [pharmacyId])

  const resetForm = () => {
    setForm({
      nome: '',
      email: '',
      telefone: '',
      crm: '',
      senha: '',
      disponivel_chat: true,
    })
    setEditingId(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      if (editingId) {
        await pharmacistService.update(editingId, {
          nome: form.nome,
          email: form.email,
          telefone: form.telefone,
          disponivel_chat: form.disponivel_chat,
        })
        setMessage('Farmacêutico atualizado com sucesso.')
      } else {
        await pharmacistService.create({
          nome: form.nome,
          email: form.email,
          telefone: form.telefone,
          crm: form.crm,
          senha: form.senha,
          id_farmacia: pharmacyId,
          disponivel_chat: form.disponivel_chat,
        })
        setMessage('Farmacêutico adicionado com sucesso.')
      }
      resetForm()
      loadPharmacists()
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Erro ao salvar farmacêutico')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (item) => {
    setEditingId(item._id)
    setForm({
      nome: item.nome || '',
      email: item.email || '',
      telefone: item.telefone || '',
      crm: item.crm || '',
      senha: '',
      disponivel_chat: item.disponivel_chat !== false,
    })
  }

  const handleDisable = async (id) => {
    if (!window.confirm('Desativar este farmacêutico?')) return
    try {
      await pharmacistService.remove(id)
      setMessage('Farmacêutico desativado.')
      loadPharmacists()
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Erro ao desativar farmacêutico')
    }
  }

  if (resolvingPharmacy) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500">Identificando farmácia vinculada...</p>
      </div>
    )
  }

  if (!pharmacyId) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Nenhuma farmácia vinculada.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Adicionar / Gerenciar Farmacêuticos</h2>
            <p className="text-xs text-gray-400">{pharmacists.length} cadastrado(s)</p>
          </div>
        </div>
        <button onClick={loadPharmacists} disabled={loading} className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {message && <div className="px-5 pt-4"><Alert type="success" message={message} /></div>}
      {error && <div className="px-5 pt-4"><Alert type="error" message={error} onClose={() => setError(null)} /></div>}

      <form onSubmit={handleSubmit} className="p-5 border-b border-gray-100 bg-gray-50/50 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Nome do farmacêutico"
            required
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="E-mail"
            required
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={form.telefone}
            onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            placeholder="Telefone"
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <input
            type="text"
            value={form.crm}
            onChange={(e) => setForm({ ...form, crm: e.target.value })}
            placeholder="CRM"
            disabled={!!editingId}
            required
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-100"
          />
        </div>
        {!editingId && (
          <input
            type="password"
            value={form.senha}
            onChange={(e) => setForm({ ...form, senha: e.target.value })}
            placeholder="Senha para login no painel (mín. 6 caracteres)"
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        )}
        <label className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm w-fit">
          <input
            type="checkbox"
            checked={form.disponivel_chat}
            onChange={(e) => setForm({ ...form, disponivel_chat: e.target.checked })}
          />
          Disponivel no chat
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-secondary disabled:opacity-50">
            {saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Adicionar farmacêutico'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : pharmacists.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-500">Nenhum farmacêutico cadastrado.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Nome</th>
                <th className="px-4 py-3 text-left font-semibold">Contato</th>
                <th className="px-4 py-3 text-left font-semibold">CRM</th>
                <th className="px-4 py-3 text-left font-semibold">Chat</th>
                <th className="px-4 py-3 text-left font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pharmacists.map((item) => (
                <tr key={item._id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{item.nome || '-'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{item.email || '-'}{item.telefone ? ` · ${item.telefone}` : ''}</td>
                  <td className="px-4 py-3">{item.crm || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.disponivel_chat === false ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                      {item.disponivel_chat === false ? 'Offline' : 'Online'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800" title="Editar">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDisable(item._id)} className="text-red-600 hover:text-red-800 text-xs font-semibold">
                        Desativar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ────────── Histórico das Receitas ────────── */
function ReceitasHistoryPanel() {
  const [prescriptions, setPrescriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    loadPrescriptions()
  }, [])

  const loadPrescriptions = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await prescriptionService.getAllForPharmacist({
        status: 'todos',
        page: 1,
        limit: 100,
      })
      const data = res.data?.data
      setPrescriptions(Array.isArray(data) ? data : (data?.docs || data?.receitas || []))
    } catch (err) {
      setError(err.message || err.response?.data?.message || 'Erro ao carregar receitas')
      setPrescriptions([])
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status) => {
    const map = {
      'Pendente': { color: 'bg-yellow-100 text-yellow-700', icon: Clock },
      'Em Análise': { color: 'bg-blue-100 text-blue-700', icon: Eye },
      'Aprovada': { color: 'bg-green-100 text-green-700', icon: Clock },
      'Rejeitada': { color: 'bg-red-100 text-red-700', icon: Clock },
    }
    const s = map[status] || map['Pendente']
    const Icon = s.icon
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${s.color}`}>
        <Icon className="w-3 h-3" /> {status}
      </span>
    )
  }

  const termo = search.trim().toLowerCase()
  const receitasFiltradas = prescriptions.filter((rx) => {
    if (!termo) return true
    const blob = [
      rx?._id,
      rx?.status,
      rx?.nome_arquivo,
      rx?.id_usuario?.nome,
      rx?.id_usuario?.email,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return blob.includes(termo)
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Histórico de receitas</h2>
            <p className="text-xs text-gray-400">
              {prescriptions.length} receita(s) · somente leitura (validação pelo farmacêutico)
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar receita por cliente, arquivo, status..."
            className="px-3 py-2 border rounded-lg text-sm w-80"
          />
          <button
            onClick={loadPrescriptions}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="px-5 pt-4"><Alert type="error" message={error} onClose={() => setError(null)} /></div>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : receitasFiltradas.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nenhuma receita encontrada</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {receitasFiltradas.map((rx) => (
            <div key={rx._id} className="p-5">
              <div
                className="flex items-center gap-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === rx._id ? null : rx._id)}
              >
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-gray-900 truncate">
                      {rx.nome_arquivo || 'Receita médica'}
                    </p>
                    {getStatusBadge(rx.status)}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {rx.id_usuario?.nome || rx.id_usuario?.email || 'Paciente'}
                    </span>
                    <span className="mx-2">·</span>
                    {new Date(rx.createdAt).toLocaleDateString('pt-BR')} às{' '}
                    {new Date(rx.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {expandedId === rx._id ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </div>

              {expandedId === rx._id && (
                <div className="mt-4 ml-14 space-y-4">
                  {(() => {
                    const file = rx.url_imagem_publica || rx.url_arquivo
                    if (!file) return null
                    const fileUrl = file.startsWith('http')
                      ? file
                      : `/${file.replace(/^\/+/, '').replace(/\\/g, '/')}`
                    const fileKind = String(file).toLowerCase()
                    const canPreviewAsImage =
                      !fileKind.includes('.pdf') &&
                      !fileKind.includes('.xml') &&
                      !fileKind.includes('application/pdf') &&
                      !fileKind.includes('application/xml') &&
                      !fileKind.includes('text/xml')
                    return (
                      <div className="space-y-2 max-w-md">
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-secondary"
                        >
                          <Eye className="w-4 h-4" />
                          Abrir receita digital
                        </a>
                        {canPreviewAsImage && (
                          <div className="rounded-xl overflow-hidden border border-gray-200">
                            <img
                              src={fileUrl}
                              alt="Receita"
                              className="w-full object-contain max-h-96 bg-gray-50"
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {rx.dados_ocr && (
                    <div className="bg-blue-50 rounded-xl p-4 text-sm">
                      <p className="font-semibold text-blue-700 mb-2">Dados extraídos (OCR):</p>
                      <div className="grid grid-cols-2 gap-2 text-blue-600">
                        {rx.dados_ocr.medico && <p><span className="font-medium">Médico:</span> {rx.dados_ocr.medico}</p>}
                        {rx.dados_ocr.crm && <p><span className="font-medium">CRM:</span> {rx.dados_ocr.crm}</p>}
                        {rx.dados_ocr.principio_ativo && (
                          <p><span className="font-medium">Princípio ativo:</span> {rx.dados_ocr.principio_ativo}</p>
                        )}
                        {rx.dados_ocr.data_emissao && (
                          <p><span className="font-medium">Emissão:</span> {new Date(rx.dados_ocr.data_emissao).toLocaleDateString('pt-BR')}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {rx.validacao_crm && (
                    <div className={`rounded-xl p-3 text-sm ${rx.validacao_crm.valido ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      <span className="font-semibold">CRM: </span>
                      {rx.validacao_crm.valido ? '✓ Verificado' : '✗ Não verificado'}
                      {rx.validacao_crm.detalhes && ` — ${rx.validacao_crm.detalhes}`}
                    </div>
                  )}

                  {rx.observacoes && (
                    <div className="text-sm bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <span className="font-semibold">Observações:</span> {rx.observacoes}
                    </div>
                  )}
                  <div className="text-xs text-gray-500">
                    Status atual: <span className="font-semibold">{rx.status}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ────────── Histórico de Chats ────────── */
function ChatsHistoryPanel() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    loadTickets()
  }, [])

  const loadTickets = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await supportService.getAllTickets()
      const data = res.data?.data
      setTickets(Array.isArray(data) ? data : (data?.tickets || data?.mensagens || []))
    } catch (err) {
      setError(err.message || err.response?.data?.message || 'Erro ao carregar tickets')
      setTickets([])
    } finally {
      setLoading(false)
    }
  }

  const statusColors = {
    'aberta': 'bg-yellow-100 text-yellow-700',
    'em_atendimento': 'bg-blue-100 text-blue-700',
    'respondida': 'bg-green-100 text-green-700',
    'encerrada': 'bg-gray-100 text-gray-500',
  }

  const statusLabels = {
    'aberta': 'Aberta',
    'em_atendimento': 'Em Atendimento',
    'respondida': 'Respondida',
    'encerrada': 'Encerrada',
  }

  const prioridadeColors = {
    'baixa': 'text-gray-400',
    'normal': 'text-blue-400',
    'alta': 'text-orange-500',
    'urgente': 'text-red-500',
  }

  const termo = search.trim().toLowerCase()
  const filteredTickets = tickets.filter((t) => {
    if (!termo) return true
    const blob = [
      t?._id,
      t?.assunto,
      t?.categoria,
      t?.status,
      t?.id_usuario?.nome,
      t?.id_atendente?.nome,
      ...(t?.mensagens || []).map((m) => m?.texto || ''),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return blob.includes(termo)
  })

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Histórico de Chats</h2>
              <p className="text-xs text-gray-400">{filteredTickets.length} ticket(s)</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por cliente, assunto, texto..."
              className="px-3 py-2 border rounded-lg text-sm w-80"
            />
            <button
              onClick={loadTickets}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {error && <div className="px-5 pt-4"><Alert type="error" message={error} onClose={() => setError(null)} /></div>}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Nenhum chat encontrado</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredTickets
              .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
              .map((ticket) => (
              <div key={ticket._id} className="p-5">
                <div
                  className="flex items-center gap-4 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === ticket._id ? null : ticket._id)}
                >
                  <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-gray-900 truncate">
                        {ticket.assunto || ticket.categoria || 'Ticket de suporte'}
                      </p>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${statusColors[ticket.status] || 'bg-gray-100 text-gray-500'}`}>
                        {statusLabels[ticket.status] || ticket.status}
                      </span>
                      {ticket.prioridade && ticket.prioridade !== 'normal' && (
                        <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${prioridadeColors[ticket.prioridade]}`}>
                          <AlertTriangle className="w-3 h-3" />
                          {ticket.prioridade.charAt(0).toUpperCase() + ticket.prioridade.slice(1)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {ticket.id_usuario?.nome || ticket.id_usuario?.email || 'Usuário'}
                      </span>
                      <span className="mx-2">·</span>
                      {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
                      {ticket.id_atendente && (
                        <>
                          <span className="mx-2">·</span>
                          Atendente: {ticket.id_atendente?.nome || 'Você'}
                        </>
                      )}
                    </p>
                  </div>
                  {expandedId === ticket._id ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>

                {expandedId === ticket._id && (
                  <div className="mt-4 ml-14 space-y-4">
                    {/* Messages */}
                    <div className="bg-gray-50 rounded-xl p-4 max-h-80 overflow-y-auto space-y-3">
                      {(ticket.mensagens || []).length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">Nenhuma mensagem ainda</p>
                      ) : (
                        ticket.mensagens.map((msg, i) => {
                          const isStaff = ['farmaceutico', 'admin', 'sistema'].includes(msg.tipo_remetente)
                          return (
                            <div key={i} className={`flex ${isStaff ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                                isStaff
                                  ? 'bg-primary text-white rounded-br-md'
                                  : 'bg-white border border-gray-200 text-gray-700 rounded-bl-md'
                              }`}>
                                <p className={`text-[10px] font-bold mb-1 ${isStaff ? 'text-white/70' : 'text-gray-400'}`}>
                                  {msg.tipo_remetente === 'usuario' ? 'Cliente' : msg.tipo_remetente === 'farmaceutico' ? 'Farmacêutico' : 'Admin'}
                                </p>
                                <p>{msg.texto}</p>
                                <p className={`text-[10px] mt-1 ${isStaff ? 'text-white/50' : 'text-gray-300'}`}>
                                  {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          )
                        })
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    <div className="text-xs text-gray-500">
                      Atendente: {ticket.id_atendente?.nome || 'Nao atribuido'} ·
                      Mensagens: {Array.isArray(ticket.mensagens) ? ticket.mensagens.length : 0}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
