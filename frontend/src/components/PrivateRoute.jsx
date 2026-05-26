import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/store'
import { PHARMACY_ROLES } from '../constants'
import Logger from '../utils/logger'

const logger = new Logger('PrivateRoute')

export function PrivateRoute({ children, requiredRole = null, requiredRoles = null, excludeRoles = [] }) {
  const { user, isAuthenticated } = useAuthStore()
  const isAuth = isAuthenticated()
  const userRole =
    user?.tipo_usuario ||
    user?.role ||
    (user?.dados_entregador ? 'entregador' : null)

  const getSafeRedirect = () => {
    if (PHARMACY_ROLES.includes(userRole)) return '/farmaceutico'
    if (userRole === 'entregador') return '/entregas'
    if (userRole === 'administrador' || userRole === 'admin') return '/admin'
    return '/perfil'
  }

  if (!isAuth) {
    logger.warn('Attempted to access protected route without authentication')
    return <Navigate to="/login" replace />
  }

  // Support single role or array of roles
  const allowed = requiredRoles || (requiredRole ? [requiredRole] : null)
  if (allowed && !allowed.includes(userRole)) {
    logger.warn(`User ${user?.id} attempted to access restricted route without permission`, {
      userRole,
      requiredRoles: allowed,
    })
    return <Navigate to={getSafeRedirect()} replace />
  }

  if (excludeRoles.length > 0 && excludeRoles.includes(userRole)) {
    return <Navigate to={getSafeRedirect()} replace />
  }

  return children
}

export default PrivateRoute
