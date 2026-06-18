import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Star, Clock, MapPin, Search, ChevronRight, SlidersHorizontal, MessageCircle, Store, Truck } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import useHasRegisteredAddress from '../hooks/useHasRegisteredAddress'
import { pharmacyService } from '../services/api'

export default function Farmacias() {
  const temEndereco = useHasRegisteredAddress()
  const [pharmacies, setPharmacies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('avaliacao')
  const [onlyOnlinePharmacist, setOnlyOnlinePharmacist] = useState(false)

  useEffect(() => {
    loadPharmacies()
  }, [])

  useEffect(() => {
    loadPharmacies({ silent: true })
    if (!onlyOnlinePharmacist) return undefined
    const interval = setInterval(() => loadPharmacies({ silent: true }), 15000)
    return () => clearInterval(interval)
  }, [onlyOnlinePharmacist])

  const loadPharmacies = async (opts = {}) => {
    try {
      if (!opts.silent) setLoading(true)
      const response = await pharmacyService.getAll({
        limit: 200,
        onlyOnlinePharmacist: onlyOnlinePharmacist ? 'true' : undefined,
      })
      const payload = response.data?.data
      const data = Array.isArray(payload) ? payload : payload?.docs ?? []
      setPharmacies(data)
    } catch (err) {
      console.error('Erro ao carregar farmácias:', err)
      setPharmacies([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = pharmacies.filter((p) => {
    const matchesSearch =
      p.nome?.toLowerCase().includes(search.toLowerCase()) ||
      p.bairro?.toLowerCase().includes(search.toLowerCase())
    if (!matchesSearch) return false
    if (!onlyOnlinePharmacist) return true
    return isPharmacistOnline(p)
  })

  const getDisplayRating = (pharmacy) => {
    return pharmacy.avaliacao || 0
  }

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'avaliacao') return getDisplayRating(b) - getDisplayRating(a)
    if (sortBy === 'frete') return getFrete(a) - getFrete(b)
    return 0
  })

  if (loading) return <LoadingSpinner />

  return (
    <div className="page-shell py-6 sm:py-8">
      <div className="mb-8">
        <h1 className="section-title mb-2">Farmácias</h1>
        <p className="text-gray-500">Escolha uma farmácia e veja os produtos disponíveis</p>
      </div>

      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar farmácia por nome ou bairro..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <SlidersHorizontal className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-500">Ordenar por:</span>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'avaliacao', label: 'Mais Bem Avaliadas' },
            { value: 'frete', label: 'Menor Frete' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                sortBy === opt.value
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOnlyOnlinePharmacist((value) => !value)}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition ${
              onlyOnlinePharmacist
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            Com farmacêutico online
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl">
          <Store className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">
            {onlyOnlinePharmacist
              ? 'Nenhuma farmácia com farmacêutico online agora'
              : 'Nenhuma farmácia encontrada'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sorted.map((pharmacy) => (
            <PharmacyCard
              key={pharmacy._id}
              pharmacy={pharmacy}
              temEndereco={temEndereco}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function isPharmacistOnline(pharmacy) {
  return Boolean(pharmacy?.farmaceutico_online || pharmacy?.farmaceuticos_online > 0)
}

function getFrete(pharmacy) {
  const taxa = Number(pharmacy?.taxa_entrega_base)
  return Number.isFinite(taxa) && taxa > 0 ? taxa : 8
}

function PharmacyCard({ pharmacy, temEndereco }) {
  const displayRating = pharmacy.avaliacao || 0
  const displayTotal = pharmacy.total_avaliacoes || 0
  const initial = pharmacy.nome?.charAt(0) || 'F'
  const colors = [
    'from-blue-500 to-blue-600',
    'from-emerald-500 to-emerald-600',
    'from-violet-500 to-violet-600',
    'from-orange-500 to-orange-600',
    'from-pink-500 to-pink-600',
    'from-cyan-500 to-cyan-600',
  ]
  const colorIndex = pharmacy.nome?.length % colors.length || 0
  const supportOnline = isPharmacistOnline(pharmacy)

  return (
    <Link
      to={`/farmacia/${pharmacy._id}`}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group"
    >
      <div className={`h-32 bg-gradient-to-br ${colors[colorIndex]} flex items-center justify-center relative overflow-hidden`}>
        {pharmacy.foto && (
          <img
            src={pharmacy.foto}
            alt={pharmacy.nome}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        )}
        {pharmacy.logo ? (
          <img
            src={pharmacy.logo}
            alt={pharmacy.nome}
            loading="lazy"
            className="relative w-16 h-16 rounded-2xl bg-white object-contain p-1.5 shadow-md"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <div className="relative w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
            <span className="text-3xl font-bold text-white">{initial}</span>
          </div>
        )}
        {displayRating >= 4.5 && (
          <div className="absolute top-3 right-3 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1">
            <Star className="w-3 h-3 fill-current" /> Top
          </div>
        )}
        <div className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${
          supportOnline
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-white/85 text-gray-600'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${supportOnline ? 'bg-emerald-500' : 'bg-gray-400'}`} />
          {supportOnline ? 'Suporte online' : 'Sem suporte'}
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-bold text-gray-900 text-lg leading-tight group-hover:text-primary transition-colors">
            {pharmacy.nome}
          </h3>
          <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-primary transition-colors flex-shrink-0 mt-0.5" />
        </div>

        <div className="flex items-center gap-1.5 mb-3">
          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
          <span className="font-semibold text-sm text-gray-900">{displayRating.toFixed(1)}</span>
          <span className="text-gray-400 text-sm">({displayTotal})</span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{pharmacy.bairro}, {pharmacy.cidade}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{pharmacy.horario_funcionamento}</span>
          </div>
          {temEndereco && (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Truck className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
              <span>Frete <span className="font-semibold text-gray-900">R$ {getFrete(pharmacy).toFixed(2)}</span></span>
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
          {pharmacy.ativa === false ? (
            <span className="text-xs text-red-600 font-medium bg-red-50 px-2.5 py-1 rounded-full">
              Fechada
            </span>
          ) : (
            <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full">
              Aberta
            </span>
          )}
          <span className="min-w-0 truncate text-xs text-gray-400">
            {pharmacy.logradouro}, {pharmacy.numero}
          </span>
        </div>
      </div>
    </Link>
  )
}
