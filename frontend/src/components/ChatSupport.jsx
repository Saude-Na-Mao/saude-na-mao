import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, MessageCircle, X, Clock, LogOut } from 'lucide-react'
import { supportService } from '../services/api'
import { useAuthStore } from '../stores/store'
import { useSupportChatRealtime } from '../hooks/useSupportChatRealtime'
import {
  setActiveSupportTicket,
  clearActiveSupportTicket,
  getActiveSupportTicket,
} from '../utils/supportTicketStorage'
import Logger from '../utils/logger'

const logger = new Logger('ChatSupport')

const MENU_OPTIONS_CLIENT = [
  { id: 1, label: 'Informações sobre medicamentos', submenu: null },
  { id: 2, label: 'Dúvidas sobre receita', submenu: null },
  { id: 3, label: 'Agendamento com farmacêutico', submenu: null },
  { id: 4, label: 'Rastrear pedido', submenu: null },
  { id: 5, label: 'Suporte Geral', submenu: null },
]

const MENU_OPTIONS_PHARMACY_STAFF = [
  { id: 1, label: 'Suporte técnico do painel', submenu: null },
  { id: 2, label: 'Dúvidas sobre pedidos e status', submenu: null },
  { id: 3, label: 'Dúvidas sobre validação de receita', submenu: null },
  { id: 4, label: 'Problema com chat/atendimento', submenu: null },
  { id: 5, label: 'Outros assuntos da farmácia', submenu: null },
]

const WAITING_MESSAGE = {
  type: 'bot',
  text: 'Você foi conectado à nossa central de atendimento. Um agente responderá em breve.',
  timestamp: new Date(),
}

const CATEGORY_MAP_CLIENT = {
  1: 'duvida_medicamento',
  2: 'receita',
  3: 'outro',
  4: 'entrega',
  5: 'outro',
}

const CATEGORY_MAP_PHARMACY_STAFF = {
  1: 'outro',
  2: 'entrega',
  3: 'receita',
  4: 'outro',
  5: 'outro',
}

