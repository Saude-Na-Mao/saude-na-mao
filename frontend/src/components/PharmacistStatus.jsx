import { useState, useEffect, useCallback } from 'react'
import { pharmacyService } from '../services/api'

const POLL_MS_DEFAULT = 30000
const POLL_MS_COMPACT = 15000

export function PharmacistStatus({
  pharmacyId,
  compact = false,
  onAvailabilityChange,
}) {
  const [hasOnline, setHasOnline] = useState(false)
  const [onlineCount, setOnlineCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    if (!pharmacyId) {
      setLoading(false)
      return
    }
    try {
      const res = await pharmacyService.getPharmacists(pharmacyId)
      const data = res.data?.data || {}
      const list = Array.isArray(data.pharmacists) ? data.pharmacists : []
      const online =
        typeof data.hasOnline === 'boolean'
          ? data.hasOnline
          : list.some((p) => p.isOnline || (p.logado && p.disponivel_chat !== false))
      const count =
        typeof data.onlineCount === 'number'
          ? data.onlineCount
          : list.filter((p) => p.isOnline || (p.logado && p.disponivel_chat !== false))
              .length
      setHasOnline(online)
      setOnlineCount(count)
      onAvailabilityChange?.(online)
    } catch {
      setHasOnline(false)
      setOnlineCount(0)
      onAvailabilityChange?.(false)
    } finally {
      setLoading(false)
    }
  }, [pharmacyId, onAvailabilityChange])

  useEffect(() => {
    setLoading(true)
    fetchStatus()
    const ms = compact ? POLL_MS_COMPACT : POLL_MS_DEFAULT
    const id = setInterval(fetchStatus, ms)
    return () => clearInterval(id)
  }, [fetchStatus, compact])

  if (!pharmacyId) return null

  if (loading && compact) {
    return (
      <p className="text-xs text-gray-500">Verificando farmacêuticos...</p>
    )
  }

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-2 text-xs font-medium px-2.5 py-1 rounded-full ${
          hasOnline
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-gray-100 text-gray-600'
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            hasOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
          }`}
          aria-hidden
        />
        {hasOnline
          ? onlineCount === 1
            ? 'Farmacêutico online agora'
            : `${onlineCount} farmacêuticos online`
          : 'Nenhum farmacêutico online no momento'}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h4 className="font-semibold text-gray-900 text-sm">Atendimento farmacêutico</h4>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
            hasOnline
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              hasOnline ? 'bg-emerald-500' : 'bg-gray-400'
            }`}
          />
          {hasOnline ? 'Online' : 'Offline'}
        </span>
      </div>
      <p className="text-sm text-gray-600">
        {loading
          ? 'Carregando...'
          : hasOnline
            ? `${onlineCount} farmacêutico(s) disponível(is) para chat e dúvidas.`
            : 'No momento não há farmacêuticos online nesta farmácia. Você ainda pode enviar sua dúvida e será atendido quando possível.'}
      </p>
    </div>
  )
}
