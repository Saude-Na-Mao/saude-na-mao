import { Activity, TrendingUp } from 'lucide-react'
import { ORDER_STATUS_LABELS } from '../../constants'

/** Labels extras além do enum em constants (status reais do modelo Order). */
const EXTRA_STATUS_LABELS = {
  em_processamento: 'Em processamento',
  aguardando_confirmacao_receita_farmacia: 'Aguardando receita na farmácia',
  rejeitado: 'Rejeitado',
}

export function statusLabel(status) {
  return ORDER_STATUS_LABELS[status] || EXTRA_STATUS_LABELS[status] || status
}

const BAR_COLORS = {
  aguardando_pagamento: 'bg-yellow-400',
  confirmado: 'bg-blue-400',
  em_processamento: 'bg-indigo-400',
  a_caminho: 'bg-purple-400',
  enviado: 'bg-purple-400',
  aguardando_confirmacao_receita_farmacia: 'bg-amber-400',
  entregue: 'bg-emerald-400',
  cancelado: 'bg-red-400',
  rejeitado: 'bg-red-500',
}

export function OrdersByStatusChart({ pedidosPorStatus }) {
  if (!pedidosPorStatus || Object.keys(pedidosPorStatus).length === 0) {
    return null
  }

  const entries = Object.entries(pedidosPorStatus)
  const maxCount = Math.max(...entries.map(([, c]) => c), 1)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-emerald-600" />
        Pedidos por status
      </h3>
      <p className="text-xs text-gray-500 mb-4">Somente pedidos desta farmácia no período selecionado.</p>
      <div className="space-y-3">
        {entries.map(([status, count]) => (
          <div key={status} className="flex items-center gap-3">
            <span className="text-xs text-gray-600 w-36 text-right truncate">
              {statusLabel(status)}
            </span>
            <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${BAR_COLORS[status] || 'bg-gray-400'}`}
                style={{ width: `${(count / maxCount) * 100}%`, minWidth: count > 0 ? '24px' : '0' }}
              />
            </div>
            <span className="text-sm font-bold w-8">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Taxa de cancelamento inclui cancelado + rejeitado (pedidos que não viraram entrega).
 */
export function ConversionFunnelCard({ pedidosPorStatus, totalPedidosPeriodo }) {
  if (!pedidosPorStatus) return null

  const s = pedidosPorStatus
  const totalOrders =
    totalPedidosPeriodo ??
    (Object.values(s).reduce((a, b) => a + b, 0) || 1)
  const safeTotal = totalOrders > 0 ? totalOrders : 1
  const delivered = s.entregue || 0
  const cancelled = (s.cancelado || 0) + (s.rejeitado || 0)
  const rate = ((delivered / safeTotal) * 100).toFixed(1)
  const cancelRate = ((cancelled / safeTotal) * 100).toFixed(1)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-emerald-600" />
        Funil de conversão
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Taxa de cancelamento soma pedidos cancelados e rejeitados.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
        <div>
          <p className="text-4xl font-bold text-blue-600">{totalOrders}</p>
          <p className="text-sm text-gray-500 mt-1">Total de pedidos</p>
        </div>
        <div>
          <p className="text-4xl font-bold text-emerald-600">{rate}%</p>
          <p className="text-sm text-gray-500 mt-1">Taxa de entrega</p>
          <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
            <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${rate}%` }} />
          </div>
        </div>
        <div>
          <p className="text-4xl font-bold text-red-600">{cancelRate}%</p>
          <p className="text-sm text-gray-500 mt-1">Taxa de cancelamento</p>
          <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
            <div className="bg-red-500 h-2 rounded-full" style={{ width: `${cancelRate}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
