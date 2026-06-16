import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Navigate, Routes, Route, useLocation, useSearchParams } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import PrivateRoute from './components/PrivateRoute'
import Logger from './utils/logger'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ChatSupport from './components/ChatSupport'
import MiniCart from './components/MiniCart'
import NotificationToast from './components/NotificationToast'
import Home from './pages/Home'
import Farmacias from './pages/Farmacias'
import FarmaciaDetalhe from './pages/FarmaciaDetalhe'
import Produtos from './pages/Produtos'
import Carrinho from './pages/Carrinho'
import Checkout from './pages/Checkout'
import CheckoutIA from './pages/CheckoutIA'
import Receita from './pages/Receita'
import ReceitaDigital from './pages/ReceitaDigital'
import AnalyticsDashboard from './pages/AnalyticsDashboard'
import SecurityAuditDashboard from './pages/SecurityAuditDashboard'
import Login from './pages/Login'
import Registro from './pages/Registro'
import Perfil from './pages/Perfil'
import Favoritos from './pages/Favoritos'
import ClienteChats from './pages/ClienteChats'
import ClienteReceitas from './pages/ClienteReceitas'
import Pedidos from './pages/Pedidos'
import Rastreamento from './pages/Rastreamento'
import MedicineTracking from './pages/MedicineTracking'
import QRVerification from './components/QRVerification'
import Suporte from './pages/Suporte'
import Admin from './pages/Admin'
import Farmaceutico from './pages/Farmaceutico'
import PharmacistDashboard from './pages/PharmacistDashboard'
import PharmacyDashboard from './pages/PharmacyDashboard'
import EntregadorDashboard from './pages/EntregadorDashboard'
import Comprovante from './pages/Comprovante'
import Legal from './pages/Legal'
import MobileApp from './pages/MobileApp'
import LgpdConsentModal from './components/LgpdConsentModal'
import './App.css'

const logger = new Logger('App')

function isPhoneClient() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator?.userAgent || ''
  const mobileUA = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua)
  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches
  return mobileUA || (window.innerWidth <= 900 && coarsePointer)
}

function AppContent() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [phoneClient, setPhoneClient] = useState(isPhoneClient)
  const isMobileAppRoute = location.pathname === '/app' || searchParams.get('app') === '1'
  const isMobileAppLocked =
    typeof window !== 'undefined' && window.sessionStorage?.getItem('ssm_mobile_app_lock') === '1'

  useEffect(() => {
    const refreshPhoneClient = () => setPhoneClient(isPhoneClient())
    window.addEventListener('resize', refreshPhoneClient)
    return () => window.removeEventListener('resize', refreshPhoneClient)
  }, [])

  if ((phoneClient || isMobileAppLocked) && location.pathname !== '/app') {
    return <Navigate to="/app" replace />
  }

  return (
    <div className="flex flex-col min-h-screen">
      {!isMobileAppRoute && <Navbar />}
      <NotificationToast />
      {!isMobileAppRoute && <LgpdConsentModal />}
      <main id="main-content" className="flex-1 min-w-0">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/farmacias" element={<Farmacias />} />
          <Route path="/farmacia/:id" element={<FarmaciaDetalhe />} />
          <Route path="/produtos" element={<Produtos />} />
          <Route path="/carrinho" element={<Carrinho />} />
          <Route
            path="/checkout"
            element={
              <PrivateRoute excludeRoles={['farmacia', 'dono_farmacia', 'farmaceutico']}>
                <Checkout />
              </PrivateRoute>
            }
          />
          <Route
            path="/checkout-ia"
            element={
              <PrivateRoute excludeRoles={['farmacia']}>
                <CheckoutIA />
              </PrivateRoute>
            }
          />
          <Route
            path="/receita"
            element={
              <PrivateRoute excludeRoles={['farmacia']}>
                <Receita />
              </PrivateRoute>
            }
          />
          <Route
            path="/receita-digital/:id"
            element={
              <PrivateRoute>
                <ReceitaDigital />
              </PrivateRoute>
            }
          />
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Registro />} />
          <Route
            path="/perfil"
            element={
              <PrivateRoute>
                <Perfil />
              </PrivateRoute>
            }
          />
          <Route
            path="/favoritos"
            element={
              <PrivateRoute requiredRole="cliente">
                <Favoritos />
              </PrivateRoute>
            }
          />
          <Route
            path="/chats"
            element={
              <PrivateRoute requiredRole="cliente">
                <ClienteChats />
              </PrivateRoute>
            }
          />
          <Route
            path="/minhas-receitas"
            element={
              <PrivateRoute requiredRole="cliente">
                <ClienteReceitas />
              </PrivateRoute>
            }
          />
          <Route
            path="/pedidos"
            element={
              <PrivateRoute excludeRoles={['farmacia']}>
                <Pedidos />
              </PrivateRoute>
            }
          />
          <Route
            path="/rastreamento/:id"
            element={
              <PrivateRoute excludeRoles={['farmacia']}>
                <Rastreamento />
              </PrivateRoute>
            }
          />
          <Route
            path="/medicamento/rastreamento/:id"
            element={
              <PrivateRoute excludeRoles={['farmacia']}>
                <MedicineTracking />
              </PrivateRoute>
            }
          />
          <Route
            path="/verificar-medicamento"
            element={
              <PrivateRoute>
                <QRVerification />
              </PrivateRoute>
            }
          />
          <Route
            path="/pedido/:id/comprovante"
            element={
              <PrivateRoute excludeRoles={['farmacia']}>
                <Comprovante />
              </PrivateRoute>
            }
          />
          <Route path="/suporte" element={<Suporte />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="/app" element={<MobileApp />} />
          <Route
            path="/admin"
            element={
              <PrivateRoute requiredRoles={['admin', 'administrador']}>
                <Admin />
              </PrivateRoute>
            }
          />
          <Route
            path="/farmaceutico"
            element={
              <PrivateRoute requiredRole="farmaceutico">
                <PharmacistDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/dono-farmacia"
            element={
              <PrivateRoute requiredRole="dono_farmacia">
                <Farmaceutico />
              </PrivateRoute>
            }
          />
          <Route
            path="/dashboard/farmacia"
            element={
              <PrivateRoute requiredRole="farmacia">
                <PharmacyDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/dashboard/analytics"
            element={
              <PrivateRoute requiredRole="farmacia">
                <AnalyticsDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/dashboard/seguranca"
            element={
              <PrivateRoute requiredRole="administrador">
                <SecurityAuditDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/entregas"
            element={
              <PrivateRoute requiredRole="entregador">
                <EntregadorDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/entregador"
            element={
              <PrivateRoute requiredRole="entregador">
                <EntregadorDashboard />
              </PrivateRoute>
            }
          />
        </Routes>
      </main>
      {!isMobileAppRoute && <Footer />}
      {!isMobileAppRoute && <MiniCart />}
      {!isMobileAppRoute && <ChatSupport />}
    </div>
  )
}

function App() {
  logger.info('App initialized')

  return (
    <ErrorBoundary>
      <Router>
        <AppContent />
      </Router>
    </ErrorBoundary>
  )
}

export default App
