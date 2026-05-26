export const API_ENDPOINTS = {
  AUTH: {
    REGISTER: '/auth/register',
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
  },
  USERS: {
    ME: '/users/me',
    PROFILE: '/users/perfil',
    PROFILE_UPDATE: '/users/perfil',
    PASSWORD: '/users/senha',
    ADDRESSES: '/users/enderecos',
    ADDRESS_ADD: '/users/endereco',
    ADDRESS_DELETE: '/users/endereco',
  },
  PRODUCTS: {
    LIST: '/produtos',
    GET_BY_ID: '/produtos/:id',
    SEARCH: '/produtos',
    CATEGORIES: '/produtos/categorias',
    FEATURED: '/produtos/destaque',
  },
  CART: {
    GET: '/carrinho',
    ADD: '/carrinho',
    REMOVE: '/carrinho/:id',
    UPDATE: '/carrinho/:id',
    CLEAR: '/carrinho',
  },
  ORDERS: {
    LIST: '/pedidos',
    GET_BY_ID: '/pedidos/:id',
    CREATE: '/pedidos',
    UPDATE_STATUS: '/pedidos/:id/status',
    TRACK: '/pedidos/:id/rastreamento',
  },
  PAYMENTS: {
    PROCESS: '/pagamentos',
    GET_STATUS: '/pagamentos/:id',
  },
  SUPPORT: {
    SEND: '/suporte',
    HISTORY: '/suporte',
  },
  DELIVERIES: {
    AVAILABLE: '/entregas/available',
    MY: '/entregas/my',
    CREATE: '/entregas',
    GET_BY_ID: '/entregas/:id',
    ACCEPT: '/entregas/:id/accept',
    UPDATE_STATUS: '/entregas/:id/status',
    UPDATE_LOCATION: '/entregas/:id/location',
    CONFIRM: '/entregas/:id/confirm',
    RATE_CLIENT: '/entregas/:id/rate/client',
    RATE_DRIVER: '/entregas/:id/rate/driver',
    CANCEL: '/entregas/:id/cancel',
  },
  INTERACTIONS: {
    CHECK: '/produtos/check-interactions',
  },
}

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
}

export const ERROR_TYPES = {
  NETWORK: 'NETWORK_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  AUTHENTICATION: 'AUTHENTICATION_ERROR',
  AUTHORIZATION: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND_ERROR',
  SERVER: 'SERVER_ERROR',
  TIMEOUT: 'TIMEOUT_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR',
}

export const ORDER_STATUS = {
  AWAITING_PAYMENT: 'aguardando_pagamento',
  CONFIRMED: 'confirmado',
  SENT: 'enviado',
  IN_TRANSIT: 'a_caminho',
  DELIVERED: 'entregue',
  CANCELLED: 'cancelado',
}

export const ORDER_STATUS_LABELS = {
  [ORDER_STATUS.AWAITING_PAYMENT]: 'Aguardando Pagamento',
  [ORDER_STATUS.CONFIRMED]: 'Confirmado',
  [ORDER_STATUS.SENT]: 'Enviado',
  [ORDER_STATUS.IN_TRANSIT]: 'A Caminho',
  [ORDER_STATUS.DELIVERED]: 'Entregue',
  [ORDER_STATUS.CANCELLED]: 'Cancelado',
}

export const USER_TYPES = {
  CLIENT: 'cliente',
  DELIVERY: 'entregador',
  PHARMACY_OWNER: 'dono_farmacia',
  PHARMACIST: 'farmaceutico',
  ADMIN: 'administrador',
}

export const SELF_REGISTER_TYPES = [
  { value: 'cliente', label: 'Cliente', description: 'Comprar medicamentos e produtos' },
  { value: 'entregador', label: 'Entregador', description: 'Realizar entregas de pedidos' },
  { value: 'dono_farmacia', label: 'Dono de Farmácia', description: 'Cadastrar e gerenciar sua farmácia' },
]

export const PHARMACY_OWNER_ROLES = ['dono_farmacia']
export const PHARMACIST_ROLES = ['farmaceutico']
export const PHARMACY_ROLES = ['dono_farmacia', 'farmaceutico']

export const VALIDATION_RULES = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  CPF: /^(\d{3})\.(\d{3})\.(\d{3})-(\d{2})$/,
  PHONE: /^(\(\d{2}\)|\d{2})\s?\d{4,5}-?\d{4}$/,
  PASSWORD_MIN_LENGTH: 8,
  NAME_MIN_LENGTH: 3,
  NAME_MAX_LENGTH: 100,
}

export const PASSWORD_REQUIREMENTS = {
  MIN_LENGTH: 8,
  HAS_UPPERCASE: /[A-Z]/,
  HAS_LOWERCASE: /[a-z]/,
  HAS_NUMBER: /\d/,
  HAS_SPECIAL: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
}

export const API_CONFIG = {
  TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  CACHE_DURATION: 5 * 60 * 1000,
}

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  REFRESH_TOKEN: 'refresh_token',
  USER: 'user_data',
  CART: 'cart_items',
  FAVORITES: 'favorites',
  PREFERENCES: 'user_preferences',
  LAST_LOGIN: 'last_login',
}

export const ROUTES = {
  HOME: '/',
  PRODUCTS: '/produtos',
  CART: '/carrinho',
  LOGIN: '/login',
  REGISTER: '/registro',
  PROFILE: '/perfil',
  ORDERS: '/pedidos',
  TRACKING: '/rastreamento/:id',
  SUPPORT: '/suporte',
  NOT_FOUND: '/404',
}

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
}

export const ERROR_MESSAGES = {
  NETWORK: 'Erro de conexão. Verifique sua internet.',
  TIMEOUT: 'Requisição expirou. Tente novamente.',
  UNAUTHORIZED: 'Sessão expirada. Faça login novamente.',
  FORBIDDEN: 'Você não tem permissão para acessar isso.',
  NOT_FOUND: 'Recurso não encontrado.',
  SERVER_ERROR: 'Erro no servidor. Tente novamente mais tarde.',
  VALIDATION: 'Dados inválidos. Verifique o formulário.',
  GENERIC: 'Algo deu errado. Tente novamente.',
}

export const SUCCESS_MESSAGES = {
  LOGIN: 'Login realizado com sucesso!',
  REGISTER: 'Cadastro realizado com sucesso!',
  PROFILE_UPDATED: 'Perfil atualizado com sucesso!',
  PASSWORD_CHANGED: 'Senha alterada com sucesso!',
  ADDRESS_ADDED: 'Endereço adicionado com sucesso!',
  ORDER_CREATED: 'Pedido criado com sucesso!',
  ITEM_ADDED_TO_CART: 'Item adicionado ao carrinho!',
  ITEM_REMOVED_FROM_CART: 'Item removido do carrinho!',
  MESSAGE_SENT: 'Mensagem enviada com sucesso!',
}

export const DELIVERY_TIME = {
  FAST: 120,
  STANDARD: 240,
  SCHEDULED: 'agendado',
}

export const DISCOUNT_CONFIG = {
  THRESHOLD: 100,
  PERCENTAGE: 10,
}

export const FEATURES = {
  ENABLE_CHAT: true,
  ENABLE_PRESCRIPTION_UPLOAD: true,
  ENABLE_GEOLOCATION: true,
  ENABLE_NOTIFICATIONS: true,
  MAINTENANCE_MODE: false,
}
