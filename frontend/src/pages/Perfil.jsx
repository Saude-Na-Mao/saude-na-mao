import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/store'
import { userService, orderService, prescriptionService, supportService, pharmacyOwnerService } from '../services/api'
import Alert from '../components/Alert'
import LoadingSpinner from '../components/LoadingSpinner'
import AddressNumberInput from '../components/AddressNumberInput'
import {
  User, Mail, Phone, MapPin, Lock, Save, LogOut,
  Package, Heart, CreditCard, FileText, ChevronRight,
  ShoppingBag, Star, Clock, Shield, Bell, HelpCircle,
  Plus, Trash2, CheckCircle, X, MessageSquare, Send,
  RefreshCw, Bike, Car, Award, Store, Clipboard, Camera,
} from 'lucide-react'
import { resolveMediaUrl } from '../utils/mediaUrl'
import { maskCep, maskUf, onlyLetters } from '../utils/inputMasks'
import { setSupportToastSuppressed } from '../utils/supportTicketStorage'
import { useSupportTicketRoom } from '../hooks/useSupportTicketRoom'
import {
  contentDedupeKey,
  mergeTicketWithMessage,
  messageKey,
  normalizeSupportMessage,
  normalizeTipoRemetente,
} from '../utils/supportMessageUtils'

const normalizePlate = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const normalizeCnh = (value) => String(value || '').replace(/\D/g, '')
const PLATE_REGEX = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/
const CNH_REGEX = /^\d{11}$/