export default function ChatSupport() {
  const { token, user } = useAuthStore()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [selectedOption, setSelectedOption] = useState(null)
  const [isWaiting, setIsWaiting] = useState(false)
  const [ticketId, setTicketId] = useState(null)
  const [chatClosed, setChatClosed] = useState(false)
  const [sendingMsg, setSendingMsg] = useState(false)
  const messagesEndRef = useRef(null)
  const isPharmacyStaff = ['farmaceutico', 'dono_farmacia'].includes(user?.role)
  const userId = user?.id || user?._id

  const appendStaffMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg])
  }, [])

  const handleTicketClosed = useCallback(() => {
    setChatClosed(true)
  }, [])

  const { unreadCount, setLastMsgCount, syncTicketFromApi } = useSupportChatRealtime({
    token: isPharmacyStaff ? null : token,
    userId: isPharmacyStaff ? null : userId,
    ticketId,
    isChatOpen: isOpen,
    onStaffMessage: appendStaffMessage,
    onTicketClosed: handleTicketClosed,
  })
  const activeMenuOptions = isPharmacyStaff
    ? MENU_OPTIONS_PHARMACY_STAFF
    : MENU_OPTIONS_CLIENT
  const activeCategoryMap = isPharmacyStaff
    ? CATEGORY_MAP_PHARMACY_STAFF
    : CATEGORY_MAP_CLIENT
  const welcomeMessage = {
    type: 'bot',
    text: isPharmacyStaff
      ? 'Olá! Bem-vindo ao suporte interno da farmácia.\n\nEscolha uma opção abaixo:'
      : 'Olá! Bem-vindo ao suporte Saúde na Mão.\n\nEscolha uma opção abaixo:',
    timestamp: new Date(),
    showMenu: true,
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!token || isPharmacyStaff || ticketId) return
    const stored = getActiveSupportTicket()
    if (stored) {
      setTicketId(stored)
    }
  }, [token, isPharmacyStaff, ticketId])

  const handleOpenChat = async () => {
    setIsOpen(true)
    if (messages.length === 0) {
      setMessages([welcomeMessage])
    }
    if (ticketId && token) {
      await syncTicketFromApi(ticketId)
    }
  }

  const handleSelectOption = async (option) => {
    const userMessage = {
      type: 'user',
      text: `${option.id}. ${option.label}`,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setSelectedOption(option)
    setIsWaiting(true)
    setInputValue('')

    if (token && !ticketId) {
      try {
        const res = await supportService.send({
          assunto: option.label || 'Suporte Geral',
          categoria: activeCategoryMap[option.id] || 'outro',
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
      setMessages((prev) => [
        ...prev,
        {
          type: 'bot',
          text: `Você selecionou: "${option.label}"\n\n${WAITING_MESSAGE.text}`,
          timestamp: new Date(),
        },
      ])
      setIsWaiting(false)
      logger.info('Chat option selected', { optionId: option.id, label: option.label })
    }, 500)
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || chatClosed || sendingMsg) return

    if (!token) {
      setMessages(prev => [...prev, {
        type: 'bot',
        text: 'Faça login para usar o chat de suporte.',
        timestamp: new Date(),
      }])
      setInputValue('')
      return
    }

    const text = inputValue.trim()
    setMessages(prev => [...prev, { type: 'user', text, timestamp: new Date() }])
    setInputValue('')
    setSendingMsg(true)

    if (!ticketId) {
      try {
        const res = await supportService.send({
          assunto: selectedOption?.label || 'Suporte Geral',
          categoria: activeCategoryMap[selectedOption?.id] || 'outro',
          mensagemInicial: text,
        })
        const ticket = res.data?.data?.ticket || res.data?.data
        if (ticket?._id) {
          setTicketId(ticket._id)
          setActiveSupportTicket(ticket._id)
          setLastMsgCount((ticket.mensagens || []).length)
          setMessages(prev => [...prev, {
            type: 'bot',
            text: 'Chamado criado. Um farmacêutico irá responder em breve.',
            timestamp: new Date(),
          }])
        }
      } catch {
        setMessages(prev => [...prev, {
          type: 'bot',
          text: 'Erro ao criar chamado. Tente novamente.',
          timestamp: new Date(),
        }])
      }
    } else {
      try {
        await supportService.sendMessage(ticketId, { texto: text })
        setLastMsgCount((n) => n + 1)
      } catch {
        setMessages(prev => [...prev, {
          type: 'bot',
          text: 'Erro ao enviar mensagem. Tente novamente.',
          timestamp: new Date(),
        }])
      }
    }
    setSendingMsg(false)
    logger.info('Message sent to support', { messageLength: text.length })
  }

  const handleCloseChat = async () => {
    if (!ticketId) return
    try {
      await supportService.closeTicket(ticketId)
      clearActiveSupportTicket()
      setChatClosed(true)
      setMessages(prev => [...prev, {
        type: 'bot',
        text: 'Chamado finalizado. Obrigado pelo contato.',
        timestamp: new Date(),
      }])
    } catch {}
  }

  const handleReset = () => {
    clearActiveSupportTicket()
    setMessages([welcomeMessage])
    setSelectedOption(null)
    setIsWaiting(false)
    setInputValue('')
    setTicketId(null)
    setChatClosed(false)
    setLastMsgCount(0)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
      {isOpen && (
        <div className="fixed inset-x-3 bottom-20 flex h-[min(78svh,600px)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl sm:static sm:mb-4 sm:w-96 sm:max-w-[calc(100vw-2rem)]">
          <div className="bg-gradient-to-r from-green-500 to-blue-500 text-white p-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <MessageCircle size={20} />
              <div>
                <h3 className="font-bold text-sm">Suporte Saúde na Mão</h3>
                <p className="text-xs text-green-50">Online • Resposta rápida</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="hover:bg-white hover:bg-opacity-20 p-1 rounded transition"
              aria-label="Fechar chat"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((message, index) => (
              <div key={index}>
                {message.type === 'bot' ? (
                  <div className="flex justify-start mb-2">
                    <div className="bg-blue-100 text-gray-800 rounded-lg rounded-tl-none px-4 py-3 max-w-xs text-sm">
                      <p className="whitespace-pre-wrap">{message.text}</p>
                      {message.showMenu && (
                        <div className="mt-3 space-y-2">
                          {activeMenuOptions.map((option) => (
                            <button
                              key={option.id}
                              onClick={() => handleSelectOption(option)}
                              className="w-full text-left px-3 py-2 rounded bg-white border border-blue-300 hover:bg-blue-50 text-gray-800 text-xs font-medium transition hover:border-blue-500"
                            >
                              <span className="font-bold text-blue-600 mr-2">{option.id}.</span>
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(message.timestamp).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end mb-2">
                    <div className="bg-green-500 text-white rounded-lg rounded-tr-none px-4 py-3 max-w-xs text-sm">
                      <p className="break-words">{message.text}</p>
                      <p className="text-xs text-green-100 mt-2">
                        {new Date(message.timestamp).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isWaiting && (
              <div className="flex justify-start mb-2">
                <div className="flex items-center gap-2 text-gray-600 text-sm">
                  <Clock size={16} className="animate-spin" />
                  <span>Aguardando resposta...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {selectedOption && (
            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
              {ticketId && !chatClosed && (
                <button
                  onClick={handleCloseChat}
                  className="w-full flex items-center justify-center gap-1 text-sm text-red-600 hover:text-red-800 font-medium hover:underline transition mb-1"
                >
                  <LogOut size={14} /> Finalizar Chat
                </button>
              )}
              {chatClosed ? (
                <button
                  onClick={handleReset}
                  className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium hover:underline transition"
                >
                  Iniciar Novo Chat
                </button>
              ) : !ticketId ? (
                <button
                  onClick={handleReset}
                  className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium hover:underline transition"
                >
                  Voltar ao menu principal
                </button>
              ) : null}
            </div>
          )}

          <div className="border-t border-gray-200 p-3 bg-white">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Digite sua mensagem..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                disabled={!selectedOption || chatClosed || sendingMsg}
                aria-label="Campo de mensagem"
              />
              <button
                onClick={handleSendMessage}
                disabled={!selectedOption || !inputValue.trim() || chatClosed || sendingMsg}
                className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg px-3 py-2 transition flex items-center justify-center gap-1 shrink-0"
                aria-label="Enviar mensagem"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {!isOpen && (
        <button
          onClick={handleOpenChat}
          className="relative bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition transform hover:scale-110"
          aria-label="Abrir suporte por chat"
        >
          <MessageCircle size={28} />
          {!isPharmacyStaff && unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-xs font-bold"
              aria-label={`${unreadCount} mensagens não lidas`}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
