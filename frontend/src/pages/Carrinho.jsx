import { useState, useEffect } from 'react'
import { useCartStore, useAuthStore, usePrescriptionStore } from '../stores/store'
import { useNavigate, Link } from 'react-router-dom'
import { Trash2, ArrowRight, Tag, Truck, Store, X, CheckCircle, AlertTriangle, ShoppingCart, Package2 } from 'lucide-react'
import api, { interactionService, prescriptionService } from '../services/api'
import StatusReceita from '../components/StatusReceita'
import { itemExigeReceita, receitaVinculadaAoProduto } from '../utils/receitaCart'
import { isRemoteCheckoutBlocked } from '../utils/compliance'

/** Receita aprovada: mesma farmácia, validade, vínculo explícito ao produto da linha (API confirma disponibilidade). */
function rxCandidataParaProduto(rx, productId, pharmacyId) {
  if (!rx || rx.status !== 'Aprovada') return false
  const fid = rx.id_farmacia?._id || rx.id_farmacia
  if (fid && pharmacyId && String(fid) !== String(pharmacyId)) return false
  if (rx.validade && new Date(rx.validade) <= new Date()) return false
  return receitaVinculadaAoProduto(rx, productId)
}

export default function Carrinho() {
  const navigate = useNavigate()
  const { items, removeItem, updateQuantity, getTotal, clearCart, addItem } = useCartStore()
  const { isAuthenticated, token } = useAuthStore()
  const { setPrescricaoFarmacia, clearPrescricoes, getPrescricaoFarmacia } = usePrescriptionStore()
  const [couponCode, setCouponCode] = useState('')
  const [couponData, setCouponData] = useState(null)
  const [couponError, setCouponError] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [deliveryType, setDeliveryType] = useState('moto')
  const [interactions, setInteractions] = useState([])
  const [taxaEntrega, setTaxaEntrega] = useState(8.00)
  const [rxUi, setRxUi] = useState({ modo: null, rx: null, motivoIndisponivel: null })
  const [dispensaOk, setDispensaOk] = useState(false)

  useEffect(() => {
    if (items.length === 0) {
      setRxUi({ modo: null, rx: null, motivoIndisponivel: null })
      setDispensaOk(false)
    }
  }, [items.length])

  const irParaReceitaNovoEnvio = (opts = {}) => {
    const { verStatus = false } = opts
    const ctrl = items.find((i) => itemExigeReceita(i))
    if (!isAuthenticated()) {
      navigate('/login', { state: { from: '/receita' } })
      return
    }
    if (verStatus) {
      navigate('/receita')
      return
    }
    clearPrescricoes()
    setRxUi({ modo: null, rx: null, motivoIndisponivel: null })
    navigate('/receita', {
      state: {
        forcarNovoUpload: true,
        productId: ctrl?.id,
        productNome: ctrl?.nome,
      },
    })
  }

  // Update delivery fee when delivery type changes
  useEffect(() => {
    const fees = { moto: 8.00, retirada: 0 }
    let taxa = fees[deliveryType] ?? 8.00
    const subtotal = getTotal()
    if (subtotal >= 150 && deliveryType === 'moto') taxa = 0
    if (couponData?.frete_gratis) taxa = 0
    setTaxaEntrega(taxa)
  }, [deliveryType, couponData, items])

  // Reorder: load items from localStorage if present
  useEffect(() => {
    const reorderRaw = localStorage.getItem('reorder_items')
    if (reorderRaw) {
      try {
        const reorderItems = JSON.parse(reorderRaw)
        if (Array.isArray(reorderItems) && reorderItems.length > 0) {
          clearCart()
          reorderItems.forEach((item) => addItem(item))
        }
      } catch { /* ignore */ }
      localStorage.removeItem('reorder_items')
    }
  }, [])

  // Check drug interactions when items change
  useEffect(() => {
    if (items.length < 2) {
      setInteractions([])
      return
    }
    const productIds = items.map((i) => i.id).filter(Boolean)
    if (productIds.length < 2) return
    interactionService.check({ product_ids: productIds })
      .then((res) => {
        setInteractions(res.data?.data?.interacoes || [])
      })
      .catch(() => setInteractions([]))
  }, [items])

  const pharmacyName = items[0]?.nome_farmacia || 'Farmácia'

  const subtotal = getTotal()
  const desconto = couponData?.desconto || 0
  const total = Math.max(0, subtotal - desconto + taxaEntrega)

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return
    try {
      setCouponLoading(true)
      setCouponError('')
      const res = await api.post('/cupons/validar', {
        codigo: couponCode,
        subtotal,
      })
      setCouponData(res.data?.data)
    } catch (err) {
      setCouponError(err.message || err.data?.message || 'Cupom inválido')
      setCouponData(null)
    } finally {
      setCouponLoading(false)
    }
  }

  const removeCoupon = () => {
    setCouponData(null)
    setCouponCode('')
    setCouponError('')
  }

  const precisaReceitaNoPedido = items.some((i) => itemExigeReceita(i))
  const itensBloqueadosRemoto = items.filter((i) => isRemoteCheckoutBlocked(i))
  const temBloqueioRemoto = itensBloqueadosRemoto.length > 0
  const pharmacyId = items[0]?.id_farmacia || null

  const itemsSig = items
    .map((i) =>
      `${i.id}:${i.controlado ? 1 : 0}:${i.receita_obrigatoria ? 1 : 0}:${i.quantity}`,
    )
    .join('|')

  // Carrega receitas e verifica disponibilidade para dispensação (RN01)
  useEffect(() => {
    if (!precisaReceitaNoPedido || !pharmacyId || !token) {
      setRxUi({ modo: null, rx: null, motivoIndisponivel: null })
      setDispensaOk(false)
      return
    }
    let cancelado = false
    const itensReceita = items.filter((i) => itemExigeReceita(i))

    const verificarDisponibilidade = async (prescriptionId) => {
      try {
        const res = await prescriptionService.checkAvailability(prescriptionId)
        return res.data?.data
      } catch {
        // Erro de rede/404: não é rejeição farmacêutica — trata como sem receita válida vinculada
        return {
          disponivel: false,
          verificacaoInconclusiva: true,
          motivo: null,
          status: '',
          validade: null,
        }
      }
    }

    const carregar = async () => {
      try {
        const res = await prescriptionService.getAll({ params: { limit: 80 } })
        const lista = res.data?.data?.receitas || res.data?.data?.docs || []
        const receitaSessaoAtual = getPrescricaoFarmacia(pharmacyId)
        const farmFiltered = lista.filter((r) => {
          const fid = r.id_farmacia?._id || r.id_farmacia
          return !fid || String(fid) === String(pharmacyId)
        })

        const pendente = farmFiltered.find(
          (r) =>
            receitaSessaoAtual?._id &&
            String(r._id) === String(receitaSessaoAtual._id) &&
            ['Pendente', 'Em Análise'].includes(r.status) &&
            itensReceita.some((ci) => receitaVinculadaAoProduto(r, ci.id)),
        )

        if (pendente) {
          if (!cancelado) {
            setDispensaOk(false)
            setRxUi({ modo: 'pendente', rx: pendente, motivoIndisponivel: null })
            setPrescricaoFarmacia(pharmacyId, {
              _id: pendente._id,
              status: pendente.status,
              createdAt: pendente.createdAt,
              validade: pendente.validade,
              observacoes: pendente.observacoes,
              id_farmacia: pharmacyId,
              disponivel_para_novo_pedido: pendente.disponivel_para_novo_pedido,
              id_produto: pendente.id_produto,
            })
          }
          return
        }

        const checks = await Promise.all(
          itensReceita.map(async (ci) => {
            const cand = farmFiltered.find((r) =>
              receitaSessaoAtual?._id &&
              String(r._id) === String(receitaSessaoAtual._id) &&
              rxCandidataParaProduto(r, ci.id, pharmacyId),
            )
            if (!cand) {
              return {
                ci,
                cand: null,
                resultado: {
                  disponivel: false,
                  motivo:
                    'Nenhuma receita aprovada encontrada para este medicamento nesta farmácia.',
                },
              }
            }
            const resultado = await verificarDisponibilidade(cand._id)
            return { ci, cand, resultado }
          }),
        )

        const todosOk =
          itensReceita.length > 0 &&
          checks.every((c) => c.resultado?.disponivel === true)

        let modo = null
        let rx = null
        let motivoIndisponivel = null

        if (checks.length === 0) {
          modo = null
          rx = null
        } else if (todosOk) {
          modo = 'ok'
          rx = checks.find((c) => c.cand)?.cand ?? null
        } else {
          const failed = checks.find((c) => !c.resultado?.disponivel)

          if (failed?.resultado?.verificacaoInconclusiva) {
            modo = null
            rx = null
            motivoIndisponivel = null
          } else {
            modo = null
            rx = null
            motivoIndisponivel = null
          }
        }

        if (cancelado) return
        setDispensaOk(todosOk)
        setRxUi({ modo, rx, motivoIndisponivel })
        if (rx && pharmacyId && modo === 'ok') {
          setPrescricaoFarmacia(pharmacyId, {
            _id: rx._id,
            status: rx.status,
            createdAt: rx.createdAt,
            validade: rx.validade,
            observacoes: rx.observacoes,
            id_farmacia: pharmacyId,
            disponivel_para_novo_pedido: rx.disponivel_para_novo_pedido,
            id_produto: rx.id_produto,
          })
        }
      } catch {
        if (!cancelado) {
          setDispensaOk(false)
          setRxUi({ modo: null, rx: null, motivoIndisponivel: null })
        }
      }
    }

    carregar()
    return () => {
      cancelado = true
    }
  }, [precisaReceitaNoPedido, pharmacyId, token, itemsSig, setPrescricaoFarmacia, getPrescricaoFarmacia])

  const receitaPendente = rxUi.modo === 'pendente'
  const receitaAprovada = dispensaOk && rxUi.modo === 'ok'

  const handleFinalize = () => {
    if (temBloqueioRemoto) return

    const checkoutState = {
      subtotal,
      taxaEntrega,
      desconto,
      total,
      deliveryType,
      couponData,
      pharmacyName,
      pharmacyId: items[0]?.id_farmacia,
    }
    localStorage.setItem('checkout_data', JSON.stringify(checkoutState))

    // Se já tem receita aprovada, vai direto para o checkout
    const precisaReceita = precisaReceitaNoPedido && !dispensaOk
    const dest = precisaReceita ? '/receita' : '/checkout'

    if (!isAuthenticated()) {
      navigate('/login', { state: { from: dest } })
      return
    }

    navigate(dest)
  }

  if (items.length === 0) {
    return (
      <div className="page-shell py-12">
        <div className="text-center py-16">
          <ShoppingCart className="w-14 h-14 text-gray-300 mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-2">Carrinho Vazio</h1>
          <p className="text-gray-600 mb-6">
            Você ainda não adicionou nenhum produto ao carrinho
          </p>
          <Link
            to="/farmacias"
            className="inline-block bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-secondary transition"
          >
            Ver Farmácias
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell py-6 sm:py-8">
      <h1 className="section-title mb-2">Meu Carrinho</h1>
      <div className="flex items-center gap-2 mb-8 text-gray-500">
        <Store className="w-4 h-4" />
        <span className="text-sm">{pharmacyName}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`p-4 sm:p-5 flex flex-col sm:flex-row gap-4 hover:bg-gray-50 transition ${
                  itemExigeReceita(item) ? 'bg-amber-50/40' : ''
                } ${idx > 0 ? 'border-t border-gray-100' : ''}`}
              >
                <div className="w-16 h-16 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Package2 className="w-7 h-7 text-gray-300" />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 mb-1">{item.nome}</h3>
                  {itemExigeReceita(item) && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded-lg mb-1">
                      <AlertTriangle className="w-3 h-3" />
                      Receita obrigatória
                    </span>
                  )}
                  {isRemoteCheckoutBlocked(item) && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold bg-red-100 text-red-700 px-2 py-1 rounded-lg mb-1">
                      <X className="w-3 h-3" />
                      Checkout remoto bloqueado
                    </span>
                  )}
                  <div className="text-primary font-bold">
                    R$ {item.preco?.toFixed(2)}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start sm:gap-2">
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-gray-300 hover:text-red-500 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <div className="flex items-center border rounded-lg overflow-hidden">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="px-2.5 py-1 text-gray-500 hover:bg-gray-50 transition text-sm"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-sm font-medium">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="px-2.5 py-1 text-gray-500 hover:bg-gray-50 transition text-sm"
                    >
                      +
                    </button>
                  </div>

                  <div className="font-bold text-sm text-gray-900">
                    R$ {(item.preco * item.quantity).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              to="/farmacias"
              className="flex-1 border border-primary text-primary px-5 py-3 rounded-xl font-semibold hover:bg-primary/5 transition text-center text-sm"
            >
              Continuar Comprando
            </Link>
            <button
              onClick={clearCart}
              className="px-5 py-3 text-red-500 border border-red-200 rounded-xl font-semibold hover:bg-red-50 transition text-sm"
            >
              Limpar
            </button>
          </div>

          {/* Drug Interaction Alert */}
          {interactions.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-red-800 text-sm mb-2">
                    Alerta de Interação Medicamentosa
                  </h3>
                  <div className="space-y-2">
                    {interactions.map((inter, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${
                            inter.severidade === 'grave' ? 'bg-red-500' :
                            inter.severidade === 'moderada' ? 'bg-orange-500' : 'bg-yellow-500'
                          }`} />
                          <span className="font-semibold text-red-800">
                            {inter.medicamentos?.join(' + ')}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            inter.severidade === 'grave' ? 'bg-red-200 text-red-800' :
                            inter.severidade === 'moderada' ? 'bg-orange-200 text-orange-800' : 'bg-yellow-200 text-yellow-800'
                          }`}>
                            {inter.severidade?.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-red-700 ml-4 mt-0.5">{inter.descricao}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-red-600 mt-3 font-medium">
                    Consulte seu médico ou farmacêutico antes de prosseguir.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" /> Entrega
            </h3>
            <div className="space-y-2">
              {[
                { value: 'moto', label: 'Motoboy', desc: 'Até 60 min', fee: subtotal >= 150 ? 0 : 8 },
                { value: 'retirada', label: 'Retirada', desc: 'Retire na farmácia', fee: 0 },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                    deliveryType === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="delivery"
                    value={opt.value}
                    checked={deliveryType === opt.value}
                    onChange={(e) => setDeliveryType(e.target.value)}
                    className="accent-primary"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">{opt.label}</div>
                    <div className="text-xs text-gray-500">{opt.desc}</div>
                  </div>
                  <span className={`text-sm font-bold ${opt.fee === 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
                    {opt.fee === 0 ? 'Grátis' : `R$ ${opt.fee.toFixed(2)}`}
                  </span>
                </label>
              ))}
              {subtotal >= 150 && deliveryType === 'moto' && (
                <p className="text-xs text-emerald-600 mt-1 ml-1">Frete grátis para pedidos acima de R$ 150</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Tag className="w-4 h-4 text-orange-500" /> Cupom de Desconto
            </h3>
            {couponData ? (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-emerald-700 text-sm">{couponData.cupom?.codigo}</div>
                  <div className="text-xs text-emerald-600">
                    {couponData.frete_gratis ? 'Frete grátis' : `-R$ ${couponData.desconto?.toFixed(2)}`}
                  </div>
                </div>
                <button onClick={removeCoupon} className="text-gray-400 hover:text-red-500 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Digite o cupom"
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError('') }}
                    className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition uppercase"
                  />
                  <button
                    onClick={handleApplyCoupon}
                    disabled={couponLoading}
                    className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-secondary transition disabled:opacity-50"
                  >
                    {couponLoading ? '...' : 'Aplicar'}
                  </button>
                </div>
                {couponError && (
                  <p className="text-xs text-red-500 mt-2">{couponError}</p>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-lg font-bold mb-4">Resumo do Pedido</h2>

            {temBloqueioRemoto && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">Atendimento obrigatório da farmácia</p>
                  <p className="text-xs text-red-700">
                    Remova {itensBloqueadosRemoto.length === 1 ? 'este item' : 'estes itens'} para finalizar o pedido online.
                    O fluxo de controlados exige validação direta e regras específicas da farmácia.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-3 border-b border-gray-100 pb-4 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal ({items.length} {items.length === 1 ? 'item' : 'itens'})</span>
                <span className="font-medium">R$ {subtotal.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Frete</span>
                <span className={`font-medium ${taxaEntrega === 0 ? 'text-emerald-600' : ''}`}>
                  {taxaEntrega === 0 ? 'Grátis' : `R$ ${taxaEntrega.toFixed(2)}`}
                </span>
              </div>

              {desconto > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Desconto</span>
                  <span className="font-medium">-R$ {desconto.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center mb-5">
              <span className="text-lg font-bold">Total</span>
              <span className="text-2xl font-bold text-primary">
                R$ {total.toFixed(2)}
              </span>
            </div>

            {precisaReceitaNoPedido && (
              <div className="mb-3">
                <StatusReceita
                  status={
                    rxUi.modo === 'rejeitada'
                        ? 'Rejeitada'
                        : rxUi.modo === 'expirada'
                          ? 'Expirada'
                          : rxUi.rx?.status
                  }
                  receitaJaUtilizada={false}
                  dataEnvio={rxUi.rx?.createdAt || rxUi.rx?.aberta_em}
                  validade={rxUi.rx?.validade}
                  observacoes={rxUi.motivoIndisponivel || rxUi.rx?.observacoes}
                  onEnviar={() => irParaReceitaNovoEnvio()}
                  onReenviar={() => irParaReceitaNovoEnvio()}
                  onVerStatus={() => irParaReceitaNovoEnvio({ verStatus: true })}
                />
              </div>
            )}

            {/* Botão de finalizar */}
            {!temBloqueioRemoto && (!precisaReceitaNoPedido || receitaAprovada) && (
              <button
                onClick={handleFinalize}
                className="w-full py-3.5 rounded-xl font-semibold transition flex items-center justify-center gap-2 bg-primary text-white hover:bg-secondary"
              >
                Finalizar Compra
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {temBloqueioRemoto && (
              <button
                disabled
                className="w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 bg-gray-200 text-gray-500 cursor-not-allowed"
              >
                Remova controlados para finalizar
              </button>
            )}
            {precisaReceitaNoPedido && receitaPendente && (
              <button
                disabled
                className="w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 bg-gray-200 text-gray-500 cursor-not-allowed"
              >
                Aguardando aprovação da receita
              </button>
            )}

            {precisaReceitaNoPedido && !rxUi.rx && rxUi.modo !== 'pendente' && (
              <p className="text-xs text-amber-600 text-center mt-3 font-medium">
                Há medicamentos que exigem receita. Envie a receita médica correspondente a cada um.
              </p>
            )}
            {!precisaReceitaNoPedido && (
              <p className="text-xs text-gray-400 text-center mt-3">
                Escolha o método de pagamento na próxima etapa
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
