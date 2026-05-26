import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supportService } from '../services/api'
import { useAuthStore } from '../stores/store'
import { useSupportChatRealtime } from '../hooks/useSupportChatRealtime'
import {
  setActiveSupportTicket,
  clearActiveSupportTicket,
} from '../utils/supportTicketStorage'
import Alert from '../components/Alert'
import { Send, MessageCircle, Clock, Mail, X, LogOut } from 'lucide-react'
import Logger from '../utils/logger'

const logger = new Logger('Suporte')

const CHAT_OPTIONS = [
  { id: 1, label: 'Dúvida sobre Medicamentos', response: 'Ótimo! Qual medicamento você gostaria de saber mais?' },
  { id: 2, label: 'Problema com Entrega', response: 'Desculpe pelo inconveniente. Vou ajudar você com seu pedido!' },
  { id: 3, label: 'Dúvida sobre Receita', response: 'Posso ajudar com sua dúvida sobre receita médica.' },
  { id: 4, label: 'Agendamento com Farmacêutico', response: 'Ótimo! Deixe-me conectar você a um farmacêutico disponível.' },
  { id: 5, label: 'Suporte Geral', response: 'Como posso ajudá-lo melhor?' },
]

const CATEGORY_MAP = {
  1: 'duvida_medicamento',
  2: 'entrega',
  3: 'receita',
  4: 'outro',
  5: 'outro',
}

