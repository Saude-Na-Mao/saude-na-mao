/**
 * Constantes de Roles (Papéis) do Sistema SSM
 * Define todos os tipos de usuários e suas permissões
 */

const ROLES = {
  ADMIN: 'admin',
  CLIENTE: 'cliente',
  FARMACEUTICO: 'farmaceutico',
  DONO_FARMACIA: 'dono_farmacia',
  ENTREGADOR: 'entregador',
};

/**
 * Mapeamento de funcionalidades por role
 * Define exatamente o que cada tipo de usuário pode fazer
 */
const PERMISSIONS = {
  // ============ CLIENTE ============
  [ROLES.CLIENTE]: {
    descricao: 'Cliente final que compra medicamentos',
    features: [
      'browseFarmacias',        // Listar farmácias
      'viewProductos',          // Ver medicamentos disponíveis
      'addToCart',              // Adicionar ao carrinho
      'viewCart',               // Ver carrinho
      'checkout',               // Fazer checkout
      'viewPedidos',            // Ver seus pedidos
      'rastrearMedicamento',    // Rastrear entrega
      'viewReceitaDigital',     // Baixar receita digital
      'chatFarmaceutico',       // Chat com farmacêutico
      'editPerfil',             // Editar perfil pessoal
      'viewMinhasReceitas',     // Ver histórico de receitas
    ],
    rotas: [
      '/home',
      '/farmacias',
      '/farmacias/:id',
      '/produtos',
      '/carrinho',
      '/checkout',
      '/checkout-ia',
      '/pedidos',
      '/pedidos/:id',
      '/rastreamento/:id',
      '/receita-digital/:id',
      '/perfil',
    ],
  },

  // ============ FARMACÊUTICO ============
  [ROLES.FARMACEUTICO]: {
    descricao: 'Farmacêutico que valida receitas e medicamentos',
    features: [
      'dashboard',              // Ver dashboard de validações
      'validarReceita',         // Aprovar/rejeitar receita
      'verInteracoes',          // Verificar interações medicamentosas
      'chatComClientes',        // Responder chat dos clientes
      'viewAlertas',            // Ver alertas de fraude
      'editPerfil',             // Editar perfil
    ],
    rotas: [
      '/farmaceutico',
      '/farmaceutico/validacoes',
      '/farmaceutico/alertas',
      '/perfil',
    ],
  },

  // ============ DONO DE FARMÁCIA ============
  [ROLES.DONO_FARMACIA]: {
    descricao: 'Proprietário de farmácia (acesso B2B)',
    features: [
      'dashboardB2B',           // Dashboard de negócio
      'viewAnalytics',          // Ver analytics e gráficos
      'viewAuditLogs',          // Ver logs de auditoria
      'gerenciarFarmacia',      // Editar dados da farmácia
      'viewFarmaceuticos',      // Ver farmacêuticos cadastrados
      'addFarmaceutico',        // Adicionar farmacêutico
      'viewVendas',             // Ver relatório de vendas
      'detectarFraude',         // Ver detecção de fraude
      'editPerfil',             // Editar perfil
      'gerenciarMedicamentos',  // Cadastrar medicamentos
    ],
    rotas: [
      '/admin/dashboard',
      '/admin/analytics',
      '/admin/audit-logs',
      '/admin/farmacia',
      '/admin/farmaceuticos',
      '/admin/vendas',
      '/admin/fraude',
      '/perfil',
    ],
  },

  // ============ ENTREGADOR ============
  [ROLES.ENTREGADOR]: {
    descricao: 'Entregador de medicamentos',
    features: [
      'verPedidosAtribuidos',   // Ver pedidos para entregar
      'atualizarStatus',        // Atualizar status de entrega
      'coletarAssinatura',      // Coletar assinatura do cliente
      'tirarFoto',              // Tirar foto de prova
      'verMapa',                // Ver mapa de entrega
      'editPerfil',             // Editar perfil
    ],
    rotas: [
      '/entregador',
      '/entregador/pedidos',
      '/entregador/pedido/:id',
      '/perfil',
    ],
  },

  // ============ ADMIN ============
  [ROLES.ADMIN]: {
    descricao: 'Administrador do sistema (acesso total)',
    features: [
      '*',                      // Acesso a TUDO
    ],
    rotas: [
      '*',                      // Acesso a TODAS as rotas
    ],
  },
};

/**
 * Ações específicas que precisam de validação de permissão
 */
const ACTION_ROLES = {
  // Ações no endpoint de usuários
  'users.read': [ROLES.ADMIN, ROLES.CLIENTE],
  'users.update': [ROLES.ADMIN, ROLES.CLIENTE], // Cada um edita só seu perfil
  'users.delete': [ROLES.ADMIN],
  
  // Ações em farmácias
  'pharmacies.list': [ROLES.ADMIN, ROLES.CLIENTE, ROLES.FARMACEUTICO, ROLES.ENTREGADOR],
  'pharmacies.read': [ROLES.ADMIN, ROLES.CLIENTE, ROLES.FARMACEUTICO, ROLES.ENTREGADOR],
  'pharmacies.create': [ROLES.ADMIN, ROLES.DONO_FARMACIA],
  'pharmacies.update': [ROLES.ADMIN, ROLES.DONO_FARMACIA], // Só seu próprio
  'pharmacies.delete': [ROLES.ADMIN],
  
  // Ações em receitas/pedidos
  'prescriptions.create': [ROLES.ADMIN, ROLES.CLIENTE],
  'prescriptions.read': [ROLES.ADMIN, ROLES.CLIENTE, ROLES.FARMACEUTICO],
  'prescriptions.validate': [ROLES.ADMIN, ROLES.FARMACEUTICO],
  'prescriptions.delete': [ROLES.ADMIN],
  
  // Ações em medicamentos
  'products.read': [ROLES.ADMIN, ROLES.CLIENTE, ROLES.FARMACEUTICO, ROLES.ENTREGADOR],
  'products.create': [ROLES.ADMIN, ROLES.DONO_FARMACIA],
  'products.update': [ROLES.ADMIN, ROLES.DONO_FARMACIA],
  'products.delete': [ROLES.ADMIN],
  
  // Ações em entrega
  'deliveries.read': [ROLES.ADMIN, ROLES.ENTREGADOR, ROLES.CLIENTE],
  'deliveries.update': [ROLES.ADMIN, ROLES.ENTREGADOR],
  
  // Ações em analytics
  'analytics.read': [ROLES.ADMIN, ROLES.DONO_FARMACIA],
  
  // Ações em auditoria
  'audit.read': [ROLES.ADMIN, ROLES.DONO_FARMACIA],
};

module.exports = {
  ROLES,
  PERMISSIONS,
  ACTION_ROLES,
};
