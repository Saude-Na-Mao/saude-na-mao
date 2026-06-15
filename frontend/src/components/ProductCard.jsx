import { ShoppingCart, Heart, Info, AlertTriangle, FileText } from 'lucide-react'
import { useCartStore, useFavoritesStore, useUiStore } from '../stores/store'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ProdutoDetalheModal from './ProdutoDetalheModal'
import { resolveMediaUrl } from '../utils/mediaUrl'
import {
  getDisplayPrice,
  getAvailableStock,
  isRemoteCheckoutBlocked,
  isProductUnavailable,
  requiresPrescription,
  shouldHideProductImage,
} from '../utils/compliance'

export default function ProductCard({ product }) {
  const { addItem, replaceCartWithItem } = useCartStore()
  const { toggleFavorite, isFavorite } = useFavoritesStore()
  const { addNotification } = useUiStore()
  const navigate = useNavigate()
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const [showConflict, setShowConflict] = useState(false)
  const [conflictPharmacy, setConflictPharmacy] = useState('')
  const [modalAberto, setModalAberto] = useState(false)

  const favorite = isFavorite(product.id || product._id)

  const displayPrice = getDisplayPrice(product)
  const requiresRx = requiresPrescription(product)
  const remoteBlocked = isRemoteCheckoutBlocked(product)
  const hideImage = shouldHideProductImage(product)
  const availableStock = getAvailableStock(product)
  const isOutOfStock = isProductUnavailable(product)

  const productData = {
    ...product,
    preco: displayPrice,
    estoque: availableStock,
    classificacao_receita: product.classificacao_receita || 'sem_receita',
    receita_obrigatoria: requiresRx,
    quantity,
  }

  const handleAddToCart = () => {
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
    setTimeout(() => setAdded(false), 2000)
  }

  const handleToggleFavorite = () => {
    const result = toggleFavorite({
      id: product.id || product._id,
      nome: product.nome,
      preco: product.preco,
      imagem_url: product.imagem,
      id_farmacia: product.id_farmacia,
    })

    if (result?.authRequired) {
      addNotification?.({ type: 'warning', message: 'Faça login para favoritar produtos.' })
      navigate('/login')
    }
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
    setTimeout(() => setAdded(false), 2000)
  }

  const imageSrc = resolveMediaUrl(
    product.imagem || product.imagem_url || product.imagens?.[0],
  ) || 'https://via.placeholder.com/200'

  return (
    <div className={`rounded-lg shadow-md overflow-hidden transition transform hover:-translate-y-1 h-full flex flex-col ${
      isOutOfStock 
        ? 'bg-gray-100 opacity-60 hover:opacity-70' 
        : 'bg-white hover:shadow-lg'
    }`}>
      <div className={`h-48 flex items-center justify-center relative ${
        isOutOfStock 
          ? 'bg-gradient-to-br from-gray-100 to-gray-200' 
          : 'bg-gradient-to-br from-blue-50 to-green-50'
      }`}>
        {hideImage ? (
          <FileText className={`w-16 h-16 ${isOutOfStock ? 'text-gray-300' : 'text-amber-500'}`} />
        ) : (
          <img
            src={imageSrc}
            alt={product.nome}
            className={`h-32 w-32 object-contain ${isOutOfStock ? 'grayscale' : ''}`}
          />
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-t-lg">
            <span className="bg-red-600 text-white font-bold px-4 py-2 rounded-lg text-sm">
              FORA DE ESTOQUE
            </span>
          </div>
        )}
        <button
          onClick={handleToggleFavorite}
          className="absolute top-2 left-2 p-1.5 rounded-full bg-white/80 hover:bg-white shadow-sm transition"
          aria-label={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          disabled={isOutOfStock}
        >
          <Heart className={`w-5 h-5 transition ${favorite ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
        </button>
        {requiresRx && (
          <span className="absolute top-2 right-2 bg-amber-500 text-white text-xs px-2 py-1 rounded">
            Receita
          </span>
        )}
      </div>

      <div className="p-4 flex flex-1 flex-col">
        {remoteBlocked && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p>
              <span className="font-medium">Controlado bloqueado.</span>
              {' '}Este item exige atendimento direto da farmácia antes de qualquer compra online.
            </p>
          </div>
        )}
        <h3 className={`font-semibold line-clamp-2 mb-2 ${isOutOfStock ? 'text-gray-500' : 'text-gray-800'}`}>
          {product.nome}
        </h3>

        {product.descricao && (
          <p className={`text-xs mb-3 line-clamp-1 ${isOutOfStock ? 'text-gray-400' : 'text-gray-600'}`}>
            {product.descricao}
          </p>
        )}

        <div className="mb-4">
          <div className={`text-2xl font-bold ${isOutOfStock ? 'text-gray-400 line-through' : 'text-primary'}`}>
            R$ {displayPrice.toFixed(2)}
          </div>
          {!isOutOfStock ? (
            <p className="text-xs text-green-600 font-semibold">Disponível</p>
          ) : (
            <p className="text-xs text-red-600 font-semibold">Fora de estoque</p>
          )}
        </div>

        <div className="space-y-2 mt-auto">
          {!isOutOfStock && (
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="px-2 py-1 border rounded hover:bg-gray-100"
              >
                -
              </button>
              <span className="flex-1 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity(Math.min(availableStock, quantity + 1))}
                className="px-2 py-1 border rounded hover:bg-gray-100"
              >
                +
              </button>
            </div>
          )}

          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock || remoteBlocked}
            className={`w-full py-2 rounded font-semibold flex items-center justify-center gap-2 transition ${
              added
                ? 'bg-green-500 text-white'
                : isOutOfStock || remoteBlocked
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-primary text-white hover:bg-secondary'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            {remoteBlocked ? 'Atendimento da farmácia' : isOutOfStock ? 'Indisponível' : added ? 'Adicionado!' : 'Adicionar ao Carrinho'}
          </button>

          <button
            onClick={() => setModalAberto(true)}
            className="w-full py-2 rounded font-semibold flex items-center justify-center gap-2 transition border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm"
          >
            <Info className="w-4 h-4" />
            Ver detalhes / Tirar dúvida
          </button>
        </div>
      </div>

      <ProdutoDetalheModal
        produto={product}
        isOpen={modalAberto}
        onClose={() => setModalAberto(false)}
      />

      {showConflict && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowConflict(false)}>
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Farmácia diferente</h3>
            <p className="text-sm text-gray-600 mb-4">
              Seu carrinho contém itens de <strong>{conflictPharmacy}</strong>. Deseja limpar o carrinho e adicionar itens de outra farmácia?
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
