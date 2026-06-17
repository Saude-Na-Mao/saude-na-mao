import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuthStore, useCartStore, usePrescriptionStore } from '../stores/store'
import { prescriptionService } from '../services/api'
import PrescriptionChat from '../components/PrescriptionChat'
import { itemExigeReceita } from '../utils/receitaCart'
import {
  Upload,
  FileText,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  X,
  Shield,
  Clock,
  Truck,
  ShoppingCart,
  MessageCircle,
} from 'lucide-react'

const ACTIVE_STATUSES = ['Pendente', 'Em Análise', 'Rejeitada']

function prioridade(r) {
  const st = r.status
  if (st === 'Pendente') return 0
  if (st === 'Em Análise') return 1
  if (st === 'Aprovada' && r.disponivel_para_novo_pedido !== false) return 2
  if (st === 'Aprovada') return 4
  if (st === 'Rejeitada') return 4
  if (st === 'Expirada') return 5
  return 9
}

/** Receita ativa vinculada a um produto específico do carrinho. */
function prescricaoDoItem(candidatas, itemId, sessaoPresc) {
  const matches = candidatas.filter((r) => {
    const pr = r.id_produto?._id || r.id_produto
    return pr && String(pr) === String(itemId)
  })
  const ativas = matches
    .filter((r) => {
      if (ACTIVE_STATUSES.includes(r.status)) return true
      if (r.status !== 'Aprovada') return false
      // Aprovada só conta se foi a receita enviada nesta sessão para o produto
      if (!sessaoPresc?._id) return r.disponivel_para_novo_pedido !== false
      return String(r._id) === String(sessaoPresc._id)
    })
    .sort((a, b) => prioridade(a) - prioridade(b))
  return ativas[0] || null
}

