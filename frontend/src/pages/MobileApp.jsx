import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Bike,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  CreditCard,
  FileText,
  Home,
  LogOut,
  MapPin,
  Minus,
  PackageCheck,
  PackageSearch,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  Truck,
  UploadCloud,
  UserRound,
  Wallet,
  X,
} from 'lucide-react'
import {
  authService,
  deliveryService,
  orderService,
  paymentService,
  pharmacistService,
  pharmacyService,
  prescriptionService,
  productService,
  reviewService,
} from '../services/api'
import { getGoogleClientId } from '../config/env'
import { SELF_REGISTER_TYPES } from '../constants'
import AccessibilityMenu from '../components/AccessibilityMenu'
import DarkModeToggle from '../components/DarkModeToggle'
import { useAuthStore, useCartStore, usePrescriptionStore } from '../stores/store'
import { resolveMediaUrl } from '../utils/mediaUrl'
import ValidationService from '../utils/validation'
import {
  getDisplayPrice,
  getAvailableStock,
  isRemoteCheckoutBlocked,
  isProductUnavailable,
  requiresPrescription,
  shouldHideProductImage,
} from '../utils/compliance'

const CLIENT_TABS = [
  { id: 'home', label: 'Início', icon: Home },
  { id: 'buscar', label: 'Busca', icon: Search },
  { id: 'farmacias', label: 'Farmácias', icon: Store },
  { id: 'pedidos', label: 'Pedidos', icon: ClipboardList },
  { id: 'conta', label: 'Conta', icon: UserRound },
]

const DRIVER_TABS = [
  { id: 'home', label: 'Início', icon: Home },
  { id: 'entregas', label: 'Entregas', icon: Truck },
  { id: 'historico', label: 'Histórico', icon: ClipboardList },
  { id: 'conta', label: 'Conta', icon: UserRound },
]

const PHARMACY_TABS = [
  { id: 'home', label: 'Início', icon: Home },
  { id: 'pedidos', label: 'Pedidos', icon: ClipboardList },
  { id: 'receitas', label: 'Receitas', icon: FileText },
  { id: 'conta', label: 'Conta', icon: UserRound },
]

const QUICK_SEARCHES = ['Dor e febre', 'Vitaminas', 'Infantil', 'Receita', 'Higiene']

const MOBILE_TARJA_CONFIG = {
  sem_receita: null,
  tarja_vermelha: { label: 'Tarja Vermelha', className: 'border-red-100 bg-red-50 text-red-700' },
  tarja_preta: { label: 'Tarja Preta', className: 'border-gray-950 bg-gray-950 text-white' },
  antimicrobiano: { label: 'Antimicrobiano', className: 'border-blue-100 bg-blue-50 text-blue-700' },
  controlado_a: { label: 'Tarja Amarela', className: 'border-yellow-100 bg-yellow-50 text-yellow-800' },
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function firstName(user) {
  return user?.nome?.split(' ')?.[0] || 'você'
}

function money(value) {
  const n = Number(value || 0)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function getTarjaConfig(product) {
  return MOBILE_TARJA_CONFIG[product?.classificacao_receita || 'sem_receita'] || null
}

function getErrorMessage(error, fallback = 'Não foi possível concluir a ação') {
  return error?.response?.data?.message || error?.message || fallback
}

function extractList(payload, keys = []) {
  if (Array.isArray(payload)) return payload
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key]
  }
  return payload?.docs || []
}

function resolveId(value) {
  if (!value) return ''
  if (typeof value === 'object') return String(value._id || value.id || '')
  return String(value)
}

function getPharmacyId(product) {
  return resolveId(product?.id_farmacia)
}

function getPharmacyName(product, pharmaciesById) {
  if (product?.id_farmacia && typeof product.id_farmacia === 'object') {
    return product.id_farmacia.nome || 'Farmácia'
  }
  return pharmaciesById[getPharmacyId(product)]?.nome || product?.nome_farmacia || 'Farmácia'
}

function getOrderId(order) {
  return String(order?._id || order?.id || '')
}

function getOrderPharmacyId(order) {
  return resolveId(order?.id_farmacia)
}

function getUserPharmacyId(user) {
  return resolveId(
    user?.id_farmacia ||
      user?.farmacia_id ||
      user?.dados_farmaceutico?.id_farmacia ||
      user?.dados_dono_farmacia?.id_farmacia
  )
}

