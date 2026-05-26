import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuthStore, useCartStore, usePrescriptionStore } from '../stores/store'
import { prescriptionService } from '../services/api'
import PrescriptionChat from '../components/PrescriptionChat'
import { itemExigeReceita } from '../utils/receitaCart'
import {
  Camera,
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
  Eye,
  ShoppingCart,
  MessageCircle,
} from 'lucide-react'

/** Receitas com vínculo explícito a algum produto do carrinho (mesmo id). */
function filtrarReceitasDoCarrinho(candidatas, itensReceita) {
  if (!itensReceita.length) return []
  const productIds = new Set(itensReceita.map((i) => String(i.id)))
  return candidatas.filter((r) => {
    const pr = r.id_produto?._id || r.id_produto
    if (!pr) return false
    return productIds.has(String(pr))
  })
}

export default function Receita() {
  const navigate = useNavigate()
  const location = useLocation()
  const forcarNovoUpload = location.state?.forcarNovoUpload === true
  const { token } = useAuthStore()
  const { items } = useCartStore()
  const setPrescricaoFarmacia = usePrescriptionStore(
    (s) => s.setPrescricaoFarmacia,
  )
  const clearPrescricoes = usePrescriptionStore((s) => s.clearPrescricoes)
  const prescricoesPorFarmacia = usePrescriptionStore(
    (s) => s.prescricoesPorFarmacia,
  )
  const fileInputRef = useRef(null)

  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [error, setError] = useState('')
  const [rxStatus, setRxStatus] = useState(null) // null | 'Pendente' | 'Em Análise' | 'Aprovada' | 'Rejeitada'
  const [rxData, setRxData] = useState(null) // dados completos da receita ativa
  const [carregandoStatus, setCarregandoStatus] = useState(false)
  const [modo, setModo] = useState('assincrono') // 'assincrono' | 'chat_ao_vivo'

  const formatarErroReceita = (msg) => {
    const texto = String(msg || '')
    if (texto.includes('já foi utilizada em um pedido anterior')) {
      return 'Este arquivo de receita já foi usado em um pedido ativo. Envie uma nova foto/arquivo da receita (não reutilize o mesmo arquivo).'
    }
    return texto || 'Erro ao enviar receita. Tente novamente.'
  }

  const itensReceitaPedido = items.filter((i) => itemExigeReceita(i))
  const pharmacyId = items[0]?.id_farmacia || null
  const contextoCarrinhoOk =
    Boolean(pharmacyId) && itensReceitaPedido.length > 0
  const receitaSig = itensReceitaPedido
    .map((i) => String(i.id))
    .sort()
    .join(',')

  useEffect(() => {
    if (!token) {
      navigate('/login', { state: { from: '/receita' } })
      return
    }
  }, [token, navigate])

  // Inicialização: busca receita existente para a farmácia atual
  useEffect(() => {
    if (!token) return
    let cancelado = false

    if (forcarNovoUpload) {
      setRxStatus(null)
      setRxData(null)
      setUploaded(false)
      setCarregandoStatus(false)
      setFile(null)
      setPreview(null)
      setError('')
      return () => {
        cancelado = true
      }
    }

    // Sem farmácia / itens que exigem receita: não buscar receitas soltas da conta
    if (!contextoCarrinhoOk) {
      setRxStatus(null)
      setRxData(null)
      setUploaded(false)
      setCarregandoStatus(false)
      setError('')
      return () => {
        cancelado = true
      }
    }

    // Cache imediato: não usar "Aprovada" sem checar disponibilidade na API
    const cache = pharmacyId ? prescricoesPorFarmacia[pharmacyId] : null
    if (
      cache &&
      ['Pendente', 'Em Análise', 'Rejeitada'].includes(cache.status)
    ) {
      setRxStatus(cache.status)
      setRxData(cache)
      setUploaded(true)
    }

    const carregar = async () => {
      setCarregandoStatus(true)
      try {
        const res = await prescriptionService.getAll()
        const receitas = res.data?.data?.receitas || res.data?.data?.docs || []
        const candidatas = receitas.filter((r) => {
          const fid = r.id_farmacia?._id || r.id_farmacia
          return !fid || String(fid) === String(pharmacyId)
        })

        const doCarrinho = filtrarReceitasDoCarrinho(
          candidatas,
          itensReceitaPedido,
        )

        const prioridade = (r) => {
          const st = r.status
          if (st === 'Pendente') return 0
          if (st === 'Em Análise') return 1
          if (st === 'Aprovada' && r.disponivel_para_novo_pedido !== false) return 2
          if (st === 'Aprovada') return 4
          if (st === 'Rejeitada') return 4
          if (st === 'Expirada') return 5
          return 9
        }
        const receitaSessaoAtual = pharmacyId ? prescricoesPorFarmacia[pharmacyId] : null
        const ativa = doCarrinho
          .filter((r) => {
            if (['Pendente', 'Em Análise', 'Rejeitada'].includes(r.status)) return true
            if (r.status !== 'Aprovada') return false
            if (!receitaSessaoAtual?._id) return false
            return String(r._id) === String(receitaSessaoAtual._id)
          })
          .sort((a, b) => prioridade(a) - prioridade(b))[0]

        if (cancelado) return

        if (ativa) {
          if (ativa.status === 'Aprovada') {
            try {
              const chk = await prescriptionService.checkAvailability(ativa._id)
              const { disponivel, motivo } = chk.data?.data || {}
              if (cancelado) return
              if (!disponivel) {
                setRxStatus(null)
                setRxData(null)
                setUploaded(false)
                clearPrescricoes()
                setError(
                  motivo ||
                    'Esta receita não está disponível para uma nova compra. Envie uma nova receita.',
                )
                return
              }
            } catch {
              if (cancelado) return
              setRxStatus(null)
              setRxData(null)
              setUploaded(false)
              return
            }
          }

          setRxStatus(ativa.status)
          setRxData(ativa)
          setUploaded(true)
          if (pharmacyId) {
            setPrescricaoFarmacia(pharmacyId, {
              _id: ativa._id,
              status: ativa.status,
              createdAt: ativa.createdAt,
              validade: ativa.validade,
              observacoes: ativa.observacoes,
              id_farmacia: pharmacyId,
              disponivel_para_novo_pedido: ativa.disponivel_para_novo_pedido,
              id_produto: ativa.id_produto,
            })
          }
        }
      } catch {
        // silencioso
      } finally {
        if (!cancelado) setCarregandoStatus(false)
      }
    }

    carregar()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, pharmacyId, forcarNovoUpload, contextoCarrinhoOk, receitaSig])

  // Polling enquanto a receita está pendente
  useEffect(() => {
    if (!contextoCarrinhoOk) return
    if (!uploaded) return
    if (rxStatus === 'Aprovada' || rxStatus === 'Rejeitada') return

    const poll = async () => {
      try {
        const res = await prescriptionService.getAll()
        const receitas = res.data?.data?.receitas || []
        const candidatas = receitas.filter((r) => {
          const fid = r.id_farmacia?._id || r.id_farmacia
          return !fid || String(fid) === String(pharmacyId)
        })
        const doCarrinho = filtrarReceitasDoCarrinho(
          candidatas,
          itensReceitaPedido,
        )
        const prioridadePoll = (r) => {
          const st = r.status
          if (st === 'Pendente') return 0
          if (st === 'Em Análise') return 1
          if (st === 'Aprovada' && r.disponivel_para_novo_pedido !== false) return 2
          if (st === 'Aprovada') return 4
          if (st === 'Rejeitada') return 4
          return 9
        }
        const receitaSessaoAtual = pharmacyId ? prescricoesPorFarmacia[pharmacyId] : null
        const ordenadas = [...doCarrinho]
          .filter((r) => {
            if (['Pendente', 'Em Análise', 'Rejeitada'].includes(r.status)) return true
            if (r.status !== 'Aprovada') return false
            if (!receitaSessaoAtual?._id) return false
            return String(r._id) === String(receitaSessaoAtual._id)
          })
          .sort((a, b) => prioridadePoll(a) - prioridadePoll(b))
        if (ordenadas.length > 0) {
          const r = ordenadas[0]
          if (r.status === 'Aprovada') {
            try {
              const chk = await prescriptionService.checkAvailability(r._id)
              const { disponivel, motivo } = chk.data?.data || {}
              if (!disponivel) {
                setRxStatus(null)
                setRxData(null)
                setUploaded(false)
                clearPrescricoes()
                setError(
                  motivo ||
                    'Esta receita não está disponível para uma nova compra. Envie uma nova receita.',
                )
                return
              }
            } catch {
              setRxStatus(null)
              setRxData(null)
              setUploaded(false)
              return
            }
          }
          setRxStatus(r.status)
          setRxData(r)
          if (pharmacyId) {
            setPrescricaoFarmacia(pharmacyId, {
              _id: r._id,
              status: r.status,
              createdAt: r.createdAt,
              validade: r.validade,
              observacoes: r.observacoes,
              id_farmacia: pharmacyId,
              disponivel_para_novo_pedido: r.disponivel_para_novo_pedido,
              id_produto: r.id_produto,
            })
          }
        }
      } catch {
        // silently retry
      }
    }

    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [
    contextoCarrinhoOk,
    uploaded,
    rxStatus,
    pharmacyId,
    receitaSig,
    prescricoesPorFarmacia,
    setPrescricaoFarmacia,
    clearPrescricoes,
  ])

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0]
    if (!selected) return

    const allowed = ['image/jpeg', 'image/png', 'application/pdf']
    if (!allowed.includes(selected.type)) {
      setError('Formato não permitido. Use JPG, PNG ou PDF.')
      return
    }
    if (selected.size > 15 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo 15MB.')
      return
    }

    setFile(selected)
    setError('')

    if (selected.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => setPreview(ev.target.result)
      reader.readAsDataURL(selected)
    } else {
      setPreview(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return
    try {
      setUploading(true)
      setError('')
      const res = await prescriptionService.upload(
        file,
        pharmacyId,
        modo,
        itensReceitaPedido[0]?.id || null,
      )
      const dados = res?.data?.data?.receita || res?.data?.data || {}
      setUploaded(true)
      setRxStatus(dados.status || 'Em Análise')
      setRxData({
        _id: dados._id || dados.id,
        status: dados.status || 'Em Análise',
        createdAt: dados.createdAt || new Date().toISOString(),
        validade: dados.validade || null,
        observacoes: dados.observacoes || '',
        id_farmacia: pharmacyId,
        modo_validacao: dados.modo_validacao || modo,
        chat_sessao_id: dados.chat_sessao_id || null,
        url_imagem_publica: dados.url_imagem_publica || null,
      })
      // Persiste no store global para o Carrinho.jsx refletir o estado imediatamente
      if (pharmacyId) {
        setPrescricaoFarmacia(pharmacyId, {
          _id: dados._id || dados.id,
          status: dados.status || 'Em Análise',
          createdAt: dados.createdAt || new Date().toISOString(),
          validade: dados.validade || null,
          observacoes: dados.observacoes || '',
          id_farmacia: pharmacyId,
          modo_validacao: dados.modo_validacao || modo,
          chat_sessao_id: dados.chat_sessao_id || null,
        })
      }
    } catch (err) {
      const apiMsg = err.response?.data?.message
      setError(formatarErroReceita(apiMsg || err.message))
    } finally {
      setUploading(false)
    }
  }

  const removeFile = () => {
    setFile(null)
    setPreview(null)
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

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
        <h1 className="text-3xl font-bold mb-2">Receita Médica</h1>
        <p className="text-gray-500">
          Medicamentos com receita obrigatória precisam de validação farmacêutica.
          Medicamentos controlados exigem atendimento direto da farmácia.
        </p>
      </div>

      {!contextoCarrinhoOk && !forcarNovoUpload && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900 text-left">
          Para enviar e acompanhar a receita, adicione ao carrinho ao menos um medicamento que{' '}
          <strong>exija receita</strong> em uma farmácia. Assim a receita fica vinculada ao produto
          do pedido e não reaproveitamos aprovações de outros medicamentos.
        </div>
      )}

      {/* Controlled Items */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
        <h3 className="font-bold text-amber-800 text-sm mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Medicamentos com receita obrigatória no seu pedido
        </h3>
        <div className="space-y-2">
          {itensReceitaPedido.map((item) => (
            <div key={item.id} className="flex items-center gap-3 text-sm">
              <span className="text-lg">💊</span>
              <span className="font-medium text-amber-900">{item.nome}</span>
              <span className="text-amber-600">x{item.quantity}</span>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h3 className="font-bold text-gray-900 mb-4">Como funciona</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col items-center text-center p-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
              <Camera className="w-6 h-6 text-primary" />
            </div>
            <h4 className="font-semibold text-sm mb-1">1. Envie a foto</h4>
            <p className="text-xs text-gray-500">Tire uma foto da receita com boa iluminação</p>
          </div>
          <div className="flex flex-col items-center text-center p-4">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mb-3">
              <Shield className="w-6 h-6 text-blue-500" />
            </div>
            <h4 className="font-semibold text-sm mb-1">2. Farmácia valida</h4>
            <p className="text-xs text-gray-500">O farmacêutico verifica a receita e aprova</p>
          </div>
          <div className="flex flex-col items-center text-center p-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mb-3">
              <Truck className="w-6 h-6 text-emerald-500" />
            </div>
            <h4 className="font-semibold text-sm mb-1">3. Pedido segue</h4>
            <p className="text-xs text-gray-500">A farmácia libera apenas itens permitidos no fluxo online</p>
          </div>
        </div>
      </div>

      {/* Upload area */}
      {carregandoStatus && !forcarNovoUpload && !uploaded ? (
        <div className="border border-gray-200 bg-white rounded-xl p-8 text-center mb-6">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Verificando status da receita...</p>
        </div>
      ) : uploaded ? (
        <div className={`border rounded-xl p-8 text-center mb-6 ${
          rxStatus === 'Aprovada'
            ? 'bg-emerald-50 border-emerald-200'
            : rxStatus === 'Rejeitada'
            ? 'bg-red-50 border-red-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          {rxStatus === 'Aprovada' ? (
            <>
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-emerald-800 mb-2">Receita Aprovada!</h3>
              <p className="text-sm text-emerald-600 mb-4">
                Sua receita foi aprovada pelo farmacêutico. Você já pode prosseguir para o pagamento.
              </p>
              <button
                onClick={() => navigate('/checkout')}
                className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition inline-flex items-center gap-2"
              >
                <ShoppingCart className="w-4 h-4" />
                Ir para o Checkout
              </button>
            </>
          ) : rxStatus === 'Rejeitada' ? (
            <>
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-red-800 mb-2">Receita Rejeitada</h3>
              <p className="text-sm text-red-600 mb-4">
                {rxData?.observacoes
                  ? `Motivo: ${rxData.observacoes}.`
                  : 'Sua receita não foi aprovada.'}{' '}
                Por favor, envie uma nova receita válida.
              </p>
              <button
                onClick={() => {
                  setUploaded(false)
                  setRxStatus(null)
                  setRxData(null)
                  removeFile()
                }}
                className="px-6 py-2 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition"
              >
                Enviar Nova Receita
              </button>
            </>
          ) : (
            <>
              <Clock className="w-12 h-12 text-amber-500 mx-auto mb-4 animate-pulse" />
              <h3 className="text-xl font-bold text-amber-800 mb-2">
                {rxData?.modo_validacao === 'chat_ao_vivo'
                  ? 'Aguardando o farmacêutico iniciar o chat'
                  : rxStatus === 'Em Análise'
                    ? 'Receita em Análise'
                    : 'Aguardando Avaliação'}
              </h3>
              <p className="text-sm text-amber-600 mb-2">
                {rxData?.modo_validacao === 'chat_ao_vivo'
                  ? 'O farmacêutico foi notificado e atenderá em instantes.'
                  : 'Sua receita foi enviada e está sendo avaliada pelo farmacêutico.'}
              </p>
              {rxData?.createdAt && (
                <p className="text-xs text-amber-700/80 mb-2">
                  Enviada em{' '}
                  {new Date(rxData.createdAt).toLocaleString('pt-BR')}
                </p>
              )}
              <p className="text-xs text-amber-500">
                Aguarde a aprovação para continuar com o pagamento. Esta página atualiza automaticamente.
              </p>
            </>
          )}

          {/* Chat ao vivo (quando o paciente escolheu esse modo) */}
          {rxData?.modo_validacao === 'chat_ao_vivo' &&
            rxData?.chat_sessao_id &&
            !['Aprovada', 'Rejeitada', 'Cancelada', 'Expirada'].includes(
              rxStatus,
            ) && (
              <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4 text-left">
                <div className="flex items-center gap-2 text-sm font-bold text-green-700 mb-2">
                  <MessageCircle className="w-4 h-4" />
                  Chat ao vivo com o farmacêutico
                </div>
                <PrescriptionChat
                  prescriptionId={rxData._id}
                  chatSessaoId={rxData.chat_sessao_id}
                  urlImagemReceita={rxData.url_imagem_publica}
                  outroUsuario={null}
                  onEncerrar={() => {
                    /* status atualizado via socket */
                  }}
                />
              </div>
            )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" /> Enviar Receita
          </h3>

          {/* Modo de validação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <button
              type="button"
              onClick={() => setModo('assincrono')}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                modo === 'assincrono'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-sm">Aguardar aprovação</span>
              </div>
              <p className="text-xs text-gray-500">
                Envie a receita e aguarde. O farmacêutico analisa e você
                recebe uma notificação com o resultado.
              </p>
              <p className="text-xs text-blue-500 mt-1">Prazo: até 2 horas úteis</p>
            </button>

            <button
              type="button"
              onClick={() => setModo('chat_ao_vivo')}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                modo === 'chat_ao_vivo'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <MessageCircle className="w-4 h-4 text-green-600" />
                <span className="font-medium text-sm">Chat ao vivo</span>
              </div>
              <p className="text-xs text-gray-500">
                Converse diretamente com o farmacêutico. Esclareça dúvidas,
                corrija problemas e reenvie se necessário.
              </p>
              <p className="text-xs text-green-500 mt-1">
                Resposta imediata quando disponível
              </p>
            </button>
          </div>

          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition"
            >
              <Camera className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="font-semibold text-gray-700 mb-1">
                Clique para selecionar ou tirar foto
              </p>
              <p className="text-xs text-gray-400">
                JPG, PNG ou PDF · Máximo 15MB
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {preview ? (
                <div className="relative">
                  <img
                    src={preview}
                    alt="Preview da receita"
                    className="w-full max-h-80 object-contain rounded-xl border border-gray-200"
                  />
                  <button
                    onClick={removeFile}
                    className="absolute top-2 right-2 bg-white shadow-md rounded-full p-1.5 hover:bg-red-50 transition"
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                  <FileText className="w-8 h-8 text-blue-500" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{file.name}</p>
                    <p className="text-xs text-gray-400">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button onClick={removeFile} className="text-gray-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-secondary transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Enviar Receita
                  </>
                )}
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Important notes */}
      <div className="bg-gray-50 rounded-xl p-5 mb-6">
        <h3 className="font-bold text-sm text-gray-800 mb-3">⚠️ Informações Importantes</h3>
        <ul className="space-y-2 text-xs text-gray-600">
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>A receita será validada pelo farmacêutico responsável da farmácia.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>O entregador irá até seu endereço <strong>buscar a receita física</strong> no ato da entrega.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>Após aprovação, o farmacêutico orienta o entregador sobre os documentos que precisará trazer de volta à farmácia.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>Receitas controladas têm validade máxima de 6 meses.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">•</span>
            <span>Tenha um documento com foto em mãos para o entregador verificar.</span>
          </li>
        </ul>
      </div>

      {/* Continue button */}
      <button
        onClick={() => navigate('/checkout')}
        disabled={rxStatus !== 'Aprovada'}
        className={`w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition ${
          rxStatus === 'Aprovada'
            ? 'bg-primary text-white hover:bg-secondary'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        Continuar para Pagamento
        <ArrowRight className="w-4 h-4" />
      </button>

      {rxStatus !== 'Aprovada' && (
        <p className="text-xs text-gray-400 text-center mt-3">
          {uploaded
            ? rxStatus === 'Rejeitada'
              ? 'Envie uma nova receita para prosseguir'
              : 'Aguarde a aprovação da receita pelo farmacêutico'
            : 'Envie a receita para prosseguir com o pedido'
          }
        </p>
      )}
    </div>
  )
}
