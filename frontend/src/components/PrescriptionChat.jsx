import { useEffect, useRef, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import {
  MessageCircle,
  Send,
  Image as ImageIcon,
  Paperclip,
  X,
  CheckCircle,
  XCircle,
  Loader,
} from 'lucide-react'
import { useAuthStore } from '../stores/store'
import { prescriptionService } from '../services/api'
import { getApiErrorMessage } from '../utils/apiErrorMessage'
import { getSocketUrl } from '../config/env'
import Modal from './Modal'

function formatHora(value) {
  if (!value) return ''
  try {
    const d = new Date(value)
    return d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function PrescriptionChat({
  prescriptionId,
  chatSessaoId,
  urlImagemReceita,
  outroUsuario,
  onEncerrar,
}) {
  const { user, token } = useAuthStore()
  const [mensagens, setMensagens] = useState([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [outroDigitando, setOutroDigitando] = useState(false)
  const [encerrado, setEncerrado] = useState(false)
  const [statusFinal, setStatusFinal] = useState(null)
  const [imagemAtual, setImagemAtual] = useState(urlImagemReceita || null)
  const [reuploading, setReuploading] = useState(false)
  const [confirmandoEncerramento, setConfirmandoEncerramento] = useState(false)
  const [decisaoFarmaceutico, setDecisaoFarmaceutico] = useState('sem_decisao')
  const [observacoesEncerramento, setObservacoesEncerramento] = useState('')
  const [previewImagemAberto, setPreviewImagemAberto] = useState(false)

  const formatarErroReceita = (msg) => {
    const texto = String(msg || '')
    if (texto.includes('já foi utilizada em um pedido anterior')) {
      return 'Este arquivo de receita já foi usado em um pedido ativo. Envie uma nova foto/arquivo da receita.'
    }
    return texto || 'tente novamente.'
  }

  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const socketRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  const tipoUsuario =
    user?.tipo_usuario || user?.role || 'usuario'
  const isFarmaceutico =
    tipoUsuario === 'farmaceutico' ||
    tipoUsuario === 'administrador' ||
    tipoUsuario === 'admin'

  useEffect(() => {
    if (!prescriptionId) return
    const carregarChat = async () => {
      try {
        const res = await prescriptionService.getForChat(prescriptionId)
        const receita = res?.data?.data?.receita
        if (!receita) return
        setMensagens(Array.isArray(receita.chat_mensagens) ? receita.chat_mensagens : [])
        if (receita.url_imagem_publica) setImagemAtual(receita.url_imagem_publica)
        setEncerrado(!!receita.chat_encerrado)
        if (receita.status) setStatusFinal(receita.status)
      } catch {
        // Silencioso: o fluxo principal de chat continua por socket
      }
    }
    carregarChat()
  }, [prescriptionId])

  // Conecta ao socket e entra na sala do chat
  useEffect(() => {
    if (!chatSessaoId || !token) return

    const socket = io(getSocketUrl(), { auth: { token }, transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join:prescription-chat', {
        chat_sessao_id: chatSessaoId,
        userId: user?.id,
      })
    })

    socket.on('chat:message', (msg) => {
      setMensagens((prev) => [...prev, msg])
    })

    socket.on('prescription-chat:typing', ({ isTyping }) => {
      setOutroDigitando(!!isTyping)
    })

    socket.on('chat:prescription_image_updated', (payload) => {
      if (payload?.url_imagem_publica) {
        setImagemAtual(payload.url_imagem_publica)
      }
    })

    socket.on('chat:closed', (payload) => {
      setEncerrado(true)
      if (payload?.novoStatusReceita) {
        setStatusFinal(payload.novoStatusReceita)
      }
      setMensagens((prev) => [
        ...prev,
        {
          tipoRemetente: 'sistema',
          texto: `Chat encerrado por ${payload?.encerradoPor || 'um participante'}.${
            payload?.novoStatusReceita
              ? ' Receita: ' + payload.novoStatusReceita + '.'
              : ''
          }`,
          enviado_em: payload?.encerradoEm || new Date(),
        },
      ])
    })

    return () => {
      try {
        socket.emit('leave:prescription-chat', {
          chat_sessao_id: chatSessaoId,
        })
      } catch {
        /* ignore */
      }
      socket.disconnect()
      socketRef.current = null
    }
  }, [chatSessaoId, token, user?.id])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, outroDigitando])

  const enviarMensagem = useCallback(async () => {
    const conteudo = texto.trim()
    if (!conteudo || encerrado) return

    try {
      setEnviando(true)
      await prescriptionService.sendChatMessage(prescriptionId, conteudo)
      setTexto('')
      // Cancela imediatamente o "digitando"
      socketRef.current?.emit('prescription-chat:typing', {
        chat_sessao_id: chatSessaoId,
        isTyping: false,
        tipoRemetente: tipoUsuario,
      })
    } catch (err) {
      setMensagens((prev) => [
        ...prev,
        {
          tipoRemetente: 'sistema',
          texto: `Erro ao enviar: ${getApiErrorMessage(err, 'tente novamente.')}`,
          enviado_em: new Date(),
        },
      ])
    } finally {
      setEnviando(false)
    }
  }, [texto, encerrado, prescriptionId, chatSessaoId, tipoUsuario])

  const handleTextoChange = (e) => {
    const v = e.target.value
    setTexto(v)

    if (encerrado || !chatSessaoId) return

    socketRef.current?.emit('prescription-chat:typing', {
      chat_sessao_id: chatSessaoId,
      isTyping: true,
      tipoRemetente: tipoUsuario,
    })

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('prescription-chat:typing', {
        chat_sessao_id: chatSessaoId,
        isTyping: false,
        tipoRemetente: tipoUsuario,
      })
    }, 1000)
  }

  const handleReupload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setReuploading(true)
      const res = await prescriptionService.reuploadChatImage(prescriptionId, file)
      const novaUrl = res?.data?.data?.receita?.url_imagem_publica
      if (novaUrl) setImagemAtual(novaUrl)
    } catch (err) {
      setMensagens((prev) => [
        ...prev,
        {
          tipoRemetente: 'sistema',
          texto: `Erro ao reenviar receita: ${formatarErroReceita(getApiErrorMessage(err, 'tente novamente.'))}`,
          enviado_em: new Date(),
        },
      ])
    } finally {
      setReuploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const encerrarChat = async (payload = {}) => {
    try {
      const res = await prescriptionService.closeChat(prescriptionId, payload)
      const receitaAtualizada = res?.data?.data?.receita
      if (receitaAtualizada?.status) setStatusFinal(receitaAtualizada.status)
      setEncerrado(true)
    } catch (err) {
      setMensagens((prev) => [
        ...prev,
        {
          tipoRemetente: 'sistema',
          texto: `Erro ao encerrar: ${getApiErrorMessage(err, 'tente novamente.')}`,
          enviado_em: new Date(),
        },
      ])
    }
  }

  const handleEncerrarUsuario = async () => {
    const ok = window.confirm(
      'Tem certeza? O farmacêutico não poderá mais responder.',
    )
    if (!ok) return
    await encerrarChat({ motivo_encerramento: 'Encerrado pelo paciente' })
  }

  const handleEncerrarFarmaceutico = async () => {
    if (decisaoFarmaceutico === 'rejeitar' && !observacoesEncerramento.trim()) {
      setMensagens((prev) => [
        ...prev,
        {
          tipoRemetente: 'sistema',
          texto: 'Para rejeitar é obrigatório informar o motivo.',
          enviado_em: new Date(),
        },
      ])
      return
    }
    const payload = {
      motivo_encerramento:
        decisaoFarmaceutico === 'sem_decisao'
          ? 'Encerrado pelo farmacêutico sem decisão'
          : `Encerrado pelo farmacêutico (${
              decisaoFarmaceutico === 'aprovar' ? 'aprovado' : 'rejeitado'
            })`,
    }
    if (decisaoFarmaceutico === 'aprovar') {
      payload.aprovado = true
      payload.observacoes = observacoesEncerramento.trim() || undefined
    } else if (decisaoFarmaceutico === 'rejeitar') {
      payload.aprovado = false
      payload.observacoes = observacoesEncerramento.trim()
    }
    await encerrarChat(payload)
    setConfirmandoEncerramento(false)
  }

  const meuId = String(user?.id || user?._id || '')

  return (
    <div className="flex flex-col h-[70vh] max-h-[70vh] gap-3">
      {/* Topo: imagem da receita */}
      <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-2">
        {imagemAtual ? (
          <img
            src={imagemAtual}
            alt="Receita"
            className="w-16 h-16 object-cover rounded cursor-pointer"
            onClick={() => setPreviewImagemAberto(true)}
          />
        ) : (
          <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-gray-400" />
          </div>
        )}
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-semibold truncate">
            {outroUsuario?.nome
              ? `Conversando com ${outroUsuario.nome}`
              : 'Chat ao vivo da receita'}
          </p>
          {imagemAtual && (
            <button
              onClick={() => setPreviewImagemAberto(true)}
              className="text-xs text-blue-600 hover:underline"
            >
              Ver receita em tamanho real
            </button>
          )}
        </div>
        {!encerrado && (
          <button
            onClick={() => {
              if (isFarmaceutico) {
                setConfirmandoEncerramento(true)
              } else {
                handleEncerrarUsuario()
              }
            }}
            className="text-xs px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 inline-flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Encerrar chat
          </button>
        )}
      </div>

      {/* Banner de status final */}
      {encerrado && (
        <div
          className={`text-sm rounded-lg p-3 border ${
            statusFinal === 'Aprovada'
              ? 'bg-green-50 border-green-200 text-green-700'
              : statusFinal === 'Rejeitada'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}
        >
          Chat encerrado{statusFinal ? ` — Receita: ${statusFinal}` : ''}.
          <button
            onClick={onEncerrar}
            className="ml-2 underline font-semibold"
          >
            Voltar
          </button>
        </div>
      )}

      {/* Área de mensagens */}
      <div className="flex-1 overflow-y-auto bg-white border border-gray-100 rounded-lg p-3 flex flex-col gap-2">
        {mensagens.length === 0 && (
          <div className="text-center text-xs text-gray-400 mt-4 flex flex-col items-center gap-2">
            <MessageCircle className="w-6 h-6 text-gray-300" />
            Aguardando o início da conversa...
          </div>
        )}
        {mensagens.map((m, idx) => {
          const isMe = String(m.remetenteId || '') === meuId
          const isSistema = m.tipoRemetente === 'sistema'
          if (isSistema) {
            return (
              <div
                key={idx}
                className="text-center text-gray-400 text-xs italic my-1"
              >
                {m.texto}{' '}
                <span className="opacity-60">{formatHora(m.enviado_em)}</span>
              </div>
            )
          }
          return (
            <div
              key={idx}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  isMe
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {!isMe && m.nomeRemetente && (
                  <p className="text-xs font-bold opacity-70 mb-0.5">
                    {m.nomeRemetente}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                <p
                  className={`text-[10px] text-right mt-0.5 ${
                    isMe ? 'opacity-70' : 'text-gray-400'
                  }`}
                >
                  {formatHora(m.enviado_em)}
                </p>
              </div>
            </div>
          )
        })}
        {outroDigitando && (
          <div className="text-xs text-gray-400 italic flex items-center gap-1">
            <Loader className="w-3 h-3 animate-spin" />
            {isFarmaceutico ? 'Paciente' : 'Farmacêutico'} está digitando...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Modal in-place de encerramento do farmacêutico */}
      {confirmandoEncerramento && (
        <div className="bg-white border-2 border-blue-200 rounded-lg p-3 space-y-2">
          <p className="font-semibold text-sm">Encerrar chat</p>
          <div className="space-y-1 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={decisaoFarmaceutico === 'sem_decisao'}
                onChange={() => setDecisaoFarmaceutico('sem_decisao')}
              />
              Encerrar sem decisão
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={decisaoFarmaceutico === 'aprovar'}
                onChange={() => setDecisaoFarmaceutico('aprovar')}
              />
              Encerrar e <strong className="text-green-700">APROVAR</strong>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={decisaoFarmaceutico === 'rejeitar'}
                onChange={() => setDecisaoFarmaceutico('rejeitar')}
              />
              Encerrar e <strong className="text-red-700">REJEITAR</strong>
            </label>
          </div>
          {decisaoFarmaceutico !== 'sem_decisao' && (
            <textarea
              value={observacoesEncerramento}
              onChange={(e) => setObservacoesEncerramento(e.target.value)}
              placeholder={
                decisaoFarmaceutico === 'rejeitar'
                  ? 'Motivo da rejeição (obrigatório)'
                  : 'Observações para o paciente (opcional)'
              }
              className="w-full border rounded-lg p-2 text-sm h-20 resize-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setConfirmandoEncerramento(false)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleEncerrarFarmaceutico}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}

      {/* Caixa de envio + reupload */}
      {!encerrado && (
        <div className="flex items-end gap-2">
          {!isFarmaceutico && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={handleReupload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={reuploading}
                className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                title="Reenviar receita"
              >
                {reuploading ? (
                  <Loader className="w-5 h-5 animate-spin text-gray-500" />
                ) : (
                  <Paperclip className="w-5 h-5 text-gray-500" />
                )}
              </button>
            </>
          )}
          <textarea
            value={texto}
            onChange={handleTextoChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                enviarMensagem()
              }
            }}
            placeholder="Digite sua mensagem..."
            rows={1}
            className="flex-1 resize-none border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={enviarMensagem}
            disabled={!texto.trim() || enviando}
            className="p-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Enviar"
          >
            {enviando ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      )}

      {/* Botões de status final do farmacêutico (atalho) */}
      {!encerrado && isFarmaceutico && (
        <div className="flex gap-2 text-xs">
          <button
            onClick={() => {
              setDecisaoFarmaceutico('aprovar')
              setConfirmandoEncerramento(true)
            }}
            className="flex-1 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg hover:bg-green-100 inline-flex items-center justify-center gap-1"
          >
            <CheckCircle className="w-4 h-4" /> Encerrar e aprovar
          </button>
          <button
            onClick={() => {
              setDecisaoFarmaceutico('rejeitar')
              setConfirmandoEncerramento(true)
            }}
            className="flex-1 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 inline-flex items-center justify-center gap-1"
          >
            <XCircle className="w-4 h-4" /> Encerrar e rejeitar
          </button>
        </div>
      )}

      <Modal
        isOpen={previewImagemAberto}
        onClose={() => setPreviewImagemAberto(false)}
        title="Receita médica"
        size="xl"
      >
        <div className="flex flex-col items-center gap-3">
          {imagemAtual &&
          (imagemAtual.toLowerCase().endsWith('.pdf') ||
            imagemAtual.includes('application/pdf')) ? (
            <iframe
              src={imagemAtual}
              className="w-full rounded border"
              style={{ height: '75vh' }}
              title="Receita em PDF"
            />
          ) : (
            <div
              className="overflow-auto w-full flex justify-center"
              style={{ maxHeight: '75vh' }}
            >
              <img
                src={imagemAtual}
                alt="Receita médica em tamanho real"
                className="max-w-full h-auto rounded shadow-md"
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
