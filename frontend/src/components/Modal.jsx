import { useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const closeRef = useRef(null)
  const wasOpenRef = useRef(false)

  const handleEscape = useCallback((e) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
      // Foca apenas quando o modal passa de fechado para aberto
      if (!wasOpenRef.current) {
        setTimeout(() => closeRef.current?.focus(), 50)
      }
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleEscape])

  useEffect(() => {
    wasOpenRef.current = isOpen
  }, [isOpen])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] h-[calc(100vh-1rem)] sm:h-[calc(100vh-2rem)]',
  }
  const isFull = size === 'full'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div role="dialog" aria-modal="true" aria-labelledby={title ? 'modal-title' : undefined} className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizeClasses[size] || sizeClasses.md} ${isFull ? 'max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)]' : 'max-h-[90vh]'} flex flex-col animate-slide-up`}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 id="modal-title" className="text-lg font-bold text-gray-900">{title}</h2>
            <button
              ref={closeRef}
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}

export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirmar', variant = 'primary' }) {
  const variantClasses = {
    primary: 'bg-primary hover:bg-secondary text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-gray-600 text-sm mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold hover:bg-gray-50 transition"
        >
          Cancelar
        </button>
        <button
          onClick={() => { onConfirm(); onClose() }}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${variantClasses[variant] || variantClasses.primary}`}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  )
}