export default function Suporte() {
  const { token, user } = useAuthStore()
  const userId = user?.id || user?._id
  const location = useLocation()
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    assunto: '',
    mensagem: '',
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [showChat, setShowChat] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [chatMessages, setChatMessages] = useState([
    {
      type: 'bot',
      text: 'Olá! 👋 Bem-vindo ao suporte Saúde na Mão.\n\nEscolha uma opção abaixo:',
      timestamp: new Date(),
    },
  ])
  const [selectedOption, setSelectedOption] = useState(null)
  const [chatInput, setChatInput] = useState('')
  const [ticketId, setTicketId] = useState(null)
  const [chatClosed, setChatClosed] = useState(false)
  const [sendingChat, setSendingChat] = useState(false)
  const chatEndRef = useRef(null)

  const appendStaffMessage = useCallback((msg) => {
    setChatMessages((prev) => [...prev, msg])
  }, [])

  const handleTicketClosed = useCallback(() => {
    setChatClosed(true)
  }, [])

  const { setLastMsgCount } = useSupportChatRealtime({
    token,
    userId,
    ticketId,
    isChatOpen: showChat,
    onStaffMessage: appendStaffMessage,
    onTicketClosed: handleTicketClosed,
  })

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages])

  /** Abre o chat no Centro de Suporte quando o utilizador vem do modal do produto (Iniciar chat). */
  useEffect(() => {
    const openTicketId = location.state?.openTicketId
    if (!openTicketId || !token) return undefined

    let cancelled = false
    ;(async () => {
      try {
        const res = await supportService.getById(openTicketId)
        const ticket = res.data?.data?.ticket || res.data?.data
        if (!ticket || cancelled) return

        const syntheticOption = {
          id: 1,
          label: ticket.assunto || 'Dúvida sobre medicamento',
          response: '',
        }

        const mapMsg = (m) => {
          const ts = m.enviado_em ? new Date(m.enviado_em) : new Date()
          if (m.tipo_remetente === 'usuario') {
            return { type: 'user', text: m.texto, timestamp: ts }
          }
          if (m.tipo_remetente === 'sistema') {
            return { type: 'bot', text: m.texto, timestamp: ts }
          }
          if (m.tipo_remetente === 'farmaceutico' || m.tipo_remetente === 'admin') {
            return {
              type: 'bot',
              text:
                m.tipo_remetente === 'farmaceutico'
                  ? `👨‍⚕️ Farmacêutico: ${m.texto}`
                  : m.texto,
              timestamp: ts,
            }
          }
          return { type: 'bot', text: m.texto, timestamp: ts }
        }

        const rawMsgs = Array.isArray(ticket.mensagens) ? ticket.mensagens : []
        const uiMessages = rawMsgs.map(mapMsg)

        setShowChat(true)
        setTicketId(ticket._id)
        setActiveSupportTicket(ticket._id)
        setSelectedOption(syntheticOption)
        setChatClosed(String(ticket.status) === 'encerrada')
        setChatMessages(
          uiMessages.length > 0
            ? uiMessages
            : [
                {
                  type: 'bot',
                  text: 'Conversa carregada. Envie sua próxima mensagem abaixo.',
                  timestamp: new Date(),
                },
              ],
        )
        setLastMsgCount(rawMsgs.length)

        navigate(location.pathname, { replace: true, state: {} })
      } catch (e) {
        if (!cancelled) {
          logger.error('Erro ao abrir ticket a partir do produto', e)
          setError('Não foi possível abrir o chat. Use o chat no Centro de Suporte.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [location.state?.openTicketId, token, location.pathname, navigate])

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await supportService.send(formData)
      setMessage('Mensagem enviada com sucesso! Responderemos em breve.')
      setFormData({ nome: '', email: '', assunto: '', mensagem: '' })
      setShowEmailForm(false)

      setTimeout(() => setMessage(null), 5000)
    } catch (err) {
      setError(err.response?.data?.message || 'Erro ao enviar mensagem')
      logger.error('Error sending support message', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectChatOption = async (option) => {
    const userMessage = {
      type: 'user',
      text: `${option.id}. ${option.label}`,
      timestamp: new Date(),
    }

    setChatMessages((prev) => [...prev, userMessage])
    setSelectedOption(option)

    if (token && !ticketId) {
      try {
        const res = await supportService.send({
          assunto: option.label,
          categoria: CATEGORY_MAP[option.id] || 'outro',
          mensagemInicial: `${option.id}. ${option.label}`,
        })
        const ticket = res.data?.data?.ticket || res.data?.data
        if (ticket?._id) {
          setTicketId(ticket._id)
          setActiveSupportTicket(ticket._id)
          setLastMsgCount((ticket.mensagens || []).length)
        }
      } catch {}
    }

    setTimeout(() => {
      const botMessage = {
        type: 'bot',
        text: option.response,
        timestamp: new Date(),
      }
      setChatMessages((prev) => [...prev, botMessage])
      logger.debug('Chat option selected', { optionId: option.id })
    }, 800)
  }

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || !selectedOption || chatClosed || sendingChat) return

    if (!token) {
      setChatMessages(prev => [...prev, {
        type: 'bot',
        text: '⚠️ Você precisa estar logado para usar o chat. Faça login primeiro.',
        timestamp: new Date(),
      }])
      setChatInput('')
      return
    }

    const text = chatInput.trim()
    setChatMessages(prev => [...prev, { type: 'user', text, timestamp: new Date() }])
    setChatInput('')
    setSendingChat(true)

    if (!ticketId) {
      try {
        const res = await supportService.send({
          assunto: selectedOption.label,
          categoria: CATEGORY_MAP[selectedOption.id] || 'outro',
          mensagemInicial: text,
        })
        const ticket = res.data?.data?.ticket || res.data?.data
        if (ticket?._id) {
          setTicketId(ticket._id)
          setActiveSupportTicket(ticket._id)
          setLastMsgCount((ticket.mensagens || []).length)
          setChatMessages(prev => [...prev, {
            type: 'bot',
            text: '✅ Seu chamado foi criado com sucesso! Um farmacêutico irá responder em breve.',
            timestamp: new Date(),
          }])
        }
      } catch (err) {
        setChatMessages(prev => [...prev, {
          type: 'bot',
          text: '❌ Erro ao criar chamado. Tente novamente.',
          timestamp: new Date(),
        }])
      }
    } else {
      try {
        await supportService.sendMessage(ticketId, { texto: text })
        setLastMsgCount((n) => n + 1)
      } catch (err) {
        setChatMessages(prev => [...prev, {
          type: 'bot',
          text: '❌ Erro ao enviar mensagem. Tente novamente.',
          timestamp: new Date(),
        }])
      }
    }
    setSendingChat(false)
  }

  const handleCloseChat = async () => {
    if (!ticketId) return
    try {
      await supportService.closeTicket(ticketId)
      clearActiveSupportTicket()
      setChatClosed(true)
      setChatMessages(prev => [...prev, {
        type: 'bot',
        text: '✅ Chamado finalizado com sucesso. Obrigado pelo contato!',
        timestamp: new Date(),
      }])
    } catch {}
  }

  const handleReset = () => {
    clearActiveSupportTicket()
    setChatMessages([
      {
        type: 'bot',
        text: 'Olá! 👋 Bem-vindo ao suporte Saúde na Mão.\n\nEscolha uma opção abaixo:',
        timestamp: new Date(),
      },
    ])
    setSelectedOption(null)
    setChatInput('')
    setTicketId(null)
    setChatClosed(false)
    setLastMsgCount(0)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendChatMessage()
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Centro de Suporte</h1>
        <p className="text-gray-600 text-lg">Estamos aqui para ajudar você 24/7</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="font-bold text-lg mb-2">Chat em Tempo Real</h3>
          <p className="text-gray-600 mb-4">Converse com nosso time de suporte</p>
          <button
            onClick={() => setShowChat(!showChat)}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition"
          >
            {showChat ? 'Fechar Chat' : 'Abrir Chat'}
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="font-bold text-lg mb-2">Email</h3>
          <p className="text-gray-600 mb-4">Envie um email para nossa equipe</p>
          <button
            onClick={() => setShowEmailForm(!showEmailForm)}
            className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition"
          >
            {showEmailForm ? 'Fechar' : 'Enviar Email'}
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-purple-600" />
          </div>
          <h3 className="font-bold text-lg mb-2">Telefone</h3>
          <p className="text-gray-600 mb-4">Seg-Sex: 08:00 - 18:00</p>
          <a
            href="tel:0800123456"
            className="bg-purple-500 text-white px-6 py-2 rounded-lg hover:bg-purple-600 transition inline-block"
          >
            0800 123 456
          </a>
        </div>
      </div>

      {showChat && (
        <div className="bg-white rounded-lg shadow-lg p-6 mb-12 max-w-2xl mx-auto border border-gray-200">
          <div className="h-96 overflow-y-auto border rounded-lg p-4 bg-gray-50 mb-4 space-y-4">
            {chatMessages.map((msg, index) => (
              <div key={index}>
                {msg.type === 'bot' ? (
                  <div className="flex justify-start mb-2">
                    <div className="bg-blue-100 text-gray-800 rounded-lg rounded-tl-none px-4 py-3 max-w-sm">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
                      {msg.text.includes('Bem-vindo') && (
                        <div className="mt-3 space-y-2">
                          {CHAT_OPTIONS.map((option) => (
                            <button
                              key={option.id}
                              onClick={() => handleSelectChatOption(option)}
                              className="w-full text-left px-3 py-2 rounded bg-white border border-blue-300 hover:bg-blue-50 text-gray-800 text-xs font-medium transition hover:border-blue-500"
                            >
                              <span className="font-bold text-blue-600 mr-2">{option.id}.</span>
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        {msg.timestamp.toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end mb-2">
                    <div className="bg-green-500 text-white rounded-lg rounded-tr-none px-4 py-3 max-w-sm">
                      <p className="text-sm break-words">{msg.text}</p>
                      <p className="text-xs text-green-100 mt-2">
                        {msg.timestamp.toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {selectedOption && (
            <div className="mb-4 flex justify-between items-center px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-sm text-gray-700">
                <strong>{selectedOption.label}</strong>
                {ticketId && <span className="ml-2 text-xs text-green-600">(Chamado aberto)</span>}
              </span>
              {!ticketId && (
                <button
                  onClick={handleReset}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium hover:underline"
                >
                  ← Voltar ao Menu
                </button>
              )}
            </div>
          )}

          {selectedOption && !chatClosed && (
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Digite sua mensagem..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                disabled={sendingChat}
              />
              <button
                onClick={handleSendChatMessage}
                disabled={!chatInput.trim() || sendingChat}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 transition"
              >
                <Send size={18} />
              </button>
            </div>
          )}

          {ticketId && !chatClosed && (
            <button
              onClick={handleCloseChat}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition text-sm font-medium"
            >
              <LogOut size={16} /> Finalizar Chat
            </button>
          )}

          {chatClosed && (
            <button
              onClick={handleReset}
              className="mt-3 w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm font-medium"
            >
              Iniciar Novo Chat
            </button>
          )}
        </div>
      )}

      {showEmailForm && (
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-8 mb-12 border border-green-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Envie-nos uma Mensagem</h2>
            <button
              onClick={() => setShowEmailForm(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={24} />
            </button>
          </div>

          {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
          {message && <Alert type="success" message={message} />}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nome</label>
                <input
                  type="text"
                  name="nome"
                  value={formData.nome}
                  onChange={handleChange}
                  placeholder="Seu nome"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  disabled={loading}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="seu@email.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Assunto</label>
              <select
                name="assunto"
                value={formData.assunto}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                disabled={loading}
                required
              >
                <option value="">Selecione um assunto</option>
                <option value="pedido">Dúvida sobre pedido</option>
                <option value="entrega">Problema de entrega</option>
                <option value="produto">Dúvida sobre produto</option>
                <option value="pagamento">Problema de pagamento</option>
                <option value="outro">Outro</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mensagem</label>
              <textarea
                name="mensagem"
                value={formData.mensagem}
                onChange={handleChange}
                placeholder="Descreva seu problema ou dúvida"
                rows="5"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                disabled={loading}
                required
              />
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-bold py-2 rounded-lg transition flex items-center justify-center gap-2"
              >
                <Send size={18} />
                {loading ? 'Enviando...' : 'Enviar Mensagem'}
              </button>
              <button
                type="button"
                onClick={() => setShowEmailForm(false)}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
