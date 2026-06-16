import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, X, Trash2, ArrowRight, Package2, Store } from 'lucide-react'
import { useCartStore, useAuthStore } from '../stores/store'

/**
 * Mini carrinho fixo no lado direito (desktop): mostra os itens atuais,
 * permite ajustar quantidade/remover e leva ao carrinho para pagar.
 */
export default function MiniCart() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { user, isAuthenticated } = useAuthStore()
  const { items, updateQuantity, removeItem, getTotal, getItemCount } = useCartStore()

  const role = user?.tipo_usuario || user?.role
  const isClient = isAuthenticated() && role === 'cliente'

  if (!isClient || items.length === 0) return null

  const count = getItemCount()
  const total = getTotal()
  const pharmacyName = items[0]?.nome_farmacia || 'Farmácia'

  const goToCart = () => {
    setOpen(false)
    navigate('/carrinho')
  }

  return (
    <>
      {/* Aba lateral (somente desktop) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="hidden md:flex fixed right-0 top-1/3 z-40 flex-col items-center gap-1 rounded-l-xl bg-primary px-3 py-4 text-white shadow-lg hover:bg-secondary transition"
          aria-label={`Abrir mini carrinho (${count} itens)`}
        >
          <span className="relative">
            <ShoppingCart className="w-5 h-5" />
            <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold leading-none">
              {count}
            </span>
          </span>
          <span className="text-[10px] font-semibold [writing-mode:vertical-rl] rotate-180">Carrinho</span>
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="fixed right-0 top-16 bottom-0 z-50 flex w-[340px] max-w-[90vw] flex-col bg-white shadow-2xl border-l border-gray-100">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-gray-900">Seu carrinho</h3>
                <span className="text-xs text-gray-400">({count})</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 transition" aria-label="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100 text-gray-500">
              <Store className="w-3.5 h-3.5" />
              <span className="text-xs truncate">{pharmacyName}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3 rounded-xl border border-gray-100 p-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {item.imagem_url ? (
                      <img src={item.imagem_url} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <Package2 className="w-6 h-6 text-gray-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 line-clamp-2">{item.nome}</p>
                    <p className="text-sm font-bold text-primary mt-0.5">R$ {(item.preco * item.quantity).toFixed(2)}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex items-center border rounded-lg overflow-hidden">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="px-2 py-0.5 text-gray-500 hover:bg-gray-50 text-sm"
                        >-</button>
                        <span className="w-6 text-center text-xs font-medium">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="px-2 py-0.5 text-gray-500 hover:bg-gray-50 text-sm"
                        >+</button>
                      </div>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-gray-300 hover:text-red-500 transition ml-auto"
                        aria-label={`Remover ${item.nome}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Subtotal</span>
                <span className="text-lg font-bold text-gray-900">R$ {total.toFixed(2)}</span>
              </div>
              <button
                onClick={goToCart}
                className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:bg-secondary transition flex items-center justify-center gap-2"
              >
                Ir ao carrinho
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-[11px] text-gray-400 text-center">O pagamento é feito na página do carrinho</p>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
