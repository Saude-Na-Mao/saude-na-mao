const mongoose = require("mongoose");
const User = require("../models/User");
const Pharmacy = require("../models/Pharmacy");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Prescription = require("../models/Prescription");
const SupportMessage = require("../models/SupportMessage");
const AuditLog = require("../models/AuditLog");
const { logManual } = require("../middlewares/auditMiddleware");

const VALID_USER_TYPES = ["cliente", "entregador", "dono_farmacia", "farmaceutico", "administrador"];

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizePagination(page, limit, defaultLimit = 20) {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);

  return {
    page: Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage,
    limit:
      Number.isNaN(parsedLimit) || parsedLimit < 1 ? defaultLimit : parsedLimit,
  };
}

function normalizeObjectId(id, message) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError(message, 404);
  }

  return new mongoose.Types.ObjectId(id);
}

function getMonthRange(referenceDate = new Date()) {
  const start = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1,
  );
  const end = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    1,
  );

  return { start, end };
}

function sanitizeRegexValue(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getDashboardStats() {
  const { start, end } = getMonthRange();

  const [
    total_usuarios_ativos,
    total_farmacias_ativas,
    total_pedidos_mes,
    receitaMesAggregation,
    pedidosPorStatus,
    ultimos_pedidos,
    tickets_abertos,
    receitas_pendentes,
  ] = await Promise.all([
    User.countDocuments({ ativo: true }),
    Pharmacy.countDocuments({ ativa: true }),
    Order.countDocuments({ createdAt: { $gte: start, $lt: end } }),
    Payment.aggregate([
      {
        $match: {
          status: "aprovado",
          pago_em: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$valor" },
        },
      },
    ]),
    Order.aggregate([
      {
        $group: {
          _id: "$status",
          total: { $sum: 1 },
        },
      },
    ]),
    Order.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .populate({ path: "id_usuario", select: "nome email telefone" })
      .populate({ path: "id_farmacia", select: "nome cidade estado" }),
    SupportMessage.countDocuments({ status: "aberta" }),
    Prescription.countDocuments({ status: "Pendente" }),
  ]);

  return {
    total_usuarios_ativos,
    total_farmacias_ativas,
    total_pedidos_mes,
    receita_total_mes: receitaMesAggregation[0]?.total || 0,
    pedidos_por_status: pedidosPorStatus.reduce((accumulator, item) => {
      accumulator[item._id] = item.total;
      return accumulator;
    }, {}),
    ultimos_pedidos,
    tickets_abertos,
    receitas_pendentes,
  };
}

async function getRevenueReport({ dataInicio, dataFim, agrupar = "dia" }) {
  const formatos = {
    dia: "%Y-%m-%d",
    semana: "%G-W%V",
    mes: "%Y-%m",
  };

  const formato = formatos[agrupar] || formatos.dia;
  const match = { status: "aprovado" };

  if (dataInicio || dataFim) {
    match.pago_em = {};

    if (dataInicio) {
      match.pago_em.$gte = dataInicio;
    }

    if (dataFim) {
      match.pago_em.$lte = dataFim;
    }
  }

  const resultado = await Payment.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: {
            format: formato,
            date: "$pago_em",
          },
        },
        total: { $sum: "$valor" },
        quantidade: { $sum: 1 },
        valor_plataforma: { $sum: "$valor_plataforma" },
      },
    },
    {
      $project: {
        _id: 0,
        periodo: "$_id",
        total: 1,
        quantidade: 1,
        valor_plataforma: 1,
      },
    },
    { $sort: { periodo: 1 } },
  ]);

  return resultado;
}

async function getTopProducts(limit = 10) {
  const parsedLimit = Number.parseInt(limit, 10);
  const resolvedLimit =
    Number.isNaN(parsedLimit) || parsedLimit < 1 ? 10 : parsedLimit;

  const resultado = await Order.aggregate([
    { $unwind: "$itens" },
    {
      $group: {
        _id: "$itens.id_produto",
        total_vendido: { $sum: "$itens.quantidade" },
        receita: { $sum: "$itens.subtotal" },
      },
    },
    { $sort: { total_vendido: -1 } },
    { $limit: resolvedLimit },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "produto",
      },
    },
    {
      $unwind: {
        path: "$produto",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 0,
        produto: "$produto",
        total_vendido: 1,
        receita: 1,
      },
    },
  ]);

  return resultado;
}