export default function Receita() {
  const navigate = useNavigate()
  const location = useLocation()
  const forcarNovoUpload = location.state?.forcarNovoUpload === true
  const { token } = useAuthStore()
  const { items } = useCartStore()
  const setPrescricao = usePrescriptionStore((s) => s.setPrescricao)
  const prescricoesPendentes = usePrescriptionStore((s) => s.prescricoesPendentes)

  const [mode, setMode] = useState('assincrono')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // itemId -> { status, data }
  const [prescByItem, setPrescByItem] = useState({})
  // itemId -> File
  const [fileByItem, setFileByItem] = useState({})
  const [uploadingItem, setUploadingItem] = useState(null)
  const [reenviandoItem, setReenviandoItem] = useState(null)
  // Modalidade por item: 'mim' (receita própria) | 'terceiro' (receita de outra pessoa)
  const [modoReceitaPorItem, setModoReceitaPorItem] = useState({})
  const [pacientePorItem, setPacientePorItem] = useState({})
  const fileInputs = useRef({})

  const setModoReceita = (itemId, modo) =>
    setModoReceitaPorItem((prev) => ({ ...prev, [itemId]: modo }))
  const setPacienteCampo = (itemId, campo, valor) =>
    setPacientePorItem((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), [campo]: valor },
    }))

  const itensReceitaPedido = items.filter((i) => itemExigeReceita(i))
  const pharmacyId = items[0]?.id_farmacia || null
  const contextoCarrinhoOk = Boolean(pharmacyId) && itensReceitaPedido.length > 0
  const receitaSig = itensReceitaPedido
    .map((i) => String(i.id))
    .sort()
    .join(',')

  const formatarErroReceita = (msg) => {
    const texto = String(msg || '')
    if (texto.includes('já foi utilizada em um pedido anterior')) {
      return 'Este arquivo de receita já foi usado em um pedido ativo. Envie uma nova receita digital assinada (não reutilize o mesmo arquivo).'
    }
    return texto || 'Erro ao enviar receita. Tente novamente.'
  }

  useEffect(() => {
    if (!token) {
      navigate('/login', { state: { from: '/receita' } })
    }
  }, [token, navigate])

  // Carrega o status de cada receita vinculada aos itens do carrinho
  useEffect(() => {
    if (!token || !contextoCarrinhoOk) {
      setPrescByItem({})
      return
    }
    let cancelado = false

    const carregar = async (silencioso = false) => {
      if (!silencioso) setLoading(true)
      try {
        const res = await prescriptionService.getAll()
        const receitas = res.data?.data?.receitas || res.data?.data?.docs || []
        const candidatas = receitas.filter((r) => {
          const fid = r.id_farmacia?._id || r.id_farmacia
          return !fid || String(fid) === String(pharmacyId)
        })

        const next = {}
        for (const item of itensReceitaPedido) {
          if (forcarNovoUpload && !prescByItem[item.id]) {
            // Em modo "reenviar", começa vazio até o usuário enviar de novo
            continue
          }
          const sessao = prescricoesPendentes?.[item.id]
          const ativa = prescricaoDoItem(candidatas, item.id, sessao)
          if (!ativa) continue

          // A aprovação do farmacêutico é refletida imediatamente na tela. A
          // disponibilidade do lote é reconfirmada no Checkout.
          next[item.id] = { status: ativa.status, data: ativa }
          setPrescricao?.(item.id, {
            _id: ativa._id,
            status: ativa.status,
            id_produto: item.id,
            id_farmacia: pharmacyId,
            disponivel_para_novo_pedido: ativa.disponivel_para_novo_pedido,
          })
        }

        if (!cancelado) {
          setPrescByItem((prev) => ({ ...prev, ...next }))
        }
      } catch {
        // silencioso
      } finally {
        if (!cancelado && !silencioso) setLoading(false)
      }
    }

    carregar()
    const interval = setInterval(() => carregar(true), 5000)
    return () => {
      cancelado = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, pharmacyId, forcarNovoUpload, contextoCarrinhoOk, receitaSig])

  const handleFileChange = (itemId, e) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    const allowed = ['application/pdf', 'application/xml', 'text/xml']
    if (!allowed.includes(selected.type)) {
      setError('Formato não permitido. Use PDF ou XML assinado.')
      return
    }
    if (selected.size > 15 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo 15MB.')
      return
    }
    setError('')
    setFileByItem((prev) => ({ ...prev, [itemId]: selected }))
  }

  const removeFile = (itemId) => {
    setFileByItem((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
    if (fileInputs.current[itemId]) fileInputs.current[itemId].value = ''
  }

  const handleUpload = async (itemId) => {
    const file = fileByItem[itemId]
    if (!file) return
    const paraTerceiro = (modoReceitaPorItem[itemId] || 'mim') === 'terceiro'
    const paciente = pacientePorItem[itemId] || {}
    if (paraTerceiro) {
      if (!String(paciente.nome || '').trim() || !String(paciente.cpf || '').trim()) {
        setError('Informe pelo menos o nome e o CPF do paciente da receita.')
        return
      }
    }
    try {
      setUploadingItem(itemId)
      setError('')
      const res = await prescriptionService.upload(file, pharmacyId, mode, itemId, {
        paraTerceiro,
        paciente,
      })
      const dados = res?.data?.data?.receita || res?.data?.data || {}
      setPrescByItem((prev) => ({
        ...prev,
        [itemId]: {
          status: dados.status || 'Em Análise',
          data: {
            _id: dados._id || dados.id,
            status: dados.status || 'Em Análise',
            createdAt: dados.createdAt || new Date().toISOString(),
            validade: dados.validade || null,
            observacoes: dados.observacoes || '',
            id_farmacia: pharmacyId,
            id_produto: itemId,
            modo_validacao: dados.modo_validacao || mode,
            chat_sessao_id: dados.chat_sessao_id || null,
            url_imagem_publica: dados.url_imagem_publica || null,
          },
        },
      }))
      setPrescricao(itemId, {
        _id: dados._id || dados.id,
        status: dados.status || 'Em Análise',
        id_produto: itemId,
        id_farmacia: pharmacyId,
      })
      removeFile(itemId)
    } catch (err) {
      const apiMsg = err.response?.data?.message
      setError(formatarErroReceita(apiMsg || err.message))
    } finally {
      setUploadingItem(null)
    }
  }

  const resetItem = (itemId) => {
    setPrescByItem((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
    removeFile(itemId)
  }

  /** Cancela a receita enviada (Pendente/Em Análise) e volta ao envio para reenviar outro arquivo. */
  const handleReenviar = async (itemId, prescId) => {
    if (!prescId) {
      resetItem(itemId)
      return
    }
    if (!window.confirm('Cancelar a receita enviada e enviar outro arquivo para este medicamento?')) {
      return
    }
    try {
      setReenviandoItem(itemId)
      setError('')
      await prescriptionService.cancel(prescId)
      setPrescricao?.(itemId, null)
      resetItem(itemId)
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          'Não foi possível cancelar a receita enviada. Tente novamente.',
      )
    } finally {
      setReenviandoItem(null)
    }
  }

  const itensAprovados = itensReceitaPedido.filter(
    (i) => prescByItem[i.id]?.status === 'Aprovada',
  ).length
  const todasAprovadas =
    itensReceitaPedido.length > 0 && itensAprovados === itensReceitaPedido.length
  // Fluxo pedido-primeiro: basta a receita estar ENVIADA para seguir ao checkout;
  // o farmacêutico valida depois, no próprio pedido.
  const itensEnviados = itensReceitaPedido.filter((i) =>
    ['Pendente', 'Em Análise', 'Aprovada'].includes(prescByItem[i.id]?.status),
  ).length
  const todasEnviadas =
    itensReceitaPedido.length > 0 && itensEnviados === itensReceitaPedido.length

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link
        to="/carrinho"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-primary transition mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar ao carrinho
      </Link>

      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FileText className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Receita Digital</h1>
        <p className="text-gray-500">
          Envie <strong>uma receita por medicamento</strong> (PDF ou XML assinado eletronicamente).
          A farmácia confere a autenticidade antes de liberar o pedido.
        </p>
      </div>

      {!contextoCarrinhoOk && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900 text-left">
          Para enviar e acompanhar a receita, adicione ao carrinho ao menos um medicamento que{' '}
          <strong>exija receita</strong> em uma farmácia. Assim a receita fica vinculada ao produto
          do pedido.
        </div>
      )}

      {/* Progresso */}
      {contextoCarrinhoOk && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">
            Receitas aprovadas
          </span>
          <span
            className={`text-sm font-bold px-3 py-1 rounded-full ${
              todasAprovadas
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {itensAprovados} / {itensReceitaPedido.length}
          </span>
        </div>
      )}

      {/* Modo de validação (global) */}
      {contextoCarrinhoOk && !todasAprovadas && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <button
            type="button"
            onClick={() => setMode('assincrono')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              mode === 'assincrono'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-sm">Aguardar aprovação</span>
            </div>
            <p className="text-xs text-gray-500">
              Envie a receita e aguarde. O farmacêutico analisa e você recebe o resultado.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setMode('chat_ao_vivo')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              mode === 'chat_ao_vivo'
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <MessageCircle className="w-4 h-4 text-green-600" />
              <span className="font-medium text-sm">Chat ao vivo</span>
            </div>
            <p className="text-xs text-gray-500">
              Converse diretamente com o farmacêutico e reenvie se necessário.
            </p>
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
          {error}
        </div>
      )}

      {loading && Object.keys(prescByItem).length === 0 && (
        <div className="border border-gray-200 bg-white rounded-xl p-6 text-center mb-6">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Verificando status das receitas...</p>
        </div>
      )}

      {/* Um bloco de upload/status por medicamento controlado */}
      <div className="space-y-4 mb-6">
        {itensReceitaPedido.map((item) => {
          const presc = prescByItem[item.id]
          const status = presc?.status
          const data = presc?.data
          const file = fileByItem[item.id]
          const isUploading = uploadingItem === item.id

          return (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">💊</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{item.nome}</p>
                  <p className="text-xs text-gray-400">Quantidade: {item.quantity}</p>
                </div>
                {status === 'Aprovada' && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                    Aprovada
                  </span>
                )}
                {status === 'Rejeitada' && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                    Rejeitada
                  </span>
                )}
                {(status === 'Pendente' || status === 'Em Análise') && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                    {status}
                  </span>
                )}
              </div>

              {status === 'Aprovada' ? (
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <CheckCircle className="w-5 h-5" />
                  Receita aprovada pelo farmacêutico.
                </div>
              ) : status === 'Rejeitada' ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span>
                      {data?.observacoes
                        ? `Motivo: ${data.observacoes}.`
                        : 'Receita não aprovada.'}{' '}
                      Envie uma nova receita válida para este medicamento.
                    </span>
                  </div>
                  <button
                    onClick={() => resetItem(item.id)}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition"
                  >
                    Enviar nova receita
                  </button>
                </div>
              ) : status === 'Pendente' || status === 'Em Análise' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <Clock className="w-5 h-5 animate-pulse" />
                    {data?.modo_validacao === 'chat_ao_vivo'
                      ? 'Aguardando o farmacêutico iniciar o chat.'
                      : 'Receita em análise pelo farmacêutico. Esta página atualiza sozinha.'}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-400">Enviou o arquivo errado?</span>
                    <button
                      type="button"
                      onClick={() => handleReenviar(item.id, data?._id)}
                      disabled={reenviandoItem === item.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 font-medium hover:bg-amber-50 transition disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      {reenviandoItem === item.id ? 'Cancelando...' : 'Cancelar e reenviar'}
                    </button>
                  </div>
                  {data?.modo_validacao === 'chat_ao_vivo' && data?.chat_sessao_id && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4 text-left">
                      <div className="flex items-center gap-2 text-sm font-bold text-green-700 mb-2">
                        <MessageCircle className="w-4 h-4" />
                        Chat ao vivo com o farmacêutico
                      </div>
                      <PrescriptionChat
                        prescriptionId={data._id}
                        chatSessaoId={data.chat_sessao_id}
                        urlImagemReceita={data.url_imagem_publica}
                        outroUsuario={null}
                        onEncerrar={() => {}}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Modalidade da receita: própria ou de outra pessoa (paciente) */}
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1.5">Para quem é a receita?</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'mim', label: 'Para mim' },
                        { key: 'terceiro', label: 'Para outra pessoa' },
                      ].map((opt) => {
                        const ativo = (modoReceitaPorItem[item.id] || 'mim') === opt.key
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setModoReceita(item.id, opt.key)}
                            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                              ativo ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {(modoReceitaPorItem[item.id] || 'mim') === 'terceiro' && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <p className="text-xs font-semibold text-amber-800">
                        Dados do paciente (vão para o registro SNGPC junto com os seus dados de comprador)
                      </p>
                      <input
                        type="text"
                        placeholder="Nome completo do paciente"
                        value={pacientePorItem[item.id]?.nome || ''}
                        onChange={(e) => setPacienteCampo(item.id, 'nome', e.target.value)}
                        className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="CPF do paciente"
                          value={pacientePorItem[item.id]?.cpf || ''}
                          onChange={(e) => setPacienteCampo(item.id, 'cpf', e.target.value)}
                          className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                        />
                        <input
                          type="text"
                          placeholder="RG do paciente"
                          value={pacientePorItem[item.id]?.rg || ''}
                          onChange={(e) => setPacienteCampo(item.id, 'rg', e.target.value)}
                          className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                        />
                      </div>
                    </div>
                  )}

                  {!file ? (
                    <div
                      onClick={() => fileInputs.current[item.id]?.click()}
                      className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition"
                    >
                      <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="font-semibold text-gray-700 text-sm mb-0.5">
                        Selecionar receita deste medicamento
                      </p>
                      <p className="text-xs text-gray-400">PDF ou XML assinado · Máx. 15MB</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <FileText className="w-7 h-7 text-blue-500" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{file.name}</p>
                        <p className="text-xs text-gray-400">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <button
                        onClick={() => removeFile(item.id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => handleUpload(item.id)}
                    disabled={!file || isUploading}
                    className="w-full bg-primary text-white py-2.5 rounded-xl font-semibold hover:bg-secondary transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                  >
                    {isUploading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Enviar receita deste medicamento
                      </>
                    )}
                  </button>

                  <input
                    ref={(el) => (fileInputs.current[item.id] = el)}
                    type="file"
                    accept=".pdf,.xml,application/pdf,application/xml,text/xml"
                    onChange={(e) => handleFileChange(item.id, e)}
                    className="hidden"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* How it works */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h3 className="font-bold text-gray-900 mb-4">Como funciona</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col items-center text-center p-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <h4 className="font-semibold text-sm mb-1">1. Envie um arquivo por medicamento</h4>
            <p className="text-xs text-gray-500">PDF ou XML assinado pelo médico</p>
          </div>
          <div className="flex flex-col items-center text-center p-4">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mb-3">
              <Shield className="w-6 h-6 text-blue-500" />
            </div>
            <h4 className="font-semibold text-sm mb-1">2. Farmácia valida</h4>
            <p className="text-xs text-gray-500">Cada receita é conferida individualmente</p>
          </div>
          <div className="flex flex-col items-center text-center p-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mb-3">
              <Truck className="w-6 h-6 text-emerald-500" />
            </div>
            <h4 className="font-semibold text-sm mb-1">3. Pedido segue</h4>
            <p className="text-xs text-gray-500">Liberação após todas as receitas aprovadas</p>
          </div>
        </div>
      </div>

      {/* Aguardando aprovação do farmacêutico (enviada, ainda não aprovada) */}
      {todasEnviadas && !todasAprovadas && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <h2 className="text-base font-bold mb-1.5 flex items-center gap-2 text-amber-900">
            <Clock className="w-5 h-5 text-amber-500" /> Aguardando aprovação da receita
          </h2>
          <p className="text-sm text-amber-800">
            O pagamento só é liberado <strong>depois</strong> que o farmacêutico aprovar
            sua(s) receita(s). Esta página atualiza sozinha — assim que for aprovada, o
            botão <strong>Continuar para pagamento</strong> é liberado.
          </p>
        </div>
      )}

      {/* Receita aprovada: segue para pagamento normal */}
      {todasAprovadas && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-6">
          <h2 className="text-base font-bold mb-1.5 flex items-center gap-2 text-emerald-900">
            <CheckCircle className="w-5 h-5 text-emerald-500" /> Receita aprovada
          </h2>
          <p className="text-sm text-emerald-800">
            O farmacêutico validou sua(s) receita(s). Continue para o pagamento e
            acompanhe a entrega normalmente.
          </p>
        </div>
      )}

      {/* Continuar para pagamento (só após aprovação) */}
      <button
        onClick={() => navigate('/checkout')}
        disabled={!todasAprovadas}
        className={`w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition ${
          todasAprovadas
            ? 'bg-primary text-white hover:bg-secondary'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        {todasAprovadas ? (
          <>
            <ShoppingCart className="w-4 h-4" />
            Continuar para pagamento
          </>
        ) : todasEnviadas ? (
          <>
            <Clock className="w-4 h-4" />
            Aguardando aprovação do farmacêutico
          </>
        ) : (
          <>
            Envie a receita de todos os itens
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  )
}
