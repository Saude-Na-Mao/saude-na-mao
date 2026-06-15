import axios from 'axios'
import { useAuthStore } from '../stores/store'
import Logger from '../utils/logger'
import { ERROR_MESSAGES, HTTP_STATUS } from '../constants'
import { getApiBaseUrl } from '../config/env'

const logger = new Logger('ApiClient')

const API_URL = getApiBaseUrl()

/** 401 em login/register é credencial inválida, não sessão expirada — não redirecionar. */
function isPublicAuthCredentialRequest(config) {
  const path = String(config?.url || '')
    .split('?')[0]
    .replace(/\/+$/, '') || ''
  const normalized = path.startsWith('/') ? path.slice(1) : path
  return [
    'auth/login',
    'auth/register',
    'auth/google',
    'auth/email-code/request',
    'auth/email-code/verify',
  ].includes(normalized)
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
})

const PUBLIC_GET_CACHE_TTL_MS = 90 * 1000
const publicGetCache = new Map()

function normalizeParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
  )
}

function getPublicCacheKey(url, config = {}) {
  return `snm:api:${url}:${JSON.stringify(normalizeParams(config.params))}`
}

function readPublicCache(key) {
  const now = Date.now()
  const memoryEntry = publicGetCache.get(key)
  if (memoryEntry?.expiresAt > now) return memoryEntry.data

  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (entry?.expiresAt > now) {
      publicGetCache.set(key, entry)
      return entry.data
    }
    sessionStorage.removeItem(key)
  } catch {
    return null
  }

  return null
}

function writePublicCache(key, data, ttlMs = PUBLIC_GET_CACHE_TTL_MS) {
  const entry = { data, expiresAt: Date.now() + ttlMs }
  publicGetCache.set(key, entry)

  try {
    sessionStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // Cache is optional; ignore quota/private-mode failures.
  }
}

function cachedGet(url, config = {}, ttlMs = PUBLIC_GET_CACHE_TTL_MS) {
  const key = getPublicCacheKey(url, config)
  const cachedData = readPublicCache(key)

  if (cachedData) {
    return Promise.resolve({ data: cachedData })
  }

  return api.get(url, config).then((response) => {
    writePublicCache(key, response.data, ttlMs)
    return response
  })
}

function authRequestTimeoutMs(config) {
  return isPublicAuthCredentialRequest(config) ? 125000 : 30000
}