async function getTopPharmacies(limit = 10) {
  const parsedLimit = Number.parseInt(limit, 10);
  const resolvedLimit =
    Number.isNaN(parsedLimit) || parsedLimit < 1 ? 10 : parsedLimit;

  const resultado = await Order.aggregate([
    {
      $group: {
        _id: "$id_farmacia",
        total_pedidos: { $sum: 1 },
        receita: { $sum: "$total" },
      },
    },
    { $sort: { receita: -1 } },
    { $limit: resolvedLimit },
    {
      $lookup: {
        from: "pharmacies",
        localField: "_id",
        foreignField: "_id",
        as: "farmacia",
      },
    },
    {
      $unwind: {
        path: "$farmacia",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 0,
        farmacia: "$farmacia",
        total_pedidos: 1,
        receita: 1,
      },
    },
  ]);

  return resultado;
}

async function listUsers({ page = 1, limit = 20, tipo, busca, ativo } = {}) {
  const pagination = normalizePagination(page, limit, 20);
  const filtro = {};

  if (tipo) {
    filtro.tipo_usuario = tipo;
  }

  if (ativo !== undefined) {
    filtro.ativo = ativo === true || ativo === "true";
  }

  if (busca) {
    const regex = new RegExp(sanitizeRegexValue(busca), "i");
    filtro.$or = [{ nome: regex }, { email: regex }];
  }

  const total = await User.countDocuments(filtro);
  const usuarios = await User.find(filtro)
    .select("-senha")
    .sort({ data_cadastro: -1 })
    .skip((pagination.page - 1) * pagination.limit)
    .limit(pagination.limit);

  return {
    usuarios,
    total,
    pagina: pagination.page,
    totalPaginas: Math.ceil(total / pagination.limit) || 1,
  };
}