function getPrescriptionId(receita) {
  return String(receita?._id || receita?.id || '')
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function normalizeProductKey(product) {
  return [
    normalizeText(product?.principio_ativo || product?.nome),
    normalizeText(product?.dosagem),
    normalizeText(product?.forma_farmaceutica),
  ]
    .filter(Boolean)
    .join('|')
}

function aggregateProductGroups(products) {
  const map = new Map()
  products.filter(Boolean).forEach((product) => {
    const key = normalizeProductKey(product) || String(product._id || product.id)
    const price = getDisplayPrice(product)
    const current = map.get(key)
    if (!current) {
      map.set(key, {
        key,
        representative: product,
        offers: [product],
        minPrice: price,
      })
      return
    }
    current.offers.push(product)
    if (price < current.minPrice) {
      current.minPrice = price
      current.representative = product
    }
  })

  return Array.from(map.values()).sort((a, b) =>
    String(a.representative?.nome || '').localeCompare(String(b.representative?.nome || ''), 'pt-BR')
  )
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function orderHasPrescription(order) {
  return (order?.itens || []).some((item) => item?.id_receita || item?.receita_obrigatoria || item?.controlado)
}

function statusLabel(status) {
  const labels = {
    aguardando_pagamento: 'Aguardando pagamento',
    aguardando_confirmacao_receita_farmacia: 'Receita em validação',
    pago: 'Pago',
    em_processamento: 'Em preparo',
    confirmado: 'Confirmado',
    enviado: 'Enviado',
    entregue: 'Entregue',
    cancelado: 'Cancelado',
    rejeitado: 'Rejeitado',
    pendente: 'Pendente',
    aceita: 'Aceita',
    coletando: 'Coletando',
    coletada: 'Coletada',
    em_transito: 'Em trânsito',
  }
  return labels[status] || status || 'Em andamento'
}

function clientOrderStatusLabel(order) {
  if (order?.status === 'aguardando_confirmacao_receita_farmacia' && order?.status_pagamento !== 'aprovado') {
    return 'Receitas em validação pela farmácia'
  }
  if (order?.status === 'aguardando_confirmacao_receita_farmacia' && order?.status_pagamento === 'aprovado') {
    return 'Entregador chegou; aguardando conferência final'
  }
  if (order?.status === 'aguardando_pagamento' && order?.status_pagamento === 'aprovado') {
    return 'Aguardando confirmação da farmácia'
  }
  if (order?.status === 'aguardando_pagamento') {
    return 'Pagamento liberado'
  }
  if (order?.status === 'confirmado') {
    return 'Entregador indo pegar o pedido'
  }
  if (order?.status === 'a_caminho') {
    return 'Entregador está chegando até você'
  }
  return statusLabel(order?.status)
}

function orderActionMessage(order) {
  if (order?.status === 'aguardando_confirmacao_receita_farmacia') {
    return order?.status_pagamento === 'aprovado'
      ? 'O entregador confirmou o código. A farmácia fará a conferência final para concluir a venda.'
      : 'A farmácia está validando as receitas digitais antes de liberar o pagamento.'
  }
  if (order?.status === 'aguardando_pagamento' && order?.status_pagamento !== 'aprovado') {
    return 'Receita aprovada ou pedido sem receita. Finalize o pagamento para seguir.'
  }
  if (order?.status === 'aguardando_pagamento' && order?.status_pagamento === 'aprovado') {
    return 'Pagamento aprovado. A farmácia precisa confirmar o recebimento do pedido.'
  }
  if (order?.status === 'em_processamento') {
    return 'Pedido em separação na farmácia.'
  }
  if (order?.status === 'confirmado') {
    return 'O entregador está indo buscar seu pedido na farmácia.'
  }
  if (order?.status === 'a_caminho') {
    return 'Seu pedido está chegando. Tenha o código em mãos para finalizar a entrega.'
  }
  if (order?.status === 'entregue') {
    return 'Venda finalizada. Você já pode avaliar a farmácia e o entregador.'
  }
  return ''
}

function MobileAppHeader({ user, role, onCart, cartCount }) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 px-4 pb-3 backdrop-blur"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{greeting()}</p>
          <h1 className="truncate text-lg font-bold text-gray-950">
            {role === 'entregador' ? 'Boas entregas' : `Olá, ${firstName(user)}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <AccessibilityMenu />
          <DarkModeToggle />
          {role === 'cliente' && (
            <button
              type="button"
              onClick={onCart}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-800"
              aria-label="Carrinho"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </button>
          )}
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
            {firstName(user).charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  )
}

function AuthScreen({ onSuccess }) {
  const { setUser, setToken } = useAuthStore()
  const [mode, setMode] = useState('login')
  const [loginMode, setLoginMode] = useState('password')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [login, setLogin] = useState({ email: '', senha: '' })
  const [otpEmail, setOtpEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [accountType, setAccountType] = useState('cliente')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [register, setRegister] = useState({
    nome: '',
    email: '',
    telefone: '',
    cpf: '',
    senha: '',
    confirmaSenha: '',
    tipo_veiculo: '',
    cnh: '',
  })
  const googleButtonRef = useRef(null)
  const googleClientId = getGoogleClientId()
  const mobileAccountTypes = SELF_REGISTER_TYPES.filter((item) => ['cliente', 'entregador'].includes(item.value))

  const finish = useCallback(
    async (response) => {
      const data = response.data?.data
      if (!data?.accessToken || !data?.user) {
        throw new Error('Resposta inválida do servidor')
      }
      setToken(data.accessToken)
      setUser(data.user)
      onSuccess?.()
    },
    [onSuccess, setToken, setUser]
  )

  const handleGoogleCredential = useCallback(
    async (googleResponse) => {
      try {
        setError('')
        setGoogleLoading(true)
        if (!googleResponse?.credential) throw new Error('Token do Google não recebido')
        await finish(await authService.google(googleResponse.credential))
      } catch (err) {
        setError(getErrorMessage(err, 'Erro ao entrar com Google'))
      } finally {
        setGoogleLoading(false)
      }
    },
    [finish]
  )

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return undefined

    let cancelled = false
    let script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')

    const renderGoogleButton = () => {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) return
      googleButtonRef.current.innerHTML = ''
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential,
      })
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: Math.min(360, googleButtonRef.current.offsetWidth || 320),
        text: mode === 'register' ? 'signup_with' : 'continue_with',
        shape: 'rectangular',
        locale: 'pt-BR',
      })
    }

    if (window.google?.accounts?.id) {
      renderGoogleButton()
      return () => {
        cancelled = true
      }
    }

    if (!script) {
      script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      document.body.appendChild(script)
    }

    script.addEventListener('load', renderGoogleButton)
    return () => {
      cancelled = true
      script?.removeEventListener('load', renderGoogleButton)
    }
  }, [googleClientId, handleGoogleCredential, mode])

  function validateRegister() {
    const nameValidation = ValidationService.validateName(register.nome)
    if (!nameValidation.valid) return nameValidation.error

    const emailValidation = ValidationService.validateEmail(register.email)
    if (!emailValidation.valid) return emailValidation.error

    if (!register.telefone.trim()) return 'Telefone é obrigatório'

    const cpfValidation = ValidationService.validateCPF(register.cpf)
    if (!cpfValidation.valid) return cpfValidation.error

    const passwordValidation = ValidationService.validatePassword(register.senha)
    if (!passwordValidation.valid) return passwordValidation.error

    if (register.senha !== register.confirmaSenha) return 'As senhas não coincidem'

    if (accountType === 'entregador') {
      if (!register.tipo_veiculo) return 'Tipo de veículo é obrigatório'
      if (!register.cnh.trim()) return 'CNH é obrigatória'
    }

    if (!termsAccepted) return 'Aceite os termos de uso e a política de privacidade'
    return null
  }

  async function handleLogin(event) {
    event.preventDefault()
    try {
      setLoading(true)
      setError('')
      await finish(await authService.login(login.email, login.senha))
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao entrar'))
    } finally {
      setLoading(false)
    }
  }

  async function requestEmailCode(event) {
    event.preventDefault()
    const emailValidation = ValidationService.validateEmail(otpEmail)
    if (!emailValidation.valid) {
      setError(emailValidation.error)
      return
    }

    try {
      setLoading(true)
      setError('')
      await authService.requestEmailCode(otpEmail)
      setOtpSent(true)
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao enviar código'))
    } finally {
      setLoading(false)
    }
  }

  async function verifyEmailCode(event) {
    event.preventDefault()
    if (!/^\d{6}$/.test(otpCode)) {
      setError('Informe o código de 6 dígitos')
      return
    }

    try {
      setLoading(true)
      setError('')
      await finish(await authService.verifyEmailCode(otpEmail, otpCode))
    } catch (err) {
      setError(getErrorMessage(err, 'Código inválido ou expirado'))
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(event) {
    event.preventDefault()
    const validationError = validateRegister()
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setLoading(true)
      setError('')
      await finish(await authService.register({
        nome: register.nome,
        email: register.email,
        telefone: register.telefone,
        cpf: register.cpf.replace(/\D/g, ''),
        senha: register.senha,
        tipo_usuario: accountType,
        dados_entregador: accountType === 'entregador'
          ? {
              tipo_veiculo: register.tipo_veiculo,
              cnh: register.cnh,
            }
          : undefined,
        lgpd_consentimento: {
          aceito: true,
          data_aceite: new Date().toISOString(),
          versao_termo: '1.0',
        },
      }))
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao criar conta'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 px-4 py-6">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-md flex-col justify-between">
        <div>
          <div className="mb-8">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-white">
              S
            </div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">{greeting()}</p>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight text-gray-950">Saúde na Mão</h1>
            <p className="mt-2 text-sm text-gray-500">Compre medicamentos e acompanhe entregas pelo celular.</p>
          </div>

          <div className="mb-4 grid grid-cols-2 rounded-2xl bg-gray-200 p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`h-11 rounded-xl text-sm font-bold ${mode === 'login' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'}`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`h-11 rounded-xl text-sm font-bold ${mode === 'register' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'}`}
            >
              Criar conta
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          {mode === 'login' ? (
            <>
              <div className="mb-3 grid grid-cols-2 rounded-2xl bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('password')
                    setError('')
                  }}
                  className={`h-10 rounded-xl text-sm font-bold ${loginMode === 'password' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'}`}
                >
                  Senha
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('code')
                    setError('')
                  }}
                  className={`h-10 rounded-xl text-sm font-bold ${loginMode === 'code' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'}`}
                >
                  Código
                </button>
              </div>

              {loginMode === 'password' ? (
                <form onSubmit={handleLogin} className="space-y-3">
                  <input
                    type="email"
                    value={login.email}
                    onChange={(event) => setLogin((current) => ({ ...current, email: event.target.value }))}
                    placeholder="Email"
                    className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    type="password"
                    value={login.senha}
                    onChange={(event) => setLogin((current) => ({ ...current, senha: event.target.value }))}
                    placeholder="Senha"
                    className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="h-12 w-full rounded-2xl bg-primary text-base font-bold text-white shadow-sm disabled:opacity-60"
                  >
                    {loading ? 'Entrando...' : 'Entrar no app'}
                  </button>
                </form>
              ) : (
                <form onSubmit={otpSent ? verifyEmailCode : requestEmailCode} className="space-y-3">
                  <input
                    type="email"
                    value={otpEmail}
                    onChange={(event) => setOtpEmail(event.target.value)}
                    placeholder="Email"
                    disabled={otpSent}
                    className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-gray-100"
                  />
                  {otpSent && (
                    <input
                      inputMode="numeric"
                      value={otpCode}
                      onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Código de 6 dígitos"
                      className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="h-12 w-full rounded-2xl bg-primary text-base font-bold text-white shadow-sm disabled:opacity-60"
                  >
                    {loading ? 'Aguarde...' : otpSent ? 'Validar código' : 'Receber código'}
                  </button>
                  {otpSent && (
                    <button
                      type="button"
                      onClick={() => {
                        setOtpSent(false)
                        setOtpCode('')
                      }}
                      className="w-full text-sm font-bold text-primary"
                    >
                      Alterar e-mail
                    </button>
                  )}
                </form>
              )}
            </>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {mobileAccountTypes.map((item) => {
                  const selected = accountType === item.value
                  const Icon = item.value === 'entregador' ? Truck : ShoppingBag
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setAccountType(item.value)}
                      className={`rounded-2xl border p-3 text-left ${selected ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 bg-white text-gray-600'}`}
                    >
                      <Icon className="mb-2 h-5 w-5" />
                      <span className="block text-sm font-extrabold">{item.label}</span>
                      <span className="block text-xs leading-tight opacity-75">{item.description}</span>
                    </button>
                  )
                })}
              </div>
              <input
                value={register.nome}
                onChange={(event) => setRegister((current) => ({ ...current, nome: event.target.value }))}
                placeholder="Nome completo"
                className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <input
                type="email"
                value={register.email}
                onChange={(event) => setRegister((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email"
                className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <input
                type="tel"
                value={register.telefone}
                onChange={(event) => setRegister((current) => ({ ...current, telefone: event.target.value }))}
                placeholder="Telefone"
                className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <input
                inputMode="numeric"
                value={register.cpf}
                onChange={(event) => setRegister((current) => ({ ...current, cpf: event.target.value }))}
                placeholder="CPF"
                className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <input
                type="password"
                value={register.senha}
                onChange={(event) => setRegister((current) => ({ ...current, senha: event.target.value }))}
                placeholder="Senha"
                className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <input
                type="password"
                value={register.confirmaSenha}
                onChange={(event) => setRegister((current) => ({ ...current, confirmaSenha: event.target.value }))}
                placeholder="Confirmar senha"
                className="h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              {accountType === 'entregador' && (
                <div className="grid grid-cols-1 gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-3">
                  <select
                    value={register.tipo_veiculo}
                    onChange={(event) => setRegister((current) => ({ ...current, tipo_veiculo: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-blue-100 bg-white px-4 text-base outline-none focus:border-primary"
                  >
                    <option value="">Tipo de veículo</option>
                    <option value="moto">Moto</option>
                    <option value="bicicleta">Bicicleta</option>
                    <option value="carro">Carro</option>
                  </select>
                  <input
                    value={register.cnh}
                    onChange={(event) => setRegister((current) => ({ ...current, cnh: event.target.value }))}
                    placeholder="CNH"
                    className="h-12 w-full rounded-2xl border border-blue-100 bg-white px-4 text-base outline-none focus:border-primary"
                  />
                </div>
              )}
              <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-500">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                />
                <span>
                  Concordo com os <span className="font-bold text-primary">termos</span> e a{' '}
                  <span className="font-bold text-primary">política de privacidade</span>.
                </span>
              </label>
              <button
                type="submit"
                disabled={loading}
                className="h-12 w-full rounded-2xl bg-primary text-base font-bold text-white shadow-sm disabled:opacity-60"
              >
                {loading ? 'Criando...' : `Criar conta ${accountType === 'entregador' ? 'entregador' : 'cliente'}`}
              </button>
            </form>
          )}

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-bold uppercase tracking-wide text-gray-400">ou</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {googleClientId ? (
            <div className={`flex justify-center ${googleLoading ? 'pointer-events-none opacity-60' : ''}`}>
              <div ref={googleButtonRef} />
            </div>
          ) : (
            <button
              type="button"
              disabled
              className="h-12 w-full rounded-2xl border border-gray-200 bg-white text-sm font-bold text-gray-400"
            >
              Google não configurado
            </button>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          Entregador acessa pela mesma entrada usando a conta de entregador.
        </p>
      </div>
    </div>
  )
}

function BottomNav({ tabs, activeTab, onChange }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
      <div className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((item) => {
          const Icon = item.icon
          const active = activeTab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`flex flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[11px] font-bold transition ${
                active ? 'bg-primary/10 text-primary' : 'text-gray-500'
              }`}
            >
              <Icon className="mb-0.5 h-5 w-5" />
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function SearchBox({ value, onChange, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="relative">
      <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar remédio ou farmácia"
        className="h-12 w-full rounded-2xl border border-gray-200 bg-white pl-12 pr-4 text-base shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </form>
  )
}

function ProductRow({ product, pharmacyName, onAdd }) {
  const price = getDisplayPrice(product)
  const image = resolveMediaUrl(product.imagens?.[0] || product.imagem_url)
  const hideImage = shouldHideProductImage(product)
  const blocked = isRemoteCheckoutBlocked(product)
  const unavailable = isProductUnavailable(product)
  const tarja = getTarjaConfig(product)

  return (
    <div className={`rounded-2xl border border-gray-100 p-3 shadow-sm ${unavailable ? 'bg-gray-100 opacity-70' : 'bg-white'}`}>
      <div className="flex gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-100">
          {hideImage || !image ? (
            <PackageSearch className="h-8 w-8 text-primary" />
          ) : (
            <img src={image} alt="" className="h-full w-full object-contain" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-gray-950">{product.nome}</h3>
          <p className="mt-1 truncate text-xs text-gray-500">{pharmacyName}</p>
          {tarja && (
            <span className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-extrabold uppercase ${tarja.className}`}>
              <AlertTriangle className="h-3 w-3" />
              {tarja.label}
            </span>
          )}
          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-extrabold text-gray-950">{money(price)}</p>
              {requiresPrescription(product) && <p className="text-[11px] font-semibold text-amber-600">Receita obrigatória</p>}
              {unavailable && <p className="text-[11px] font-semibold text-gray-500">Indisponível</p>}
            </div>
            <button
              type="button"
              onClick={() => onAdd(product)}
              disabled={blocked || unavailable}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white disabled:bg-gray-300"
              aria-label="Adicionar ao carrinho"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProductGroupRow({ group, pharmaciesById, onOpen }) {
  const product = group.representative
  const image = resolveMediaUrl(product?.imagens?.[0] || product?.imagem_url)
  const hideImage = shouldHideProductImage(product)
  const pharmaciesCount = new Set(group.offers.map((offer) => getPharmacyId(offer)).filter(Boolean)).size
  const tarja = getTarjaConfig(product)

  return (
    <button
      type="button"
      onClick={() => onOpen(group)}
      className="w-full rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-sm"
    >
      <div className="flex gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-100">
          {hideImage || !image ? (
            <PackageSearch className="h-8 w-8 text-primary" />
          ) : (
            <img src={image} alt="" className="h-full w-full object-contain" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-gray-950">{product?.nome}</h3>
          <p className="mt-1 text-xs text-gray-500">
            {pharmaciesCount > 1 ? `${pharmaciesCount} farmácias disponíveis` : getPharmacyName(product, pharmaciesById)}
          </p>
          {tarja && (
            <span className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-extrabold uppercase ${tarja.className}`}>
              <AlertTriangle className="h-3 w-3" />
              {tarja.label}
            </span>
          )}
          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">A partir de</p>
              <p className="text-base font-extrabold text-gray-950">{money(group.minPrice)}</p>
              {requiresPrescription(product) && <p className="text-[11px] font-semibold text-amber-600">Receita obrigatória</p>}
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white">
              <ChevronRight className="h-5 w-5" />
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

function CartSheet({ open, onClose, onCheckout }) {
  const { items, getTotal, updateQuantity, removeItem, clearCart } = useCartStore()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40">
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[86svh] max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 pb-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-gray-950">Carrinho</h2>
          <button type="button" onClick={onClose} className="rounded-full bg-gray-100 p-2">
            <X className="h-5 w-5" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="py-10 text-center">
            <ShoppingCart className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="font-bold text-gray-900">Seu carrinho está vazio</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-gray-100 p-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-950">{item.nome}</p>
                    <p className="text-xs text-gray-500">{item.nome_farmacia}</p>
                    <p className="mt-1 text-sm font-extrabold text-primary">{money(item.preco)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => updateQuantity(item.id, item.quantity - 1)} className="rounded-full bg-gray-100 p-2">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold">{item.quantity}</span>
                    <button type="button" onClick={() => updateQuantity(item.id, item.quantity + 1)} className="rounded-full bg-gray-100 p-2">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <button type="button" onClick={() => removeItem(item.id)} className="mt-2 text-xs font-bold text-red-500">
                  Remover
                </button>
              </div>
            ))}

            <div className="sticky bottom-0 bg-white pt-3">
              <div className="mb-3 flex items-center justify-between text-base font-extrabold">
                <span>Total</span>
                <span>{money(getTotal())}</span>
              </div>
              <button
                type="button"
                onClick={onCheckout}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-sm font-extrabold text-white"
              >
                Finalizar pedido
              </button>
              <button type="button" onClick={clearCart} className="mt-3 w-full text-center text-xs font-bold text-gray-400">
                Limpar carrinho
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CheckoutSheet({ open, user, onClose, onDone }) {
  const { items, getTotal, clearCart } = useCartStore()
  const { prescricoesPendentes, setPrescricao } = usePrescriptionStore()
  const [busy, setBusy] = useState(false)
  const [uploadingId, setUploadingId] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    telefone: user?.telefone || '',
    cpf: user?.cpf || '',
    logradouro: '',
    numero: '',
    bairro: '',
    cidade: 'Goiânia',
    estado: 'GO',
    cep: '',
    metodo_pagamento: 'pix',
  })

  if (!open) return null

  const requiredItems = items.filter((item) => item.receita_obrigatoria || item.controlado)
  const hasPrescriptionItems = requiredItems.length > 0
  const missingPrescriptionItems = requiredItems.filter((item) => !getPrescriptionId(prescricoesPendentes[item.id]))
  const needsRecipeValidation = requiredItems.some((item) => prescricoesPendentes[item.id]?.status !== 'Aprovada')
  const deliveryFee = 6.99
  const total = getTotal() + deliveryFee
  const inputClass =
    'h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20'

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function uploadPrescriptionForItem(item, file) {
    if (!file) return
    const validTypes = ['application/pdf', 'application/xml', 'text/xml']
    if (!validTypes.includes(file.type)) {
      setError('Envie apenas PDF ou XML assinado digitalmente')
      return
    }
    try {
      setUploadingId(item.id)
      setError('')
      const response = await prescriptionService.upload(file, item.id_farmacia, 'assincrono', item.id)
      const receita = response.data?.data?.receita
      if (!receita) throw new Error('Receita não retornada pelo servidor')
      setPrescricao(item.id, receita)
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao enviar receita'))
    } finally {
      setUploadingId('')
    }
  }

  function validateCheckout() {
    if (items.length === 0) return 'Carrinho vazio'
    if (!form.telefone.trim()) return 'Informe o telefone'
    if (!form.cpf.trim()) return 'Informe o CPF'
    if (!form.logradouro.trim() || !form.numero.trim() || !form.bairro.trim() || !form.cidade.trim() || !form.estado.trim()) {
      return 'Preencha o endereço de entrega'
    }
    if (missingPrescriptionItems.length > 0) {
      return 'Envie a receita de todos os medicamentos controlados/tarjados'
    }
    return null
  }

  async function submitOrder() {
    const validationError = validateCheckout()
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setBusy(true)
      setError('')
      const orderPayload = {
        id_farmacia: items[0]?.id_farmacia,
        tipo_entrega: 'moto',
        taxa_entrega: deliveryFee,
        metodo_pagamento: form.metodo_pagamento,
        deferPrescriptionApproval: hasPrescriptionItems && needsRecipeValidation,
        endereco_entrega: {
          logradouro: form.logradouro,
          numero: form.numero,
          bairro: form.bairro,
          cidade: form.cidade,
          estado: form.estado,
          cep: form.cep,
        },
        itens: items.map((item) => ({
          id_produto: item.id,
          quantidade: item.quantity,
          id_receita: getPrescriptionId(prescricoesPendentes[item.id]) || undefined,
        })),
      }

      const response = await orderService.create(orderPayload)
      const pedido = response.data?.data?.pedido
      const orderId = getOrderId(pedido)

      if (!hasPrescriptionItems || !needsRecipeValidation) {
        await paymentService.confirmTest(orderId)
      }

      clearCart()
      onDone?.(pedido, hasPrescriptionItems && needsRecipeValidation)
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao finalizar pedido'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40">
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92svh] max-w-md flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <button type="button" onClick={onClose} className="rounded-full bg-gray-100 p-2">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-base font-extrabold text-gray-950">Finalizar pedido</h2>
          <div className="h-9 w-9" />
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {error && (
            <button
              type="button"
              onClick={() => setError('')}
              className="w-full rounded-2xl bg-red-50 px-4 py-3 text-left text-sm font-bold text-red-700"
            >
              {error}
            </button>
          )}

          <section className="rounded-2xl border border-gray-100 p-4">
            <h3 className="mb-3 text-sm font-extrabold text-gray-950">Dados da compra</h3>
            <div className="grid grid-cols-2 gap-3">
              <input value={form.telefone} onChange={(event) => updateField('telefone', event.target.value)} placeholder="Celular" className={inputClass} />
              <input value={form.cpf} onChange={(event) => updateField('cpf', event.target.value)} placeholder="CPF" className={inputClass} />
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 p-4">
            <h3 className="mb-3 text-sm font-extrabold text-gray-950">Endereço</h3>
            <div className="space-y-3">
              <input value={form.logradouro} onChange={(event) => updateField('logradouro', event.target.value)} placeholder="Rua ou avenida" className={inputClass} />
              <div className="grid grid-cols-2 gap-3">
                <input value={form.numero} onChange={(event) => updateField('numero', event.target.value)} placeholder="Número" className={inputClass} />
                <input value={form.bairro} onChange={(event) => updateField('bairro', event.target.value)} placeholder="Bairro" className={inputClass} />
              </div>
              <div className="grid grid-cols-[1fr_72px] gap-3">
                <input value={form.cidade} onChange={(event) => updateField('cidade', event.target.value)} placeholder="Cidade" className={inputClass} />
                <input value={form.estado} onChange={(event) => updateField('estado', event.target.value.toUpperCase().slice(0, 2))} placeholder="UF" className={inputClass} />
              </div>
              <input value={form.cep} onChange={(event) => updateField('cep', event.target.value)} placeholder="CEP" className={inputClass} />
            </div>
          </section>

          {hasPrescriptionItems && (
            <section className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <div className="mb-3 flex gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <h3 className="text-sm font-extrabold text-gray-950">
                    {requiredItems.length} medicamento(s) exigem receita
                  </h3>
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    Envie uma receita digital assinada para cada item antes de seguir.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {requiredItems.map((item) => {
                  const receita = prescricoesPendentes[item.id]
                  const status = receita?.status || 'Não enviada'
                  return (
                    <div key={item.id} className="rounded-2xl bg-white p-3">
                      <p className="text-sm font-extrabold text-gray-950">{item.nome}</p>
                      <p className="mt-1 text-xs font-bold text-primary">{status}</p>
                      <label className="mt-3 flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gray-100 text-xs font-extrabold text-gray-700">
                        <UploadCloud className="h-4 w-4" />
                        {uploadingId === item.id ? 'Enviando...' : receita ? 'Trocar receita' : 'Enviar receita'}
                        <input
                          type="file"
                          accept=".pdf,.xml,application/pdf,application/xml,text/xml"
                          className="hidden"
                          disabled={uploadingId === item.id}
                          onChange={(event) => uploadPrescriptionForItem(item, event.target.files?.[0])}
                        />
                      </label>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-gray-100 p-4">
            <h3 className="mb-3 text-sm font-extrabold text-gray-950">Pagamento</h3>
            <button
              type="button"
              onClick={() => updateField('metodo_pagamento', 'pix')}
              className="flex h-11 w-full items-center justify-between rounded-xl bg-primary/10 px-3 text-sm font-extrabold text-primary"
            >
              <span className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Pix teste
              </span>
              <CheckCircle2 className="h-4 w-4" />
            </button>
          </section>
        </div>

        <div className="border-t border-gray-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="mb-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Produtos</span>
              <span>{money(getTotal())}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Entrega</span>
              <span>{money(deliveryFee)}</span>
            </div>
            <div className="flex justify-between text-base font-extrabold text-gray-950">
              <span>Total</span>
              <span>{money(total)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={submitOrder}
            disabled={busy || uploadingId !== ''}
            className="h-12 w-full rounded-2xl bg-primary text-sm font-extrabold text-white disabled:opacity-60"
          >
            {busy
              ? 'Processando...'
              : hasPrescriptionItems && needsRecipeValidation
                ? 'Enviar para validação'
                : 'Pagar e finalizar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ClientApp({ user, activeTab, setActiveTab }) {
  const { addItem, replaceCartWithItem, getItemCount } = useCartStore()
  const [search, setSearch] = useState('')
  const [products, setProducts] = useState([])
  const [pharmacies, setPharmacies] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [selectedPharmacy, setSelectedPharmacy] = useState('')
  const [selectedProductGroup, setSelectedProductGroup] = useState(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [busyOrderId, setBusyOrderId] = useState('')
  const [ratingForms, setRatingForms] = useState({})

  const pharmaciesById = useMemo(() => {
    const map = {}
    pharmacies.forEach((pharmacy) => {
      map[pharmacy._id || pharmacy.id] = pharmacy
    })
    return map
  }, [pharmacies])

  const productGroups = useMemo(() => aggregateProductGroups(products), [products])

  const filteredProductGroups = useMemo(() => {
    const term = search.trim().toLowerCase()
    return productGroups
      .filter((group) => {
        if (!term) return true
        const product = group.representative
        return [product?.nome, product?.categoria, product?.fabricante, product?.principio_ativo]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      })
      .slice(0, 50)
  }, [productGroups, search])

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    const selectedGroupKey = selectedProductGroup?.key || ''
    return products
      .filter((product) => !selectedPharmacy || getPharmacyId(product) === selectedPharmacy)
      .filter((product) => !selectedGroupKey || normalizeProductKey(product) === selectedGroupKey)
      .filter((product) => {
        if (!term || selectedGroupKey) return true
        return [product.nome, product.categoria, product.fabricante, getPharmacyName(product, pharmaciesById)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      })
      .slice(0, 50)
  }, [products, search, selectedPharmacy, selectedProductGroup, pharmaciesById])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [productsRes, pharmaciesRes, ordersRes] = await Promise.all([
        productService.getAll({ sort: 'nome', limit: 120 }),
        pharmacyService.getAll({ limit: 50 }),
        orderService.getAll().catch(() => null),
      ])
      setProducts(extractList(productsRes.data?.data, ['produtos']).filter((product) => product && getPharmacyId(product)))
      setPharmacies(extractList(pharmaciesRes.data?.data, ['farmacias']).filter(Boolean))
      setOrders(extractList(ordersRes?.data?.data, ['pedidos']).filter(Boolean))
    } catch (err) {
      setMessage(getErrorMessage(err, 'Erro ao carregar app'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function submitSearch(event) {
    event.preventDefault()
    setSelectedPharmacy('')
    setSelectedProductGroup(null)
    setActiveTab('buscar')
  }

  function quickSearch(term) {
    setSearch(term)
    setSelectedPharmacy('')
    setSelectedProductGroup(null)
    setActiveTab('buscar')
  }

  function openProductGroup(group) {
    setSelectedProductGroup(group)
    setSelectedPharmacy('')
    setSearch(group.representative?.nome || '')
    setActiveTab('buscar')
  }

  function openProductAtPharmacy(product) {
    setSelectedProductGroup({
      key: normalizeProductKey(product),
      representative: product,
      offers: [product],
      minPrice: getDisplayPrice(product),
    })
    setSelectedPharmacy(getPharmacyId(product))
    setSearch(product.nome || '')
  }

  function addProduct(product) {
    if (isProductUnavailable(product)) {
      setMessage('Medicamento indisponível nesta farmácia.')
      return
    }

    if (isRemoteCheckoutBlocked(product)) {
      setMessage('Este medicamento exige atendimento direto da farmácia.')
      return
    }

    const pharmacyId = getPharmacyId(product)
    const data = {
      id: product._id || product.id,
      nome: product.nome,
      preco: getDisplayPrice(product),
      estoque: getAvailableStock(product),
      controlado: product.controlado,
      receita_obrigatoria: requiresPrescription(product),
      classificacao_receita: product.classificacao_receita || 'sem_receita',
      imagem_url: resolveMediaUrl(product.imagens?.[0] || product.imagem_url),
      id_farmacia: pharmacyId,
      nome_farmacia: getPharmacyName(product, pharmaciesById),
      quantity: 1,
    }

    const result = addItem(data)
    if (result?.unavailable) {
      setMessage('Medicamento indisponível nesta farmácia.')
      return
    }
    if (result?.pharmacyConflict) {
      replaceCartWithItem(data)
      setMessage('Carrinho atualizado com a farmácia selecionada.')
    } else {
      setMessage('Produto adicionado ao carrinho.')
    }
    setCartOpen(true)
  }

  function viewPharmacyProducts(pharmacy) {
    setSelectedPharmacy(pharmacy._id || pharmacy.id)
    setSelectedProductGroup(null)
    setSearch('')
    setActiveTab('buscar')
  }

  async function payPendingOrder(order) {
    const id = getOrderId(order)
    try {
      setBusyOrderId(id)
      setMessage('')
      await paymentService.confirmTest(id)
      await load()
      setMessage('Pagamento aprovado. Aguardando confirmação da farmácia.')
    } catch (err) {
      setMessage(getErrorMessage(err, 'Erro ao confirmar pagamento'))
    } finally {
      setBusyOrderId('')
    }
  }

  async function submitRating(order) {
    const id = getOrderId(order)
    const form = ratingForms[id] || {}
    const nota = Number(form.nota || 5)
    const comentario = form.comentario || ''
    const pharmacyId = getOrderPharmacyId(order)
    const deliveryId = resolveId(order.id_entrega)

    try {
      setBusyOrderId(id)
      if (!order.avaliado_em) {
        await orderService.rate(id, { nota, comentario })
      }
      if (pharmacyId && !order.farmacia_avaliada_em) {
        await reviewService.create(pharmacyId, { nota, comentario, id_pedido: id })
      }
      if (deliveryId && !order.id_entrega?.avaliacao_cliente?.avaliado_em) {
        await deliveryService.rateByClient(deliveryId, { nota, comentario })
      }
      await load()
      setMessage('Avaliação registrada.')
    } catch (err) {
      setMessage(getErrorMessage(err, 'Erro ao avaliar pedido'))
    } finally {
      setBusyOrderId('')
    }
  }

  function renderHome() {
    return (
      <div className="space-y-5">
        <div>
          <SearchBox value={search} onChange={setSearch} onSubmit={submitSearch} />
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {QUICK_SEARCHES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => quickSearch(item)}
                className="shrink-0 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button type="button" onClick={() => setActiveTab('farmacias')} className="rounded-2xl bg-white p-4 text-left shadow-sm">
            <Store className="mb-3 h-5 w-5 text-primary" />
            <p className="text-sm font-extrabold text-gray-950">Farmácias</p>
          </button>
          <button type="button" onClick={() => setCartOpen(true)} className="rounded-2xl bg-white p-4 text-left shadow-sm">
            <ShoppingBag className="mb-3 h-5 w-5 text-primary" />
            <p className="text-sm font-extrabold text-gray-950">Carrinho</p>
          </button>
          <button type="button" onClick={() => setActiveTab('pedidos')} className="rounded-2xl bg-white p-4 text-left shadow-sm">
            <PackageCheck className="mb-3 h-5 w-5 text-primary" />
            <p className="text-sm font-extrabold text-gray-950">Pedidos</p>
          </button>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-gray-950">Farmácias próximas</h2>
            <button type="button" onClick={() => setActiveTab('farmacias')} className="text-xs font-bold text-primary">
              Ver todas
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {pharmacies.slice(0, 6).map((pharmacy) => (
              <button
                key={pharmacy._id || pharmacy.id}
                type="button"
                onClick={() => viewPharmacyProducts(pharmacy)}
                className="w-40 shrink-0 rounded-2xl bg-white p-4 text-left shadow-sm"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 font-extrabold text-primary">
                  {pharmacy.nome?.charAt(0) || 'F'}
                </div>
                <p className="line-clamp-2 text-sm font-extrabold text-gray-950">{pharmacy.nome || 'Farmácia'}</p>
                <p className="mt-1 text-xs text-gray-500">{pharmacy.bairro || 'Goiânia'}</p>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-gray-950">Mais buscados</h2>
            <button type="button" onClick={() => setActiveTab('buscar')} className="text-xs font-bold text-primary">
              Buscar
            </button>
          </div>
          <div className="space-y-3">
            {filteredProductGroups.slice(0, 6).map((group) => (
              <ProductGroupRow
                key={group.key}
                group={group}
                pharmaciesById={pharmaciesById}
                onOpen={openProductGroup}
              />
            ))}
          </div>
        </section>
      </div>
    )
  }

  function renderSearch() {
    const selectedPharmacyData = selectedPharmacy ? pharmaciesById[selectedPharmacy] : null
    const groupOffers = selectedProductGroup
      ? selectedProductGroup.offers
          .filter((offer) => !selectedPharmacy || getPharmacyId(offer) === selectedPharmacy)
          .sort((a, b) => getDisplayPrice(a) - getDisplayPrice(b))
      : []

    return (
      <div className="space-y-4">
        <SearchBox value={search} onChange={setSearch} onSubmit={submitSearch} />

        {(selectedProductGroup || selectedPharmacy) && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (selectedPharmacy && selectedProductGroup) {
                  setSelectedPharmacy('')
                } else {
                  setSelectedProductGroup(null)
                  setSelectedPharmacy('')
                  setSearch('')
                }
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-gray-950">
                {selectedPharmacyData?.nome || selectedProductGroup?.representative?.nome || 'Busca'}
              </p>
              <p className="truncate text-xs text-gray-500">
                {selectedPharmacy && selectedProductGroup ? 'Produtos desta farmácia' : selectedProductGroup ? 'Escolha a farmácia' : 'Produtos disponíveis'}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {selectedProductGroup && !selectedPharmacy ? (
            groupOffers.map((product) => {
              const unavailable = isProductUnavailable(product)
              return (
                <button
                  key={product._id || product.id}
                  type="button"
                  onClick={() => !unavailable && openProductAtPharmacy(product)}
                  disabled={unavailable}
                  className={`w-full rounded-2xl border border-gray-100 p-4 text-left shadow-sm ${unavailable ? 'bg-gray-100 opacity-70' : 'bg-white'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-gray-950">{getPharmacyName(product, pharmaciesById)}</p>
                      <p className="mt-1 text-xs text-gray-500">{unavailable ? 'Indisponível' : 'Disponível agora'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">A partir de</p>
                      <p className="text-base font-extrabold text-primary">{money(getDisplayPrice(product))}</p>
                    </div>
                  </div>
                </button>
              )
            })
          ) : selectedPharmacy ? (
            filteredProducts.map((product) => (
              <ProductRow
                key={product._id || product.id}
                product={product}
                pharmacyName={getPharmacyName(product, pharmaciesById)}
                onAdd={addProduct}
              />
            ))
          ) : (
            filteredProductGroups.map((group) => (
              <ProductGroupRow
                key={group.key}
                group={group}
                pharmaciesById={pharmaciesById}
                onOpen={openProductGroup}
              />
            ))
          )}
        </div>
      </div>
    )
  }

  function renderPharmacies() {
    return (
      <div className="space-y-3">
        {pharmacies.map((pharmacy) => (
          <button
            key={pharmacy._id || pharmacy.id}
            type="button"
            onClick={() => viewPharmacyProducts(pharmacy)}
            className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm"
          >
            <div className="flex gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-extrabold text-primary">
                {pharmacy.nome?.charAt(0) || 'F'}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-extrabold text-gray-950">{pharmacy.nome || 'Farmácia'}</h3>
                <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                  <MapPin className="h-3.5 w-3.5" />
                  {pharmacy.bairro || pharmacy.cidade || 'Goiânia'}
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                  <Clock3 className="h-3.5 w-3.5" />
                  {pharmacy.horario_funcionamento || 'Aberta hoje'}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    )
  }

  function renderOrders() {
    return (
      <div className="space-y-3">
        {orders.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="font-bold text-gray-900">Nenhum pedido encontrado</p>
          </div>
        ) : (
          orders.map((order) => {
            const id = order._id || order.id
            const delivery = order.id_entrega
            const confirmationCode = delivery?.codigo_confirmacao
            const canPay = order.status === 'aguardando_pagamento' && order.status_pagamento !== 'aprovado'
            const canRate = order.status === 'entregue' && order.mostrar_botao_avaliacao !== false
            const ratingForm = ratingForms[id] || { nota: 5, comentario: '' }
            return (
              <div key={id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-gray-950">Pedido #{String(id).slice(-6).toUpperCase()}</p>
                    <p className="mt-1 text-xs font-bold text-primary">{clientOrderStatusLabel(order)}</p>
                  </div>
                  <p className="text-sm font-extrabold text-gray-950">{money(order.valor_total || order.total)}</p>
                </div>
                {orderActionMessage(order) && (
                  <p className="mt-3 rounded-2xl bg-gray-50 p-3 text-xs font-semibold leading-relaxed text-gray-600">
                    {orderActionMessage(order)}
                  </p>
                )}
                {confirmationCode && ['a_caminho', 'aguardando_confirmacao_receita_farmacia'].includes(order.status) && (
                  <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-primary">Código do pedido</p>
                    <p className="mt-1 text-2xl font-black tracking-widest text-gray-950">{confirmationCode}</p>
                    <p className="mt-1 text-xs text-gray-500">Pegue o pedido em até 5 minutos e passe este código ao entregador.</p>
                  </div>
                )}
                {canPay && (
                  <button
                    type="button"
                    onClick={() => payPendingOrder(order)}
                    disabled={busyOrderId === id}
                    className="mt-3 h-11 w-full rounded-2xl bg-primary text-sm font-extrabold text-white disabled:opacity-60"
                  >
                    {busyOrderId === id ? 'Confirmando...' : 'Pagar agora'}
                  </button>
                )}
                {order.status === 'cancelado' && order.motivo_cancelamento && (
                  <p className="mt-3 rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">
                    {order.motivo_cancelamento}
                  </p>
                )}
                {canRate && (
                  <div className="mt-3 rounded-2xl border border-gray-100 p-3">
                    <p className="mb-2 text-sm font-extrabold text-gray-950">Avaliar pedido</p>
                    <div className="mb-3 flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() =>
                            setRatingForms((current) => ({
                              ...current,
                              [id]: { ...ratingForm, nota: star },
                            }))
                          }
                          className={`rounded-full p-1 ${Number(ratingForm.nota) >= star ? 'text-amber-400' : 'text-gray-300'}`}
                          aria-label={`${star} estrelas`}
                        >
                          <Star className="h-5 w-5 fill-current" />
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={ratingForm.comentario}
                      onChange={(event) =>
                        setRatingForms((current) => ({
                          ...current,
                          [id]: { ...ratingForm, comentario: event.target.value },
                        }))
                      }
                      placeholder="Comentário opcional"
                      className="min-h-20 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => submitRating(order)}
                      disabled={busyOrderId === id}
                      className="mt-2 h-10 w-full rounded-xl bg-gray-950 text-xs font-extrabold text-white disabled:opacity-60"
                    >
                      Enviar avaliação
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    )
  }

  function renderAccount() {
    const { logout } = useAuthStore.getState()
    return (
      <div className="flex min-h-[calc(100dvh-11rem)] flex-col gap-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-xl font-extrabold text-white">
              {firstName(user).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold text-gray-950">{user?.nome}</p>
              <p className="truncate text-sm text-gray-500">{user?.email}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 text-sm font-bold text-gray-800 shadow-sm">
          <p>Telefone: {user?.telefone || 'preencher na compra'}</p>
          <p className="mt-1">CPF: {user?.cpf || 'preencher na compra'}</p>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('pedidos')}
          className="block rounded-2xl bg-white p-4 text-left text-sm font-bold text-gray-800 shadow-sm"
        >
          Pedidos e receitas
        </button>
        <button
          type="button"
          onClick={() => {
            logout()
            window.location.href = '/app'
          }}
          className="mt-auto flex w-full items-center gap-2 rounded-2xl bg-white p-4 text-sm font-bold text-red-600 shadow-sm"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gray-50">
      <MobileAppHeader user={user} role="cliente" onCart={() => setCartOpen(true)} cartCount={getItemCount()} />
      <main
        className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-4"
        style={{ paddingBottom: 'calc(5.75rem + env(safe-area-inset-bottom))' }}
      >
        {message && (
          <button
            type="button"
            onClick={() => setMessage('')}
            className="mb-3 w-full rounded-2xl bg-gray-950 px-4 py-3 text-left text-sm font-bold text-white"
          >
            {message}
          </button>
        )}
        {loading ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-gray-500 shadow-sm">Carregando...</div>
        ) : activeTab === 'home' ? renderHome()
          : activeTab === 'buscar' ? renderSearch()
          : activeTab === 'farmacias' ? renderPharmacies()
          : activeTab === 'pedidos' ? renderOrders()
          : renderAccount()}
      </main>
      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onCheckout={() => {
          setCartOpen(false)
          setCheckoutOpen(true)
        }}
      />
      <CheckoutSheet
        open={checkoutOpen}
        user={user}
        onClose={() => setCheckoutOpen(false)}
        onDone={async (_pedido, waitingPrescription) => {
          await load()
          setActiveTab('pedidos')
          setMessage(waitingPrescription ? 'Pedido enviado para validação da farmácia.' : 'Pagamento aprovado. Farmácia notificada.')
        }}
      />
      <BottomNav tabs={CLIENT_TABS} activeTab={activeTab} onChange={setActiveTab} />
    </div>
  )
}

function PharmacyOrderCard({ order, pharmacyId, busy, onApprove, onReject, onConfirmReceipt }) {
  const id = getOrderId(order)
  const hasRecipe = orderHasPrescription(order)
  const customer = order.id_usuario
  const waitingDigitalRecipe =
    order.status === 'aguardando_confirmacao_receita_farmacia' && order.status_pagamento !== 'aprovado'
  const waitingReturnedRecipe =
    order.status === 'aguardando_confirmacao_receita_farmacia' && order.status_pagamento === 'aprovado'
  const canApprove =
    order.status === 'aguardando_pagamento' &&
    order.status_pagamento === 'aprovado' &&
    (!hasRecipe || order.itens?.every((item) => !item.id_receita || item.id_receita))

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-gray-950">Pedido #{id.slice(-6).toUpperCase()}</p>
          <p className="mt-1 text-xs font-bold text-primary">{statusLabel(order.status)}</p>
          <p className="mt-1 truncate text-xs text-gray-500">{customer?.nome || 'Cliente'} • {customer?.telefone || 'sem telefone'}</p>
        </div>
        <p className="text-sm font-extrabold text-gray-950">{money(order.total || order.valor_total)}</p>
      </div>

      {hasRecipe && (
        <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3">
          <div className="flex gap-2">
            <ShieldCheck className="h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-xs font-bold text-amber-800">
              Este pedido contém medicamentos que exigem validação digital.
            </p>
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3">
        <div className="rounded-2xl bg-gray-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Produtos solicitados</p>
          <div className="space-y-2">
            {(order.itens || []).map((item) => (
              <div key={`${item.id_produto || item.nome_produto}`} className="flex justify-between gap-3 text-xs">
                <span className="font-bold text-gray-800">{item.quantidade}x {item.nome_produto}</span>
                <span className="text-gray-500">{money(item.subtotal)}</span>
              </div>
            ))}
          </div>
        </div>
        {hasRecipe && (
          <div className="rounded-2xl bg-gray-50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Receitas digitais anexadas</p>
            <div className="space-y-1">
              {(order.itens || []).filter((item) => item.id_receita).map((item) => (
                <p key={`${item.id_receita}`} className="text-xs font-semibold text-gray-700">
                  {item.nome_produto}: #{String(item.id_receita).slice(-6).toUpperCase()}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {waitingDigitalRecipe && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
            Separação bloqueada até validar todas as receitas na aba Receitas.
          </p>
        )}
        {order.status === 'aguardando_pagamento' && order.status_pagamento !== 'aprovado' && (
          <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-bold text-gray-600">
            Receitas aprovadas. Aguardando pagamento do cliente.
          </p>
        )}
        {canApprove && (
          <button
            type="button"
            onClick={() => onApprove(order)}
            disabled={busy}
            className="h-11 w-full rounded-2xl bg-primary text-sm font-extrabold text-white disabled:opacity-60"
          >
            {busy ? 'Atualizando...' : 'Pedido recebido / em separação'}
          </button>
        )}
        {waitingReturnedRecipe && (
          <button
            type="button"
            onClick={() => onConfirmReceipt(order)}
            disabled={busy}
            className="h-11 w-full rounded-2xl bg-primary text-sm font-extrabold text-white disabled:opacity-60"
          >
            Confirmar código e concluir venda
          </button>
        )}
        {['aguardando_pagamento', 'em_processamento', 'aguardando_confirmacao_receita_farmacia'].includes(order.status) && (
          <button
            type="button"
            onClick={() => onReject(order)}
            disabled={busy}
            className="h-10 w-full rounded-xl bg-red-50 text-xs font-extrabold text-red-700 disabled:opacity-60"
          >
            Cancelar pedido
          </button>
        )}
        {order.status === 'entregue' && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">Venda concluída.</p>
        )}
      </div>
    </div>
  )
}

function PrescriptionReviewCard({ receita, busy, onValidate, onInvalidate }) {
  const id = getPrescriptionId(receita)
  const fileUrl = resolveMediaUrl(receita.url_imagem_publica || receita.url_arquivo)
  const productName = receita.id_produto?.nome || receita.produto?.nome || 'Medicamento vinculado'

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-gray-950">{productName}</p>
          <p className="mt-1 text-xs font-bold text-primary">{receita.status || 'Pendente'}</p>
          <p className="mt-1 truncate text-xs text-gray-500">{receita.id_usuario?.nome || 'Cliente'}</p>
        </div>
        <FileText className="h-5 w-5 shrink-0 text-primary" />
      </div>

      <div className="mt-3 space-y-2 rounded-2xl bg-gray-50 p-3 text-xs font-bold text-gray-700">
        <p className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Assinatura Digital do Médico: Válida
        </p>
        <p className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          CRM do Médico: Ativo/Regular
        </p>
        <p className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          RNDS: Disponível para dispensação
        </p>
      </div>

      {fileUrl && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex h-10 items-center justify-center rounded-xl bg-gray-100 text-xs font-extrabold text-gray-700"
        >
          Abrir PDF/XML
        </a>
      )}

      {['Pendente', 'Em Análise'].includes(receita.status || 'Pendente') && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onValidate(receita)}
            disabled={busy}
            className="h-10 rounded-xl bg-primary text-xs font-extrabold text-white disabled:opacity-60"
          >
            Validar
          </button>
          <button
            type="button"
            onClick={() => onInvalidate(receita)}
            disabled={busy}
            className="h-10 rounded-xl bg-red-50 text-xs font-extrabold text-red-700 disabled:opacity-60"
          >
            Invalidar
          </button>
        </div>
      )}
    </div>
  )
}

function PharmacyApp({ user, activeTab, setActiveTab }) {
  const [pharmacyId, setPharmacyId] = useState(getUserPharmacyId(user))
  const [orders, setOrders] = useState([])
  const [prescriptions, setPrescriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      let currentPharmacyId = pharmacyId || getUserPharmacyId(user)
      if (!currentPharmacyId) {
        const meRes = await pharmacistService.getMe().catch(() => null)
        currentPharmacyId = resolveId(meRes?.data?.data?.farmaceutico?.id_farmacia || meRes?.data?.data?.id_farmacia)
        if (currentPharmacyId) setPharmacyId(currentPharmacyId)
      }
      if (!currentPharmacyId) {
        const pharmaciesRes = await pharmacyService.getAll({ limit: 1 }).catch(() => null)
        const fallbackPharmacy = extractList(pharmaciesRes?.data?.data, ['farmacias']).find(Boolean)
        currentPharmacyId = resolveId(fallbackPharmacy)
        if (currentPharmacyId) {
          setPharmacyId(currentPharmacyId)
          setMessage('Conta sem vínculo: usando farmácia demo local.')
        }
      }
      if (!currentPharmacyId) {
        setOrders([])
        setPrescriptions([])
        setMessage('Nenhuma farmácia vinculada a esta conta.')
        return
      }

      const [ordersRes, prescriptionsRes] = await Promise.all([
        orderService.getPharmacyOrders(currentPharmacyId, { limit: 50 }).catch(() => null),
        prescriptionService.getAllForPharmacist({
          limit: 50,
          status: 'Pendente,Em Análise,Aprovada,Rejeitada',
          pharmacyId: currentPharmacyId,
        }).catch(() => null),
      ])
      setOrders(extractList(ordersRes?.data?.data, ['pedidos']).filter(Boolean))
      setPrescriptions(extractList(prescriptionsRes?.data?.data, ['receitas']).filter(Boolean))
    } catch (err) {
      setMessage(getErrorMessage(err, 'Erro ao carregar farmácia'))
    } finally {
      setLoading(false)
    }
  }, [pharmacyId, user])

  useEffect(() => {
    load()
  }, [load])

  async function runAction(id, action, successMessage) {
    try {
      setBusyId(id)
      setMessage('')
      await action()
      await load()
      setMessage(successMessage)
    } catch (err) {
      setMessage(getErrorMessage(err))
    } finally {
      setBusyId('')
    }
  }

  function approveOrder(order) {
    const id = getOrderId(order)
    runAction(
      id,
      () => orderService.approveByPharmacist(id, pharmacyId),
      'Pedido em separação. Entregador será chamado quando elegível.'
    )
  }

  function rejectOrder(order) {
    const motivo = window.prompt('Motivo do cancelamento')
    if (!motivo) return
    const id = getOrderId(order)
    runAction(id, () => orderService.rejectByPharmacist(id, pharmacyId, motivo), 'Pedido cancelado.')
  }

  function confirmReceipt(order) {
    const codigo = window.prompt('Código informado pelo entregador/cliente')
    if (!codigo) return
    const id = getOrderId(order)
    runAction(
      id,
      () => orderService.confirmReceiptReturnAtPharmacy(id, { pharmacyId, codigo }),
      'Venda concluída.'
    )
  }

  function validatePrescription(receita) {
    const id = getPrescriptionId(receita)
    runAction(
      id,
      () =>
        prescriptionService.validate(id, {
          aprovado: true,
          observacoes: 'Validação sistêmica simulada aprovada: assinatura digital, CRM e RNDS regulares.',
          validade: addDays(new Date(), 30).toISOString(),
        }),
      'Receita validada.'
    )
  }

  function invalidatePrescription(receita) {
    const motivo = window.prompt('Justificativa obrigatória')
    if (!motivo) return
    const id = getPrescriptionId(receita)
    runAction(
      id,
      () => prescriptionService.validate(id, { aprovado: false, observacoes: motivo }),
      'Receita invalidada. Pedido vinculado será cancelado.'
    )
  }

  function renderHome() {
    const pendingOrders = orders.filter((order) => !['entregue', 'cancelado', 'rejeitado'].includes(order.status))
    const pendingPrescriptions = prescriptions.filter((receita) => ['Pendente', 'Em Análise'].includes(receita.status || 'Pendente'))
    return (
      <div className="space-y-4">
        <div className="rounded-3xl bg-gray-950 p-5 text-white">
          <p className="text-sm text-white/60">{greeting()}, {firstName(user)}</p>
          <h2 className="mt-1 text-2xl font-extrabold">Painel da farmácia</h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setActiveTab('pedidos')} className="rounded-2xl bg-white/10 p-4 text-left">
              <ClipboardList className="mb-2 h-5 w-5 text-emerald-300" />
              <p className="text-xs text-white/60">Pedidos ativos</p>
              <p className="text-lg font-extrabold">{pendingOrders.length}</p>
            </button>
            <button type="button" onClick={() => setActiveTab('receitas')} className="rounded-2xl bg-white/10 p-4 text-left">
              <FileText className="mb-2 h-5 w-5 text-emerald-300" />
              <p className="text-xs text-white/60">Receitas</p>
              <p className="text-lg font-extrabold">{pendingPrescriptions.length}</p>
            </button>
          </div>
        </div>
        {pendingOrders.slice(0, 2).map((order) => (
          <PharmacyOrderCard
            key={getOrderId(order)}
            order={order}
            pharmacyId={pharmacyId}
            busy={busyId === getOrderId(order)}
            onApprove={approveOrder}
            onReject={rejectOrder}
            onConfirmReceipt={confirmReceipt}
          />
        ))}
      </div>
    )
  }

  function renderOrders() {
    return (
      <div className="space-y-3">
        {orders.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="font-bold text-gray-900">Nenhum pedido na farmácia</p>
          </div>
        ) : (
          orders.map((order) => (
            <PharmacyOrderCard
              key={getOrderId(order)}
              order={order}
              pharmacyId={pharmacyId}
              busy={busyId === getOrderId(order)}
              onApprove={approveOrder}
              onReject={rejectOrder}
              onConfirmReceipt={confirmReceipt}
            />
          ))
        )}
      </div>
    )
  }

  function renderPrescriptions() {
    const sorted = [...prescriptions].sort((a, b) => {
      const aPending = ['Pendente', 'Em Análise'].includes(a.status || 'Pendente') ? 0 : 1
      const bPending = ['Pendente', 'Em Análise'].includes(b.status || 'Pendente') ? 0 : 1
      return aPending - bPending
    })

    return (
      <div className="space-y-3">
        {sorted.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <FileText className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="font-bold text-gray-900">Nenhuma receita recebida</p>
          </div>
        ) : (
          sorted.map((receita) => (
            <PrescriptionReviewCard
              key={getPrescriptionId(receita)}
              receita={receita}
              busy={busyId === getPrescriptionId(receita)}
              onValidate={validatePrescription}
              onInvalidate={invalidatePrescription}
            />
          ))
        )}
      </div>
    )
  }

  function renderAccount() {
    const { logout } = useAuthStore.getState()
    return (
      <div className="flex min-h-[calc(100dvh-11rem)] flex-col gap-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-base font-extrabold text-gray-950">{user?.nome}</p>
          <p className="mt-1 text-sm text-gray-500">{user?.email}</p>
          <p className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            Farmácia
          </p>
        </div>
        <button type="button" onClick={load} className="flex w-full items-center gap-2 rounded-2xl bg-white p-4 text-sm font-bold text-gray-800 shadow-sm">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Atualizar painel
        </button>
        <button
          type="button"
          onClick={() => {
            logout()
            window.location.href = '/app'
          }}
          className="mt-auto flex w-full items-center gap-2 rounded-2xl bg-white p-4 text-sm font-bold text-red-600 shadow-sm"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gray-50">
      <MobileAppHeader user={user} role="farmaceutico" />
      <main
        className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-4"
        style={{ paddingBottom: 'calc(5.75rem + env(safe-area-inset-bottom))' }}
      >
        {message && (
          <button type="button" onClick={() => setMessage('')} className="mb-3 w-full rounded-2xl bg-gray-950 px-4 py-3 text-left text-sm font-bold text-white">
            {message}
          </button>
        )}
        {loading ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-gray-500 shadow-sm">Carregando...</div>
        ) : activeTab === 'home' ? renderHome()
          : activeTab === 'pedidos' ? renderOrders()
          : activeTab === 'receitas' ? renderPrescriptions()
          : renderAccount()}
      </main>
      <BottomNav tabs={PHARMACY_TABS} activeTab={activeTab} onChange={setActiveTab} />
    </div>
  )
}

function DeliveryCard({ delivery, actionLabel, onAction, busy }) {
  const orderId = delivery.id_pedido?._id || delivery.id_pedido || delivery._id
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-gray-950">Entrega #{String(orderId).slice(-6).toUpperCase()}</p>
          <p className="mt-1 text-xs font-bold text-primary">{statusLabel(delivery.status)}</p>
        </div>
        <Truck className="h-5 w-5 text-primary" />
      </div>
      <div className="space-y-2 text-xs text-gray-500">
        <p className="flex items-center gap-2">
          <Store className="h-4 w-4" />
          {delivery.endereco_coleta?.nome || delivery.farmacia?.nome || 'Farmácia'}
        </p>
        <p className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          {delivery.endereco_entrega?.bairro || delivery.endereco_entrega?.cidade || 'Endereço do cliente'}
        </p>
      </div>
      {actionLabel && (
        <button
          type="button"
          onClick={() => onAction(delivery)}
          disabled={busy}
          className="mt-4 h-11 w-full rounded-2xl bg-primary text-sm font-extrabold text-white disabled:opacity-60"
        >
          {busy ? 'Processando...' : actionLabel}
        </button>
      )}
    </div>
  )
}

function DriverApp({ user, activeTab, setActiveTab }) {
  const [available, setAvailable] = useState([])
  const [mine, setMine] = useState([])
  const [earnings, setEarnings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const activeDelivery = mine.find((delivery) => ['aceita', 'coletando', 'coletada', 'em_transito'].includes(delivery.status))

  async function load() {
    try {
      setLoading(true)
      const [availableRes, myRes, earningsRes] = await Promise.all([
        deliveryService.getAvailable({ limit: 30 }).catch(() => null),
        deliveryService.getMy({ limit: 50 }).catch(() => null),
        deliveryService.getGanhos('hoje').catch(() => null),
      ])
      setAvailable(extractList(availableRes?.data?.data, ['entregas']))
      setMine(extractList(myRes?.data?.data, ['entregas']))
      setEarnings(earningsRes?.data?.data || null)
    } catch (err) {
      setMessage(getErrorMessage(err, 'Erro ao carregar entregas'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function runAction(delivery, action) {
    try {
      setBusyId(delivery._id)
      setMessage('')
      await action()
      await load()
      setMessage('Entrega atualizada.')
    } catch (err) {
      setMessage(getErrorMessage(err))
    } finally {
      setBusyId('')
    }
  }

  function renderHome() {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl bg-gray-950 p-5 text-white">
          <p className="text-sm text-white/60">{greeting()}, {firstName(user)}</p>
          <h2 className="mt-1 text-2xl font-extrabold">Pronto para entregar?</h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 p-4">
              <Wallet className="mb-2 h-5 w-5 text-emerald-300" />
              <p className="text-xs text-white/60">Ganhos hoje</p>
              <p className="text-lg font-extrabold">{money(earnings?.total || earnings?.ganhos || 0)}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <Bike className="mb-2 h-5 w-5 text-emerald-300" />
              <p className="text-xs text-white/60">Disponíveis</p>
              <p className="text-lg font-extrabold">{available.length}</p>
            </div>
          </div>
        </div>

        {activeDelivery ? (
          <DeliveryCard
            delivery={activeDelivery}
            actionLabel={activeDelivery.status === 'aceita' ? 'Confirmar coleta' : activeDelivery.status === 'coletada' ? 'Iniciar rota' : null}
            busy={busyId === activeDelivery._id}
            onAction={(delivery) => {
              if (delivery.status === 'aceita') {
                runAction(delivery, () => deliveryService.coletarNaFarmacia(delivery._id))
              } else {
                runAction(delivery, () => deliveryService.updateStatus(delivery._id, { novoStatus: 'em_transito' }))
              }
            }}
          />
        ) : (
          <button type="button" onClick={() => setActiveTab('entregas')} className="w-full rounded-2xl bg-white p-5 text-left shadow-sm">
            <p className="text-lg font-extrabold text-gray-950">Ver entregas disponíveis</p>
            <p className="mt-1 text-sm text-gray-500">Aceite uma entrega para começar.</p>
          </button>
        )}
      </div>
    )
  }

  function renderDeliveries() {
    return (
      <div className="space-y-3">
        {activeDelivery && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <p className="mb-3 text-sm font-extrabold text-gray-950">Entrega em andamento</p>
            <DeliveryCard delivery={activeDelivery} />
            {(activeDelivery.status === 'coletada' || activeDelivery.status === 'em_transito') && (
              <div className="mt-3 rounded-2xl bg-white p-3">
                <input
                  value={confirmCode}
                  onChange={(event) => setConfirmCode(event.target.value)}
                  placeholder="Código do cliente"
                  className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => runAction(activeDelivery, () => deliveryService.confirm(activeDelivery._id, { codigo: confirmCode }))}
                  className="mt-2 h-11 w-full rounded-xl bg-primary text-sm font-extrabold text-white"
                >
                  Finalizar entrega
                </button>
              </div>
            )}
          </div>
        )}

        {available.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <Truck className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="font-bold text-gray-900">Nenhuma entrega disponível</p>
          </div>
        ) : (
          available.map((delivery) => (
            <DeliveryCard
              key={delivery._id}
              delivery={delivery}
              actionLabel="Aceitar entrega"
              busy={busyId === delivery._id}
              onAction={(item) => runAction(item, () => deliveryService.accept(item._id))}
            />
          ))
        )}
      </div>
    )
  }

  function renderHistory() {
    return (
      <div className="space-y-3">
        {mine.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="font-bold text-gray-900">Histórico vazio</p>
          </div>
        ) : (
          mine.map((delivery) => <DeliveryCard key={delivery._id} delivery={delivery} />)
        )}
      </div>
    )
  }

  function renderAccount() {
    const { logout } = useAuthStore.getState()
    return (
      <div className="flex min-h-[calc(100dvh-11rem)] flex-col gap-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-base font-extrabold text-gray-950">{user?.nome}</p>
          <p className="mt-1 text-sm text-gray-500">{user?.email}</p>
          <p className="mt-3 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Entregador</p>
        </div>
        <button type="button" onClick={load} className="flex w-full items-center gap-2 rounded-2xl bg-white p-4 text-sm font-bold text-gray-800 shadow-sm">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Atualizar entregas
        </button>
        <button
          type="button"
          onClick={() => {
            logout()
            window.location.href = '/app'
          }}
          className="mt-auto flex w-full items-center gap-2 rounded-2xl bg-white p-4 text-sm font-bold text-red-600 shadow-sm"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gray-50">
      <MobileAppHeader user={user} role="entregador" />
      <main
        className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-4"
        style={{ paddingBottom: 'calc(5.75rem + env(safe-area-inset-bottom))' }}
      >
        {message && (
          <button type="button" onClick={() => setMessage('')} className="mb-3 w-full rounded-2xl bg-gray-950 px-4 py-3 text-left text-sm font-bold text-white">
            {message}
          </button>
        )}
        {loading ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-gray-500 shadow-sm">Carregando...</div>
        ) : activeTab === 'home' ? renderHome()
          : activeTab === 'entregas' ? renderDeliveries()
          : activeTab === 'historico' ? renderHistory()
          : renderAccount()}
      </main>
      <BottomNav tabs={DRIVER_TABS} activeTab={activeTab} onChange={setActiveTab} />
    </div>
  )
}

export default function MobileApp() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, isAuthenticated } = useAuthStore()
  const authenticated = isAuthenticated()
  const role = user?.tipo_usuario || user?.role
  const tab = searchParams.get('tab') || 'home'

  useEffect(() => {
    window.sessionStorage?.setItem('ssm_mobile_app_lock', '1')
  }, [])

  function setActiveTab(nextTab) {
    setSearchParams(nextTab === 'home' ? {} : { tab: nextTab })
  }

  if (!authenticated) {
    return <AuthScreen onSuccess={() => setActiveTab('home')} />
  }

  if (role === 'entregador') {
    const validTab = DRIVER_TABS.some((item) => item.id === tab) ? tab : 'home'
    return <DriverApp user={user} activeTab={validTab} setActiveTab={setActiveTab} />
  }

  if (role === 'farmaceutico' || role === 'dono_farmacia') {
    const validTab = PHARMACY_TABS.some((item) => item.id === tab) ? tab : 'home'
    return <PharmacyApp user={user} activeTab={validTab} setActiveTab={setActiveTab} />
  }

  const validTab = CLIENT_TABS.some((item) => item.id === tab) ? tab : 'home'
  return <ClientApp user={user} activeTab={validTab} setActiveTab={setActiveTab} />
}
