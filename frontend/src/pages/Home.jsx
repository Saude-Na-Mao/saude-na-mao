import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { MapPin, Clock, Shield, Zap, ArrowRight, Star, Truck, CreditCard, Headphones, Tag, ChevronRight, Search, Percent } from 'lucide-react'
import { couponService, pharmacyService, productService } from '../services/api'
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

    couponService.getActive()
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
      <section className="bg-gradient-to-br from-primary-800 via-primary-700 to-secondary border-b border-primary-900/20">
        <div className="page-shell py-8 sm:py-10 lg:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr] gap-8 lg:gap-12 items-center">
            <div className="animate-fade-in">
              <div className="inline-flex items-center gap-2 bg-white/15 text-white text-xs sm:text-sm px-3 py-1.5 rounded-full mb-5">
                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                Compra segura com farmácias locais verificadas
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight tracking-normal">
                Medicamentos, farmácias e suporte farmacêutico em um só lugar
              </h1>
              <p className="text-base sm:text-lg text-white/80 mt-4 max-w-2xl leading-relaxed">
                Compare preços em Goiânia, envie receitas quando necessário e acompanhe a entrega sem sair do app.
              </p>

              <form
                onSubmit={(e) => { e.preventDefault(); if (searchQuery.trim()) navigate(`/produtos?search=${encodeURIComponent(searchQuery.trim())}`) }}
                className="mt-6 max-w-2xl"
              >
                <div className="flex flex-col sm:flex-row gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-soft">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar remédio, vitamina ou farmácia"
                      className="w-full pl-11 pr-3 py-3 text-gray-900 bg-transparent focus:outline-none text-sm sm:text-base"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 bg-primary text-white px-5 py-3 rounded-xl font-semibold text-sm hover:bg-secondary transition"
                  >
                    Buscar
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>

              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  { label: 'Farmácias abertas', to: '/farmacias' },
                  { label: 'Medicamentos populares', to: '/produtos' },
                  { label: 'Enviar receita', to: '/receita' },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => navigate(item.to)}
                    className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-2xl border border-white/20 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Pedido rápido</p>
                    <h2 className="mt-1 text-xl font-bold text-gray-900">Entrega em até 4 horas</h2>
                  </div>
                  <Truck className="w-9 h-9 text-emerald-600" />
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-emerald-200/70 pt-4 text-center">
                  <div>
                    <MapPin className="mx-auto mb-1 w-4 h-4 text-primary" />
                    <p className="text-[11px] font-medium text-gray-600">Bairro</p>
                  </div>
                  <div>
                    <CreditCard className="mx-auto mb-1 w-4 h-4 text-blue-600" />
                    <p className="text-[11px] font-medium text-gray-600">Pagamento</p>
                  </div>
                  <div>
                    <Clock className="mx-auto mb-1 w-4 h-4 text-orange-600" />
                    <p className="text-[11px] font-medium text-gray-600">Rastreamento</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/20 bg-emerald-50 p-5 text-gray-900 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <h2 className="font-bold">Receitas e controlados com validação</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      Fluxo pensado para segurança, LGPD e atendimento farmacêutico.
                    </p>
                    <Link to="/receita" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                      Enviar receita <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {[
              ['50k+', 'Pedidos entregues'],
              ['4.9', 'Avaliação média'],
              ['2h', 'Entrega média'],
              ['1000+', 'Produtos'],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl border border-white/15 bg-white/10 px-4 py-3">
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="text-xs text-white/70 mt-0.5">{label}</div>
              </div>
            ))}
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
          <div className="bg-gradient-to-br from-primary to-secondary rounded-2xl p-8 sm:p-12 text-white relative overflow-hidden">
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
