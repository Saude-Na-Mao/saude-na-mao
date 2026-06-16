const prescriptionClasses = new Set([
  'tarja_vermelha',
  'tarja_preta',
  'antimicrobiano',
  'controlado_a',
])

const controlledClasses = new Set(['tarja_preta', 'controlado_a'])
const sngpcClasses = new Set(['tarja_preta', 'controlado_a', 'antimicrobiano'])

export const TCC_DEMO_MODE = import.meta.env.VITE_TCC_DEMO_MODE === 'true'
export const ALLOW_CONTROLLED_REMOTE_SALE =
  import.meta.env.VITE_ALLOW_CONTROLLED_REMOTE_SALE !== 'false'

export const COMPLIANCE_DEMO_NOTICE =
  'Compras com receita dependem de validação farmacêutica antes do pedido.'

export function requiresPrescription(product) {
  const classification = product?.classificacao_receita || 'sem_receita'
  return Boolean(
    product?.receita_obrigatoria ||
      product?.necessitaReceita ||
      product?.controlado ||
      prescriptionClasses.has(classification),
  )
}

export function isControlledProduct(product) {
  const classification = product?.classificacao_receita || 'sem_receita'
  return Boolean(product?.controlado || controlledClasses.has(classification))
}

export function isSngpcProduct(product) {
  const classification = product?.classificacao_receita || 'sem_receita'
  return Boolean(product?.controlado || sngpcClasses.has(classification))
}

export function getControlledAvailableBatchQuantity(product) {
  if (!isControlledProduct(product)) return null
  const now = new Date()
  return (Array.isArray(product?.batches) ? product.batches : [])
    .filter((batch) => {
      if (batch?.active === false) return false
      if (batch?.expirationDate && new Date(batch.expirationDate) < now) return false
      return true
    })
    .reduce((total, batch) => total + Math.max(0, Number(batch?.quantity || 0)), 0)
}

export function getAvailableStock(product) {
  const estoque = Math.max(0, Number(product?.estoque || 0))
  const batchQuantity = getControlledAvailableBatchQuantity(product)
  return batchQuantity == null ? estoque : Math.min(estoque, batchQuantity)
}

export function isProductUnavailable(product) {
  return getAvailableStock(product) <= 0
}

export function isRemoteCheckoutBlocked(product) {
  const classification = product?.classificacao_receita || 'sem_receita'
  if (classification === 'tarja_preta' || classification === 'controlado_a') {
    return false
  }
  return isControlledProduct(product) && !ALLOW_CONTROLLED_REMOTE_SALE
}

export function showPromo(product) {
  const promo = Number(product?.preco_promocional)
  const base = Number(product?.preco)
  return (
    !requiresPrescription(product) &&
    Number.isFinite(promo) &&
    Number.isFinite(base) &&
    promo > 0 &&
    promo < base
  )
}

export function getDisplayPrice(product) {
  if (showPromo(product)) return Number(product.preco_promocional)
  return Number(product?.preco ?? product?.preco_final ?? 0)
}

export function shouldHideProductImage() {
  // Todos os produtos exibem a foto real do medicamento. A exigência de receita
  // é sinalizada pelo selo "Receita", não escondendo a imagem.
  return false
}
