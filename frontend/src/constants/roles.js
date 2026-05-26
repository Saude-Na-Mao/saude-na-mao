/**
 * constants/roles.js (Frontend)
 * Mapeamento de roles e permissões para o frontend
 */

export const ROLES = {
  ADMIN: "admin",
  CLIENTE: "cliente",
  FARMACEUTICO: "farmaceutico",
  DONO_FARMACIA: "dono_farmacia",
  ENTREGADOR: "entregador",
};

export const PERMISSIONS = {
  [ROLES.CLIENTE]: {
    label: "Cliente",
    descricao: "Cliente final que compra medicamentos",
    features: [
      "browseFarmacias",
      "viewProductos",
      "addToCart",
      "viewCart",
      "checkout",
      "viewPedidos",
      "rastrearMedicamento",
      "viewReceitaDigital",
      "chatFarmaceutico",
      "editPerfil",
      "viewMinhasReceitas",
    ],
  },
  [ROLES.FARMACEUTICO]: {
    label: "Farmacêutico",
    descricao: "Farmacêutico que valida receitas",
    features: [
      "dashboard",
      "validarReceita",
      "verInteracoes",
      "chatComClientes",
      "viewAlertas",
      "editPerfil",
    ],
  },
  [ROLES.DONO_FARMACIA]: {
    label: "Dono de Farmácia",
    descricao: "Proprietário e gestor de farmácia",
    features: [
      "dashboardB2B",
      "viewAnalytics",
      "viewAuditLogs",
      "gerenciarFarmacia",
      "viewFarmaceuticos",
      "addFarmaceutico",
      "viewVendas",
      "detectarFraude",
      "editPerfil",
      "gerenciarMedicamentos",
    ],
  },
  [ROLES.ENTREGADOR]: {
    label: "Entregador",
    descricao: "Entregador de medicamentos",
    features: [
      "verPedidosAtribuidos",
      "atualizarStatus",
      "coletarAssinatura",
      "tirarFoto",
      "verMapa",
      "editPerfil",
    ],
  },
  [ROLES.ADMIN]: {
    label: "Administrador",
    descricao: "Administrador do sistema",
    features: ["*"],
  },
};

export const MENU_ITEMS = {
  [ROLES.CLIENTE]: [
    { id: "home", label: "Início", icon: "home", path: "/" },
    { id: "farmacias", label: "Farmácias", icon: "store", path: "/farmacias" },
    {
      id: "carrinho",
      label: "Carrinho",
      icon: "shopping_cart",
      path: "/carrinho",
    },
    { id: "pedidos", label: "Meus Pedidos", icon: "receipt", path: "/pedidos" },
    {
      id: "receitas",
      label: "Minhas Receitas",
      icon: "description",
      path: "/receitas",
    },
    { id: "perfil", label: "Perfil", icon: "person", path: "/perfil" },
  ],
  [ROLES.FARMACEUTICO]: [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "dashboard",
      path: "/farmaceutico",
    },
    {
      id: "validacoes",
      label: "Validações",
      icon: "check_circle",
      path: "/farmaceutico/validacoes",
    },
    {
      id: "alertas",
      label: "Alertas",
      icon: "warning",
      path: "/farmaceutico/alertas",
    },
    { id: "perfil", label: "Perfil", icon: "person", path: "/perfil" },
  ],
  [ROLES.DONO_FARMACIA]: [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "dashboard",
      path: "/admin/dashboard",
    },
    {
      id: "analytics",
      label: "Analytics",
      icon: "analytics",
      path: "/admin/analytics",
    },
    {
      id: "farmacia",
      label: "Farmácia",
      icon: "store",
      path: "/admin/farmacia",
    },
    {
      id: "medicamentos",
      label: "Medicamentos",
      icon: "inventory",
      path: "/admin/medicamentos",
    },
    {
      id: "vendas",
      label: "Vendas",
      icon: "trending_up",
      path: "/admin/vendas",
    },
    { id: "fraude", label: "Fraude", icon: "security", path: "/admin/fraude" },
    {
      id: "auditoria",
      label: "Auditoria",
      icon: "audit",
      path: "/admin/audit-logs",
    },
    { id: "perfil", label: "Perfil", icon: "person", path: "/perfil" },
  ],
  [ROLES.ENTREGADOR]: [
    {
      id: "pedidos",
      label: "Pedidos",
      icon: "delivery_dining",
      path: "/entregador/pedidos",
    },
    { id: "mapa", label: "Mapa", icon: "map", path: "/entregador/mapa" },
    { id: "perfil", label: "Perfil", icon: "person", path: "/perfil" },
  ],
  [ROLES.ADMIN]: [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "dashboard",
      path: "/admin/dashboard",
    },
    {
      id: "usuarios",
      label: "Usuários",
      icon: "people",
      path: "/admin/usuarios",
    },
    {
      id: "farmacias",
      label: "Farmácias",
      icon: "store",
      path: "/admin/farmacias",
    },
    {
      id: "verificacoes",
      label: "Verificações",
      icon: "verified_user",
      path: "/admin/verificacoes",
    },
    { id: "fraude", label: "Fraude", icon: "security", path: "/admin/fraude" },
    {
      id: "auditoria",
      label: "Auditoria",
      icon: "audit",
      path: "/admin/audit-logs",
    },
    {
      id: "sistema",
      label: "Sistema",
      icon: "settings",
      path: "/admin/sistema",
    },
  ],
};
