import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Star, Clock, MapPin, ArrowLeft, Search, ShoppingCart, Truck, MessageSquare, AlertTriangle, FileText, Info, Package2 } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { useCartStore, useUiStore } from '../stores/store'
import ProdutoDetalheModal from '../components/ProdutoDetalheModal'
import { PharmacistStatus } from '../components/PharmacistStatus'
import api from '../services/api'
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

export default function FarmaciaDetalhe() {
  const { id } = useParams()
  const [pharmacy, setPharmacy] = useState(null)
  const [products, setProducts] = useState([])
  const [reviewsSeed, setReviewsSeed] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState('')
  const [sortBy, setSortBy] = useState('nome')

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    try {
      setLoading(true)
      const [pharmRes, prodsRes, revRes] = await Promise.all([
        api.get(`/farmacias/${id}`),
        api.get(`/farmacias/${id}/products`, { params: { limit: 100 } }),
        api.get(`/avaliacoes/pharmacy/${id}`, { params: { page: 1, limit: 6 } }).catch((e) => {
          console.error('Erro ao carregar resumo de avaliações:', e)
          return { data: { data: {} } }
        }),
      ])
      setPharmacy(pharmRes.data?.data?.farmacia || pharmRes.data?.data)
      const prodsPayload = prodsRes.data?.data
      setProducts(Array.isArray(prodsPayload) ? prodsPayload : prodsPayload?.docs ?? [])
      const rd = revRes.data?.data
      setReviewsSeed({
        reviews: Array.isArray(rd?.reviews) ? rd.reviews : [],
        total: typeof rd?.total === 'number' ? rd.total : 0,
        avgRating: typeof rd?.avgRating === 'number' ? rd.avgRating : null,
        totalPages: typeof rd?.totalPages === 'number' ? Math.max(1, rd.totalPages) : 1,
      })
    } catch (err) {
      console.error('Erro ao carregar farmácia:', err)
      setReviewsSeed({ reviews: [], total: 0, avgRating: null, totalPages: 1 })
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (!pharmacy) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-500 text-lg">Farmácia não encontrada</p>
        <Link to="/farmacias" className="text-primary font-semibold mt-4 inline-block">
          Voltar para farmácias
        </Link>
      </div>
    )
  }

  const categorias = [...new Set(products.map((p) => p.categoria).filter(Boolean))]

  const filtered = products
    .filter((p) => {
      const matchSearch = !search ||
        p.nome?.toLowerCase().includes(search.toLowerCase()) ||
        p.principio_ativo?.toLowerCase().includes(search.toLowerCase())
      const matchCategoria = !categoria || p.categoria === categoria
      return matchSearch && matchCategoria
    })
    .sort((a, b) => {
      if (sortBy === 'preco-asc') return (a.preco_final || a.preco) - (b.preco_final || b.preco)
      if (sortBy === 'preco-desc') return (b.preco_final || b.preco) - (a.preco_final || a.preco)
      return a.nome?.localeCompare(b.nome)
    })

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

  const apiReviewTotal = reviewsSeed?.total ?? 0
  const hasApiReviews = apiReviewTotal > 0 && typeof reviewsSeed?.avgRating === 'number'
  const fallbackAvg = typeof pharmacy.avaliacao === 'number' && pharmacy.avaliacao > 0 ? pharmacy.avaliacao : null
  const fallbackReviewCount =
    typeof pharmacy.total_avaliacoes === 'number' && pharmacy.total_avaliacoes > 0
      ? pharmacy.total_avaliacoes
      : 0

  return (
    <div>
      <div className={`bg-gradient-to-br ${colors[colorIndex]} text-white`}>
        <div className="page-shell py-8">
          <Link to="/farmacias" className="inline-flex items-center gap-2 text-white/80 hover:text-white transition mb-6 text-sm">
            <ArrowLeft className="w-4 h-4" /> Voltar para farmácias
          </Link>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden shadow-md">
              {pharmacy.logo ? (
                <img
                  src={pharmacy.logo}
                  alt={pharmacy.nome}
                  className="w-full h-full object-contain p-1.5"
                  onError={(e) => { e.currentTarget.replaceWith(Object.assign(document.createElement('span'), { className: 'text-4xl font-bold text-gray-700', textContent: initial })) }}
                />
              ) : (
                <span className="text-4xl font-bold text-gray-700">{initial}</span>
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{pharmacy.nome}</h1>
              <div className="flex flex-wrap items-center gap-4 text-white/80 text-sm">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-yellow-300 fill-yellow-300" />
                  {!reviewsSeed ? (
                    <span className="text-white/70">Carregando avaliações…</span>
                  ) : hasApiReviews ? (
                    <>
                      <span className="font-semibold text-white">{reviewsSeed.avgRating.toFixed(1)}</span>
                      <span>({reviewsSeed.total} avaliações)</span>
                    </>
                  ) : fallbackAvg != null && fallbackReviewCount > 0 ? (
                    <>
                      <span className="font-semibold text-white">{fallbackAvg.toFixed(1)}</span>
                      <span>({fallbackReviewCount} avaliações)</span>
                    </>
                  ) : (
                    <span className="text-white/90">Sem avaliações ainda</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{pharmacy.horario_funcionamento}</span>
                </div>
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span>{pharmacy.logradouro}, {pharmacy.numero} - {pharmacy.bairro}</span>
                </div>
              </div>
              <div className="flex gap-3 mt-4 flex-wrap items-center">
                <span className="bg-white/15 backdrop-blur-sm text-sm px-3 py-1 rounded-full">
                  <Truck className="w-3.5 h-3.5 inline mr-1" />
                  Entrega disponível
                </span>
                <span className="bg-white/15 backdrop-blur-sm text-sm px-3 py-1 rounded-full">
                  {products.length} produtos
                </span>
              </div>
              <div className="mt-4 max-w-md">
                <div className="bg-white/95 rounded-lg p-3 text-gray-900 shadow-sm">
                  <PharmacistStatus pharmacyId={id} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="page-shell py-8">
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar produto nesta farmácia..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
            />
          </div>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
          >
            <option value="">Todas categorias</option>
            {categorias.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
          >
            <option value="nome">Nome (A-Z)</option>
            <option value="preco-asc">Menor preço</option>
            <option value="preco-desc">Maior preço</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-2xl">
          <Package2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">Nenhum produto encontrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((product) => (
              <PharmacyProductCard
                key={product._id}
                product={product}
                pharmacyId={id}
                pharmacyName={pharmacy.nome}
              />
            ))}
          </div>
        )}

        <ReviewsSection pharmacyId={id} reviewsSeed={reviewsSeed} />
      </div>
    </div>
  )
}

