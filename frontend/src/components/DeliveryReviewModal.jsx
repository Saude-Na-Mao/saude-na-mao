import { useState } from 'react'
import { Star, Send, X } from 'lucide-react'
import { deliveryService } from '../services/api'

export default function DeliveryReviewModal({ deliveryId, driverName, onClose, onSuccess }) {
  const [nota, setNota] = useState(0)
  const [hover, setHover] = useState(0)
  const [comentario, setComentario] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (nota === 0) {
      setError('Selecione uma nota')
      return
    }
    try {
      setLoading(true)
      setError(null)
      await deliveryService.rateByClient(deliveryId, {
        nota,
        comentario: comentario.trim() || undefined,
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err?.message || err?.response?.data?.message || 'Erro ao enviar avaliação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold mb-1">Avaliar entregador</h2>
        <p className="text-sm text-gray-500 mb-6">{driverName || 'Entregador'}</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Sua nota</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setNota(star)}
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  className="p-1 transition-transform hover:scale-110"
                  aria-label={`${star} estrela${star > 1 ? 's' : ''}`}
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      star <= (hover || nota)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            {nota > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                {['', 'Péssimo', 'Ruim', 'Regular', 'Bom', 'Excelente'][nota]}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Comentário (opcional)
            </label>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Como foi a entrega?"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
            <p className="text-xs text-gray-400 text-right mt-1">{comentario.length}/500</p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={nota === 0 || loading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-secondary transition disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {loading ? 'Enviando...' : 'Enviar avaliação'}
          </button>
        </form>
      </div>
    </div>
  )
}
