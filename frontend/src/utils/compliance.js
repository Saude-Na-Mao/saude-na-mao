const prescriptionClasses = new Set([
  'tarja_vermelha',
  'tarja_preta',
  'antimicrobiano',
  'controlado_a',
])

const controlledClasses = new Set(['tarja_preta', 'controlado_a'])

export const TCC_DEMO_MODE = import.meta.env.VITE_TCC_DEMO_MODE !== 'false'
export const ALLOW_CONTROLLED_REMOTE_SALE =
  import.meta.env.VITE_ALLOW_CONTROLLED_REMOTE_SALE === 'true'

export const COMPLIANCE_DEMO_NOTICE =
  'Demonstração controlada: não realiza dispensação real de medicamentos. Compras com receita dependem de validação farmacêutica, e controlados ficam bloqueados no checkout remoto.'

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

export function isRemoteCheckoutBlocked(product) {
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

export function shouldHideProductImage(product) {
  return requiresPrescription(product)
}
