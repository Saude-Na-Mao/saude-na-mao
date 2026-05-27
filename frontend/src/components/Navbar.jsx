import { Link, useNavigate, useLocation } from 'react-router-dom'
import { ShoppingCart, User, LogOut, Menu, X, Home, Package2, MessageSquare, FileText, Shield, Store, ClipboardList, Truck, Heart } from 'lucide-react'
import { useAuthStore, useCartStore, useUiStore, useFavoritesStore } from '../stores/store'
import { pharmacistService } from '../services/api'
import AccessibilityMenu from './AccessibilityMenu'
import DarkModeToggle from './DarkModeToggle'
import Logger from '../utils/logger'

const logger = new Logger('Navbar')

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, isAuthenticated } = useAuthStore()
  const { getItemCount } = useCartStore()
  const { isMobileMenuOpen, toggleMobileMenu, closeMobileMenu } = useUiStore()
  const favoriteCount = useFavoritesStore((state) => state.items.length)

  const cartCount = getItemCount()
  const isAuth = isAuthenticated()
  const role = user?.tipo_usuario || user?.role
  const isPharmacist = isAuth && role === 'farmaceutico'
  const isPharmacyOwner = isAuth && role === 'dono_farmacia'
  const isDriver = isAuth && role === 'entregador'
  const isClient = isAuth && role === 'cliente'
  const isAdmin = isAuth && (role === 'administrador' || role === 'admin')

  const handleLogout = async () => {
    try {
      if (isPharmacist || isPharmacyOwner) {
        try {
          await pharmacistService.setPresence(false)
        } catch {
          /* ignore */
        }
      }
      logout()
      logger.info('User logged out from navbar')
      closeMobileMenu()
      navigate('/login')
    } catch (error) {
      logger.error('Logout failed', error)
    }
  }

  const handleNavClick = (path) => {
    navigate(path)
    closeMobileMenu()
  }

  const isActive = (path) => location.pathname === path

  const navLinkClass = (path) =>
    `relative text-sm font-medium transition-colors duration-200 flex items-center gap-1.5 py-1 ${
      isActive(path)
        ? 'text-primary'
        : 'text-gray-600 hover:text-primary'
    }`

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100" role="navigation" aria-label="Navegação principal">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg">Pular para o conteúdo</a>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex justify-between items-center h-16">
          <Link 
            to={isPharmacist ? '/farmaceutico' : isPharmacyOwner ? '/dono-farmacia' : isDriver ? '/entregas' : '/'} 
            className="flex items-center gap-2.5 group"
            onClick={() => closeMobileMenu()}
          >
            <div className="w-9 h-9 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
              <span className="text-white text-lg font-bold">S</span>
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-lg text-gray-900 tracking-tight">Saúde</span>
              <span className="font-bold text-lg text-primary tracking-tight"> na Mão</span>
            </div>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            {isPharmacist ? (
              <>
                <Link to="/farmaceutico" className={navLinkClass('/farmaceutico')}>
                  <ClipboardList className="w-4 h-4" />
                  Painel
                </Link>
              </>
            ) : isPharmacyOwner ? (
              <>
                <Link to="/dono-farmacia" className={navLinkClass('/dono-farmacia')}>
                  <Store className="w-4 h-4" />
                  Farmácia
                </Link>
              </>
            ) : isDriver ? (
              <>
                <Link to="/entregas" className={navLinkClass('/entregas')}>
                  <Truck className="w-4 h-4" />
                  Entregas
                </Link>
                <span className="mx-2 text-gray-200">|</span>
                <Link to="/suporte" className={navLinkClass('/suporte')}>
                  <MessageSquare className="w-4 h-4" />
                  Suporte
                </Link>
              </>
            ) : (
              <>
                <Link to="/" className={navLinkClass('/')}>
                  <Home className="w-4 h-4" />
                  Início
                </Link>
                <span className="mx-2 text-gray-200">|</span>
                <Link to="/farmacias" className={navLinkClass('/farmacias')}>
                  <Store className="w-4 h-4" />
                  Farmácias
                </Link>
                <span className="mx-2 text-gray-200">|</span>
                <Link to="/produtos" className={navLinkClass('/produtos')}>
                  <Package2 className="w-4 h-4" />
                  Produtos
                </Link>
                <span className="mx-2 text-gray-200">|</span>
                <Link to="/suporte" className={navLinkClass('/suporte')}>
                  <MessageSquare className="w-4 h-4" />
                  Suporte
                </Link>
              </>
            )}
          </div>

          {/* Desktop right side */}
          <div className="hidden md:flex items-center gap-3">
            <AccessibilityMenu />
            <DarkModeToggle />

            {isClient && (
              <Link 
                to="/carrinho"
                className="relative p-2 text-gray-500 hover:text-primary hover:bg-primary/5 rounded-xl transition-all duration-200"
                aria-label={`Carrinho${cartCount > 0 ? ` (${cartCount} ${cartCount === 1 ? 'item' : 'itens'})` : ''}`}
              >
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full w-4.5 h-4.5 min-w-[18px] min-h-[18px] flex items-center justify-center font-bold leading-none">
                    {cartCount}
                  </span>
                )}
              </Link>
            )}

            {isClient && (
              <Link
                to="/favoritos"
                className="relative p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200"
                aria-label="Favoritos"
              >
                <Heart className={`w-5 h-5 ${favoriteCount > 0 ? 'fill-red-500 text-red-500' : ''}`} />
              </Link>
            )}

            <div className="h-8 w-px bg-gray-200" />

            {isAuth && user ? (
              <div className="flex items-center gap-2">
                {isPharmacist || isPharmacyOwner ? (
                  <Link
                    to="/perfil"
                    className="flex items-center gap-2 text-sm text-gray-700 hover:text-primary transition-colors px-3 py-2 rounded-xl hover:bg-primary/5"
                  >
                    <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                      <Shield className="w-4 h-4 text-emerald-600" />
                    </div>
                    <span className="font-medium">{user.nome?.split(' ')[0] || (isPharmacist ? 'Farmacêutico' : 'Dono Farmácia')}</span>
                  </Link>
                ) : isDriver ? (
                  <Link
                    to="/perfil"
                    className="flex items-center gap-2 text-sm text-gray-700 hover:text-primary transition-colors px-3 py-2 rounded-xl hover:bg-primary/5"
                  >
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <Truck className="w-4 h-4 text-blue-600" />
                    </div>
                    <span className="font-medium">{user.nome?.split(' ')[0] || 'Entregador'}</span>
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/perfil"
                      className="flex items-center gap-2 text-sm text-gray-700 hover:text-primary transition-colors px-3 py-2 rounded-xl hover:bg-primary/5"
                    >
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium">{user.nome?.split(' ')[0] || 'Perfil'}</span>
                    </Link>
                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="flex items-center gap-1.5 px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all text-sm font-medium"
                        title="Painel Admin"
                      >
                        <Shield className="w-4 h-4" />
                        <span className="hidden lg:inline">Admin</span>
                      </Link>
                    )}
                  </>
                )}
                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  aria-label="Sair"
                  title="Sair"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link 
                  to="/login" 
                  className="text-sm font-medium text-gray-600 hover:text-primary px-3 py-2 rounded-xl transition-colors"
                >
                  Entrar
                </Link>
                <Link 
                  to="/registro" 
                  className="text-sm font-semibold bg-primary text-white px-4 py-2 rounded-xl hover:bg-secondary transition-all shadow-sm hover:shadow-md"
                >
                  Criar Conta
                </Link>
              </div>
            )}
          </div>

          {/* Mobile right side */}
          <div className="flex md:hidden items-center gap-2">
            {isClient && (
              <Link 
                to="/carrinho"
                className="relative p-2 text-gray-600 hover:text-primary transition"
                onClick={() => closeMobileMenu()}
                aria-label={`Carrinho${cartCount > 0 ? ` (${cartCount} ${cartCount === 1 ? 'item' : 'itens'})` : ''}`}
              >
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full min-w-[18px] min-h-[18px] flex items-center justify-center font-bold leading-none">
                    {cartCount}
                  </span>
                )}
              </Link>
            )}

            {isClient && (
              <Link
                to="/favoritos"
                className="relative p-2 text-gray-600 hover:text-red-500 transition"
                onClick={() => closeMobileMenu()}
                aria-label="Favoritos"
              >
                <Heart className={`w-5 h-5 ${favoriteCount > 0 ? 'fill-red-500 text-red-500' : ''}`} />
              </Link>
            )}

            <button
              onClick={toggleMobileMenu}
              className="p-2 text-gray-600 hover:text-primary hover:bg-gray-50 rounded-xl transition"
              aria-label={isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div id="mobile-menu" className="md:hidden border-t border-gray-100 py-3 space-y-1 animate-slide-down" role="menu">
            {isPharmacist ? (
              <>
                <button
                  onClick={() => handleNavClick('/farmaceutico')}
                  className={`flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl text-sm transition ${
                    isActive('/farmaceutico') ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <ClipboardList className="w-4 h-4" /> Painel Farmacêutico
                </button>
                <button
                  onClick={() => handleNavClick('/perfil')}
                  className={`flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl text-sm transition ${
                    isActive('/perfil') ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <User className="w-4 h-4" /> Meu Perfil
                </button>
              </>
            ) : isPharmacyOwner ? (
              <>
                <button
                  onClick={() => handleNavClick('/dono-farmacia')}
                  className={`flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl text-sm transition ${
                    isActive('/dono-farmacia') ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Store className="w-4 h-4" /> Minha Farmácia
                </button>
                <button
                  onClick={() => handleNavClick('/perfil')}
                  className={`flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl text-sm transition ${
                    isActive('/perfil') ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <User className="w-4 h-4" /> Meu Perfil
                </button>
              </>
            ) : isDriver ? (
              <>
                <button
                  onClick={() => handleNavClick('/entregas')}
                  className={`flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl text-sm transition ${
                    isActive('/entregas') ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Truck className="w-4 h-4" /> Minhas Entregas
                </button>
                <button
                  onClick={() => handleNavClick('/suporte')}
                  className={`flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl text-sm transition ${
                    isActive('/suporte') ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" /> Suporte
                </button>
                <button
                  onClick={() => handleNavClick('/perfil')}
                  className={`flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl text-sm transition ${
                    isActive('/perfil') ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <User className="w-4 h-4" /> Meu Perfil
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleNavClick('/')}
                  className={`flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl text-sm transition ${
                    isActive('/') ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Home className="w-4 h-4" /> Início
                </button>
                <button
                  onClick={() => handleNavClick('/farmacias')}
                  className={`flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl text-sm transition ${
                    isActive('/farmacias') ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Store className="w-4 h-4" /> Farmácias
                </button>
                <button
                  onClick={() => handleNavClick('/produtos')}
                  className={`flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl text-sm transition ${
                    isActive('/produtos') ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Package2 className="w-4 h-4" /> Produtos
                </button>
                <button
                  onClick={() => handleNavClick('/suporte')}
                  className={`flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl text-sm transition ${
                    isActive('/suporte') ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" /> Suporte
                </button>
              </>
            )}

            <div className="h-px bg-gray-100 my-2" />

            {isAuth && user ? (
              <>
                {isClient && (
                  <button
                    onClick={() => handleNavClick('/perfil')}
                    className="flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition"
                  >
                    <User className="w-4 h-4" /> Meu Perfil
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => handleNavClick('/admin')}
                    className="flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition"
                  >
                    <Shield className="w-4 h-4" /> Painel Admin
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 transition"
                >
                  <LogOut className="w-4 h-4" /> Sair
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2 px-4 pt-2">
                <Link
                  to="/login"
                  onClick={() => closeMobileMenu()}
                  className="text-center py-2.5 text-sm font-medium text-primary border border-primary rounded-xl hover:bg-primary/5 transition"
                >
                  Entrar
                </Link>
                <Link
                  to="/registro"
                  onClick={() => closeMobileMenu()}
                  className="text-center py-2.5 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-secondary transition"
                >
                  Criar Conta
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
