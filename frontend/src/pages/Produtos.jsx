import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useCartStore, useUiStore } from '../stores/store'
import LoadingSpinner from '../components/LoadingSpinner'
import ProdutoDetalheModal from '../components/ProdutoDetalheModal'
import { productService, pharmacyService } from '../services/api'
import { Search, Filter, ShoppingCart, Store, ArrowUpDown, AlertTriangle, FileText, Info, MessageCircle, Package2, X } from 'lucide-react'
import { resolveMediaUrl } from '../utils/mediaUrl'
import {
  getDisplayPrice,
  getAvailableStock,
  isRemoteCheckoutBlocked,
  isProductUnavailable,
  requiresPrescription,
  shouldHideProductImage,
  showPromo,
} from '../utils/compliance'

const TARJA_CONFIG = {
  sem_receita: null,
  tarja_vermelha: { label: 'Tarja Vermelha', bg: 'bg-red-50', text: 'text-red-700', border: 'border-l-4 border-l-red-500' },
  tarja_preta: { label: 'Tarja Preta', bg: 'bg-gray-900', text: 'text-white', border: 'border-l-4 border-l-black' },
  antimicrobiano: { label: 'Antimicrobiano', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-l-4 border-l-blue-500' },
  controlado_a: { label: 'Tarja Amarela (Lista A)', bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-l-4 border-l-yellow-500' },
}

const FRETE_PADRAO = 8

function freteDaFarmacia(pharmacy) {
  const taxa = Number(pharmacy?.taxa_entrega_base)
  return Number.isFinite(taxa) && taxa > 0 ? taxa : FRETE_PADRAO
}

export default function Produtos() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [products, setProducts] = useState([])
  const [pharmacies, setPharmacies] = useState({})
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')
  const [sortBy, setSortBy] = useState('nome')
  const [priceRange, setPriceRange] = useState([0, 500])
  const [categoryFilter, setCategoryFilter] = useState('')
  const [pharmacyFilter, setPharmacyFilter] = useState('')
  const [onlyOnlinePharmacist, setOnlyOnlinePharmacist] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef(null)
  const searchWrapperRef = useRef(null)

  const fetchSuggestions = useCallback((term) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!term || term.length < 2) { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await productService.search(term)
        const data = res.data?.data
        const list = Array.isArray(data) ? data : data?.docs ?? []
        setSuggestions(list.slice(0, 6))
        setShowSuggestions(true)
      } catch { setSuggestions([]) }
    }, 300)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const query = searchParams.get('search')

  useEffect(() => {
    loadData()
  }, [query])

  useEffect(() => {
    if (!onlyOnlinePharmacist) return undefined

    refreshPharmaciesStatus()
    const interval = setInterval(refreshPharmaciesStatus, 15000)
    return () => clearInterval(interval)
  }, [onlyOnlinePharmacist])

  const loadData = async () => {
    try {
      setLoading(true)

      const [prodsRes, pharmsRes] = await Promise.all([
        query ? productService.search(query) : productService.getAll({ sort: sortBy, limit: 200 }),
        pharmacyService.getAll({ limit: 50 }),
      ])

      const prodsPayload = prodsRes.data?.data
      const prodsData = Array.isArray(prodsPayload) ? prodsPayload : prodsPayload?.docs ?? []
      setProducts(prodsData)

      // Build pharmacy map from populated id_farmacia in products + pharmacy API
      const pharmsPayload = pharmsRes.data?.data
      const pharmsData = Array.isArray(pharmsPayload)
        ? pharmsPayload
        : pharmsPayload?.docs ?? pharmsPayload?.farmacias ?? []
      const pharmsMap = {}
      pharmsData.forEach((p) => {
        pharmsMap[p._id] = p
      })
      // Also extract populated pharmacy data from products
      prodsData.forEach((p) => {
        if (p.id_farmacia && typeof p.id_farmacia === 'object' && p.id_farmacia._id) {
          pharmsMap[p.id_farmacia._id] = p.id_farmacia
        }
      })
      setPharmacies(pharmsMap)
    } catch (err) {
      console.error('Erro ao carregar produtos:', err)
    } finally {
      setLoading(false)
    }
  }

  async function refreshPharmaciesStatus() {
    try {
      const response = await pharmacyService.getAll({ limit: 50 })
      const payload = response.data?.data
      const list = Array.isArray(payload)
        ? payload
        : payload?.docs ?? payload?.farmacias ?? []
      const nextMap = {}
      list.forEach((pharmacy) => {
        nextMap[pharmacy._id] = pharmacy
      })
      setPharmacies((current) => ({ ...current, ...nextMap }))
    } catch {
      /* status online é complementar */
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchInput.trim()) {
      setSearchParams({ search: searchInput.trim() })
    } else {
      setSearchParams({})
    }
  }

  // Helper to get pharmacy ID string from a product
  const getPharmacyId = (p) => {
    if (typeof p.id_farmacia === 'object' && p.id_farmacia?._id) return String(p.id_farmacia._id)
    return p.id_farmacia ? String(p.id_farmacia) : ''
  }

  const categories = [...new Set(products.map((p) => p.categoria).filter(Boolean))].sort()
  const pharmacyIds = [...new Set(products.map(getPharmacyId).filter(Boolean))]

  const filtered = products
    .filter((p) => p.preco >= priceRange[0] && p.preco <= priceRange[1])
    .filter((p) => !categoryFilter || p.categoria === categoryFilter)
    .filter((p) => !pharmacyFilter || getPharmacyId(p) === pharmacyFilter)
    .filter((p) => {
      if (!onlyOnlinePharmacist) return true
      const pharmacy = pharmacies[getPharmacyId(p)]
      return Boolean(pharmacy?.farmaceutico_online || pharmacy?.farmaceuticos_online > 0)
    })


  // Agrupa o mesmo medicamento (mesmo nome) vendido por várias farmácias.
  // Cada grupo guarda as ofertas ranqueadas de forma crescente por preço + frete.
  const groupsMap = new Map()
  filtered.forEach((product) => {
    const key = (product.nome || '').trim().toLowerCase()
    if (!groupsMap.has(key)) groupsMap.set(key, [])
    const pharmId = getPharmacyId(product)
    const pharmacy = pharmacies[pharmId]
    const preco = getDisplayPrice(product)
    const frete = freteDaFarmacia(pharmacy)
    groupsMap.get(key).push({ product, pharmacy, pharmacyId: pharmId, preco, frete, total: preco + frete })
  })

  const groups = Array.from(groupsMap.values())
    .map((ofertas) => {
      const ranked = [...ofertas].sort((a, b) => a.total - b.total)
      return {
        representante: ranked[0].product,
        ofertas: ranked,
        menorPreco: Math.min(...ranked.map((o) => o.preco)),
        menorFrete: Math.min(...ranked.map((o) => o.frete)),
        menorTotal: ranked[0].total,
      }
    })
    .sort((a, b) => {
      if (sortBy === 'preco-asc') return a.menorTotal - b.menorTotal
      if (sortBy === 'preco-desc') return b.menorTotal - a.menorTotal
      return (a.representante.nome || '').localeCompare(b.representante.nome || '')
    })

  return (
    <div className="page-shell py-6 sm:py-8">
      {/* Search Bar */}
      <div className="mb-8">
        <h1 className="section-title mb-2">
          {query ? `Resultados para "${query}"` : 'Todos os Medicamentos'}
        </h1>
        <p className="text-gray-500 mb-4">Compare preços entre farmácias e encontre o melhor</p>

        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row" ref={searchWrapperRef}>
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); fetchSuggestions(e.target.value) }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Buscar medicamentos, princípios ativos..."
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                {suggestions.map((s) => (
                  <button
                    key={s._id}
                    type="button"
                    onClick={() => {
                      setSearchInput(s.nome)
                      setShowSuggestions(false)
                      setSearchParams({ search: s.nome })
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition text-sm"
                  >
                    {s.imagem_url ? (
                      <img src={resolveMediaUrl(s.imagem_url)} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{s.nome}</p>
                      <p className="text-xs text-gray-400">
                        R$ {(s.preco_final || s.preco)?.toFixed(2)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            className="w-full px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-secondary transition sm:w-auto"
          >
            Buscar
          </button>
        </form>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Filters */}
        <aside className="lg:w-64 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 lg:sticky lg:top-20 space-y-5">
            <h3 className="font-bold flex items-center gap-2 text-sm">
              <Filter className="w-4 h-4 text-primary" /> Filtros
            </h3>

            <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition ${
              onlyOnlinePharmacist
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
            }`}>
              <input
                type="checkbox"
                checked={onlyOnlinePharmacist}
                onChange={(e) => setOnlyOnlinePharmacist(e.target.checked)}
                className="sr-only"
              />
              <span className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition ${
                onlyOnlinePharmacist ? 'bg-primary' : 'bg-gray-300'
              }`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                  onlyOnlinePharmacist ? 'left-5' : 'left-0.5'
                }`} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                  <MessageCircle className="w-4 h-4 text-primary" />
                  Farmacêutico online
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Mostrar farmácias com atendimento agora
                </span>
              </span>
            </label>

            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-2">Farmácia</label>
              <select
                value={pharmacyFilter}
                onChange={(e) => setPharmacyFilter(e.target.value)}
                className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Todas farmácias</option>
                {pharmacyIds.map((id) => (
                  <option key={id} value={id}>
                    {pharmacies[id]?.nome || 'Farmácia'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-2">Categoria</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Todas categorias</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-2">
                Preço: R$ {priceRange[0]} - R$ {priceRange[1]}
              </label>
              <input
                type="range"
                min="0"
                max="500"
                value={priceRange[1]}
                onChange={(e) => setPriceRange([0, parseInt(e.target.value)])}
                className="w-full accent-primary"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-2">
                <ArrowUpDown className="w-3 h-3 inline mr-1" /> Ordenar por
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="nome">Nome (A-Z)</option>
                <option value="preco-asc">Menor Preço</option>
                <option value="preco-desc">Maior Preço</option>
              </select>
            </div>

            <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
              {groups.length} medicamentos · {filtered.length} ofertas
            </p>
          </div>
        </aside>

        {/* Product Grid */}
        <main className="flex-1">
          {loading ? (
            <LoadingSpinner />
          ) : groups.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-2xl">
              <Package2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg mb-2">Nenhum produto encontrado</p>
              <p className="text-gray-400 text-sm">
                {onlyOnlinePharmacist
                  ? 'Nenhuma farmácia com suporte online tem este produto agora.'
                  : 'Tente ajustar os filtros ou faça outra busca'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {groups.map((group) => (
                <GroupOfferCard key={group.representante.nome} group={group} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function GroupOfferCard({ group }) {
  const [modalAberto, setModalAberto] = useState(false)
  const product = group.representante
  const precisaReceita = requiresPrescription(product)
  const remoteBlocked = isRemoteCheckoutBlocked(product)
  const tarja = TARJA_CONFIG[product.classificacao_receita] || null
  const productImage = resolveMediaUrl(product.imagens?.[0] || product.imagem_url)
  const hideProductImage = shouldHideProductImage(product)
  const nFarmacias = group.ofertas.length

  const vd =
    product.validade_receita_dias != null && product.validade_receita_dias > 0
      ? product.validade_receita_dias
      : product.classificacao_receita === 'antimicrobiano'
        ? 10
        : null

  return (
    <div className={`bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-all h-full flex flex-col ${tarja?.border || ''}`}>
      {tarja && (
        <div className={`px-4 py-1.5 ${tarja.bg} ${tarja.text} text-[10px] font-bold flex items-center gap-1`}>
          <AlertTriangle className="w-3 h-3" />
          {tarja.label}
        </div>
      )}

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex gap-3">
          <div className="w-16 h-16 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
            {hideProductImage ? (
              <FileText className="w-8 h-8 text-amber-500" />
            ) : productImage ? (
              <img src={productImage} alt="" className="w-full h-full object-contain" />
            ) : (
              <Package2 className="w-8 h-8 text-gray-300" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-0.5 min-h-[2.5rem]">{product.nome}</h3>
            <p className="text-xs text-gray-400">
              {product.fabricante}{product.dosagem ? ` · ${product.dosagem}` : ''}
            </p>
            {product.categoria && (
              <span className="inline-block text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full mt-1">
                {product.categoria}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {vd != null && (
            <span className="flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded-lg">
              <FileText className="w-3 h-3" /> Validade: {vd} dias
            </span>
          )}
          {precisaReceita && (
            <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-1 rounded-lg">
              <FileText className="w-3 h-3" /> Receita obrigatória
            </span>
          )}
          {remoteBlocked && (
            <span className="flex items-center gap-1 text-[10px] font-bold bg-red-50 text-red-700 px-2 py-1 rounded-lg">
              <AlertTriangle className="w-3 h-3" /> Atendimento obrigatório
            </span>
          )}
        </div>

        <div className="mt-auto pt-3 border-t border-gray-50">
          <p className="text-[11px] text-gray-400">A partir de</p>
          <div className="flex items-end gap-2 flex-wrap">
            <span className="text-2xl font-bold text-primary leading-none">R$ {group.menorPreco.toFixed(2)}</span>
            <span className="text-[11px] text-gray-400 mb-0.5">+ frete a partir de R$ {group.menorFrete.toFixed(2)}</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            {nFarmacias} {nFarmacias === 1 ? 'farmácia disponível' : 'farmácias disponíveis'}
          </p>

          <button
            onClick={() => setModalAberto(true)}
            className="mt-3 w-full py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 transition bg-primary text-white hover:bg-secondary text-sm"
          >
            <Store className="w-4 h-4" />
            Ver ofertas e comprar
          </button>
        </div>
      </div>

      <OffersModal group={group} isOpen={modalAberto} onClose={() => setModalAberto(false)} />
    </div>
  )
}

function OffersModal({ group, isOpen, onClose }) {
  const { addItem, replaceCartWithItem } = useCartStore()
  const { addNotification } = useUiStore()
  const navigate = useNavigate()
  const [conflict, setConflict] = useState(null)
  const [detalheOferta, setDetalheOferta] = useState(null)

  if (!isOpen) return null

  const buildProductData = (offer) => ({
    id: offer.product._id || offer.product.id,
    nome: offer.product.nome,
    preco: offer.preco,
    estoque: getAvailableStock(offer.product),
    controlado: offer.product.controlado,
    receita_obrigatoria: requiresPrescription(offer.product),
    classificacao_receita: offer.product.classificacao_receita || 'sem_receita',
    imagem_url: resolveMediaUrl(offer.product.imagens?.[0] || offer.product.imagem_url),
    id_farmacia: offer.pharmacyId,
    nome_farmacia: offer.pharmacy?.nome || 'Farmácia',
    taxa_entrega: offer.frete,
    quantity: 1,
  })

  const goToPharmacy = (offer) => {
    onClose()
    navigate(`/farmacia/${offer.pharmacyId}`)
  }

  const handleAdd = (offer) => {
    if (isProductUnavailable(offer.product)) {
      addNotification?.({ type: 'warning', message: 'Medicamento indisponível nesta farmácia.' })
      return
    }
    if (isRemoteCheckoutBlocked(offer.product)) {
      addNotification?.({ type: 'warning', message: 'Por segurança regulatória, este medicamento exige atendimento da farmácia.' })
      return
    }
    const result = addItem(buildProductData(offer))
    if (result?.unavailable) {
      addNotification?.({ type: 'warning', message: 'Medicamento indisponível nesta farmácia.' })
      return
    }
    if (result?.authRequired) {
      addNotification?.({ type: 'warning', message: 'Faça login para adicionar produtos ao carrinho.' })
      onClose()
      navigate('/login')
      return
    }
    if (result?.pharmacyConflict) {
      setConflict({ offer, currentPharmacyName: result.currentPharmacyName })
      return
    }
    addNotification?.({ type: 'success', message: `${offer.product.nome} adicionado ao carrinho` })
    goToPharmacy(offer)
  }

  const handleReplace = () => {
    const { offer } = conflict
    const result = replaceCartWithItem(buildProductData(offer))
    if (result?.authRequired) {
      onClose()
      navigate('/login')
      return
    }
    setConflict(null)
    addNotification?.({ type: 'success', message: `Carrinho atualizado com item de ${offer.pharmacy?.nome || 'Farmácia'}` })
    goToPharmacy(offer)
  }

  const detalhePharmacy = detalheOferta?.pharmacy

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900 truncate">{group.representante.nome}</h3>
              <p className="text-xs text-gray-500 mt-0.5">Ofertas ordenadas pelo menor preço + frete</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition shrink-0" aria-label="Fechar">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto p-4 space-y-3">
            {group.ofertas.map((offer, idx) => {
              const indisponivel = isProductUnavailable(offer.product)
              const remoteBlocked = isRemoteCheckoutBlocked(offer.product)
              const supportOnline = Boolean(offer.pharmacy?.farmaceutico_online || offer.pharmacy?.farmaceuticos_online > 0)
              return (
                <div
                  key={`${offer.pharmacyId}-${idx}`}
                  className={`rounded-xl border p-4 ${idx === 0 ? 'border-primary bg-primary/5' : 'border-gray-100'}`}
                >
                  {idx === 0 && (
                    <span className="inline-block mb-2 text-[10px] font-bold bg-primary text-white px-2 py-0.5 rounded-full">
                      Melhor preço
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/farmacia/${offer.pharmacyId}`} className="font-semibold text-gray-900 hover:text-primary transition truncate block">
                        {offer.pharmacy?.nome || 'Farmácia'}
                      </Link>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {offer.pharmacy?.bairro && (
                          <span className="text-xs text-gray-400">{offer.pharmacy.bairro}</span>
                        )}
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          supportOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${supportOnline ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                          {supportOnline ? 'suporte online' : 'sem suporte'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-primary leading-none">R$ {offer.preco.toFixed(2)}</div>
                      <div className="text-xs text-gray-500 mt-1">+ frete R$ {offer.frete.toFixed(2)}</div>
                      <div className="text-[11px] text-gray-400">Total c/ entrega R$ {offer.total.toFixed(2)}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAdd(offer)}
                    disabled={indisponivel || remoteBlocked}
                    className={`mt-3 w-full py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition ${
                      indisponivel || remoteBlocked
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : 'bg-primary text-white hover:bg-secondary'
                    }`}
                  >
                    <ShoppingCart className="w-4 h-4" />
                    {indisponivel ? 'Indisponível' : remoteBlocked ? 'Atendimento na farmácia' : 'Adicionar e ir à farmácia'}
                  </button>
                </div>
              )
            })}

            <button
              onClick={() => setDetalheOferta(group.ofertas[0])}
              className="w-full py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition flex items-center justify-center gap-2"
            >
              <Info className="w-4 h-4" />
              Ver informações do medicamento
            </button>
          </div>

          {conflict && (
            <div className="absolute inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setConflict(null)}>
              <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Farmácia diferente</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Seu carrinho contém itens de <strong>{conflict.currentPharmacyName}</strong>. Deseja limpar o carrinho e adicionar itens de <strong>{conflict.offer.pharmacy?.nome || 'Farmácia'}</strong>?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConflict(null)}
                    className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleReplace}
                    className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-secondary transition"
                  >
                    Limpar e adicionar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {detalheOferta && (
        <ProdutoDetalheModal
          produto={{
            ...detalheOferta.product,
            estoque: getAvailableStock(detalheOferta.product),
            id: detalheOferta.product._id || detalheOferta.product.id,
            imagem: detalheOferta.product.imagem || detalheOferta.product.imagem_url || detalheOferta.product.imagens?.[0],
            id_farmacia: detalhePharmacy?._id
              ? {
                  _id: detalhePharmacy._id,
                  nome: detalhePharmacy.nome,
                  cidade: detalhePharmacy.cidade,
                  estado: detalhePharmacy.estado,
                  telefone: detalhePharmacy.telefone,
                  bairro: detalhePharmacy.bairro,
                  logradouro: detalhePharmacy.logradouro,
                  horario_funcionamento: detalhePharmacy.horario_funcionamento,
                  avaliacao: detalhePharmacy.avaliacao,
                }
              : detalheOferta.pharmacyId,
            nome_farmacia: detalhePharmacy?.nome || 'Farmácia',
          }}
          isOpen={!!detalheOferta}
          onClose={() => setDetalheOferta(null)}
        />
      )}
    </>
  )
}
