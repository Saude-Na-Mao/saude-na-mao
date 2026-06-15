/**
 * Flag opcional para forçar exibição de pedidos ativos como "aguardando pagamento".
 * Use apenas em cenários de demonstração.
 * Ative com: VITE_ORDER_SEM_CONFIRMACAO_PAGAMENTO=true
 */
export const ORDER_DISPLAY_SEM_CONFIRMACAO_PAGAMENTO =
  import.meta.env.VITE_ORDER_SEM_CONFIRMACAO_PAGAMENTO === 'true'

const TERMINAL = ['entregue', 'cancelado', 'rejeitado']

/** Chaves das abas em Meus pedidos (não confundir com status no Mongo). */
export const PEDIDOS_TAB = {
  todos: 'todos',
  aguardando: 'aguardando_pagamento',
  /** Farmácia validou separação — no banco: em_processamento */
  farmaciaConfirmada: 'farmacia_confirmada',
  /** Entregador aceitou ou em rota — no banco: confirmado, a_caminho, aguardando_confirmacao_receita_farmacia */
  enviado: 'enviado',
  entregue: 'entregue',
  cancelado: 'cancelado',
}

export function hasCourierAssigned(order) {
  if (!order) return false
  return Boolean(
    order.id_entrega ||
      order.entregador?.nome ||
      order.entregador?.telefone ||
      order.entregador?.veiculo,
  )
}

export function orderHasPrescriptionItem(order) {
  return (order?.itens || []).some((i) => i?.id_receita || i?.receita_obrigatoria)
}

/**
 * Texto do motivo de cancelamento/rejeição para exibir ao utilizador.
 * Usa `motivo_cancelamento` ou, em falta, a observação mais recente no histórico.
 */
export function getOrderCancellationReason(order) {
  const direct = String(order?.motivo_cancelamento || '').trim()
  if (direct) return direct
  const hist = Array.isArray(order?.historico_status) ? [...order.historico_status] : []
  const st = String(order?.status || '').trim()
  for (let i = hist.length - 1; i >= 0; i -= 1) {
    const h = hist[i]
    const hs = String(h?.status || '').trim()
    if (hs === 'cancelado' || (st === 'rejeitado' && hs === 'rejeitado')) {
      const obs = String(h?.observacao || '').trim()
      if (obs) return obs
    }
  }
  return null
}

/**
 * Status exibido em listagens e filtros (pode diferir do `order.status` no banco).
 */
export function getOrderDisplayStatusKey(order) {
  const raw = order?.status

  if (ORDER_DISPLAY_SEM_CONFIRMACAO_PAGAMENTO) {
    if (TERMINAL.includes(raw)) return raw
    return 'aguardando_pagamento'
  }

  if (raw === 'a_caminho' && !hasCourierAssigned(order)) {
    return 'em_processamento'
  }
  return raw
}

export function isPreparandoEnvioSemEntregador(order) {
  if (ORDER_DISPLAY_SEM_CONFIRMACAO_PAGAMENTO) return false
  return order?.status === 'a_caminho' && !hasCourierAssigned(order)
}

/**
 * Se o pedido entra no fluxo “código no cliente → devolução receita na farmácia”.
 * (Itens com receita vinculada em entrega no endereço.)
 */
export function orderNeedsPharmacyReceiptReturn(order) {
  if (!order) return false
  if (['retirada', 'drive-thru'].includes(String(order.tipo_entrega || '').trim())) {
    return false
  }
  return (order?.itens || []).some(
    (i) => i?.id_receita || i?.receita_obrigatoria || i?.controlado,
  )
}

/** Filtro da lista Meus pedidos conforme aba selecionada. */
export function orderMatchesPedidosTab(order, tabKey) {
  if (!order || tabKey === PEDIDOS_TAB.todos) return true
  const st = String(order.status || '').trim()

  if (tabKey === PEDIDOS_TAB.aguardando) {
    return st === 'aguardando_pagamento'
  }
  if (tabKey === PEDIDOS_TAB.farmaciaConfirmada) {
    return st === 'em_processamento'
  }
  if (tabKey === PEDIDOS_TAB.enviado) {
    return (
      st === 'confirmado' ||
      st === 'a_caminho' ||
      st === 'aguardando_confirmacao_receita_farmacia'
    )
  }
  if (tabKey === PEDIDOS_TAB.entregue) return st === 'entregue'
  if (tabKey === PEDIDOS_TAB.cancelado) {
    return st === 'cancelado' || st === 'rejeitado'
  }
  return true
}

