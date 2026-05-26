/**
 * ProtectedRoute.jsx
 * Componente de rota protegida com validação de role
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { PERMISSIONS } from '../constants/roles';

const ProtectedRoute = ({ 
  component: Component, 
  requiredRole = null,
  requiredAction = null,
  ...rest 
}) => {
  const { user, isAuthenticated } = useAuthStore();

  // Não autenticado
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Verificar role
  if (requiredRole) {
    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!allowedRoles.includes(user.role)) {
      return <Navigate to="/acesso-negado" replace />;
    }
  }

  // Verificar action específica
  if (requiredAction) {
    const userPermissions = PERMISSIONS[user.role]?.features || [];
    if (!userPermissions.includes(requiredAction) && !userPermissions.includes('*')) {
      return <Navigate to="/acesso-negado" replace />;
    }
  }

  // Verificação especial para Dono de Farmácia
  if (user.role === 'dono_farmacia' && !user.isPharmacyOwnerVerified) {
    return <Navigate to="/verificacao-propriedade" replace />;
  }

  return <Component {...rest} />;
};

export default ProtectedRoute;
