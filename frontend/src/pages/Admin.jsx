import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/store'
import { adminService } from '../services/api'
import Alert from '../components/Alert'
import Modal from '../components/Modal'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  BarChart3, Users, ShoppingCart, Package, TrendingUp,
  AlertCircle, RefreshCw, Eye, Shield,
  Store, FileText, Activity, ChevronLeft, ChevronRight,
  Search, ToggleLeft, ToggleRight
} from 'lucide-react'

const ROLE_LABELS = {
  cliente: 'Cliente',
  entregador: 'Entregador',
  dono_farmacia: 'Dono de Farmácia',
  farmaceutico: 'Farmacêutico',
  administrador: 'Administrador',
}

const ROLE_COLORS = {
  cliente: 'bg-blue-100 text-blue-800',
  entregador: 'bg-yellow-100 text-yellow-800',
  dono_farmacia: 'bg-emerald-100 text-emerald-800',
  farmaceutico: 'bg-purple-100 text-purple-800',
  administrador: 'bg-red-100 text-red-800',
}

const ORDER_STATUS_LABELS = {
  aguardando_pagamento: 'Aguardando Pagamento',
  confirmado: 'Confirmado',
  em_processamento: 'Em Processamento',
  enviado: 'Enviado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

function formatCurrency(v) {
  return `R$ ${(Number(v) || 0).toFixed(2)}`
}

function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function Admin() {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  // Dashboard
  const [stats, setStats] = useState(null)

  // Users
  const [users, setUsers] = useState([])
  const [usersTotal, setUsersTotal] = useState(0)
  const [usersPage, setUsersPage] = useState(1)
  const [usersSearch, setUsersSearch] = useState('')
  const [usersRoleFilter, setUsersRoleFilter] = useState('')
  const [usersLoading, setUsersLoading] = useState(false)

  // Products
  const [products, setProducts] = useState([])
  const [productsTotal, setProductsTotal] = useState(0)
  const [productsPage, setProductsPage] = useState(1)
  const [productsSearch, setProductsSearch] = useState('')
  const [productsLoading, setProductsLoading] = useState(false)

  // Catálogo mestre de medicamentos (com receita)
  const [catalogItems, setCatalogItems] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogForm, setCatalogForm] = useState({
    nome: '',
    principio_ativo: '',
    classificacao_receita: 'tarja_vermelha',
    categoria: 'Outro',
    preco_sugerido: '',
  })
  const [catalogSaving, setCatalogSaving] = useState(false)

  // Pharmacies
  const [pharmacies, setPharmacies] = useState([])
  const [pharmaciesTotal, setPharmaciesTotal] = useState(0)
  const [pharmaciesPage, setPharmaciesPage] = useState(1)
  const [pharmaciesSearch, setPharmaciesSearch] = useState('')
  const [pharmaciesLoading, setPharmaciesLoading] = useState(false)

  // Audit
  const [auditLogs, setAuditLogs] = useState([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditPage, setAuditPage] = useState(1)
  const [auditLoading, setAuditLoading] = useState(false)

  // User detail modal
  const [selectedUser, setSelectedUser] = useState(null)

  useEffect(() => {
    if (!isAuthenticated() || user?.role !== 'administrador') {
      navigate('/')
      return
    }
    loadDashboard()
  }, [])

  useEffect(() => {
    if (activeTab === 'dashboard') loadDashboard()
    else if (activeTab === 'users') loadUsers()
    else if (activeTab === 'products') {
      loadProducts()
      loadMedicineCatalog()
    }
    else if (activeTab === 'pharmacies') loadPharmacies()
    else if (activeTab === 'audit') loadAuditLogs()
  }, [activeTab])

  const showMessage = (msg) => { setMessage(msg); setTimeout(() => setMessage(null), 3000) }
  const showError = (msg) => { setError(msg); setTimeout(() => setError(null), 5000) }

  // ─── Dashboard ──────────────────────────────────────────
  const loadDashboard = async () => {
    try {
      setLoading(true)
      const res = await adminService.getDashboard()
      setStats(res.data?.data || {})
    } catch (err) {
      showError('Erro ao carregar dashboard')
    } finally {
      setLoading(false)
    }
  }

  // ─── Users ──────────────────────────────────────────────
  const loadUsers = useCallback(async (page = usersPage) => {
    try {
      setUsersLoading(true)
      const params = { page, limit: 15 }
      if (usersSearch) params.busca = usersSearch
      if (usersRoleFilter) params.tipo = usersRoleFilter
      const res = await adminService.listUsers(params)
      const d = res.data?.data
      setUsers(d?.usuarios || d?.docs || [])
      setUsersTotal(d?.total || d?.totalDocs || 0)
      setUsersPage(d?.page || d?.pagina || page)
    } catch (err) {
      showError('Erro ao carregar usuários')
    } finally {
      setUsersLoading(false)
    }
  }, [usersSearch, usersRoleFilter, usersPage])

  const handleToggleUserStatus = async (userId) => {
    try {
      await adminService.toggleUserStatus(userId)
      showMessage('Status do usuário alterado')
      loadUsers()
    } catch (err) {
      showError(err.response?.data?.message || 'Erro ao alterar status')
    }
  }

  const handleViewUser = async (userId) => {
    try {
      const res = await adminService.getUserDetails(userId)
      setSelectedUser(res.data?.data)
    } catch (err) {
      showError('Erro ao carregar detalhes do usuário')
    }
  }

  // ─── Products ───────────────────────────────────────────
  const loadProducts = useCallback(async (page = productsPage) => {
    try {
      setProductsLoading(true)
      const params = { page, limit: 15 }
      if (productsSearch) params.busca = productsSearch
      const res = await adminService.listProducts(params)
      const d = res.data?.data
      setProducts(d?.produtos || d?.docs || [])
      setProductsTotal(d?.total || d?.totalDocs || 0)
      setProductsPage(d?.page || d?.pagina || page)
    } catch (err) {
      showError('Erro ao carregar produtos')
    } finally {
      setProductsLoading(false)
    }
  }, [productsSearch, productsPage])

  const handleToggleProductStatus = async (productId) => {
    try {
      await adminService.toggleProductStatus(productId)
      showMessage('Status do produto alterado')
      loadProducts()
    } catch (err) {
      showError(err.response?.data?.message || 'Erro ao alterar status')
    }
  }

  const loadMedicineCatalog = async () => {
    try {
      setCatalogLoading(true)
      const res = await adminService.listMedicineCatalog({ limit: 50 })
      setCatalogItems(res.data?.data?.itens || [])
    } catch {
      showError('Erro ao carregar catálogo de medicamentos')
    } finally {
      setCatalogLoading(false)
    }
  }

  const handleCreateCatalogEntry = async (e) => {
    e.preventDefault()
    try {
      setCatalogSaving(true)
      await adminService.createMedicineCatalog({
        nome: catalogForm.nome.trim(),
        principio_ativo: catalogForm.principio_ativo.trim(),
        classificacao_receita: catalogForm.classificacao_receita,
        categoria: catalogForm.categoria,
        preco_sugerido: catalogForm.preco_sugerido !== ''
          ? Number(catalogForm.preco_sugerido)
          : undefined,
        receita_obrigatoria: true,
      })
      showMessage('Item adicionado ao catálogo')
      setCatalogForm({
        nome: '',
        principio_ativo: '',
        classificacao_receita: 'tarja_vermelha',
        categoria: 'Outro',
        preco_sugerido: '',
      })
      loadMedicineCatalog()
    } catch (err) {
      showError(err.message || err.response?.data?.message || 'Erro ao criar item')
    } finally {
      setCatalogSaving(false)
    }
  }

  // ─── Pharmacies ─────────────────────────────────────────
  const loadPharmacies = useCallback(async (page = pharmaciesPage) => {
    try {
      setPharmaciesLoading(true)
      const params = { page, limit: 15 }
      if (pharmaciesSearch) params.busca = pharmaciesSearch
      const res = await adminService.listPharmacies(params)
      const d = res.data?.data
      setPharmacies(d?.farmacias || d?.docs || [])
      setPharmaciesTotal(d?.total || d?.totalDocs || 0)
      setPharmaciesPage(d?.page || d?.pagina || page)
    } catch (err) {
      showError('Erro ao carregar farmácias')
    } finally {
      setPharmaciesLoading(false)
    }
  }, [pharmaciesSearch, pharmaciesPage])

  const handleTogglePharmacyStatus = async (pharmacyId) => {
    try {
      await adminService.togglePharmacyStatus(pharmacyId)
      showMessage('Status da farmácia alterado')
      loadPharmacies()
    } catch (err) {
      showError(err.response?.data?.message || 'Erro ao alterar status')
    }
  }

  // ─── Audit ──────────────────────────────────────────────
  const loadAuditLogs = useCallback(async (page = auditPage) => {
    try {
      setAuditLoading(true)
      const res = await adminService.getAuditLogs({ page, limit: 20 })
      const d = res.data?.data
      setAuditLogs(d?.logs || d?.docs || [])
      setAuditTotal(d?.total || d?.totalDocs || 0)
      setAuditPage(d?.page || d?.pagina || page)
    } catch (err) {
      showError('Erro ao carregar logs de auditoria')
    } finally {
      setAuditLoading(false)
    }
  }, [auditPage])

  if (!isAuthenticated() || user?.role !== 'administrador') {
    return <LoadingSpinner />
  }

  const totalPages = (total, perPage) => Math.max(1, Math.ceil(total / perPage))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Shield className="w-8 h-8" />
                Painel Administrativo
              </h1>
              <p className="text-emerald-100 mt-1">Gestão do Saúde na Mão</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-emerald-100">Admin: {user?.nome}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {message && <Alert type="success" message={message} onClose={() => setMessage(null)} />}
        {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

        {/* Tabs */}
        <div className="flex gap-2 mb-8 bg-white rounded-lg p-2 shadow-sm overflow-x-auto">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
            { id: 'users', label: 'Usuários', icon: Users },
            { id: 'pharmacies', label: 'Farmácias', icon: Store },
            { id: 'products', label: 'Produtos', icon: Package },
            { id: 'audit', label: 'Auditoria', icon: FileText },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 whitespace-nowrap transition ${
                activeTab === id
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ═══ DASHBOARD ═══ */}
        {activeTab === 'dashboard' && (
          loading ? <LoadingSpinner /> : stats && (
            <div className="space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Usuários Ativos', value: stats.total_usuarios_ativos, icon: Users, bg: 'bg-blue-50', text: 'text-blue-700' },
                  { label: 'Farmácias Ativas', value: stats.total_farmacias_ativas, icon: Store, bg: 'bg-emerald-50', text: 'text-emerald-700' },
                  { label: 'Pedidos (Mês)', value: stats.total_pedidos_mes, icon: ShoppingCart, bg: 'bg-purple-50', text: 'text-purple-700' },
                  { label: 'Receita (Mês)', value: formatCurrency(stats.receita_total_mes), icon: TrendingUp, bg: 'bg-green-50', text: 'text-green-700' },
                  { label: 'Tickets Abertos', value: stats.tickets_abertos, icon: AlertCircle, bg: 'bg-red-50', text: 'text-red-700' },
                ].map(({ label, value, icon: Icon, bg, text }) => (
                  <div key={label} className={`${bg} rounded-xl p-5`}>
                    <div className="flex items-center justify-between mb-2">
                      <Icon className={`w-6 h-6 ${text}`} />
                    </div>
                    <p className={`text-2xl font-bold ${text}`}>{value ?? 0}</p>
                    <p className="text-sm text-gray-600 mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {/* Orders by Status - Bar Chart */}
              {stats.pedidos_por_status && Object.keys(stats.pedidos_por_status).length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-600" />
                    Pedidos por Status
                  </h3>
                  {(() => {
                    const entries = Object.entries(stats.pedidos_por_status)
                    const maxCount = Math.max(...entries.map(([, c]) => c), 1)
                    const barColors = {
                      aguardando_pagamento: 'bg-yellow-400',
                      confirmado: 'bg-blue-400',
                      em_processamento: 'bg-indigo-400',
                      enviado: 'bg-purple-400',
                      entregue: 'bg-emerald-400',
                      cancelado: 'bg-red-400',
                    }
                    return (
                      <div className="space-y-3">
                        {entries.map(([status, count]) => (
                          <div key={status} className="flex items-center gap-3">
                            <span className="text-xs text-gray-600 w-32 text-right truncate">
                              {ORDER_STATUS_LABELS[status] || status}
                            </span>
                            <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${barColors[status] || 'bg-gray-400'}`}
                                style={{ width: `${(count / maxCount) * 100}%`, minWidth: count > 0 ? '24px' : '0' }}
                              />
                            </div>
                            <span className="text-sm font-bold w-8">{count}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Recent Orders */}
              {stats.ultimos_pedidos?.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-emerald-600" />
                    Últimos Pedidos
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Pedido</th>
                          <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                          <th className="px-4 py-3 text-left font-semibold">Farmácia</th>
                          <th className="px-4 py-3 text-left font-semibold">Status</th>
                          <th className="px-4 py-3 text-left font-semibold">Total</th>
                          <th className="px-4 py-3 text-left font-semibold">Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.ultimos_pedidos.map((order) => (
                          <tr key={order._id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs">#{(order._id || '').slice(-8).toUpperCase()}</td>
                            <td className="px-4 py-3">{order.id_usuario?.nome || '-'}</td>
                            <td className="px-4 py-3">{order.id_farmacia?.nome || '-'}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100">
                                {ORDER_STATUS_LABELS[order.status] || order.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-semibold">{formatCurrency(order.total || order.valorTotal)}</td>
                            <td className="px-4 py-3 text-gray-500">{formatDate(order.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Quick Stats Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="font-semibold mb-2">Receitas Pendentes</h3>
                  <p className="text-3xl font-bold text-orange-600">{stats.receitas_pendentes ?? 0}</p>
                  <p className="text-sm text-gray-500 mt-1">Aguardando validação</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="font-semibold mb-2">Tickets de Suporte</h3>
                  <p className="text-3xl font-bold text-red-600">{stats.tickets_abertos ?? 0}</p>
                  <p className="text-sm text-gray-500 mt-1">Abertos aguardando resposta</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="font-semibold mb-2">Ticket Médio</h3>
                  <p className="text-3xl font-bold text-emerald-600">
                    {stats.total_pedidos_mes > 0
                      ? formatCurrency((stats.receita_total_mes || 0) / stats.total_pedidos_mes)
                      : 'R$ 0,00'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Valor médio por pedido</p>
                </div>
              </div>

              {/* Conversion Funnel */}
              {stats.pedidos_por_status && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                    Funil de Conversão
                  </h3>
                  {(() => {
                    const s = stats.pedidos_por_status
                    const totalOrders = Object.values(s).reduce((a, b) => a + b, 0) || 1
                    const delivered = s.entregue || 0
                    const cancelled = s.cancelado || 0
                    const rate = ((delivered / totalOrders) * 100).toFixed(1)
                    const cancelRate = ((cancelled / totalOrders) * 100).toFixed(1)
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
                        <div>
                          <p className="text-4xl font-bold text-blue-600">{totalOrders}</p>
                          <p className="text-sm text-gray-500 mt-1">Total de Pedidos</p>
                        </div>
                        <div>
                          <p className="text-4xl font-bold text-emerald-600">{rate}%</p>
                          <p className="text-sm text-gray-500 mt-1">Taxa de Entrega</p>
                          <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                            <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${rate}%` }} />
                          </div>
                        </div>
                        <div>
                          <p className="text-4xl font-bold text-red-600">{cancelRate}%</p>
                          <p className="text-sm text-gray-500 mt-1">Taxa de Cancelamento</p>
                          <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                            <div className="bg-red-500 h-2 rounded-full" style={{ width: `${cancelRate}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )
        )}

        {/* ═══ USERS ═══ */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-6 border-b">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Usuários ({usersTotal})
                </h2>
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar por nome ou email..."
                      value={usersSearch}
                      onChange={(e) => setUsersSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadUsers(1)}
                      className="pl-9 pr-3 py-2 border rounded-lg text-sm w-64"
                    />
                  </div>
                  <select
                    value={usersRoleFilter}
                    onChange={(e) => { setUsersRoleFilter(e.target.value); setTimeout(() => loadUsers(1), 0) }}
                    className="px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">Todos os tipos</option>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <button onClick={() => loadUsers(1)} className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              {usersLoading ? <div className="p-8"><LoadingSpinner /></div> : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Nome</th>
                      <th className="px-4 py-3 text-left font-semibold">Email</th>
                      <th className="px-4 py-3 text-left font-semibold">Tipo</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">Criado em</th>
                      <th className="px-4 py-3 text-left font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-gray-500">Nenhum usuário encontrado</td></tr>
                    ) : users.map((u) => (
                      <tr key={u._id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{u.nome}</td>
                        <td className="px-4 py-3 text-gray-600">{u.email}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[u.tipo_usuario] || 'bg-gray-100 text-gray-800'}`}>
                            {ROLE_LABELS[u.tipo_usuario] || u.tipo_usuario}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.ativo !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {u.ativo !== false ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(u.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => handleViewUser(u._id)} className="text-blue-600 hover:text-blue-800" title="Ver detalhes">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleToggleUserStatus(u._id)} className="text-orange-600 hover:text-orange-800" title="Alternar status">
                              {u.ativo !== false ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {/* Pagination */}
            {usersTotal > 15 && (
              <div className="p-4 border-t flex items-center justify-between">
                <p className="text-sm text-gray-500">Página {usersPage} de {totalPages(usersTotal, 15)}</p>
                <div className="flex gap-2">
                  <button disabled={usersPage <= 1} onClick={() => loadUsers(usersPage - 1)} className="px-3 py-1 border rounded disabled:opacity-50">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button disabled={usersPage >= totalPages(usersTotal, 15)} onClick={() => loadUsers(usersPage + 1)} className="px-3 py-1 border rounded disabled:opacity-50">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ PHARMACIES ═══ */}
        {activeTab === 'pharmacies' && (
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-6 border-b">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Store className="w-5 h-5" />
                  Farmácias ({pharmaciesTotal})
                </h2>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar farmácia..."
                      value={pharmaciesSearch}
                      onChange={(e) => setPharmaciesSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadPharmacies(1)}
                      className="pl-9 pr-3 py-2 border rounded-lg text-sm w-56"
                    />
                  </div>
                  <button onClick={() => loadPharmacies(1)} className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              {pharmaciesLoading ? <div className="p-8"><LoadingSpinner /></div> : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Nome</th>
                      <th className="px-4 py-3 text-left font-semibold">CNPJ</th>
                      <th className="px-4 py-3 text-left font-semibold">Cidade/UF</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pharmacies.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-gray-500">Nenhuma farmácia encontrada</td></tr>
                    ) : pharmacies.map((p) => (
                      <tr key={p._id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{p.nome}</td>
                        <td className="px-4 py-3 font-mono text-xs">{p.cnpj}</td>
                        <td className="px-4 py-3 text-gray-600">{[p.cidade, p.estado].filter(Boolean).join('/') || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.ativa !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {p.ativa !== false ? 'Ativa' : 'Inativa'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleTogglePharmacyStatus(p._id)} className="text-orange-600 hover:text-orange-800" title="Alternar status">
                            {p.ativa !== false ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {pharmaciesTotal > 15 && (
              <div className="p-4 border-t flex items-center justify-between">
                <p className="text-sm text-gray-500">Página {pharmaciesPage} de {totalPages(pharmaciesTotal, 15)}</p>
                <div className="flex gap-2">
                  <button disabled={pharmaciesPage <= 1} onClick={() => loadPharmacies(pharmaciesPage - 1)} className="px-3 py-1 border rounded disabled:opacity-50">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button disabled={pharmaciesPage >= totalPages(pharmaciesTotal, 15)} onClick={() => loadPharmacies(pharmaciesPage + 1)} className="px-3 py-1 border rounded disabled:opacity-50">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ PRODUCTS ═══ */}
        {activeTab === 'products' && (
          <>
          <div className="bg-white rounded-xl shadow-sm mb-6 border border-emerald-100">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold text-emerald-800">Catálogo mestre (medicamentos com receita)</h2>
              <p className="text-sm text-gray-500 mt-1">
                Itens que o dono da farmácia pode ativar na loja. Expanda o catálogo conforme necessário.
              </p>
            </div>
            <form onSubmit={handleCreateCatalogEntry} className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 border-b bg-emerald-50/30">
              <input
                type="text"
                placeholder="Nome *"
                value={catalogForm.nome}
                onChange={(e) => setCatalogForm({ ...catalogForm, nome: e.target.value })}
                required
                className="px-3 py-2 border rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="Princípio ativo *"
                value={catalogForm.principio_ativo}
                onChange={(e) => setCatalogForm({ ...catalogForm, principio_ativo: e.target.value })}
                required
                className="px-3 py-2 border rounded-lg text-sm"
              />
              <select
                value={catalogForm.classificacao_receita}
                onChange={(e) => setCatalogForm({ ...catalogForm, classificacao_receita: e.target.value })}
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              >
                <option value="tarja_vermelha">Tarja vermelha</option>
                <option value="tarja_preta">Tarja preta</option>
                <option value="antimicrobiano">Antimicrobiano</option>
                <option value="controlado_a">Controlado</option>
              </select>
              <button
                type="submit"
                disabled={catalogSaving}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {catalogSaving ? 'Salvando...' : 'Adicionar ao catálogo'}
              </button>
            </form>
            <div className="p-4 max-h-40 overflow-y-auto text-sm">
              {catalogLoading ? (
                <LoadingSpinner />
              ) : catalogItems.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Catálogo vazio — execute o seed ou adicione itens acima.</p>
              ) : (
                <ul className="divide-y">
                  {catalogItems.map((item) => (
                    <li key={item._id} className="py-2 flex justify-between">
                      <span className="font-medium">{item.nome}</span>
                      <span className="text-gray-500 text-xs">{item.classificacao_receita}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-6 border-b">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Produtos ({productsTotal})
                </h2>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar produto..."
                      value={productsSearch}
                      onChange={(e) => setProductsSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadProducts(1)}
                      className="pl-9 pr-3 py-2 border rounded-lg text-sm w-56"
                    />
                  </div>
                  <button onClick={() => loadProducts(1)} className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              {productsLoading ? <div className="p-8"><LoadingSpinner /></div> : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Nome</th>
                      <th className="px-4 py-3 text-left font-semibold">Categoria</th>
                      <th className="px-4 py-3 text-left font-semibold">Preço</th>
                      <th className="px-4 py-3 text-left font-semibold">Estoque</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-gray-500">Nenhum produto encontrado</td></tr>
                    ) : products.map((p) => (
                      <tr key={p._id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{p.nome}</td>
                        <td className="px-4 py-3 text-gray-600">{p.categoria || '-'}</td>
                        <td className="px-4 py-3">{formatCurrency(p.preco)}</td>
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
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.ativo !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {p.ativo !== false ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleToggleProductStatus(p._id)} className="text-orange-600 hover:text-orange-800" title="Alternar status">
                            {p.ativo !== false ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {productsTotal > 15 && (
              <div className="p-4 border-t flex items-center justify-between">
                <p className="text-sm text-gray-500">Página {productsPage} de {totalPages(productsTotal, 15)}</p>
                <div className="flex gap-2">
                  <button disabled={productsPage <= 1} onClick={() => loadProducts(productsPage - 1)} className="px-3 py-1 border rounded disabled:opacity-50">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button disabled={productsPage >= totalPages(productsTotal, 15)} onClick={() => loadProducts(productsPage + 1)} className="px-3 py-1 border rounded disabled:opacity-50">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
          </>
        )}

        {/* ═══ AUDIT LOGS ═══ */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Logs de Auditoria ({auditTotal})
                </h2>
                <button onClick={() => loadAuditLogs(1)} className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {auditLoading ? <div className="p-8"><LoadingSpinner /></div> : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Data</th>
                      <th className="px-4 py-3 text-left font-semibold">Ação</th>
                      <th className="px-4 py-3 text-left font-semibold">Recurso</th>
                      <th className="px-4 py-3 text-left font-semibold">Usuário</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-gray-500">Nenhum log encontrado</td></tr>
                    ) : auditLogs.map((log) => (
                      <tr key={log._id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(log.createdAt || log.data)}</td>
                        <td className="px-4 py-3 font-medium">{log.acao}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                            {log.recurso}{log.recurso_id ? ` #${String(log.recurso_id).slice(-6)}` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{log.usuario_id?.nome || log.usuario_nome || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            log.status === 'sucesso' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {log.status || 'sucesso'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {auditTotal > 20 && (
              <div className="p-4 border-t flex items-center justify-between">
                <p className="text-sm text-gray-500">Página {auditPage} de {totalPages(auditTotal, 20)}</p>
                <div className="flex gap-2">
                  <button disabled={auditPage <= 1} onClick={() => loadAuditLogs(auditPage - 1)} className="px-3 py-1 border rounded disabled:opacity-50">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button disabled={auditPage >= totalPages(auditTotal, 20)} onClick={() => loadAuditLogs(auditPage + 1)} className="px-3 py-1 border rounded disabled:opacity-50">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      <Modal isOpen={!!selectedUser} onClose={() => setSelectedUser(null)} title="Detalhes do Usuário" size="lg">
        {selectedUser && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-lg">
                {(selectedUser.nome || selectedUser.usuario?.nome || '?')[0].toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-lg">{selectedUser.nome || selectedUser.usuario?.nome}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[selectedUser.tipo_usuario || selectedUser.usuario?.tipo_usuario] || 'bg-gray-100'}`}>
                  {ROLE_LABELS[selectedUser.tipo_usuario || selectedUser.usuario?.tipo_usuario] || 'N/A'}
                </span>
              </div>
            </div>
            {[
              ['Email', selectedUser.email || selectedUser.usuario?.email],
              ['Telefone', selectedUser.telefone || selectedUser.usuario?.telefone],
              ['CPF', selectedUser.cpf || selectedUser.usuario?.cpf],
              ['Status', (selectedUser.ativo !== false && selectedUser.usuario?.ativo !== false) ? 'Ativo' : 'Inativo'],
              ['Criado em', formatDate(selectedUser.createdAt || selectedUser.usuario?.createdAt)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium">{value || '-'}</span>
              </div>
            ))}
            {(selectedUser.total_pedidos != null || selectedUser.usuario?.total_pedidos != null) && (
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Total de Pedidos</span>
                <span className="font-medium">{selectedUser.total_pedidos ?? selectedUser.usuario?.total_pedidos ?? 0}</span>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
