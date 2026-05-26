import { Clock, CheckCircle, XCircle, FileText, ArrowRight } from 'lucide-react'

function formatDate(value) {
  if (!value) return ''
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('pt-BR')
  } catch {
    return ''
  }
}

export default function StatusReceita({
  status,
  dataEnvio,
  validade,
  observacoes,
  onReenviar,
  onVerStatus,
  onEnviar,
  /** Receita aprovada porém já consumida em pedido anterior — exige nova dispensação */
  receitaJaUtilizada,
}) {
  // Sem receita ainda — botão padrão
  if (!status) {
    return (
      <button
        onClick={onEnviar}
        className="w-full inline-flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition py-2.5 rounded-xl font-semibold text-sm"
      >
        <FileText className="w-4 h-4" />
        Enviar Receita
      </button>
    )
  }

  if (status === 'Pendente' || status === 'Em Análise') {
    return (
      <div className="bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-xl p-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Clock className="w-4 h-4" />
          Aguardando aprovação da receita
        </div>
        {dataEnvio && (
          <p className="text-xs text-yellow-700/80 mt-1">
            Enviada em {formatDate(dataEnvio)}. Você será notificado.
          </p>
        )}
        <button
          onClick={onVerStatus}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-yellow-800 hover:underline"
        >
          Ver status <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    )
  }

  if (status === 'Aprovada' && receitaJaUtilizada) {
    return (
      <div className="bg-amber-50 text-amber-900 border border-amber-200 rounded-xl p-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Clock className="w-4 h-4" />
          Receita já utilizada em compra anterior
        </div>
        <p className="text-xs text-amber-800/90 mt-1">
          Para evitar reaproveitamento indevido, cada novo pedido precisa de receita disponível ou novo ciclo de validação.
        </p>
        <button
          onClick={onReenviar}
          className="mt-2 w-full inline-flex items-center justify-center gap-2 bg-amber-600 text-white hover:bg-amber-700 transition py-2 rounded-xl font-semibold text-sm"
        >
          <FileText className="w-4 h-4" />
          Enviar nova receita
        </button>
      </div>
    )
  }

  if (status === 'Aprovada') {
    return (
      <div className="bg-green-50 text-green-700 border border-green-200 rounded-xl p-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <CheckCircle className="w-4 h-4" />
          Receita aprovada — válida para esta compra
        </div>
        {validade && (
          <p className="text-xs text-green-700/80 mt-1">
            Válida até {formatDate(validade)}
          </p>
        )}
      </div>
    )
  }

  if (status === 'Rejeitada') {
    return (
      <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl p-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <XCircle className="w-4 h-4" />
          Receita rejeitada
        </div>
        <p className="text-xs text-red-700/80 mt-1">
          {observacoes ? `Motivo: ${observacoes}.` : ''} Envie uma nova receita.
        </p>
        <button
          onClick={onReenviar}
          className="mt-2 w-full inline-flex items-center justify-center gap-2 bg-red-600 text-white hover:bg-red-700 transition py-2 rounded-xl font-semibold text-sm"
        >
          <FileText className="w-4 h-4" />
          Enviar nova receita
        </button>
      </div>
    )
  }

  if (status === 'Expirada') {
    return (
      <div className="bg-gray-50 text-gray-600 border border-gray-200 rounded-xl p-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Clock className="w-4 h-4" />
          Receita expirada
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Sua receita anterior venceu. Envie uma nova.
        </p>
        <button
          onClick={onReenviar}
          className="mt-2 w-full inline-flex items-center justify-center gap-2 bg-primary text-white hover:bg-secondary transition py-2 rounded-xl font-semibold text-sm"
        >
          <FileText className="w-4 h-4" />
          Enviar nova receita
        </button>
      </div>
    )
  }

  return null
}
