import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useFavoritesStore, useCartStore, useUiStore, useAuthStore } from '../stores/store'
import { productService } from '../services/api'
import { Heart, ShoppingCart, Trash2 } from 'lucide-react'
import { resolveMediaUrl } from '../utils/mediaUrl'

export default function Favoritos() {
  const { items, toggleFavorite, clearFavorites, setFavorites } = useFavoritesStore()
  const { addItem } = useCartStore()
  const { addNotification } = useUiStore()
  const { user } = useAuthStore()
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [attemptedDemo, setAttemptedDemo] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const isTestClient = String(user?.email || '').toLowerCase() === 'teste@teste.com'
    if (!isTestClient || items.length > 0 || loadingDemo || attemptedDemo) return

    let cancelled = false
    async function loadDemoFavorites() {
      try {
        setAttemptedDemo(true)
        setLoadingDemo(true)
        const res = await productService.getAll({ limit: 8 })
        const data = res.data?.data
        const list = Array.isArray(data) ? data : data?.docs || data?.produtos || []
        const favorites = list.slice(0, 4).map((product) => ({
          id: product._id || product.id,
          nome: product.nome,
          preco: product.preco_final || product.preco || 0,
          imagem_url: product.imagem_url || product.imagens?.[0],
          id_farmacia:
            typeof product.id_farmacia === 'object'
              ? product.id_farmacia?._id
              : product.id_farmacia,
          nome_farmacia:
            typeof product.id_farmacia === 'object'
              ? product.id_farmacia?.nome
              : product.nome_farmacia,
        })).filter((product) => product.id)
        if (!cancelled && favorites.length > 0) setFavorites(favorites)
      } catch {
        /* demo fallback opcional */
      } finally {
        if (!cancelled) setLoadingDemo(false)
      }
    }

    loadDemoFavorites()
    return () => {
      cancelled = true
    }
  }, [user?.email, items.length, loadingDemo, attemptedDemo, setFavorites])

  const handleToggleFavorite = (product) => {
    const result = toggleFavorite(product)
    if (result?.authRequired) {
      addNotification?.({ type: 'warning', message: 'Faça login para favoritar produtos.' })
      navigate('/login')
    }
  }

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">
          {loadingDemo ? 'Carregando favoritos...' : 'Nenhum favorito ainda'}
        </h1>
        <p className="text-gray-500 mb-6">Salve seus medicamentos preferidos para encontrá-los rapidamente</p>
        <Link to="/produtos" className="inline-block bg-primary text-white px-6 py-3 rounded-xl font-semibold hover:bg-secondary transition">
          Explorar Produtos
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Heart className="w-8 h-8 text-red-500 fill-red-500" />
            Meus Favoritos
          </h1>
          <p className="text-gray-500 mt-1">{items.length} produto{items.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { if (window.confirm('Limpar todos os favoritos?')) clearFavorites() }}
          className="text-sm text-red-500 hover:text-red-700 transition flex items-center gap-1"
        >
          <Trash2 className="w-4 h-4" /> Limpar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {items.map((product) => (
          <div key={product.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition">
            <div className="bg-gradient-to-br from-blue-50 to-green-50 h-40 flex items-center justify-center relative">
              {product.imagem_url ? (
                <img src={resolveMediaUrl(product.imagem_url)} alt={product.nome} className="h-28 w-28 object-contain" />
              ) : (
                <div className="w-28 h-28 bg-gray-100 rounded-lg" />
              )}
              <button
                onClick={() => handleToggleFavorite(product)}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-white/80 hover:bg-white shadow-sm transition"
                aria-label="Remover dos favoritos"
              >
                <Heart className="w-5 h-5 fill-red-500 text-red-500" />
              </button>
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-gray-800 line-clamp-2 mb-2">{product.nome}</h3>
              <p className="text-xl font-bold text-primary mb-3">
                R$ {(product.preco || 0).toFixed(2)}
              </p>
              <button
                onClick={() => {
                  addItem({ ...product, quantity: 1 })
                }}
                className="w-full py-2 bg-primary text-white rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-secondary transition"
              >
                <ShoppingCart className="w-4 h-4" /> Adicionar ao Carrinho
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
