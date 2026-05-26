export const formatarMoeda = (valor) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}

export const formatarData = (data, formato = 'pt-BR') => {
  return new Date(data).toLocaleDateString(formato)
}

export const formatarCPF = (cpf) => {
  return cpf
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    .slice(0, 14)
}

export const validarEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return regex.test(email)
}

export const validarCPF = (cpf) => {
  const regexCPF = /(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/
  if (!regexCPF.test(cpf)) return false

  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false

  let sum = 0
  let remainder
  for (let i = 1; i <= 9; i++) {
    sum += parseInt(digits.substring(i - 1, i)) * (11 - i)
  }
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(digits.substring(9, 10))) return false

  sum = 0
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(digits.substring(i - 1, i)) * (12 - i)
  }
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(digits.substring(10, 11))) return false

  return true
}

export const validarSenha = (senha) => {
  return {
    temMaiuscula: /[A-Z]/.test(senha),
    temMinuscula: /[a-z]/.test(senha),
    temNumero: /\d/.test(senha),
    temSimbolo: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(senha),
    temComprimento: senha.length >= 8,
    valida: senha.length >= 8 &&
      /[A-Z]/.test(senha) &&
      /[a-z]/.test(senha) &&
      /\d/.test(senha) &&
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(senha)
  }
}

export const truncarTexto = (texto, limite = 50) => {
  if (texto.length <= limite) return texto
  return texto.substring(0, limite) + '...'
}

export const calcularDesconto = (valorOriginal, percentualDesconto) => {
  return valorOriginal * (percentualDesconto / 100)
}

export const calcularValorComDesconto = (valorOriginal, percentualDesconto) => {
  return valorOriginal - calcularDesconto(valorOriginal, percentualDesconto)
}

export const gerarId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export const delay = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const debounce = (func, delay) => {
  let timeoutId
  return (...args) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

export const throttle = (func, delay) => {
  let lastCall = 0
  return (...args) => {
    const now = Date.now()
    if (now - lastCall >= delay) {
      func(...args)
      lastCall = now
    }
  }
}

export const calcularDistancia = (lat1, lon1, lat2, lon2) => {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export const armazenarLocal = (chave, dados) => {
  localStorage.setItem(chave, JSON.stringify(dados))
}

export const recuperarLocal = (chave, padrao = null) => {
  try {
    const dados = localStorage.getItem(chave)
    return dados ? JSON.parse(dados) : padrao
  } catch {
    return padrao
  }
}

export const removerLocal = (chave) => {
  localStorage.removeItem(chave)
}

export const limparLocal = () => {
  localStorage.clear()
}
