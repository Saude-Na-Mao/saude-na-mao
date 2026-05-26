/**
 * Middleware de Autenticação RBAC (Role-Based Access Control)
 * Valida JWT, extrai user data e verifica permissões
 */

const jwt = require('jsonwebtoken');
const { ROLES, ACTION_ROLES, PERMISSIONS } = require('../constants/roles');
const { getJwtSecrets } = require('../config/jwtSecrets');

/**
 * Middleware que verifica se o usuário tem um JWT válido
 * Extrai dados do token e os adiciona a req.user
 */
const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token não fornecido' 
      });
    }

    const { JWT_SECRET } = getJwtSecrets();
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      message: 'Token inválido ou expirado',
      error: error.message 
    });
  }
};

/**
 * Middleware que verifica se o usuário tem uma role específica
 * Uso: requireRoles(ROLES.ADMIN, ROLES.DONO_FARMACIA)
 */
const requireRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuário não autenticado' 
      });
    }

    const userRole = req.user.role;
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Acesso negado: seu perfil não tem permissão para esta ação',
        requiredRoles: allowedRoles,
        userRole: userRole
      });
    }

    next();
  };
};

/**
 * Middleware que verifica permissão por ação específica
 * Uso: requireAction('pharmacies.create')
 */
const requireAction = (action) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuário não autenticado' 
      });
    }

    const allowedRoles = ACTION_ROLES[action];
    
    if (!allowedRoles) {
      console.warn(`Ação "${action}" não definida em ACTION_ROLES`);
      return res.status(500).json({ 
        success: false, 
        message: 'Configuração de permissão não encontrada' 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: `Acesso negado: você não pode realizar a ação "${action}"`,
        requiredRoles: allowedRoles,
        userRole: req.user.role
      });
    }

    next();
  };
};

/**
 * Middleware que verifica se o usuário é proprietário do recurso
 * Uso: requireOwnership('pharmacyId', 'ownerUserId')
 */
const requireOwnership = (paramName, ownerField) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuário não autenticado' 
      });
    }

    // Admin pode fazer tudo
    if (req.user.role === ROLES.ADMIN) {
      return next();
    }

    const resourceId = req.params[paramName];
    const ownerId = req.body[ownerField] || req.user.id;

    if (req.user.id !== ownerId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Você só pode acessar seus próprios recursos' 
      });
    }

    next();
  };
};

/**
 * Middleware que verifica se usuário é Dono de Farmácia verificado
 * Requisito: Para criar/editar farmácias
 */
const requireVerifiedPharmacyOwner = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      message: 'Usuário não autenticado' 
    });
  }

  if (req.user.role !== ROLES.DONO_FARMACIA) {
    return res.status(403).json({ 
      success: false, 
      message: 'Apenas donos de farmácia verificados podem realizar esta ação' 
    });
  }

  if (!req.user.isPharmacyOwnerVerified) {
    return res.status(403).json({ 
      success: false, 
      message: 'Sua identidade de proprietário ainda não foi verificada. Por favor, complete o processo de verificação.',
      requiresVerification: true,
      documentStatus: req.user.documentVerificationStatus || 'not_submitted'
    });
  }

  next();
};

/**
 * Middleware que registra todas as ações (Auditoria)
 */
const auditLog = (req, res, next) => {
  const originalSend = res.send;

  res.send = function (data) {
    if (req.user) {
      const logEntry = {
        timestamp: new Date(),
        userId: req.user.id,
        userRole: req.user.role,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        ip: req.ip,
      };

      // Log para auditoria (em produção, salvar no banco de dados)
      if (process.env.LOG_AUDIT === 'true') {
        console.log('[AUDIT]', JSON.stringify(logEntry));
      }
    }

    return originalSend.call(this, data);
  };

  next();
};

module.exports = {
  authenticate,
  requireRoles,
  requireAction,
  requireOwnership,
  requireVerifiedPharmacyOwner,
  auditLog,
};