const onlyDigits = (value) => String(value || '').replace(/\D/g, '')
const formatTelefone = (value) => {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
const formatCpf = (value) => {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export default function Perfil() {
  const navigate = useNavigate()
  const location = useLocation()
  const { token, user, setUser, logout } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [activeTab, setActiveTab] = useState('dados')
  const [pendingOpenTicketId, setPendingOpenTicketId] = useState(null)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordData, setPasswordData] = useState({ senhaAtual: '', novaSenha: '', confirmarSenha: '' })
  const [stats, setStats] = useState({ pedidos: 0, receitas: 0 })
  const [pharmacyInfo, setPharmacyInfo] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const photoInputRef = useRef(null)
  const [formData, setFormData] = useState({
    nome: user?.nome || '',
    email: user?.email || '',
    telefone: formatTelefone(user?.telefone || ''),
    cpf: formatCpf(user?.cpf || ''),
    rg: user?.rg || '',
    dados_entregador: {
      tipo_veiculo: user?.dados_entregador?.tipo_veiculo || '',
      placa: user?.dados_entregador?.placa || '',
      cnh: user?.dados_entregador?.cnh || '',
    },
  })

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    loadStats()
  }, [token, navigate])

  useEffect(() => {
    const state = location.state || {}
    const tab = state.tab
    const openTicketId = state.openTicketId
    if (tab === 'chats' || openTicketId) {
      setActiveTab('chats')
      if (openTicketId) {
        setPendingOpenTicketId(String(openTicketId))
      }
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state?.tab, location.state?.openTicketId, location.pathname, navigate])

  const loadStats = async () => {
    try {
      const [ordersRes, prescRes] = await Promise.allSettled([
        orderService.getAll(),
        prescriptionService.getAll(),
      ])
      setStats({
        pedidos: ordersRes.status === 'fulfilled' ? (ordersRes.value?.data?.data?.pedidos?.length || ordersRes.value?.data?.data?.total || 0) : 0,
        receitas: prescRes.status === 'fulfilled' ? (prescRes.value?.data?.data?.docs?.length || prescRes.value?.data?.data?.total || 0) : 0,
      })

      // Carrega os dados da farmácia para os perfis de farmácia
      const role = user?.tipo_usuario || user?.role
      const pharmacyId = user?.dados_dono_farmacia?.id_farmacia || user?.dados_farmaceutico?.id_farmacia
      if (['dono_farmacia', 'farmaceutico'].includes(role) && pharmacyId) {
        try {
          const pharmRes = await pharmacyOwnerService.getPharmacy(pharmacyId)
          setPharmacyInfo(pharmRes.data?.data || null)
        } catch {}
      }
    } catch {}
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    let next = value
    if (name === 'telefone') next = formatTelefone(value)
    if (name === 'cpf') next = formatCpf(value)
    setFormData({ ...formData, [name]: next })
  }

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setRemovePhoto(false)
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleRemovePhoto = () => {
    setPhotoFile(null)
    setPhotoPreview(null)
    setRemovePhoto(true)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const handleDriverChange = (e) => {
    const { name, value } = e.target
    let nextValue = value
    if (name === 'placa') nextValue = normalizePlate(value)
    if (name === 'cnh') nextValue = normalizeCnh(value)
    setFormData((prev) => ({
      ...prev,
      dados_entregador: {
        ...prev.dados_entregador,
        [name]: nextValue,
      },
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const telefoneDigits = onlyDigits(formData.telefone)
    if (telefoneDigits && (telefoneDigits.length < 10 || telefoneDigits.length > 11)) {
      setError('Telefone inválido. Informe DDD + número (10 ou 11 dígitos).')
      return
    }
    const cpfDigits = onlyDigits(formData.cpf)
    if (cpfDigits && cpfDigits.length !== 11) {
      setError('CPF inválido. Informe os 11 dígitos.')
      return
    }

    setLoading(true)
    try {
      const payload = {
        nome: formData.nome,
        telefone: telefoneDigits,
        cpf: cpfDigits,
        rg: (formData.rg || '').trim(),
      }
      if (isDriver) {
        const tipoVeiculo = formData.dados_entregador?.tipo_veiculo || ''
        const placa = normalizePlate(formData.dados_entregador?.placa || '')
        const cnh = normalizeCnh(formData.dados_entregador?.cnh || '')
        const requiresVehicleDocs = tipoVeiculo === 'moto' || tipoVeiculo === 'carro'

        if (requiresVehicleDocs && (!placa || !cnh)) {
          setError('Para moto e carro, placa e CNH são obrigatórias')
          setLoading(false)
          return
        }

        if (placa && !PLATE_REGEX.test(placa)) {
          setError('Placa inválida. Use formato AAA1234 ou AAA1A23')
          setLoading(false)
          return
        }

        if (cnh && !CNH_REGEX.test(cnh)) {
          setError('CNH inválida. Informe 11 dígitos numéricos')
          setLoading(false)
          return
        }

        payload.dados_entregador = {
          tipo_veiculo: tipoVeiculo || undefined,
          placa: placa || undefined,
          cnh: cnh || undefined,
        }
      }

      if (removePhoto && !photoFile) payload.remover_foto = true

      let request = payload
      if (photoFile) {
        const fd = new FormData()
        fd.append('foto', photoFile)
        fd.append('nome', payload.nome)
        if (payload.telefone) fd.append('telefone', payload.telefone)
        if (payload.cpf) fd.append('cpf', payload.cpf)
        if (payload.rg) fd.append('rg', payload.rg)
        if (payload.dados_entregador) {
          fd.append('dados_entregador', JSON.stringify(payload.dados_entregador))
        }
        request = fd
      }

      const response = await userService.updateProfile(request)
      const updatedUser = response.data?.data?.user || response.data?.user || response.data?.data
      if (updatedUser) setUser(updatedUser)
      setMessage('Perfil atualizado com sucesso!')
      setEditMode(false)
      setPhotoFile(null)
      setPhotoPreview(null)
      setRemovePhoto(false)
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.mensagem || 'Erro ao atualizar perfil')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setError(null)
    if (passwordData.novaSenha !== passwordData.confirmarSenha) {
      setError('As senhas não coincidem')
      return
    }
    if (passwordData.novaSenha.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres')
      return
    }
    setLoading(true)
    try {
      await userService.updatePassword(passwordData.senhaAtual, passwordData.novaSenha)
      setMessage('Senha alterada com sucesso!')
      setShowPasswordForm(false)
      setPasswordData({ senhaAtual: '', novaSenha: '', confirmarSenha: '' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.mensagem || 'Erro ao alterar senha')
    } finally {
      setLoading(false)
    }
  }

  if (!token) return <LoadingSpinner />

  const isPharmacyRole = ['dono_farmacia', 'farmaceutico'].includes(user?.tipo_usuario || user?.role)
  const isPharmacist = (user?.tipo_usuario || user?.role) === 'farmaceutico'
  const isPharmacyOwner = (user?.tipo_usuario || user?.role) === 'dono_farmacia'
  const isDriver = (user?.tipo_usuario || user?.role) === 'entregador'
  const isAdmin = (user?.tipo_usuario || user?.role) === 'administrador'
  const userRole = user?.tipo_usuario || user?.role

  const ROLE_BADGE = {
    cliente: { label: 'Cliente', bg: 'bg-white/20' },
    entregador: { label: 'Entregador', bg: 'bg-yellow-400/20' },
    dono_farmacia: { label: 'Dono de Farmácia', bg: 'bg-emerald-400/20' },
    farmaceutico: { label: 'Farmacêutico', bg: 'bg-purple-400/20' },
    administrador: { label: 'Administrador', bg: 'bg-red-400/20' },
  }

  const roleBadge = ROLE_BADGE[userRole] || ROLE_BADGE.cliente

  const avatarSrc = removePhoto
    ? null
    : photoPreview || resolveMediaUrl(user?.foto_perfil || user?.fotoPerfil)

  const isClientOnly = !isPharmacyRole && !isDriver && !isAdmin

  const menuItems = [
    { id: 'dados', label: 'Meus Dados', icon: User, color: 'text-primary' },
    isPharmacist
      ? { id: 'painel', label: 'Painel do Farmacêutico', icon: Clipboard, link: '/farmaceutico', color: 'text-blue-500' }
      : isPharmacyOwner
      ? { id: 'farmacia', label: 'Minha Farmácia', icon: Store, link: '/dono-farmacia', color: 'text-emerald-500' }
      : isDriver
      ? { id: 'entregas', label: 'Painel do Entregador', icon: Package, link: '/entregas', color: 'text-blue-500' }
      : { id: 'pedidos', label: 'Meus Pedidos', icon: Package, link: '/pedidos', color: 'text-blue-500' },
    isClientOnly && { id: 'chats', label: 'Meus Chats', icon: MessageSquare, link: '/chats', color: 'text-indigo-500' },
    isClientOnly && { id: 'receitas', label: 'Minhas Receitas', icon: FileText, link: '/minhas-receitas', color: 'text-amber-500' },
    isClientOnly && { id: 'enderecos', label: 'Endereços', icon: MapPin, color: 'text-emerald-500' },
    isClientOnly && { id: 'pagamentos', label: 'Pagamentos', icon: CreditCard, color: 'text-violet-500' },
  ].filter(Boolean)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="bg-gradient-to-br from-primary to-secondary rounded-2xl p-6 mb-8 text-white">
        <div className="flex items-center gap-5">
          <div className="relative w-20 h-20 flex-shrink-0">
            <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center text-4xl font-bold overflow-hidden">
              {avatarSrc ? (
                <img src={avatarSrc} alt={user?.nome || 'Perfil'} className="w-full h-full object-cover" />
              ) : (
                user?.nome?.charAt(0)?.toUpperCase() || '👤'
              )}
            </div>
            {editMode && (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-8 h-8 bg-white text-primary rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition"
                title={avatarSrc ? 'Trocar foto' : 'Adicionar foto'}
              >
                <Camera className="w-4 h-4" />
              </button>
            )}
            {editMode && avatarSrc && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="absolute -top-1 -right-1 w-7 h-7 bg-white text-red-500 rounded-full shadow-md flex items-center justify-center hover:bg-red-50 transition"
                title="Remover foto"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoSelect}
              className="hidden"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold truncate">{user?.nome || 'Usuário'}</h1>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleBadge.bg}`}>
                {roleBadge.label}
              </span>
            </div>
            <p className="text-white/70 text-sm">{user?.email}</p>
            {user?.telefone && <p className="text-white/70 text-sm">{user.telefone}</p>}
            <div className="flex gap-4 mt-3">
              <div className="text-center">
                <div className="text-xl font-bold">{stats.pedidos}</div>
                <div className="text-[10px] text-white/60 uppercase tracking-wide">Pedidos</div>
              </div>
              <div className="w-px bg-white/20" />
              <div className="text-center">
                <div className="text-xl font-bold">{stats.receitas}</div>
                <div className="text-[10px] text-white/60 uppercase tracking-wide">Receitas</div>
              </div>
              {isDriver && user?.dados_entregador && (
                <>
                  <div className="w-px bg-white/20" />
                  <div className="text-center">
                    <div className="text-xl font-bold">{user.dados_entregador.entregas_realizadas || 0}</div>
                    <div className="text-[10px] text-white/60 uppercase tracking-wide">Entregas</div>
                  </div>
                  <div className="w-px bg-white/20" />
                  <div className="text-center">
                    <div className="text-xl font-bold">{user.dados_entregador.avaliacao?.toFixed(1) || '-'}</div>
                    <div className="text-[10px] text-white/60 uppercase tracking-wide">Avaliação</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar */}
        <aside>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {menuItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => item.link ? navigate(item.link) : setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition border-b border-gray-50 last:border-0 ${
                    activeTab === item.id && !item.link ? 'bg-primary/5' : ''
                  }`}
                >
                  <Icon className={`w-5 h-5 ${item.color}`} />
                  <span className="flex-1 text-sm font-medium text-gray-800">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </button>
              )
            })}
          </div>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => navigate('/suporte')}
              className="w-full flex items-center gap-3 px-5 py-3 bg-white rounded-xl border border-gray-100 hover:bg-gray-50 transition text-sm text-gray-600"
            >
              <HelpCircle className="w-4 h-4 text-gray-400" />
              <span>Ajuda</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-5 py-3 bg-white rounded-xl border border-red-100 hover:bg-red-50 transition text-sm text-red-600"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair da conta</span>
            </button>
          </div>
        </aside>

        <main className="lg:col-span-2">
          {activeTab === 'dados' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Meus Dados</h2>
                {!editMode && (
                  <button
                    onClick={() => setEditMode(true)}
                    className="px-4 py-2 border border-primary text-primary rounded-xl text-sm font-semibold hover:bg-primary hover:text-white transition"
                  >
                    Editar
                  </button>
                )}
              </div>

              {message && <Alert type="success" message={message} />}
              {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

              <form onSubmit={handleSubmit} className="space-y-5 mt-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Nome Completo</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      name="nome"
                      value={formData.nome}
                      onChange={handleChange}
                      disabled={!editMode || loading}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      disabled
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Telefone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      name="telefone"
                      value={formData.telefone}
                      onChange={handleChange}
                      disabled={!editMode || loading}
                      inputMode="numeric"
                      maxLength={16}
                      placeholder="(62) 99999-9999"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">CPF</label>
                  <input
                    type="text"
                    name="cpf"
                    value={formData.cpf}
                    onChange={handleChange}
                    disabled={!editMode || loading}
                    inputMode="numeric"
                    maxLength={14}
                    placeholder="000.000.000-00"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50"
                  />
                </div>

                {isClientOnly && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">RG</label>
                    <input
                      type="text"
                      name="rg"
                      value={formData.rg}
                      onChange={handleChange}
                      disabled={!editMode || loading}
                      maxLength={20}
                      placeholder="0000000"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Usado automaticamente no registro SNGPC de medicamentos controlados.
                    </p>
                  </div>
                )}

                {editMode && (
                  <div className="flex gap-3 pt-4 border-t border-gray-100">
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 bg-primary text-white py-2.5 rounded-xl font-semibold hover:bg-secondary transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4" /> Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditMode(false)
                        setPhotoFile(null)
                        setPhotoPreview(null)
                        setFormData({
                          nome: user?.nome || '',
                          email: user?.email || '',
                          telefone: formatTelefone(user?.telefone || ''),
                          cpf: formatCpf(user?.cpf || ''),
                          rg: user?.rg || '',
                          dados_entregador: {
                            tipo_veiculo: user?.dados_entregador?.tipo_veiculo || '',
                            placa: user?.dados_entregador?.placa || '',
                            cnh: user?.dados_entregador?.cnh || '',
                          },
                        })
                      }}
                      className="flex-1 border border-gray-200 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </form>

              <div className="mt-6 pt-6 border-t border-gray-100">
                <button
                  onClick={() => setShowPasswordForm(!showPasswordForm)}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-primary transition"
                >
                  <Lock className="w-4 h-4" />
                  Alterar Senha
                  <ChevronRight className={`w-4 h-4 transition-transform ${showPasswordForm ? 'rotate-90' : ''}`} />
                </button>

                {showPasswordForm && (
                  <form onSubmit={handlePasswordChange} className="mt-4 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Senha Atual</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="password"
                          value={passwordData.senhaAtual}
                          onChange={(e) => setPasswordData({ ...passwordData, senhaAtual: e.target.value })}
                          required
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="Digite sua senha atual"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Nova Senha</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="password"
                          value={passwordData.novaSenha}
                          onChange={(e) => setPasswordData({ ...passwordData, novaSenha: e.target.value })}
                          required
                          minLength={6}
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="Mínimo 6 caracteres"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Confirmar Nova Senha</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="password"
                          value={passwordData.confirmarSenha}
                          onChange={(e) => setPasswordData({ ...passwordData, confirmarSenha: e.target.value })}
                          required
                          minLength={6}
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="Repita a nova senha"
                        />
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 bg-primary text-white py-2.5 rounded-xl font-semibold hover:bg-secondary transition disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Lock className="w-4 h-4" /> Alterar Senha
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowPasswordForm(false)
                          setPasswordData({ senhaAtual: '', novaSenha: '', confirmarSenha: '' })
                        }}
                        className="flex-1 border border-gray-200 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {isDriver && editMode && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <Bike className="w-4 h-4 text-yellow-500" />
                    Editar Dados de Entregador
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Tipo de veículo</label>
                      <select
                        name="tipo_veiculo"
                        value={formData.dados_entregador?.tipo_veiculo || ''}
                        onChange={handleDriverChange}
                        disabled={loading}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50"
                      >
                        <option value="">Selecione</option>
                        <option value="moto">Moto</option>
                        <option value="bicicleta">Bicicleta</option>
                        <option value="carro">Carro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Placa</label>
                      <input
                        type="text"
                        name="placa"
                        value={formData.dados_entregador?.placa || ''}
                        onChange={handleDriverChange}
                        disabled={loading}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50"
                        placeholder="ABC1D23"
                        maxLength={7}
                        required={
                          formData.dados_entregador?.tipo_veiculo === 'moto' ||
                          formData.dados_entregador?.tipo_veiculo === 'carro'
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">CNH</label>
                      <input
                        type="text"
                        name="cnh"
                        value={formData.dados_entregador?.cnh || ''}
                        onChange={handleDriverChange}
                        disabled={loading}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-gray-50"
                        placeholder="Número da CNH"
                        maxLength={11}
                        required={
                          formData.dados_entregador?.tipo_veiculo === 'moto' ||
                          formData.dados_entregador?.tipo_veiculo === 'carro'
                        }
                      />
                    </div>
                  </div>
                  {(formData.dados_entregador?.tipo_veiculo === 'moto' ||
                    formData.dados_entregador?.tipo_veiculo === 'carro') && (
                    <p className="text-xs text-amber-600 mt-2">
                      Para moto e carro, os campos placa e CNH são obrigatórios.
                    </p>
                  )}
                </div>
              )}

              {isDriver && user?.dados_entregador && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <Bike className="w-4 h-4 text-yellow-500" />
                    Dados de Entregador
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-400">Veículo</p>
                      <p className="font-medium capitalize">{user.dados_entregador.tipo_veiculo || '-'}</p>
                    </div>
                    {user.dados_entregador.placa && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-400">Placa</p>
                        <p className="font-medium">{user.dados_entregador.placa}</p>
                      </div>
                    )}
                    {user.dados_entregador.cnh && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-400">CNH</p>
                        <p className="font-medium">{user.dados_entregador.cnh}</p>
                      </div>
                    )}
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-400">Status</p>
                      <p className={`font-medium ${user.dados_entregador.disponivel ? 'text-green-600' : 'text-red-600'}`}>
                        {user.dados_entregador.disponivel ? 'Disponível' : 'Indisponível'}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-400">Entregas Realizadas</p>
                      <p className="font-medium">{user.dados_entregador.entregas_realizadas || 0}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-400">Avaliação</p>
                      <p className="font-medium flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                        {user.dados_entregador.avaliacao?.toFixed(1) || '-'} ({user.dados_entregador.total_avaliacoes || 0})
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isPharmacyRole && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <Store className="w-4 h-4 text-emerald-500" />
                    {userRole === 'dono_farmacia' ? 'Dados da Farmácia' : 'Dados Profissionais'}
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {user?.dados_farmaceutico?.crf && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-400">CRF</p>
                        <p className="font-medium flex items-center gap-1">
                          {user.dados_farmaceutico.crf}
                          {user.dados_farmaceutico.crf_verificado && (
                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          )}
                        </p>
                      </div>
                    )}
                    {user?.dados_farmaceutico?.especialidades?.length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                        <p className="text-xs text-gray-400 mb-1">Especialidades</p>
                        <div className="flex flex-wrap gap-1">
                          {user.dados_farmaceutico.especialidades.map((e) => (
                            <span key={e} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full capitalize">
                              {e.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {pharmacyInfo && (
                      <>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-400">Farmácia</p>
                          <p className="font-medium">{pharmacyInfo.nome}</p>
                        </div>
                        {pharmacyInfo.cnpj && (
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-400">CNPJ</p>
                            <p className="font-medium font-mono text-xs">{pharmacyInfo.cnpj}</p>
                          </div>
                        )}
                        {(pharmacyInfo.cidade || pharmacyInfo.estado) && (
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-400">Localização</p>
                            <p className="font-medium">{[pharmacyInfo.cidade, pharmacyInfo.estado].filter(Boolean).join('/')}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {isAdmin && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-red-500" />
                    Administrador
                  </h3>
                  <button
                    onClick={() => navigate('/admin')}
                    className="w-full py-2.5 bg-red-50 text-red-700 rounded-xl text-sm font-semibold hover:bg-red-100 transition"
                  >
                    Acessar Painel Administrativo
                  </button>
                </div>
              )}

              {/* LGPD — Privacidade e Dados */}
              <LgpdSection user={user} logout={logout} navigate={navigate} />
            </div>
          )}

          {activeTab === 'receitas' && <ReceitasTab />}

          {activeTab === 'chats' && (
            <ChatsTab
              initialOpenTicketId={pendingOpenTicketId}
              onConsumedOpenTicket={() => setPendingOpenTicketId(null)}
            />
          )}

          {activeTab === 'enderecos' && <EnderecosTab />}

          {activeTab === 'pagamentos' && <CartoesTab />}
        </main>
      </div>
    </div>
  )
}

function detectarBandeira(numero) {
  const d = String(numero || '').replace(/\D/g, '')
  if (/^4/.test(d)) return 'Visa'
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard'
  if (/^3[47]/.test(d)) return 'Amex'
  if (/^(4011|4312|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(d)) return 'Elo'
  if (/^(606282|3841)/.test(d)) return 'Hipercard'
  return 'Cartão'
}

function CartoesTab() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState(null)
  const [form, setForm] = useState({ numero: '', titular: '', validade: '' })

  const load = async () => {
    try {
      setLoading(true)
      const res = await userService.getCards()
      setCards(res.data?.data?.cartoes || [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    const digits = form.numero.replace(/\D/g, '')
    if (digits.length < 13) { setErro('Número do cartão inválido'); return }
    if (!form.titular.trim()) { setErro('Informe o nome do titular'); return }
    try {
      setSaving(true); setErro(null)
      await userService.addCard({
        bandeira: detectarBandeira(digits),
        ultimos4: digits.slice(-4),
        titular: form.titular,
        validade: form.validade,
      })
      setForm({ numero: '', titular: '', validade: '' })
      setShowForm(false)
      await load()
    } catch (err) {
      setErro(err?.response?.data?.message || 'Não foi possível salvar o cartão')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (id) => {
    if (!window.confirm('Remover este cartão?')) return
    try { await userService.deleteCard(id); await load() } catch { /* ignore */ }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Meus Cartões</h2>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setErro(null) }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-secondary"
          >
            <Plus className="w-4 h-4" /> Adicionar
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400 mb-4">
        Guardamos apenas a bandeira, os últimos 4 dígitos, o titular e a validade — nunca o número completo nem o CVV.
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Carregando...</p>
      ) : (
        <div className="space-y-2 mb-4">
          {cards.length === 0 && !showForm && (
            <p className="text-sm text-gray-500">Nenhum cartão salvo ainda.</p>
          )}
          {cards.map((c) => (
            <div key={c._id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200">
              <CreditCard className="w-5 h-5 text-gray-500" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-900">{c.bandeira} •••• {c.ultimos4}</div>
                <div className="text-xs text-gray-500">{c.titular}{c.validade ? ` · ${c.validade}` : ''}</div>
              </div>
              <button onClick={() => handleRemove(c._id)} className="text-gray-400 hover:text-red-600" title="Remover">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className="space-y-3 border-t border-gray-100 pt-4">
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Número do Cartão</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.numero}
              onChange={(e) => setForm({ ...form, numero: e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ') })}
              placeholder="0000 0000 0000 0000"
              maxLength={19}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nome do Titular</label>
            <input
              type="text"
              value={form.titular}
              onChange={(e) => setForm({ ...form, titular: e.target.value.replace(/[^A-Za-zÀ-ÿ\s]/g, '').toUpperCase() })}
              placeholder="NOME SOBRENOME"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Validade</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.validade}
                onChange={(e) => setForm({ ...form, validade: e.target.value.replace(/\D/g, '').slice(0, 4).replace(/(\d{2})(?=\d)/, '$1/') })}
                placeholder="MM/AA"
                maxLength={5}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-secondary transition disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar cartão'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setErro(null) }} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function EnderecosTab() {
  const [addresses, setAddresses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState({
    apelido: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
  })

  useEffect(() => {
    loadAddresses()
  }, [])

  const loadAddresses = async () => {
    try {
      setLoading(true)
      const res = await userService.getAddresses()
      setAddresses(res.data?.data?.enderecos || [])
    } catch {
      setAddresses([])
    } finally {
      setLoading(false)
    }
  }

  const handleCepSearch = async (cep) => {
    const clean = cep.replace(/\D/g, '')
    if (clean.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setForm((f) => ({
          ...f,
          logradouro: data.logradouro || f.logradouro,
          bairro: data.bairro || f.bairro,
          cidade: data.localidade || f.cidade,
          estado: data.uf || f.estado,
        }))
      }
    } catch {}
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await userService.addAddress({
        ...form,
        cep: form.cep.replace(/\D/g, ''),
      })
      setMessage('Endereço adicionado!')
      setShowForm(false)
      setForm({ apelido: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' })
      loadAddresses()
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Erro ao salvar endereço')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await userService.deleteAddress(id)
      loadAddresses()
    } catch {}
  }

  const handleSetDefault = async (id) => {
    try {
      await userService.setDefaultAddress(id)
      loadAddresses()
    } catch {}
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Meus Endereços</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-secondary transition"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancelar' : 'Adicionar'}
        </button>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-xl space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Apelido</label>
              <input
                type="text"
                placeholder="Ex: Casa, Trabalho"
                value={form.apelido}
                onChange={(e) => setForm({ ...form, apelido: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">CEP *</label>
              <input
                type="text"
                placeholder="00000-000"
                value={form.cep}
                onChange={(e) => {
                  const val = maskCep(e.target.value)
                  setForm({ ...form, cep: val })
                  if (val.replace(/\D/g, '').length === 8) handleCepSearch(val)
                }}
                required
                inputMode="numeric"
                maxLength={9}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Logradouro *</label>
            <input
              type="text"
              value={form.logradouro}
              onChange={(e) => setForm({ ...form, logradouro: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <AddressNumberInput
              value={form.numero}
              onChange={(v) => setForm({ ...form, numero: v })}
              required
            />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Complemento</label>
              <input
                type="text"
                value={form.complemento}
                onChange={(e) => setForm({ ...form, complemento: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Bairro *</label>
              <input
                type="text"
                value={form.bairro}
                onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Cidade *</label>
              <input
                type="text"
                value={form.cidade}
                onChange={(e) => setForm({ ...form, cidade: onlyLetters(e.target.value) })}
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Estado *</label>
              <input
                type="text"
                maxLength={2}
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: maskUf(e.target.value) })}
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-secondary transition disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar Endereço'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : addresses.length === 0 && !showForm ? (
        <div className="text-center py-12">
          <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-2">Nenhum endereço cadastrado</p>
          <p className="text-xs text-gray-400">Adicione um endereço para agilizar suas compras</p>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((addr) => (
            <div key={addr._id} className="flex items-start gap-3 p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition">
              <MapPin className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900">{addr.apelido || 'Endereço'}</span>
                  {addr.padrao && (
                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">Padrão</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-0.5">
                  {addr.logradouro}, {addr.numero}{addr.complemento ? ` - ${addr.complemento}` : ''}
                </p>
                <p className="text-xs text-gray-400">
                  {addr.bairro} · {addr.cidade}/{addr.estado} · CEP {addr.cep}
                </p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                {!addr.padrao && (
                  <button
                    onClick={() => handleSetDefault(addr._id)}
                    title="Definir como padrão"
                    className="p-1.5 text-gray-400 hover:text-primary transition rounded-lg hover:bg-primary/5"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(addr._id)}
                  title="Remover"
                  className="p-1.5 text-gray-400 hover:text-red-500 transition rounded-lg hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ────────── Chats Tab ────────── */
export function ChatsTab({ initialOpenTicketId, onConsumedOpenTicket }) {
  const { token, user } = useAuthStore()
  const userId = user?.id || user?._id
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)
  const pendingOpenRef = useRef(initialOpenTicketId)

  useEffect(() => {
    pendingOpenRef.current = initialOpenTicketId
  }, [initialOpenTicketId])

  useEffect(() => {
    loadTickets()
  }, [])

  const expandedTicket = tickets.find((t) => String(t._id) === String(expandedId))

  useEffect(() => {
    if (expandedId) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [expandedId, expandedTicket?.mensagens?.length])

  useEffect(() => {
    if (!expandedId) return
    setSupportToastSuppressed(expandedId, true)
    return () => setSupportToastSuppressed(expandedId, false)
  }, [expandedId])

  useEffect(() => {
    if (!initialOpenTicketId || loading) return
    void tryOpenTicket(initialOpenTicketId, tickets)
  }, [initialOpenTicketId, loading])

  const tryOpenTicket = async (ticketId, list) => {
    if (!ticketId) return
    const id = String(ticketId)
    const found = (list || tickets).some((t) => String(t._id) === id)
    if (found) {
      setExpandedId(id)
      onConsumedOpenTicket?.()
      return
    }
    try {
      const res = await supportService.getById(id)
      const ticket = res.data?.data?.ticket || res.data?.data
      if (ticket?._id) {
        setTickets((prev) => {
          const exists = prev.some((t) => String(t._id) === String(ticket._id))
          if (exists) return prev
          return [ticket, ...prev]
        })
        setExpandedId(String(ticket._id))
        onConsumedOpenTicket?.()
      }
    } catch {
      /* ignore */
    }
  }

  const handleIncomingMessage = useCallback((mensagem, meta = {}) => {
    const evtTicketId = meta.ticketId ? String(meta.ticketId) : null
    const normalized = normalizeSupportMessage(mensagem)
    if (!normalized || !evtTicketId) return

    setTickets((prev) =>
      prev.map((t) =>
        String(t._id) === evtTicketId ? mergeTicketWithMessage(t, normalized) : t,
      ),
    )
  }, [])

  useSupportTicketRoom({
    token,
    userId,
    ticketId: expandedId,
    enabled: Boolean(token && userId && expandedId),
    onMessage: handleIncomingMessage,
  })

  const loadTickets = async (opts = {}) => {
    const silent = Boolean(opts.silent)
    try {
      if (!silent) setLoading(true)
      const res = await supportService.getHistory()
      const data = res.data?.data
      const list = Array.isArray(data) ? data : (data?.tickets || [])
      setTickets(list)
      const toOpen = pendingOpenRef.current
      if (toOpen) {
        await tryOpenTicket(toOpen, list)
        pendingOpenRef.current = null
      }
    } catch {
      setTickets([])
    } finally {
      setLoading(false)
    }
  }

  const handleSendReply = async (ticketId) => {
    const text = replyText.trim()
    if (!text || sending) return
    const tid = String(ticketId)
    const optimistic = {
      ...normalizeSupportMessage({
        tipo_remetente: 'usuario',
        texto: text,
        enviado_em: new Date().toISOString(),
        id_remetente: userId,
      }),
      _optimistic: true,
    }

    setReplyText('')
    setTickets((prev) =>
      prev.map((t) =>
        String(t._id) === tid ? mergeTicketWithMessage(t, optimistic) : t,
      ),
    )

    try {
      setSending(true)
      await supportService.sendMessage(tid, { texto: text })
    } catch {
      setTickets((prev) =>
        prev.map((t) => {
          if (String(t._id) !== tid) return t
          const mensagens = (t.mensagens || []).filter(
            (m) => !(m._optimistic && contentDedupeKey(m) === contentDedupeKey(optimistic)),
          )
          return { ...t, mensagens }
        }),
      )
      setReplyText(text)
    } finally {
      setSending(false)
    }
  }

  const handleCloseTicket = async (ticketId) => {
    try {
      await supportService.closeTicket(ticketId)
      await loadTickets({ silent: true })
    } catch {}
  }

  const statusColors = {
    'aberta': 'bg-yellow-100 text-yellow-700',
    'em_atendimento': 'bg-blue-100 text-blue-700',
    'respondida': 'bg-green-100 text-green-700',
    'encerrada': 'bg-gray-100 text-gray-500',
  }

  const statusLabels = {
    'aberta': 'Aguardando',
    'em_atendimento': 'Em Atendimento',
    'respondida': 'Respondida',
    'encerrada': 'Encerrada',
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Meus Chats</h2>
        <button
          onClick={loadTickets}
          disabled={loading}
          className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12">
          <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-2">Nenhum chat de suporte</p>
          <p className="text-xs text-gray-400">Use o chat flutuante no canto inferior para iniciar uma conversa</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const isExpanded = String(expandedId) === String(ticket._id)
            const msgs = ticket.mensagens || []
            const isOpen = ticket.status !== 'encerrada'
            const lastMsg = msgs[msgs.length - 1]

            return (
              <div key={ticket._id} className="border border-gray-100 rounded-xl overflow-hidden">
                {/* Header */}
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition"
                  onClick={() => setExpandedId(isExpanded ? null : ticket._id)}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isOpen ? 'bg-indigo-50' : 'bg-gray-50'}`}>
                    <MessageSquare className={`w-5 h-5 ${isOpen ? 'text-indigo-500' : 'text-gray-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-gray-900 truncate">
                        {ticket.assunto || 'Chat de suporte'}
                      </p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${statusColors[ticket.status] || 'bg-gray-100 text-gray-500'}`}>
                        {statusLabels[ticket.status] || ticket.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {lastMsg
                        ? `${normalizeTipoRemetente(lastMsg) === 'usuario' ? 'Você' : normalizeTipoRemetente(lastMsg) === 'sistema' ? 'Sistema' : 'Farmacêutico'}: ${lastMsg.texto}`
                        : 'Sem mensagens'}
                    </p>
                    <p className="text-[10px] text-gray-300 mt-0.5">
                      {new Date(ticket.updatedAt || ticket.createdAt).toLocaleDateString('pt-BR')}{' '}
                      às {new Date(ticket.updatedAt || ticket.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </div>

                {/* Expanded - Messages */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <div className="max-h-80 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
                      {msgs.length === 0 ? (
                        <p className="text-center text-xs text-gray-400 py-4">Nenhuma mensagem ainda</p>
                      ) : (
                        msgs.map((msg, idx) => {
                          const tipo = normalizeTipoRemetente(msg)
                          const isUser = tipo === 'usuario'
                          const isSystem = tipo === 'sistema'
                          return (
                            <div key={messageKey(msg) || idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                              <div
                                className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm ${
                                  isSystem
                                    ? 'bg-gray-200 text-gray-500 text-xs italic mx-auto text-center'
                                    : isUser
                                      ? 'bg-primary text-white rounded-br-md'
                                      : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'
                                }`}
                              >
                                {!isUser && !isSystem && (
                                  <p className="text-[10px] font-bold text-indigo-500 mb-0.5">👨‍⚕️ Farmacêutico</p>
                                )}
                                <p className="whitespace-pre-wrap">{msg.texto}</p>
                                <p className={`text-[10px] mt-1 ${isUser ? 'text-white/60' : 'text-gray-400'}`}>
                                  {new Date(msg.enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          )
                        })
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {isOpen && (
                      <div className="p-3 border-t border-gray-100 bg-white">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendReply(ticket._id)}
                            placeholder="Digite sua mensagem..."
                            className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                          <button
                            onClick={() => handleSendReply(ticket._id)}
                            disabled={!replyText.trim() || sending}
                            className="px-4 py-2.5 bg-primary text-white rounded-xl hover:bg-secondary transition disabled:opacity-50"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                        <button
                          onClick={() => handleCloseTicket(ticket._id)}
                          className="w-full mt-2 text-xs text-red-500 hover:text-red-600 py-1"
                        >
                          Encerrar conversa
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ReceitasTab() {
  const navigate = useNavigate()
  const [prescriptions, setPrescriptions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPrescriptions()
  }, [])

  const loadPrescriptions = async () => {
    try {
      setLoading(true)
      const res = await prescriptionService.getAll({ params: { limit: 100 } })
      const data = res.data?.data
      setPrescriptions(Array.isArray(data) ? data : (data?.docs || data?.receitas || []))
    } catch {
      setPrescriptions([])
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      'Aprovada': 'bg-green-100 text-green-700',
      'Pendente': 'bg-yellow-100 text-yellow-700',
      'Em Análise': 'bg-blue-100 text-blue-700',
      'Rejeitada': 'bg-red-100 text-red-700',
      'Cancelada': 'bg-gray-100 text-gray-500',
      'Expirada': 'bg-gray-100 text-gray-500',
    }
    return colors[status] || 'bg-gray-100 text-gray-700'
  }

  const temAprovada = prescriptions.some((rx) => rx.status === 'Aprovada')

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Minhas Receitas</h2>
        <button
          onClick={loadPrescriptions}
          disabled={loading}
          className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition"
          title="Atualizar"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {temAprovada && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <span>Você tem receita(s) aprovada(s). Avance para o pagamento do pedido.</span>
          </div>
          <button
            onClick={() => navigate('/pedidos')}
            className="inline-flex items-center justify-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-secondary transition whitespace-nowrap"
          >
            Avançar para o pagamento
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-2">Nenhuma receita enviada</p>
          <p className="text-xs text-gray-400">Envie receitas médicas para comprar medicamentos controlados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {prescriptions.map((rx) => {
            const pdfUrl = resolveMediaUrl(rx.url_imagem_publica || rx.url_arquivo)
            return (
              <div key={rx._id} className="p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate">
                      {rx.nome_arquivo || rx.arquivo || 'Receita médica'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(rx.createdAt).toLocaleDateString('pt-BR')}
                      {rx.validade && ` · Válida até ${new Date(rx.validade).toLocaleDateString('pt-BR')}`}
                    </p>
                  </div>
                  {pdfUrl && (
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-primary hover:underline flex-shrink-0"
                    >
                      Ver PDF
                    </a>
                  )}
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${getStatusColor(rx.status)}`}>
                    {rx.status === 'Aprovada' ? 'Validada' : rx.status}
                  </span>
                </div>

                {/* Aviso por PDF: validado x rejeitado */}
                {rx.status === 'Aprovada' && (
                  <p className="mt-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> Validada pelo farmacêutico.
                  </p>
                )}
                {rx.status === 'Rejeitada' && (
                  <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    <span className="font-semibold">Rejeitada.</span>{' '}
                    {rx.observacoes ? `Motivo: ${rx.observacoes}` : 'Envie uma nova receita válida para este medicamento.'}
                  </p>
                )}
                {(rx.status === 'Pendente' || rx.status === 'Em Análise') && (
                  <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Em análise pelo farmacêutico.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LgpdSection({ user, logout, navigate }) {
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleExport = async () => {
    try {
      setExporting(true)
      const res = await userService.exportData()
      const data = res.data?.data || res.data
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `meus-dados-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Erro ao exportar dados. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }

  const handleDelete = async () => {
    try {
      setDeleting(true)
      await userService.deleteAccount()
      alert('Sua conta foi removida com sucesso.')
      logout()
      navigate('/login')
    } catch (err) {
      alert(err.response?.data?.message || 'Erro ao excluir conta. Verifique se não há pedidos ativos.')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="mt-6 pt-6 border-t border-gray-100">
      <h3 className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">
        <Shield className="w-4 h-4 text-blue-500" />
        Privacidade e Dados (LGPD)
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        Conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018)
      </p>

      <div className="space-y-2">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full py-2.5 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-100 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <FileText className="w-4 h-4" />
          {exporting ? 'Exportando...' : 'Exportar Meus Dados'}
        </button>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-100 transition flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Solicitar Exclusão da Conta
          </button>
        ) : (
          <div className="p-3 bg-red-50 rounded-xl border border-red-200">
            <p className="text-xs text-red-700 mb-3 font-medium">
              ⚠️ Esta ação é irreversível. Todos os seus dados pessoais serão anonimizados.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleting ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2 bg-white text-gray-600 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
