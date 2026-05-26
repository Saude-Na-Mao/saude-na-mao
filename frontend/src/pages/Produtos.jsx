import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useCartStore, useUiStore } from '../stores/store'
import LoadingSpinner from '../components/LoadingSpinner'
import ProdutoDetalheModal from '../components/ProdutoDetalheModal'
import { productService, pharmacyService } from '../services/api'
import { Search, Filter, ShoppingCart, Store, ArrowUpDown, AlertTriangle, FileText, Info, MessageCircle } from 'lucide-react'
import { resolveMediaUrl } from '../utils/mediaUrl'
import {
  getDisplayPrice,
  isRemoteCheckoutBlocked,
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
  }, [query, sortBy])

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
    .sort((a, b) => {
      if (sortBy === 'preco-asc') return (a.preco_final || a.preco) - (b.preco_final || b.preco)
      if (sortBy === 'preco-desc') return (b.preco_final || b.preco) - (a.preco_final || a.preco)
      return (a.nome || '').localeCompare(b.nome || '')
    })

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Search Bar */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          {query ? `Resultados para "${query}"` : 'Todos os Medicamentos'}
        </h1>
        <p className="text-gray-500 mb-4">Compare preços entre farmácias e encontre o melhor</p>

        <form onSubmit={handleSearch} className="flex gap-3" ref={searchWrapperRef}>
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
            className="px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-secondary transition"
          >
            Buscar
          </button>
        </form>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Filters */}
        <aside className="lg:w-64 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sticky top-20 space-y-5">
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
              {filtered.length} de {products.length} produtos
            </p>
          </div>
        </aside>

        {/* Product Grid */}
        <main className="flex-1">
          {loading ? (
            <LoadingSpinner />
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-2xl">
              <div className="text-5xl mb-4">💊</div>
              <p className="text-gray-500 text-lg mb-2">Nenhum produto encontrado</p>
              <p className="text-gray-400 text-sm">Tente ajustar os filtros ou faça outra busca</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((product) => {
                const pharmId = getPharmacyId(product)
                return (
                  <ProductCardWithPharmacy
                    key={product._id || product.id}
                    product={product}
                    pharmacy={pharmacies[pharmId]}
                    pharmacyId={pharmId}
                  />
                )
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function ProductCardWithPharmacy({ product, pharmacy, pharmacyId }) {
  const { addItem, replaceCartWithItem } = useCartStore()
  const { addNotification } = useUiStore()
  const navigate = useNavigate()
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const [showConflict, setShowConflict] = useState(false)
  const [conflictPharmacy, setConflictPharmacy] = useState('')
  const [modalAberto, setModalAberto] = useState(false)

  const preco = getDisplayPrice(product)
  const temPromocao = showPromo(product)
  const precisaReceita = requiresPrescription(product)
  const remoteBlocked = isRemoteCheckoutBlocked(product)
  const tarja = TARJA_CONFIG[product.classificacao_receita] || null

  const pharmacyName = pharmacy?.nome || 'Farmácia'
  const productImage = resolveMediaUrl(product.imagens?.[0] || product.imagem_url)
  const hideProductImage = shouldHideProductImage(product)

  const productData = {
    id: product._id || product.id,
    nome: product.nome,
    preco,
    controlado: product.controlado,
    receita_obrigatoria: precisaReceita,
    classificacao_receita: product.classificacao_receita || 'sem_receita',
    imagem_url: productImage,
    id_farmacia: pharmacyId,
    nome_farmacia: pharmacyName,
    quantity,
  }

  const handleAdd = () => {
    if (remoteBlocked) {
      addNotification?.({
        type: 'warning',
        message: 'Por segurança regulatória, este medicamento exige atendimento da farmácia.',
      })
      return
    }

    const result = addItem(productData)
    if (result?.authRequired) {
      addNotification?.({ type: 'warning', message: 'Faça login para adicionar produtos ao carrinho.' })
      navigate('/login')
      return
    }

    if (result?.pharmacyConflict) {
      setConflictPharmacy(result.currentPharmacyName)
      setShowConflict(true)
      return
    }
    setAdded(true)
    addNotification?.({ type: 'success', message: `${product.nome} adicionado ao carrinho` })
    setTimeout(() => setAdded(false), 2000)
  }

  const handleReplaceCart = () => {
    if (remoteBlocked) {
      addNotification?.({
        type: 'warning',
        message: 'Por segurança regulatória, este medicamento exige atendimento da farmácia.',
      })
      return
    }

    const result = replaceCartWithItem(productData)
    if (result?.authRequired) {
      addNotification?.({ type: 'warning', message: 'Faça login para adicionar produtos ao carrinho.' })
      navigate('/login')
      return
    }

    setShowConflict(false)
    setAdded(true)
    addNotification?.({ type: 'success', message: `Carrinho atualizado com item de ${pharmacyName}` })
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-all h-full flex flex-col ${tarja?.border || ''}`}>
      {/* Tarja classification bar */}
      {tarja && (
        <div className={`px-4 py-1.5 ${tarja.bg} ${tarja.text} text-[10px] font-bold flex items-center gap-1`}>
          <AlertTriangle className="w-3 h-3" />
          {tarja.label}
        </div>
      )}
      {/* Pharmacy badge */}
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
        <Store className="w-3.5 h-3.5 text-primary" />
        <Link
          to={`/farmacia/${pharmacyId}`}
          className="text-xs font-medium text-gray-700 hover:text-primary transition truncate"
        >
          {pharmacy?.nome || 'Farmácia'}
        </Link>
        {(pharmacy?.farmaceutico_online || pharmacy?.farmaceuticos_online > 0) && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            online
          </span>
        )}
        {pharmacy?.bairro && (
          <span className="text-xs text-gray-400 ml-auto truncate">{pharmacy.bairro}</span>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex gap-3">
          <div className="w-16 h-16 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
            {hideProductImage ? (
              <FileText className="w-8 h-8 text-amber-500" />
            ) : productImage ? (
              <img
                src={productImage}
                alt=""
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-3xl">💊</span>
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

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {(() => {
            const vd =
              product.validade_receita_dias != null && product.validade_receita_dias > 0
                ? product.validade_receita_dias
                : product.classificacao_receita === 'antimicrobiano'
                  ? 10
                  : null
            return vd != null ? (
              <span className="flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded-lg">
                <FileText className="w-3 h-3" /> Validade: {vd} dias
              </span>
            ) : null
          })()}
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
          {temPromocao && (
            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2 py-1 rounded-lg">
              Promoção
            </span>
          )}
        </div>

        {/* Price + add */}
        <div className="flex items-end justify-between mt-auto pt-3 border-t border-gray-50">
          <div>
            {temPromocao && (
              <span className="text-xs text-gray-400 line-through mr-1">
                R$ {product.preco?.toFixed(2)}
              </span>
            )}
            <div className="text-xl font-bold text-primary">
              R$ {preco?.toFixed(2)}
            </div>
            {product.estoque > 0 ? (
              <p className="text-[10px] text-emerald-600">Em estoque</p>
            ) : (
              <p className="text-[10px] text-red-500">Indisponível</p>
            )}
          </div>

          {product.estoque > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-lg overflow-hidden">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-2 py-1 text-gray-500 hover:bg-gray-50 text-sm"
                >-</button>
                <span className="w-6 text-center text-xs font-medium">{quantity}</span>
                <button
                  onClick={() => setQuantity(Math.min(product.estoque, quantity + 1))}
                  className="px-2 py-1 text-gray-500 hover:bg-gray-50 text-sm"
                >+</button>
              </div>
              <button
                onClick={handleAdd}
                disabled={remoteBlocked}
                className={`p-2 rounded-lg transition ${
                  added
                    ? 'bg-emerald-500 text-white'
                    : remoteBlocked
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-primary text-white hover:bg-secondary'
                }`}
                title={remoteBlocked ? 'Atendimento direto da farmácia' : 'Adicionar ao carrinho'}
              >
                <ShoppingCart className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setModalAberto(true)}
          className="mt-3 w-full py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm"
        >
          <Info className="w-4 h-4" />
          Ver detalhes / Tirar dúvida
        </button>
      </div>

      <ProdutoDetalheModal
        produto={{
          ...product,
          id: product._id || product.id,
          imagem: product.imagem || product.imagem_url || product.imagens?.[0],
          id_farmacia: pharmacy?._id
            ? {
                _id: pharmacy._id,
                nome: pharmacy.nome,
                cidade: pharmacy.cidade,
                estado: pharmacy.estado,
                telefone: pharmacy.telefone,
                bairro: pharmacy.bairro,
                logradouro: pharmacy.logradouro,
                horario_funcionamento: pharmacy.horario_funcionamento,
                avaliacao: pharmacy.avaliacao,
              }
            : pharmacyId,
          nome_farmacia: pharmacyName,
        }}
        isOpen={modalAberto}
        onClose={() => setModalAberto(false)}
      />

      {showConflict && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowConflict(false)}>
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Farmácia diferente</h3>
            <p className="text-sm text-gray-600 mb-4">
              Seu carrinho contém itens de <strong>{conflictPharmacy}</strong>. Deseja limpar o carrinho e adicionar itens de <strong>{pharmacyName}</strong>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConflict(false)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleReplaceCart}
                className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-secondary transition"
              >
                Limpar e adicionar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