const STATUS_COLORS = {
  aguardando_pagamento: 'bg-yellow-100 text-yellow-800',
  em_processamento: 'bg-slate-100 text-slate-800',
  confirmado: 'bg-indigo-100 text-indigo-800',
  a_caminho: 'bg-purple-100 text-purple-800',
  aguardando_confirmacao_receita_farmacia: 'bg-amber-100 text-amber-900',
  entregue: 'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800',
  rejeitado: 'bg-red-100 text-red-800',
}

export const ORDER_PROGRESS_STEPS = [
  { id: 'aprovado', label: 'Aprovado' },
  { id: 'preparacao', label: 'Em preparação' },
  { id: 'esperando_entregador', label: 'Esperando entregador' },
  { id: 'a_caminho', label: 'A caminho' },
  { id: 'entregue', label: 'Chegou' },
]

export function getOrderProgressIndex(order) {
  const st = String(order?.status || '').trim()
  const payApproved = String(order?.status_pagamento || '').trim() === 'aprovado'
  const hasDelivery = hasCourierAssigned(order)

  // Entregue é a última etapa concluída: índice além do último passo para
  // marcar TODOS como "completed" (sem spinner girando no passo "Chegou").
  if (st === 'entregue') return ORDER_PROGRESS_STEPS.length
  if (st === 'a_caminho' || st === 'aguardando_confirmacao_receita_farmacia') return 3
  if (st === 'confirmado') return 2
  if (st === 'em_processamento') return hasDelivery ? 2 : 1
  if (payApproved || order?.aprovado_farmaceutico) return 0
  return -1
}

export function getOrderProgressSteps(order) {
  const current = getOrderProgressIndex(order)
  const terminal = ['cancelado', 'rejeitado'].includes(String(order?.status || '').trim())
  return ORDER_PROGRESS_STEPS.map((step, index) => ({
    ...step,
    state: terminal ? 'pending' : index < current ? 'completed' : index === current ? 'current' : 'pending',
  }))
}

/** Cor + rótulo amigável para o cliente (alinhado ao fluxo OTC/receita). */
export function getClientOrderStatusPresentation(order) {
  const st = order?.status
  const pay = order?.status_pagamento

  if (st === 'aguardando_pagamento' && pay === 'aprovado') {
    return {
      color: 'bg-teal-100 text-teal-900',
      label: 'Pagamento ok · aguardando farmácia',
    }
  }

  if (st === 'em_processamento') {
    return {
      color: STATUS_COLORS.em_processamento,
      label: 'Aprovado · em preparação',
    }
  }

  if (st === 'confirmado') {
    return {
      color: STATUS_COLORS.confirmado,
      label: 'Esperando entregador',
    }
  }

  if (st === 'a_caminho') {
    return {
      color: STATUS_COLORS.a_caminho,
      label: 'A caminho',
    }
  }

  if (st === 'aguardando_confirmacao_receita_farmacia') {
    return {
      color: STATUS_COLORS.aguardando_confirmacao_receita_farmacia,
      label: 'Aguardando confirmação na farmácia (receita)',
    }
  }

  if (st === 'entregue') {
    return { color: STATUS_COLORS.entregue, label: 'Chegou' }
  }

  if (st === 'cancelado' || st === 'rejeitado') {
    return {
      color: STATUS_COLORS.cancelado,
      label: st === 'rejeitado' ? 'Rejeitado' : 'Cancelado',
    }
  }

  const fallbackLabel =
    st === 'aguardando_pagamento' ? 'Aguardando pagamento' : String(st || '').replace(/_/g, ' ')
  return {
    color: STATUS_COLORS[st] || 'bg-gray-100 text-gray-800',
    label: fallbackLabel,
  }
}
