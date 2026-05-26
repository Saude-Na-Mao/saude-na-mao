const adminService = require("../services/adminService");

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sendSuccess(res, { statusCode = 200, message = "", data = {} }) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

function parseOptionalDate(value) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw createError("Datas inválidas", 400);
  }

  return parsed;
}

async function getDashboard(req, res, next) {
  try {
    const stats = await adminService.getDashboardStats();
    return sendSuccess(res, { data: stats });
  } catch (error) {
    return next(error);
  }
}

async function getRevenueReport(req, res, next) {
  try {
    const { dataInicio, dataFim, agrupar } = req.query;
    const inicio = parseOptionalDate(dataInicio);
    const fim = parseOptionalDate(dataFim);

    const relatorio = await adminService.getRevenueReport({
      dataInicio: inicio,
      dataFim: fim,
      agrupar,
    });

    return sendSuccess(res, { data: { relatorio } });
  } catch (error) {
    return next(error);
  }
}

async function getTopProducts(req, res, next) {
  try {
    const { limit = 10 } = req.query;
    const produtos = await adminService.getTopProducts(limit);

    return sendSuccess(res, { data: { produtos } });
  } catch (error) {
    return next(error);
  }
}

async function getTopPharmacies(req, res, next) {
  try {
    const { limit = 10 } = req.query;
    const farmacias = await adminService.getTopPharmacies(limit);

    return sendSuccess(res, { data: { farmacias } });
  } catch (error) {
    return next(error);
  }
}

async function listUsers(req, res, next) {
  try {
    const { page, limit, tipo, busca, ativo } = req.query;
    const usuarios = await adminService.listUsers({
      page,
      limit,
      tipo,
      busca,
      ativo,
    });

    return sendSuccess(res, { data: usuarios });
  } catch (error) {
    return next(error);
  }
}

async function getUserDetails(req, res, next) {
  try {
    const { userId } = req.params;
    const detalhes = await adminService.getUserDetails(userId);

    return sendSuccess(res, { data: detalhes });
  } catch (error) {
    return next(error);
  }
}

async function toggleUserStatus(req, res, next) {
  try {
    const { userId } = req.params;
    const resultado = await adminService.toggleUserStatus(userId, req.user.id);

    return sendSuccess(res, {
      message: "Status do usuário alterado",
      data: resultado,
    });
  } catch (error) {
    return next(error);
  }
}

async function changeUserRole(req, res, next) {
  try {
    const { userId } = req.params;
    const { novoTipo } = req.body;
    const usuario = await adminService.changeUserRole(
      userId,
      novoTipo,
      req.user.id,
    );

    return sendSuccess(res, { data: { usuario } });
  } catch (error) {
    return next(error);
  }
}

async function listPharmacies(req, res, next) {
  try {
    const { page, limit, busca, ativa, cidade, estado } = req.query;
    const farmacias = await adminService.listAllPharmacies({
      page,
      limit,
      busca,
      ativa,
      cidade,
      estado,
    });

    return sendSuccess(res, { data: farmacias });
  } catch (error) {
    return next(error);
  }
}

async function createPharmacy(req, res, next) {
  try {
    const farmacia = await adminService.createPharmacyAdmin(
      req.body,
      req.user.id,
    );

    return sendSuccess(res, {
      statusCode: 201,
      data: { farmacia },
    });
  } catch (error) {
    return next(error);
  }
}

async function updatePharmacy(req, res, next) {
  try {
    const { id } = req.params;
    const farmacia = await adminService.updatePharmacyAdmin(
      id,
      req.body,
      req.user.id,
    );

    return sendSuccess(res, { data: { farmacia } });
  } catch (error) {
    return next(error);
  }
}

async function togglePharmacyStatus(req, res, next) {
  try {
    const { id } = req.params;
    const farmacia = await adminService.togglePharmacyStatus(id, req.user.id);

    return sendSuccess(res, {
      message: "Status da farmácia alterado",
      data: { farmacia },
    });
  } catch (error) {
    return next(error);
  }
}

async function listProducts(req, res, next) {
  try {
    const { page, limit, busca, farmaciaId, ativo, controlado } = req.query;
    const produtos = await adminService.listAllProducts({
      page,
      limit,
      busca,
      farmaciaId,
      ativo,
      controlado,
    });

    return sendSuccess(res, { data: produtos });
  } catch (error) {
    return next(error);
  }
}

async function createProduct(req, res, next) {
  try {
    const produto = await adminService.createProductAdmin(
      req.body,
      req.user.id,
    );

    return sendSuccess(res, {
      statusCode: 201,
      data: { produto },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    const produto = await adminService.updateProductAdmin(
      id,
      req.body,
      req.user.id,
    );

    return sendSuccess(res, { data: { produto } });
  } catch (error) {
    return next(error);
  }
}

async function toggleProductStatus(req, res, next) {
  try {
    const { id } = req.params;
    const produto = await adminService.toggleProductStatus(id, req.user.id);

    return sendSuccess(res, { data: { produto } });
  } catch (error) {
    return next(error);
  }
}

async function getAuditLogs(req, res, next) {
  try {
    const {
      page,
      limit,
      acao,
      recurso,
      usuario_id,
      dataInicio,
      dataFim,
      status,
    } = req.query;
    const logs = await adminService.getAuditLogs({
      page,
      limit,
      acao,
      recurso,
      usuario_id,
      dataInicio: parseOptionalDate(dataInicio),
      dataFim: parseOptionalDate(dataFim),
      status,
    });

    return sendSuccess(res, { data: logs });
  } catch (error) {
    return next(error);
  }
}

async function getAuditLogsByUser(req, res, next) {
  try {
    const { userId } = req.params;
    const { page, limit } = req.query;
    const logs = await adminService.getAuditLogsByUser(userId, { page, limit });

    return sendSuccess(res, { data: logs });
  } catch (error) {
    return next(error);
  }
}

async function getAuditLogsByResource(req, res, next) {
  try {
    const { recurso, recurso_id } = req.params;
    const logs = await adminService.getAuditLogsByResource(recurso, recurso_id);

    return sendSuccess(res, { data: { logs } });
  } catch (error) {
    return next(error);
  }
}

async function getSupportStats(req, res, next) {
  try {
    const stats = await adminService.getAdminSupportStats();
    return sendSuccess(res, { data: stats });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getDashboard,
  getRevenueReport,
  getTopProducts,
  getTopPharmacies,
  listUsers,
  getUserDetails,
  toggleUserStatus,
  changeUserRole,
  listPharmacies,
  createPharmacy,
  updatePharmacy,
  togglePharmacyStatus,
  listProducts,
  createProduct,
  updateProduct,
  toggleProductStatus,
  getAuditLogs,
  getAuditLogsByUser,
  getAuditLogsByResource,
  getSupportStats,
};
