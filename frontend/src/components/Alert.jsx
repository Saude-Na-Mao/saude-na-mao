import { AlertCircle, CheckCircle, Info, XCircle, X } from 'lucide-react'

export default function Alert({ type = 'info', message, onClose }) {
  const styles = {
    info: {
      container: 'bg-blue-50 border-blue-200 text-blue-800',
      icon: 'text-blue-500',
      close: 'text-blue-400 hover:text-blue-600 hover:bg-blue-100',
    },
    success: {
      container: 'bg-green-50 border-green-200 text-green-800',
      icon: 'text-green-500',
      close: 'text-green-400 hover:text-green-600 hover:bg-green-100',
    },
    warning: {
      container: 'bg-amber-50 border-amber-200 text-amber-800',
      icon: 'text-amber-500',
      close: 'text-amber-400 hover:text-amber-600 hover:bg-amber-100',
    },
    error: {
      container: 'bg-red-50 border-red-200 text-red-800',
      icon: 'text-red-500',
      close: 'text-red-400 hover:text-red-600 hover:bg-red-100',
    },
  }

  const icons = {
    info: <Info className={`w-5 h-5 ${styles[type].icon}`} />,
    success: <CheckCircle className={`w-5 h-5 ${styles[type].icon}`} />,
    warning: <AlertCircle className={`w-5 h-5 ${styles[type].icon}`} />,
    error: <XCircle className={`w-5 h-5 ${styles[type].icon}`} />,
  }

  return (
    <div className={`border rounded-xl p-3.5 flex items-start gap-3 animate-slide-down ${styles[type].container}`}>
      <div className="flex-shrink-0 mt-0.5">{icons[type]}</div>
      <span className="flex-1 text-sm leading-relaxed">{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          className={`flex-shrink-0 p-1 rounded-lg transition-colors ${styles[type].close}`}
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
