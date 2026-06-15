import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../stores/store'
import { orderService } from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  CheckCircle,
  ArrowLeft,
  CreditCard,
  Smartphone,
  Banknote,
  MapPin,
  Package,
  Printer,
  Store,
  Calendar,
  Hash,
} from 'lucide-react'

const PAYMENT_LABELS = {
  pix: { label: 'PIX', icon: Smartphone, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  cartao_credito: { label: 'Cartão de Crédito', icon: CreditCard, color: 'text-blue-600', bg: 'bg-blue-50' },
  cartao_debito: { label: 'Cartão de Débito', icon: CreditCard, color: 'text-violet-600', bg: 'bg-violet-50' },
  dinheiro: { label: 'Dinheiro', icon: Banknote, color: 'text-orange-600', bg: 'bg-orange-50' },
}

const STATUS_MAP = {
  aguardando_pagamento: { label: 'Aguardando Pagamento', color: 'bg-yellow-100 text-yellow-800' },
  pago: { label: 'Pagamento Confirmado', color: 'bg-emerald-100 text-emerald-800' },
  em_processamento: { label: 'Em Processamento', color: 'bg-blue-100 text-blue-800' },
  confirmado: { label: 'Confirmado', color: 'bg-blue-100 text-blue-800' },
  a_caminho: { label: 'A Caminho', color: 'bg-purple-100 text-purple-800' },
  enviado: { label: 'Enviado', color: 'bg-purple-100 text-purple-800' },
  entregue: { label: 'Entregue', color: 'bg-green-100 text-green-800' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
  rejeitado: { label: 'Rejeitado', color: 'bg-red-100 text-red-800' },
}

export default function Comprovante() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useAuthStore()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    loadOrder()
  }, [id, token])

  const loadOrder = async () => {
    try {
      setLoading(true)
      const orderRes = await orderService.getById(id)
      const d = orderRes.data?.data
      setOrder(d?.pedido || d || null)
    } catch (err) {
      console.error('Erro ao carregar pedido:', err)
      setOrder(null)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingSpinner />

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 text-lg mb-4">Pedido não encontrado</p>
        <Link to="/pedidos" className="text-primary hover:text-secondary font-medium">
          Voltar aos Pedidos
        </Link>
      </div>
    )
  }

  const payment = PAYMENT_LABELS[order.metodo_pagamento] || PAYMENT_LABELS.pix
  const PayIcon = payment.icon
  const statusKey =
    order.status === 'aguardando_pagamento' && order.status_pagamento === 'aprovado'
      ? 'pago'
      : order.status
  const status = STATUS_MAP[statusKey] || STATUS_MAP.em_processamento
  const endereco = order.endereco_entrega || {}
  const farmacia = order.id_farmacia
  const farmaciaName = typeof farmacia === 'object' ? farmacia.nome : 'Farmácia'

  const formatDate = (d) => {
    if (!d) return '-'
    return new Date(d).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  const orderId = order._id || order.id || ''
  const shortId = orderId.length > 8 ? orderId.slice(-8).toUpperCase() : orderId

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          #comprovante-print, #comprovante-print * { visibility: visible !important; }
          #comprovante-print {
            position: absolute; left: 0; top: 0; width: 100%;
            box-shadow: none !important; border: 1px solid #e5e7eb;
          }
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
      <Link
        to="/pedidos"
        className="no-print inline-flex items-center gap-2 text-gray-500 hover:text-primary transition mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar aos Pedidos
      </Link>

      <div id="comprovante-print" className="bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-secondary p-6 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold">Comprovante do Pedido</h1>
          <p className="text-white/80 text-sm mt-1">
            Pagamento confirmado e pedido registrado
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Info geral */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Hash className="w-4 h-4 text-gray-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Pedido</p>
                <p className="font-bold text-sm">#{shortId}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4 h-4 text-gray-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Data</p>
                <p className="font-bold text-sm">{formatDate(order.createdAt || order.dataPedido)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Store className="w-4 h-4 text-gray-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Farmácia</p>
                <p className="font-bold text-sm">{farmaciaName}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 ${payment.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                <PayIcon className={`w-4 h-4 ${payment.color}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Pagamento</p>
                <p className="font-bold text-sm">{payment.label}</p>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
            <span className="text-sm text-gray-600">Status do Pedido</span>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${status.color}`}>
              {status.label}
            </span>
          </div>

          {/* Itens */}
          <div>
            <h3 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" /> Itens do Pedido
            </h3>
            <div className="bg-gray-50 rounded-xl divide-y divide-gray-200">
              {order.itens?.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {item.nome_produto || item.nome || `Item ${idx + 1}`}
                      {item.controlado && <span className="text-red-500 ml-1 text-xs">⚕ Controlado</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.quantidade || 1}x R$ {(item.preco_unitario || item.preco || 0).toFixed(2)}
                    </p>
                  </div>
                  <span className="font-semibold text-sm">
                    R$ {(item.subtotal || (item.preco_unitario || item.preco || 0) * (item.quantidade || 1)).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Endereço */}
          {endereco.logradouro && (
            <div>
              <h3 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" /> Endereço de Entrega
              </h3>
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700">
                <p>{endereco.logradouro}, {endereco.numero}{endereco.complemento ? ` - ${endereco.complemento}` : ''}</p>
                <p>{endereco.bairro} - {endereco.cidade || 'Goiânia'}/{endereco.estado || 'GO'}</p>
                {endereco.cep && <p className="text-gray-500">CEP: {endereco.cep}</p>}
              </div>
            </div>
          )}

          {/* Valores */}
          <div className="border-t border-gray-200 pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span>R$ {(order.subtotal || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Taxa de Entrega</span>
              <span className={order.taxa_entrega === 0 ? 'text-emerald-600 font-medium' : ''}>
                {order.taxa_entrega === 0 ? 'Grátis' : `R$ ${(order.taxa_entrega || 0).toFixed(2)}`}
              </span>
            </div>
            {order.cupom?.desconto > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Desconto ({order.cupom.codigo})</span>
                <span>-R$ {order.cupom.desconto.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-3 border-t border-gray-200">
              <span className="text-lg font-bold">Total</span>
              <span className="text-2xl font-bold text-primary">R$ {(order.total || 0).toFixed(2)}</span>
            </div>
          </div>

          {/* Ações */}
          <div className="no-print flex gap-3 pt-2">
            <button
              onClick={() => window.print()}
              className="flex-1 flex items-center justify-center gap-2 border border-gray-200 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-50 transition text-sm"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <Link
              to={`/rastreamento/${orderId}`}
              className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl font-semibold hover:bg-secondary transition text-sm"
            >
              <Package className="w-4 h-4" /> Rastrear
            </Link>
          </div>

          {/* Rodapé (somente impressão) */}
          <div className="hidden print:block border-t border-gray-200 pt-4 text-center">
            <p className="text-sm font-bold text-primary">Saúde na Mão</p>
            <p className="text-[11px] text-gray-500">
              Medicamentos com entrega rápida e confiável · contato@saudenamao.com.br
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              Comprovante gerado em {formatDate(new Date())} · Pedido #{shortId}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
