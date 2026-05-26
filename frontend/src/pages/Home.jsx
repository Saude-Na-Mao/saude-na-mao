import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { ShoppingCart, MapPin, Clock, Shield, Zap, ArrowRight, Star, Truck, CreditCard, Headphones, Tag, ChevronRight, Search, Percent } from 'lucide-react'
import { pharmacyService, productService } from '../services/api'
import api from '../services/api'
import { useAuthStore } from '../stores/store'
import ProductCard from '../components/ProductCard'
import { PharmacyCardSkeleton, ProductCardSkeleton } from '../components/Skeleton'

export default function Home() {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()
  const [pharmacies, setPharmacies] = useState([])
  const [coupons, setCoupons] = useState([])
  const [featuredProducts, setFeaturedProducts] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingPharmacies, setLoadingPharmacies] = useState(true)
  const [loadingProducts, setLoadingProducts] = useState(true)

  const authenticated = isAuthenticated()
  const isPharmacyRole = authenticated && ['dono_farmacia', 'farmaceutico'].includes(user?.role)
  const isDriver = authenticated && user?.role === 'entregador'

  useEffect(() => {
    pharmacyService.getAll()
      .then((res) => {
        const payload = res.data?.data
        const data = Array.isArray(payload) ? payload : payload?.docs ?? []
        setPharmacies(data.slice(0, 6))
      })
      .catch(() => {})
      .finally(() => setLoadingPharmacies(false))

    api.get('/cupons/ativos')
      .then((res) => {
        setCoupons(res.data?.data?.cupons || [])
      })
      .catch(() => {})

    productService.getFeatured()
      .then((res) => {
        const payload = res.data?.data
        const data = Array.isArray(payload) ? payload : payload?.produtos ?? payload?.docs ?? []
        setFeaturedProducts(data.slice(0, 8))
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false))
  }, [])

  if (isPharmacyRole) {
    return <Navigate to="/farmaceutico" replace />
  }

  if (isDriver) {
    return <Navigate to="/entregas" replace />
  }

  return (
    <div>
      <section className="relative bg-gradient-to-br from-primary-800 via-primary-700 to-secondary overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white rounded-full blur-3xl translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-white rounded-full blur-3xl -translate-x-1/3 translate-y-1/3" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 lg:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fade-in">
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm text-white/90 text-sm px-4 py-1.5 rounded-full mb-6">
                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                <span>Avaliado 4.9/5 por nossos clientes</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-tight tracking-tight">
                Sua farmácia
                <span className="block text-primary-200">na palma da mão</span>
              </h1>
              <p className="text-lg text-white/80 mb-8 max-w-lg leading-relaxed">
                Compare preços entre farmácias, aplique cupons e receba seus medicamentos em casa com o melhor frete de Goiânia.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/farmacias"
                  className="inline-flex items-center justify-center gap-2 bg-white text-primary-700 px-7 py-3.5 rounded-xl font-semibold hover:bg-gray-50 transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
                >
                  Ver Farmácias
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/suporte"
                  className="inline-flex items-center justify-center gap-2 border-2 border-white/30 text-white px-7 py-3.5 rounded-xl font-semibold hover:bg-white/10 transition-all backdrop-blur-sm"
                >
                  Fale Conosco
                </Link>
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); if (searchQuery.trim()) navigate(`/produtos?search=${encodeURIComponent(searchQuery.trim())}`) }}
                className="mt-8 max-w-lg"
              >
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar medicamentos, vitaminas..."
                    className="w-full pl-12 pr-28 py-3.5 rounded-xl text-gray-900 bg-white/95 backdrop-blur-sm shadow-lg focus:outline-none focus:ring-2 focus:ring-white/50 text-sm"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-white px-5 py-2 rounded-lg font-semibold text-sm hover:bg-secondary transition"
                  >
                    Buscar
                  </button>
                </div>
              </form>
            </div>
            <div className="hidden lg:flex items-center justify-center animate-fade-in">
              <div className="relative">
                <div className="w-80 h-80 bg-white/10 backdrop-blur rounded-full flex items-center justify-center">
                  <div className="w-60 h-60 bg-white/10 rounded-full flex items-center justify-center">
                    <div className="text-8xl">💊</div>
                  </div>
                </div>
                <div className="absolute top-4 right-0 bg-white rounded-2xl shadow-lg px-4 py-3 flex items-center gap-2 animate-slide-up">
                  <Truck className="w-5 h-5 text-primary" />
                  <span className="text-sm font-semibold text-gray-700">Entrega Grátis</span>
                </div>
                <div className="absolute bottom-8 left-0 bg-white rounded-2xl shadow-lg px-4 py-3 flex items-center gap-2 animate-slide-up" style={{ animationDelay: '0.2s' }}>
                  <Shield className="w-5 h-5 text-primary" />
                  <span className="text-sm font-semibold text-gray-700">100% Seguro</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 border-t border-white/10 pt-10">
            <div className="text-center">
              <div className="text-3xl font-bold text-white">50k+</div>
              <div className="text-white/60 text-sm mt-1">Pedidos Entregues</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white">4.9</div>
              <div className="text-white/60 text-sm mt-1">Avaliação Média</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white">2h</div>
              <div className="text-white/60 text-sm mt-1">Entrega Média</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white">1000+</div>
              <div className="text-white/60 text-sm mt-1">Produtos</div>
            </div>
          </div>
        </div>
      </section>

      {coupons.length > 0 && (
        <section className="py-10 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-orange-500" />
                <h2 className="text-xl font-bold text-gray-900">Cupons Disponíveis</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {coupons.slice(0, 3).map((coupon) => (
                <div key={coupon._id} className="bg-white rounded-xl border-2 border-dashed border-orange-200 p-5 flex items-center gap-4 hover:border-orange-400 transition">
                  <div className="w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Percent className="w-6 h-6 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-orange-600 text-sm">{coupon.codigo}</div>
                    <p className="text-gray-600 text-sm mt-0.5">{coupon.descricao}</p>
                    {coupon.minimo_pedido > 0 && (
                      <p className="text-xs text-gray-400 mt-1">Mín. R$ {coupon.minimo_pedido?.toFixed(2)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {(pharmacies.length > 0 || loadingPharmacies) && (
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between mb-8">
              <div>
                <span className="text-primary font-semibold text-sm uppercase tracking-wider">Perto de você</span>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">Farmácias em Goiânia</h2>
              </div>
              <Link to="/farmacias" className="text-primary font-semibold text-sm flex items-center gap-1 hover:gap-2 transition-all">
                Ver todas <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {loadingPharmacies
                ? Array.from({ length: 6 }).map((_, i) => <PharmacyCardSkeleton key={i} />)
                : pharmacies.map((pharmacy) => {
                const initial = pharmacy.nome?.charAt(0) || 'F'
                const colors = ['from-blue-500 to-blue-600', 'from-emerald-500 to-emerald-600', 'from-violet-500 to-violet-600', 'from-orange-500 to-orange-600', 'from-pink-500 to-pink-600', 'from-cyan-500 to-cyan-600']
                const colorIdx = pharmacy.nome?.length % colors.length || 0
                return (
                  <Link key={pharmacy._id} to={`/farmacia/${pharmacy._id}`} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
                    <div className={`h-24 bg-gradient-to-br ${colors[colorIdx]} flex items-center justify-center`}>
                      <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                        <span className="text-2xl font-bold text-white">{initial}</span>
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-gray-900 group-hover:text-primary transition-colors">{pharmacy.nome}</h3>
                      <div className="flex items-center gap-1.5 mt-1.5 mb-2">
                        <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                        <span className="text-sm font-semibold">{pharmacy.avaliacao?.toFixed(1)}</span>
                        <span className="text-gray-400 text-xs">({pharmacy.total_avaliacoes})</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                        <MapPin className="w-3 h-3" />
                        <span>{pharmacy.bairro}</span>
                        <span className="mx-1">·</span>
                        <Clock className="w-3 h-3" />
                        <span className="truncate">{pharmacy.horario_funcionamento}</span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {(featuredProducts.length > 0 || loadingProducts) && (
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between mb-8">
              <div>
                <span className="text-primary font-semibold text-sm uppercase tracking-wider">Destaque</span>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">Produtos em Destaque</h2>
              </div>
              <Link to="/produtos" className="text-primary font-semibold text-sm flex items-center gap-1 hover:gap-2 transition-all">
                Ver todos <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {loadingProducts
                ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
                : featuredProducts.map((product) => (
                    <ProductCard key={product._id || product.id} product={product} />
                  ))
              }
            </div>
          </div>
        </section>
      )}

      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-primary font-semibold text-sm uppercase tracking-wider">Nossos Diferenciais</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
              Por que escolher Saúde na Mão?
            </h2>
            <p className="text-gray-500 mt-3 max-w-2xl mx-auto">
              Oferecemos uma experiência completa de compra de medicamentos, com foco em agilidade, segurança e praticidade.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="card p-6 text-center group hover:-translate-y-1 transition-all duration-300">
              <div className="w-14 h-14 bg-blue-50 group-hover:bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-colors">
                <Zap className="text-blue-600 w-6 h-6" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Entrega Rápida</h3>
              <p className="text-gray-500 text-sm leading-relaxed">Receba seus medicamentos em até 4 horas na sua região</p>
            </div>

            <div className="card p-6 text-center group hover:-translate-y-1 transition-all duration-300">
              <div className="w-14 h-14 bg-green-50 group-hover:bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-colors">
                <CreditCard className="text-green-600 w-6 h-6" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Pagamento Seguro</h3>
              <p className="text-gray-500 text-sm leading-relaxed">Diversas formas de pagamento com total segurança</p>
            </div>

            <div className="card p-6 text-center group hover:-translate-y-1 transition-all duration-300">
              <div className="w-14 h-14 bg-purple-50 group-hover:bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-colors">
                <Shield className="text-purple-600 w-6 h-6" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Dados Protegidos</h3>
              <p className="text-gray-500 text-sm leading-relaxed">Suas informações sempre criptografadas e seguras</p>
            </div>

            <div className="card p-6 text-center group hover:-translate-y-1 transition-all duration-300">
              <div className="w-14 h-14 bg-orange-50 group-hover:bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-colors">
                <Headphones className="text-orange-600 w-6 h-6" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Suporte 24/7</h3>
              <p className="text-gray-500 text-sm leading-relaxed">Atendimento humanizado a qualquer momento</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-primary font-semibold text-sm uppercase tracking-wider">Como funciona</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
              Simples e rápido
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <span className="text-2xl font-bold text-primary">1</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Escolha a farmácia</h3>
              <p className="text-gray-500 text-sm">Compare preços e escolha a melhor opção</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <span className="text-2xl font-bold text-primary">2</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Finalize o pedido</h3>
              <p className="text-gray-500 text-sm">Escolha a forma de pagamento e confirme</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <span className="text-2xl font-bold text-primary">3</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Receba em casa</h3>
              <p className="text-gray-500 text-sm">Acompanhe em tempo real e receba com rapidez</p>
            </div>
          </div>
        </div>
      </section>

      {!isAuthenticated() && (
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="bg-gradient-to-br from-primary to-secondary rounded-3xl p-10 sm:p-14 text-white relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Pronto para começar?</h2>
              <p className="text-white/80 mb-8 text-lg max-w-md mx-auto">
                Cadastre-se agora e ganhe R$ 10 de desconto na primeira compra
              </p>
              <Link
                to="/registro"
                className="inline-flex items-center gap-2 bg-white text-primary-700 px-8 py-3.5 rounded-xl font-semibold hover:bg-gray-50 transition-all shadow-lg active:scale-[0.98]"
              >
                Criar Conta Grátis
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
      )}

      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="text-primary font-semibold text-sm uppercase tracking-wider">FAQ</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-2">
              Dúvidas Frequentes
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
            <div className="card p-6 hover:-translate-y-0.5 transition-all duration-300">
              <h3 className="font-semibold text-gray-900 mb-2">Como faço uma compra?</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Navegue pelo catálogo, adicione produtos ao carrinho e finalize a compra com segurança
              </p>
            </div>
            <div className="card p-6 hover:-translate-y-0.5 transition-all duration-300">
              <h3 className="font-semibold text-gray-900 mb-2">Quanto tempo leva a entrega?</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Entrega em até 4 horas para a região metropolitana
              </p>
            </div>
            <div className="card p-6 hover:-translate-y-0.5 transition-all duration-300">
              <h3 className="font-semibold text-gray-900 mb-2">Preciso de receita?</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Medicamentos controlados requerem receita. Você pode enviar via upload
              </p>
            </div>
            <div className="card p-6 hover:-translate-y-0.5 transition-all duration-300">
              <h3 className="font-semibold text-gray-900 mb-2">Como rastrear meu pedido?</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Rastreie em tempo real na página de pedidos
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