function PharmacyProductCard({ product, pharmacyId, pharmacyName }) {
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
  const availableStock = getAvailableStock(product)
  const isOutOfStock = isProductUnavailable(product)
  const tarja = TARJA_CONFIG[product.classificacao_receita] || null

  const productImage = resolveMediaUrl(
    product.imagem || product.imagem_url || product.imagens?.[0],
  )
  const hideProductImage = shouldHideProductImage(product)

  const productData = {
    id: product._id,
    nome: product.nome,
    preco: preco,
    estoque: availableStock,
    imagem: productImage,
    controlado: product.controlado,
    receita_obrigatoria: precisaReceita,
    classificacao_receita: product.classificacao_receita || 'sem_receita',
    id_farmacia: pharmacyId,
    nome_farmacia: pharmacyName,
    quantity,
  }

  const handleAdd = () => {
    if (isOutOfStock) {
      addNotification?.({ type: 'warning', message: 'Medicamento indisponível nesta farmácia.' })
      return
    }

    if (remoteBlocked) {
      addNotification?.({
        type: 'warning',
        message: 'Por segurança regulatória, este medicamento exige atendimento da farmácia.',
      })
      return
    }

    const result = addItem(productData)
    if (result?.unavailable) {
      addNotification?.({ type: 'warning', message: 'Medicamento indisponível nesta farmácia.' })
      return
    }
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
    if (isOutOfStock) {
      addNotification?.({ type: 'warning', message: 'Medicamento indisponível nesta farmácia.' })
      return
    }

    if (remoteBlocked) {
      addNotification?.({
        type: 'warning',
        message: 'Por segurança regulatória, este medicamento exige atendimento da farmácia.',
      })
      return
    }

    const result = replaceCartWithItem(productData)
    if (result?.unavailable) {
      addNotification?.({ type: 'warning', message: 'Medicamento indisponível nesta farmácia.' })
      return
    }
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
    <div className={`${isOutOfStock ? 'bg-gray-100 opacity-70' : 'bg-white'} rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-all h-full flex flex-col ${tarja?.border || ''}`}>
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
          {product.classificacao_receita === 'antimicrobiano' && (
            <span className="flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded-lg">
              <FileText className="w-3 h-3" /> Validade: 10 dias
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
          {temPromocao && (
            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2 py-1 rounded-lg">
              Promoção
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mt-auto pt-3 border-t border-gray-50">
          <div>
            {temPromocao && (
              <span className="text-xs text-gray-400 line-through mr-1">
                R$ {product.preco?.toFixed(2)}
              </span>
            )}
            <div className="text-xl font-bold text-primary">
              R$ {preco?.toFixed(2)}
            </div>
            {!isOutOfStock ? (
              <p className="text-[10px] text-emerald-600">Em estoque</p>
            ) : (
              <p className="text-[10px] text-red-500">Indisponível</p>
            )}
          </div>

          {!isOutOfStock && (
            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-lg overflow-hidden">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-2 py-1 text-gray-500 hover:bg-gray-50 text-sm"
                >-</button>
                <span className="w-6 text-center text-xs font-medium">{quantity}</span>
                <button
                  onClick={() => setQuantity(Math.min(availableStock, quantity + 1))}
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
          estoque: availableStock,
          id: product._id || product.id,
          imagem: productImage,
          id_farmacia: pharmacyId,
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

function ReviewsSection({ pharmacyId, reviewsSeed }) {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [avgRating, setAvgRating] = useState(null)

  useEffect(() => {
    setPage(1)
  }, [pharmacyId])

  useEffect(() => {
    const seedMatches =
      page === 1 &&
      reviewsSeed &&
      reviewsSeed.reviews !== undefined &&
      typeof reviewsSeed.total === 'number'

    if (seedMatches) {
      setReviews(reviewsSeed.reviews)
      setTotal(reviewsSeed.total)
      setAvgRating(reviewsSeed.avgRating ?? null)
      setTotalPages(Math.max(1, reviewsSeed.totalPages || 1))
      setLoading(false)
      return
    }

    const loadReviews = async () => {
      try {
        setLoading(true)
        const res = await api.get(`/avaliacoes/pharmacy/${pharmacyId}`, {
          params: { page, limit: 6 },
        })
        const data = res.data?.data
        setReviews(data?.reviews || [])
        setTotalPages(Math.max(1, data?.totalPages || 1))
        setTotal(typeof data?.total === 'number' ? data.total : 0)
        setAvgRating(typeof data?.avgRating === 'number' ? data.avgRating : null)
      } catch (err) {
        console.error('Erro ao carregar avaliações:', err)
      } finally {
        setLoading(false)
      }
    }

    void loadReviews()
  }, [pharmacyId, page, reviewsSeed])

  const renderStars = (nota) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i < nota ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`}
      />
    ))
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Hoje'
    if (diffDays === 1) return 'Ontem'
    if (diffDays < 7) return `${diffDays} dias atrás`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} semana${Math.floor(diffDays / 7) > 1 ? 's' : ''} atrás`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} ${Math.floor(diffDays / 30) === 1 ? 'mês' : 'meses'} atrás`
    return date.toLocaleDateString('pt-BR')
  }

  const getInitial = (name) => {
    return name?.charAt(0)?.toUpperCase() || '?'
  }

  const getAvatarColor = (name) => {
    const colors = [
      'bg-blue-100 text-blue-600',
      'bg-emerald-100 text-emerald-600',
      'bg-violet-100 text-violet-600',
      'bg-orange-100 text-orange-600',
      'bg-pink-100 text-pink-600',
      'bg-cyan-100 text-cyan-600',
      'bg-rose-100 text-rose-600',
      'bg-amber-100 text-amber-600',
    ]
    const index = (name?.length || 0) % colors.length
    return colors[index]
  }

  return (
    <div className="mt-12 border-t border-gray-100 pt-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-bold text-gray-900">Avaliações</h2>
          <span className="text-sm text-gray-400">({total})</span>
        </div>
        {total > 0 && avgRating != null && (
          <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl">
            <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
            <span className="text-lg font-bold text-gray-900">{avgRating.toFixed(1)}</span>
            <span className="text-sm text-gray-400">/ 5</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-2xl">
          <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma avaliação ainda</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reviews.map((review) => (
              <div
                key={review._id}
                className="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-sm transition"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getAvatarColor(review.nome_usuario)}`}>
                    <span className="text-sm font-bold">{getInitial(review.nome_usuario)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-semibold text-gray-900 text-sm truncate">
                        {review.nome_usuario}
                      </h4>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatDate(review.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5 mt-1">
                      {renderStars(review.nota)}
                    </div>
                    {review.comentario && (
                      <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                        "{review.comentario}"
                      </p>
                    )}
                    {review.resposta_loja && (
                      <div className="mt-3 pl-3 border-l-2 border-primary/40 bg-primary/5 rounded-r-lg py-2 pr-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary mb-0.5">
                          Resposta da farmácia
                        </p>
                        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                          {review.resposta_loja}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-3 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-500">
                {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