async function getUserDetails(userId) {
  const objectId = normalizeObjectId(userId, "Usuário não encontrado");
  const usuario = await User.findById(objectId).select("-senha");

  if (!usuario) {
    throw createError("Usuário não encontrado", 404);
  }

  const [ultimosPedidos, resumoPedidos, receitas] = await Promise.all([
    Order.find({ id_usuario: objectId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate({ path: "id_farmacia", select: "nome cidade estado" }),
    Order.aggregate([
      { $match: { id_usuario: objectId } },
      {
        $group: {
          _id: null,
          total_pedidos: { $sum: 1 },
          valor_gasto: {
            $sum: {
              $cond: [{ $eq: ["$status_pagamento", "aprovado"] }, "$total", 0],
            },
          },
        },
      },
    ]),
    Prescription.find({ id_usuario: objectId }).sort({ createdAt: -1 }),
  ]);

  return {
    usuario: {
      ...usuario.toObject(),
      ultimos_pedidos: ultimosPedidos,
      receitas,
    },
    resumo: {
      total_pedidos: resumoPedidos[0]?.total_pedidos || 0,
      valor_gasto: resumoPedidos[0]?.valor_gasto || 0,
      total_receitas: receitas.length,
    },
  };
}

async function toggleUserStatus(userId, adminId) {
  const objectId = normalizeObjectId(userId, "Usuário não encontrado");
  const usuario = await User.findById(objectId).select("-senha");

  if (!usuario) {
    throw createError("Usuário não encontrado", 404);
  }

  const statusAnterior = usuario.ativo;
  usuario.ativo = !usuario.ativo;
  await usuario.save();

  await logManual({
    acao: "USER_STATUS_CHANGED",
    recurso: "User",
    recurso_id: usuario._id.toString(),
    usuario_id: adminId,
    ip: "sistema",
    valores_anteriores: { ativo: statusAnterior },
    valores_novos: { ativo: usuario.ativo },
    descricao: "Status de usuário alterado por administrador",
    status: "sucesso",
  });

  return {
    usuario,
    novoStatus: usuario.ativo,
  };
}

async function changeUserRole(userId, novoTipo, adminId) {
  if (!VALID_USER_TYPES.includes(novoTipo)) {
    throw createError("Tipo de usuário inválido", 400);
  }

  const objectId = normalizeObjectId(userId, "Usuário não encontrado");
  const usuario = await User.findById(objectId).select("-senha");

  if (!usuario) {
    throw createError("Usuário não encontrado", 404);
  }

  const tipoAntigo = usuario.tipo_usuario;
  usuario.tipo_usuario = novoTipo;
  await usuario.save();

  await logManual({
    acao: "USER_ROLE_CHANGED",
    recurso: "User",
    recurso_id: usuario._id.toString(),
    usuario_id: adminId,
    ip: "sistema",
    valores_anteriores: { tipo: tipoAntigo },
    valores_novos: { tipo: novoTipo },
    descricao: "Perfil do usuário alterado por administrador",
    status: "sucesso",
  });

  return usuario;
}

async function listAllPharmacies({
  page = 1,
  limit = 20,
  busca,
  ativa,
  cidade,
  estado,
} = {}) {
  const pagination = normalizePagination(page, limit, 20);
  const filtro = {};

  if (busca) {
    filtro.nome = new RegExp(sanitizeRegexValue(busca), "i");
  }

  if (ativa !== undefined) {
    filtro.ativa = ativa === true || ativa === "true";
  }

  if (cidade) {
    filtro.cidade = new RegExp(sanitizeRegexValue(cidade), "i");
  }

  if (estado) {
    filtro.estado = String(estado).toUpperCase();
  }

  const total = await Pharmacy.countDocuments(filtro);
  const farmacias = await Pharmacy.find(filtro)
    .sort({ createdAt: -1 })
    .skip((pagination.page - 1) * pagination.limit)
    .limit(pagination.limit);

  const ids = farmacias.map((farmacia) => farmacia._id);
  const produtosPorFarmacia = await Product.aggregate([
    { $match: { id_farmacia: { $in: ids } } },
    {
      $group: {
        _id: "$id_farmacia",
        total_produtos: { $sum: 1 },
        ativos: {
          $sum: {
            $cond: [{ $eq: ["$ativo", true] }, 1, 0],
          },
        },
      },
    },
  ]);

  const statsMap = produtosPorFarmacia.reduce((accumulator, item) => {
    accumulator[item._id.toString()] = {
      total_produtos: item.total_produtos,
      produtos_ativos: item.ativos,
    };
    return accumulator;
  }, {});

  return {
    farmacias: farmacias.map((farmacia) => ({
      ...farmacia.toObject(),
      estatisticas: statsMap[farmacia._id.toString()] || {
        total_produtos: 0,
        produtos_ativos: 0,
      },
    })),
    total,
    pagina: pagination.page,
    totalPaginas: Math.ceil(total / pagination.limit) || 1,
  };
}

async function createPharmacyAdmin(dados, adminId) {
  const farmacia = new Pharmacy(dados);
  await farmacia.save();

  await logManual({
    acao: "PHARMACY_CREATED",
    recurso: "Pharmacy",
    recurso_id: farmacia._id.toString(),
    usuario_id: adminId,
    ip: "sistema",
    valores_anteriores: null,
    valores_novos: farmacia.toObject(),
    descricao: "Farmácia criada por administrador",
    status: "sucesso",
  });

  return farmacia;
}

async function updatePharmacyAdmin(pharmacyId, dados, adminId) {
  const objectId = normalizeObjectId(pharmacyId, "Farmácia não encontrada");
  const farmaciaAnterior = await Pharmacy.findById(objectId);

  if (!farmaciaAnterior) {
    throw createError("Farmácia não encontrada", 404);
  }

  const farmacia = await Pharmacy.findByIdAndUpdate(objectId, dados, {
    new: true,
    runValidators: true,
  });

  await logManual({
    acao: "PHARMACY_UPDATED",
    recurso: "Pharmacy",
    recurso_id: pharmacyId,
    usuario_id: adminId,
    ip: "sistema",
    valores_anteriores: farmaciaAnterior.toObject(),
    valores_novos: farmacia.toObject(),
    descricao: "Farmácia atualizada por administrador",
    status: "sucesso",
  });

  return farmacia;
}

async function togglePharmacyStatus(pharmacyId, adminId) {
  const objectId = normalizeObjectId(pharmacyId, "Farmácia não encontrada");
  const farmacia = await Pharmacy.findById(objectId);

  if (!farmacia) {
    throw createError("Farmácia não encontrada", 404);
  }

  const statusAnterior = farmacia.ativa;
  farmacia.ativa = !farmacia.ativa;
  await farmacia.save();

  await logManual({
    acao: "PHARMACY_STATUS_CHANGED",
    recurso: "Pharmacy",
    recurso_id: farmacia._id.toString(),
    usuario_id: adminId,
    ip: "sistema",
    valores_anteriores: { ativa: statusAnterior },
    valores_novos: { ativa: farmacia.ativa },
    descricao: "Status da farmácia alterado por administrador",
    status: "sucesso",
  });

  return farmacia;
}

async function listAllProducts({
  page = 1,
  limit = 20,
  busca,
  farmaciaId,
  ativo,
  controlado,
} = {}) {
  const pagination = normalizePagination(page, limit, 20);
  const filtro = {};

  if (busca) {
    const regex = new RegExp(sanitizeRegexValue(busca), "i");
    filtro.$or = [
      { nome: regex },
      { principio_ativo: regex },
      { categoria: regex },
    ];
  }

  if (farmaciaId) {
    filtro.id_farmacia = normalizeObjectId(
      farmaciaId,
      "Farmácia não encontrada",
    );
  }

  if (ativo !== undefined) {
    filtro.ativo = ativo === true || ativo === "true";
  }

  if (controlado !== undefined) {
    filtro.controlado = controlado === true || controlado === "true";
  }

  const total = await Product.countDocuments(filtro);
  const produtos = await Product.find(filtro)
    .populate({ path: "id_farmacia", select: "nome cidade" })
    .sort({ createdAt: -1 })
    .skip((pagination.page - 1) * pagination.limit)
    .limit(pagination.limit);

  return {
    produtos,
    total,
    pagina: pagination.page,
    totalPaginas: Math.ceil(total / pagination.limit) || 1,
  };
}

async function createProductAdmin(dados, adminId) {
  const farmaciaId = normalizeObjectId(
    dados.id_farmacia,
    "Farmácia não encontrada",
  );
  const farmacia = await Pharmacy.findById(farmaciaId);

  if (!farmacia) {
    throw createError("Farmácia não encontrada", 404);
  }

  const produto = new Product(dados);
  await produto.save();
  await produto.populate({ path: "id_farmacia", select: "nome cidade" });

  await logManual({
    acao: "PRODUCT_CREATED",
    recurso: "Product",
    recurso_id: produto._id.toString(),
    usuario_id: adminId,
    ip: "sistema",
    valores_anteriores: null,
    valores_novos: produto.toObject(),
    descricao: "Produto criado por administrador",
    status: "sucesso",
  });

  return produto;
}

async function updateProductAdmin(productId, dados, adminId) {
  const objectId = normalizeObjectId(productId, "Produto não encontrado");
  const produtoAnterior = await Product.findById(objectId);

  if (!produtoAnterior) {
    throw createError("Produto não encontrado", 404);
  }

  if (dados.id_farmacia) {
    const farmacia = await Pharmacy.findById(
      normalizeObjectId(dados.id_farmacia, "Farmácia não encontrada"),
    );

    if (!farmacia) {
      throw createError("Farmácia não encontrada", 404);
    }
  }

  const produto = await Product.findByIdAndUpdate(objectId, dados, {
    new: true,
    runValidators: true,
  }).populate({ path: "id_farmacia", select: "nome cidade" });

  await logManual({
    acao: "PRODUCT_UPDATED",
    recurso: "Product",
    recurso_id: productId,
    usuario_id: adminId,
    ip: "sistema",
    valores_anteriores: produtoAnterior.toObject(),
    valores_novos: produto.toObject(),
    descricao: "Produto atualizado por administrador",
    status: "sucesso",
  });

  return produto;
}

async function toggleProductStatus(productId, adminId) {
  const objectId = normalizeObjectId(productId, "Produto não encontrado");
  const produto = await Product.findById(objectId).populate({
    path: "id_farmacia",
    select: "nome cidade",
  });

  if (!produto) {
    throw createError("Produto não encontrado", 404);
  }

  const statusAnterior = produto.ativo;
  produto.ativo = !produto.ativo;
  await produto.save();

  await logManual({
    acao: "PRODUCT_STATUS_CHANGED",
    recurso: "Product",
    recurso_id: produto._id.toString(),
    usuario_id: adminId,
    ip: "sistema",
    valores_anteriores: { ativo: statusAnterior },
    valores_novos: { ativo: produto.ativo },
    descricao: "Status do produto alterado por administrador",
    status: "sucesso",
  });

  return produto;
}

async function getAuditLogs({
  page = 1,
  limit = 50,
  acao,
  recurso,
  usuario_id,
  dataInicio,
  dataFim,
  status,
} = {}) {
  const pagination = normalizePagination(page, limit, 50);
  const filtro = {};

  if (acao) {
    filtro.acao = acao;
  }

  if (recurso) {
    filtro.recurso = recurso;
  }

  if (usuario_id) {
    filtro.usuario_id = normalizeObjectId(usuario_id, "Usuário não encontrado");
  }

  if (status) {
    filtro.status = status;
  }

  if (dataInicio || dataFim) {
    filtro.criado_em = {};

    if (dataInicio) {
      filtro.criado_em.$gte = dataInicio;
    }

    if (dataFim) {
      filtro.criado_em.$lte = dataFim;
    }
  }

  const total = await AuditLog.countDocuments(filtro);
  const logs = await AuditLog.find(filtro)
    .sort({ criado_em: -1 })
    .skip((pagination.page - 1) * pagination.limit)
    .limit(pagination.limit);

  return {
    logs,
    total,
    pagina: pagination.page,
    totalPaginas: Math.ceil(total / pagination.limit) || 1,
  };
}

async function getAuditLogsByUser(userId, { page = 1, limit = 20 } = {}) {
  const objectId = normalizeObjectId(userId, "Usuário não encontrado");
  const pagination = normalizePagination(page, limit, 20);
  const filtro = { usuario_id: objectId };

  const total = await AuditLog.countDocuments(filtro);
  const logs = await AuditLog.find(filtro)
    .sort({ criado_em: -1 })
    .skip((pagination.page - 1) * pagination.limit)
    .limit(pagination.limit);

  return {
    logs,
    total,
    pagina: pagination.page,
    totalPaginas: Math.ceil(total / pagination.limit) || 1,
  };
}

async function getAuditLogsByResource(recurso, recurso_id) {
  const logs = await AuditLog.find({ recurso, recurso_id }).sort({
    criado_em: 1,
  });
  return logs;
}

async function getAdminSupportStats() {
  const seteDiasAtras = new Date();
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 6);
  seteDiasAtras.setHours(0, 0, 0, 0);

  const [
    ticketsPorStatus,
    tempoPrimeiraResposta,
    avaliacaoMedia,
    ticketsPorCategoria,
    volumePorDia,
  ] = await Promise.all([
    SupportMessage.aggregate([
      {
        $group: {
          _id: "$status",
          total: { $sum: 1 },
        },
      },
    ]),
    SupportMessage.aggregate([
      {
        $match: {
          primeira_resposta_em: { $ne: null },
          aberta_em: { $ne: null },
        },
      },
      {
        $project: {
          horas: {
            $divide: [
              { $subtract: ["$primeira_resposta_em", "$aberta_em"] },
              1000 * 60 * 60,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          media_horas: { $avg: "$horas" },
        },
      },
    ]),
    SupportMessage.aggregate([
      {
        $match: {
          avaliacao_atendimento: { $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          media: { $avg: "$avaliacao_atendimento" },
        },
      },
    ]),
    SupportMessage.aggregate([
      {
        $group: {
          _id: "$categoria",
          total: { $sum: 1 },
        },
      },
    ]),
    SupportMessage.aggregate([
      {
        $match: {
          createdAt: { $gte: seteDiasAtras },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          total: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          dia: "$_id",
          total: 1,
        },
      },
      { $sort: { dia: 1 } },
    ]),
  ]);

  return {
    tickets_por_status: ticketsPorStatus.reduce((accumulator, item) => {
      accumulator[item._id] = item.total;
      return accumulator;
    }, {}),
    tempo_medio_primeira_resposta_horas:
      tempoPrimeiraResposta[0]?.media_horas || 0,
    avaliacao_media_atendimento: avaliacaoMedia[0]?.media || 0,
    tickets_por_categoria: ticketsPorCategoria.reduce((accumulator, item) => {
      accumulator[item._id] = item.total;
      return accumulator;
    }, {}),
    volume_por_dia: volumePorDia,
  };
}

module.exports = {
  getDashboardStats,
  getRevenueReport,
  getTopProducts,
  getTopPharmacies,
  listUsers,
  getUserDetails,
  toggleUserStatus,
  changeUserRole,
  listAllPharmacies,
  createPharmacyAdmin,
  updatePharmacyAdmin,
  togglePharmacyStatus,
  listAllProducts,
  createProductAdmin,
  updateProductAdmin,
  toggleProductStatus,
  getAuditLogs,
  getAuditLogsByUser,
  getAuditLogsByResource,
  getAdminSupportStats,
};