api.interceptors.request.use(
  (config) => {
    config.timeout = authRequestTimeoutMs(config)

    if (!isPublicAuthCredentialRequest(config)) {
      const token = useAuthStore.getState().token
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }

    logger.debug(`${config.method.toUpperCase()} ${config.url}`)
    return config
  },
  (error) => {
    logger.error('Request interceptor error', error)
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => {
    const { config } = response
    const duration = response.duration || 0
    logger.logApiCall(
      config.method.toUpperCase(),
      config.url,
      response.status,
      duration
    )
    return response
  },
  async (error) => {
    const { response, message, config } = error

    if (!response) {
      logger.error('Network error', {
        url: error.config?.url,
        message,
      })
      const isAuth = isPublicAuthCredentialRequest(config)
      const timedOut = error.code === 'ECONNABORTED'
      return Promise.reject({
        status: 'NETWORK_ERROR',
        message: isAuth
          ? 'Conectando ao servidor… Se acabou de iniciar o backend, aguarde até 1 minuto e tente de novo.'
          : timedOut
            ? 'Servidor demorou a responder. Aguarde o backend ficar pronto e recarregue a página.'
            : ERROR_MESSAGES.NETWORK,
      })
    }

    const status = response.status
    const authStore = useAuthStore.getState()

    if (status === HTTP_STATUS.UNAUTHORIZED && !isPublicAuthCredentialRequest(config)) {
      logger.warn('Unauthorized - Token invalid or expired')
      authStore.logout()
      window.location.href = '/login'
      return Promise.reject({
        status,
        message: 'Sessão expirada. Faça login novamente.',
      })
    }

    const retryableStatuses = [408, 429, 500, 502, 504]
    const retryCount = (config.__retryCount || 0)
    const maxRetries = 3
    const isMongo503 =
      status === 503 &&
      (response?.data?.mongo === 'connecting' ||
        response?.data?.mongo === 'disconnected')

    if (
      retryableStatuses.includes(status) &&
      retryCount < maxRetries &&
      !isPublicAuthCredentialRequest(config) &&
      !isMongo503
    ) {
      config.__retryCount = retryCount + 1
      
      const delayMs = Math.pow(2, retryCount) * 1000
      logger.debug(`Retrying request after ${delayMs}ms`, { url: config.url, attempt: retryCount + 1 })
      
      await new Promise(resolve => setTimeout(resolve, delayMs))
      return api(config)
    }

    logger.error(`API Error ${status || 'No Status'}`, {
      url: error.config?.url,
      status,
      message: response?.data?.message || message,
      data: response?.data,
    })

    const formattedError = {
      status,
      message: response?.data?.message || ERROR_MESSAGES.GENERIC,
      data: response?.data,
    }

    return Promise.reject(formattedError)
  }
)

export const authService = {
  register: (data) => api.post('/auth/register', data),
  login: (email, senha) => api.post('/auth/login', { email, senha }),
  google: (credential) => api.post('/auth/google', { credential }),
  requestEmailCode: (email) => api.post('/auth/email-code/request', { email }),
  verifyEmailCode: (email, code) => api.post('/auth/email-code/verify', { email, code }),
  logout: () => api.post('/auth/logout'),
  getCurrentUser: () => api.get('/users/me'),
}

export const productService = {
  getAll: (params) => cachedGet('/produtos', { params }),
  getById: (id) => cachedGet(`/produtos/${id}`),
  search: (query) => cachedGet('/produtos', { params: { q: query } }),
  getCategories: () => cachedGet('/produtos/categorias'),
  getFeatured: () => cachedGet('/produtos/destaque'),
  uploadProductImage: (file) => {
    const formData = new FormData()
    formData.append('imagem', file)
    return api.post('/produtos/upload-imagem', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export const cartService = {
  get: () => api.get('/carrinho'),
  add: (productId, quantity) => api.post('/carrinho', { productId, quantity }),
  remove: (productId) => api.delete(`/carrinho/${productId}`),
  update: (productId, quantity) => api.put(`/carrinho/${productId}`, { quantity }),
  clear: () => api.delete('/carrinho'),
}

export const orderService = {
  getAll: (params = {}) => {
    const keys = Object.keys(params || {})
    return keys.length ? api.get('/pedidos', { params }) : api.get('/pedidos')
  },
  getById: (id) => api.get(`/pedidos/${id}`),
  create: (data) => api.post('/pedidos', data),
  cancel: (id) => api.post(`/pedidos/${id}/cancel`),
  updateStatus: (id, status, extra = {}) => api.patch(`/pedidos/${id}/status`, { ...extra, novoStatus: status, status }),
  track: (id) => api.get(`/pedidos/${id}/rastreamento`),
  getPharmacyOrders: (pharmacyId, params = {}) =>
    api.get(`/pedidos/pharmacy/${pharmacyId}`, { params }),
  approveByPharmacist: (orderId, pharmacyId) =>
    api.post(`/pedidos/${orderId}/pharmacist-approve`, { pharmacyId }),
  validateSngpc: (orderId, data) =>
    api.put(`/pedidos/${orderId}/validar-sngpc`, data),
  rejectByPharmacist: (orderId, pharmacyId, motivo) =>
    api.post(`/pedidos/${orderId}/reject`, { pharmacyId, motivo }),
  completePharmacyPickup: (orderId, { pharmacyId, observacao, codigo } = {}) =>
    api.post(`/pedidos/${orderId}/pickup-complete`, {
      pharmacyId,
      observacao,
      codigo,
    }),
  confirmReceiptReturnAtPharmacy: (orderId, { pharmacyId, codigo } = {}) =>
    api.post(`/pedidos/${orderId}/receipt-return-confirm`, { pharmacyId, codigo }),
  markReady: (orderId, pharmacyId) =>
    api.post(`/pedidos/${orderId}/mark-ready`, { pharmacyId }),
  confirmPickupCode: (orderId, pharmacyId, codigo) =>
    api.post(`/pedidos/${orderId}/confirm-pickup-code`, { pharmacyId, codigo }),
  rate: (orderId, data) => api.post(`/pedidos/${orderId}/rate`, data),
  generateQR: (orderId) => api.post(`/pedidos/${orderId}/qr-code`),
  confirmQR: (orderId, token) =>
    api.post(`/pedidos/${orderId}/confirm-qr`, { token }),
}

export const paymentService = {
  process: (data) => api.post('/pagamentos/initiate', data),
  getStatus: (orderId) => api.get(`/pagamentos/order/${orderId}`),
  confirmTest: (orderId) => api.post(`/pagamentos/order/${orderId}/test-confirm`),
}

export const prescriptionService = {
  upload: (file, pharmacyId = null, modoValidacao = 'assincrono', productId = null) => {
    const formData = new FormData()
    formData.append('receita', file)
    if (pharmacyId) {
      formData.append('pharmacyId', pharmacyId)
    }
    if (productId) {
      formData.append('productId', productId)
    }
    if (modoValidacao) {
      formData.append('modo_validacao', modoValidacao)
    }
    return api.post('/receitas/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  getAll: (params = {}) => api.get('/receitas', { params }),
  getById: (id) => api.get(`/receitas/${id}`),
  getPending: () => api.get('/receitas/admin/pending'),
  getAllForPharmacist: (params = {}) =>
    api.get('/receitas/admin/all', { params }),
  validate: (id, data) => api.patch(`/receitas/admin/${id}/validate`, data),
  getForChat: (id) => api.get(`/receitas/${id}/chat`),
  sendChatMessage: (id, texto) =>
    api.post(`/receitas/${id}/chat/message`, { texto }),
  closeChat: (id, data = {}) => api.post(`/receitas/${id}/chat/close`, data),
  reuploadChatImage: (prescriptionId, file) => {
    const formData = new FormData()
    formData.append('receita', file)
    return api.post(`/receitas/${prescriptionId}/chat/reupload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  checkAvailability: (prescriptionId) =>
    api.get(`/receitas/check-availability/${prescriptionId}`),
}

export const pharmacyService = {
  getAll: (params) => cachedGet('/farmacias', { params }),
  getById: (id) => cachedGet(`/farmacias/${id}`),
  getPharmacists: (id) => api.get(`/farmacias/${id}/pharmacists`),
  getProducts: (id, params) => cachedGet(`/farmacias/${id}/products`, { params }),
  updateAddress: (id, data) => api.patch(`/farmacias/${id}/endereco`, data),
  search: (lat, lng, radius = 5000) => 
    api.get('/geo/farmacias', { params: { lat, lng, radius } }),
}

export const couponService = {
  getActive: () => cachedGet('/cupons/ativos'),
  validate: (codigo, subtotal) => api.post('/cupons/validar', { codigo, subtotal }),
}

export const supportService = {
  send: (data) => api.post('/suporte', data),
  getById: (id) => api.get(`/suporte/${id}`),
  getUnread: () => api.get('/suporte/unread'),
  getHistory: () => api.get('/suporte'),
  getAllTickets: (params) => api.get('/suporte/admin/all', { params }),
  assignTicket: (id) => api.post(`/suporte/admin/${id}/assign`),
  sendMessage: (id, data) => api.post(`/suporte/${id}/message`, data),
  closeTicket: (id) => api.post(`/suporte/${id}/close`),
}

export const userService = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data) => api.patch('/users/profile', data),
  updatePassword: (senhaAtual, novaSenha) => 
    api.put('/users/senha', { senhaAtual, novaSenha }),
  addAddress: (data) => api.post('/users/addresses', data),
  getAddresses: () => api.get('/users/addresses'),
  deleteAddress: (id) => api.delete(`/users/addresses/${id}`),
  setDefaultAddress: (id) => api.patch(`/users/addresses/${id}/default`),
}

export const interactionService = {
  check: (data) => api.post('/produtos/interactions', data),
}

export const geoService = {
  geocodeCep: (cep) => api.get(`/geo/cep/${cep}`),
}

export const reviewService = {
  create: (pharmacyId, data) => api.post(`/avaliacoes/pharmacy/${pharmacyId}`, data),
  list: (pharmacyId, params) => api.get(`/avaliacoes/pharmacy/${pharmacyId}`, { params }),
  reply: (pharmacyId, reviewId, texto) =>
    api.patch(`/avaliacoes/pharmacy/${pharmacyId}/reviews/${reviewId}/reply`, {
      texto,
    }),
}

export const adminService = {
  getDashboard: () => api.get('/admin/dashboard'),
  listUsers: (params) => api.get('/admin/users', { params }),
  toggleUserStatus: (id) => api.patch(`/admin/users/${id}/status`),
  getUserDetails: (id) => api.get(`/admin/users/${id}`),
  listProducts: (params) => api.get('/admin/products', { params }),
  toggleProductStatus: (id) => api.patch(`/admin/products/${id}/status`),
  listPharmacies: (params) => api.get('/admin/pharmacies', { params }),
  togglePharmacyStatus: (id) => api.patch(`/admin/pharmacies/${id}/status`),
  getAuditLogs: (params) => api.get('/admin/audit', { params }),
  listMedicineCatalog: (params) => api.get('/admin/medicine-catalog', { params }),
  createMedicineCatalog: (data) => api.post('/admin/medicine-catalog', data),
  updateMedicineCatalog: (id, data) => api.patch(`/admin/medicine-catalog/${id}`, data),
}

export const medicineCatalogService = {
  search: (params) => api.get('/medicine-catalog', { params }),
}

export const pharmacyOwnerService = {
  getPharmacy: (id) => api.get(`/farmacias/${id}`),
  getOrders: (id, params) => api.get(`/pedidos/pharmacy/${id}`, { params }),
  updateOrderStatus: (orderId, status, extra = {}) =>
    api.patch(`/pedidos/${orderId}/status`, { ...extra, novoStatus: status, status }),
  getOrderStats: (id) => api.get(`/pedidos/pharmacy/${id}/stats`),
  getOwnerDashboard: (pharmacyId, params) =>
    api.get(`/farmacias/${pharmacyId}/owner-dashboard`, { params }),
  activateCatalogProduct: (pharmacyId, data) =>
    api.post(`/farmacias/${pharmacyId}/products/activate-catalog`, data),
  createProduct: (data) => api.post('/produtos', data),
  updateProduct: (id, data) => api.patch(`/produtos/${id}`, data),
}

export const pharmacistService = {
  getMe: () => api.get('/pharmacists/me'),
  setPresence: (online) => api.patch('/pharmacists/me/presence', { online }),
  getByPharmacy: (pharmacyId) => api.get(`/pharmacists/pharmacy/${pharmacyId}`),
  create: (data) => api.post('/pharmacists', data),
  update: (id, data) => api.put(`/pharmacists/${id}`, data),
  remove: (id) => api.delete(`/pharmacists/${id}`),
}

export const deliveryService = {
  getAvailable: (params = {}) => api.get('/deliveries/available', { params }),
  getMy: (params = {}) => api.get('/deliveries/my', { params }),
  getById: (id) => api.get(`/deliveries/${id}`),
  accept: (id) => api.post(`/deliveries/${id}/accept`),
  updateStatus: (id, data) => api.patch(`/deliveries/${id}/status`, data),
  updateLocation: (id, data) => api.patch(`/deliveries/${id}/location`, data),
  confirm: (id, data = {}) =>
    api.post(`/deliveries/${id}/confirm`, {
      ...data,
      codigo: data.codigo || data.codigo_confirmacao || data.codigoConfirmacao,
    }),
  cancel: (id, data) => api.post(`/deliveries/${id}/cancel`, data),
  rateByClient: (id, data) => api.post(`/deliveries/${id}/rate/client`, data),
  rateByDriver: (id, data) => api.post(`/deliveries/${id}/rate/driver`, data),
  arrived: (id) => api.post(`/deliveries/${id}/arrived`),
  marcarCheguei: (id) => api.post(`/deliveries/${id}/arrived`),

  // Aliases para telas antigas em PT-BR.
  listarDisponiveisPedidos: (params = {}) => api.get('/deliveries/available', { params }),
  aceitarPedido: (deliveryId) => api.post(`/deliveries/${deliveryId}/accept`),
  toggleDisponibilidade: (disponivel) => api.patch('/deliveries/me/availability', { disponivel }),
  getGanhos: (periodo = 'hoje') => api.get('/deliveries/me/earnings', { params: { periodo } }),
  getHistorico: (params = {}) => api.get('/deliveries/me/history', { params }),
  coletarNaFarmacia: (deliveryId) => api.post(`/deliveries/${deliveryId}/collect`),
  entregarAoCliente: (deliveryId, data = {}) =>
    api.post(`/deliveries/${deliveryId}/confirm`, {
      codigo: data.codigo_confirmacao || data.codigo,
      foto_comprovante: data.foto_comprovante,
    }),
}

export default api
