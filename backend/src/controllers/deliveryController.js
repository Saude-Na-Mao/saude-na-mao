const deliveryService = require("../services/deliveryService");

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sendSuccess(res, { statusCode = 200, message = "", data = {} }) {
  return res.status(statusCode).json({ success: true, message, data });
}

async function createDelivery(req, res, next) {
  try {
    const { orderId, pharmacyId } = req.body;
    if (!orderId || !pharmacyId) {
      throw createError("orderId e pharmacyId são obrigatórios", 400);
    }
    const entrega = await deliveryService.createDelivery(orderId, pharmacyId);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Entrega criada com sucesso",
      data: { entrega },
    });
  } catch (error) {
    return next(error);
  }
}

async function getAvailableDeliveries(req, res, next) {
  try {
    const { latitude, longitude, raio, page, limit } = req.query;
    let resolvedLatitude = latitude;
    let resolvedLongitude = longitude;

    // Fallback: usa a última localização do entregador quando não vier no query.
    if ((!resolvedLatitude || !resolvedLongitude) && req.user?.dados_entregador?.localizacao_atual?.coordinates?.length === 2) {
      const [lng, lat] = req.user.dados_entregador.localizacao_atual.coordinates;
      resolvedLatitude = lat;
      resolvedLongitude = lng;
    }

    const result = await deliveryService.getAvailableDeliveries({
      latitude: resolvedLatitude,
      longitude: resolvedLongitude,
      raioKm: raio ? Number(raio) : undefined,
      page,
      limit,
    });
    return sendSuccess(res, { data: result });
  } catch (error) {
    return next(error);
  }
}

async function getMyDeliveries(req, res, next) {
  try {
    const { page, limit, status } = req.query;
    const result = await deliveryService.getMyDeliveries(req.user.id, { page, limit, status });
    return sendSuccess(res, { data: result });
  } catch (error) {
    return next(error);
  }
}

async function getDeliveryById(req, res, next) {
  try {
    const { id } = req.params;
    const entrega = await deliveryService.getDeliveryById(id, req.user.id, req.user.tipo_usuario);
    return sendSuccess(res, { data: { entrega } });
  } catch (error) {
    return next(error);
  }
}

async function acceptDelivery(req, res, next) {
  try {
    const { id } = req.params;
    const entrega = await deliveryService.acceptDelivery(id, req.user.id);
    return sendSuccess(res, { message: "Entrega aceita", data: { entrega } });
  } catch (error) {
    return next(error);
  }
}

async function updateStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { novoStatus, observacao, latitude, longitude } = req.body;
    if (!novoStatus) throw createError("novoStatus é obrigatório", 400);

    const entrega = await deliveryService.updateDeliveryStatus(id, novoStatus, {
      entregadorId: req.user.tipo_usuario === "entregador" ? req.user.id : undefined,
      observacao,
      latitude,
      longitude,
      responseRole: req.user.tipo_usuario,
    });
    return sendSuccess(res, { message: "Status atualizado", data: { entrega } });
  } catch (error) {
    return next(error);
  }
}

async function updateLocation(req, res, next) {
  try {
    const { id } = req.params;
    const { latitude, longitude } = req.body;
    await deliveryService.updateLocation(id, req.user.id, { latitude, longitude });
    return sendSuccess(res, { message: "Localização atualizada" });
  } catch (error) {
    return next(error);
  }
}

async function confirmDelivery(req, res, next) {
  try {
    const { id } = req.params;
    const codigo =
      req.body?.codigo ?? req.body?.codigo_confirmacao ?? req.body?.codigoConfirmacao;
    if (!codigo) throw createError("Código de confirmação é obrigatório", 400);

    const result = await deliveryService.confirmDelivery(id, req.user.id, codigo);
    return sendSuccess(res, {
      message: "Entrega confirmada",
      data: {
        entrega: result.entrega,
        aguardando_confirmacao_farmacia: result.aguardando_confirmacao_farmacia,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function rateByClient(req, res, next) {
  try {
    const { id } = req.params;
    const { nota, comentario } = req.body;
    const entrega = await deliveryService.rateDeliveryByClient(id, req.user.id, { nota, comentario });
    return sendSuccess(res, { message: "Avaliação registrada", data: { entrega } });
  } catch (error) {
    return next(error);
  }
}

async function rateByDriver(req, res, next) {
  try {
    const { id } = req.params;
    const { nota, comentario } = req.body;
    const entrega = await deliveryService.rateDeliveryByDriver(id, req.user.id, { nota, comentario });
    return sendSuccess(res, { message: "Avaliação registrada", data: { entrega } });
  } catch (error) {
    return next(error);
  }
}

async function cancelDelivery(req, res, next) {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    const entrega = await deliveryService.cancelDelivery(id, {
      userId: req.user.id,
      userRole: req.user.tipo_usuario,
      motivo,
    });
    return sendSuccess(res, { message: "Entrega cancelada", data: { entrega } });
  } catch (error) {
    return next(error);
  }
}

async function toggleAvailability(req, res, next) {
  try {
    const { disponivel } = req.body;
    const result = await deliveryService.setDriverAvailability(req.user.id, disponivel);
    return sendSuccess(res, {
      message: "Disponibilidade atualizada",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function getDriverEarnings(req, res, next) {
  try {
    const { periodo } = req.query;
    const result = await deliveryService.getDriverEarnings(req.user.id, { periodo });
    return sendSuccess(res, { data: result });
  } catch (error) {
    return next(error);
  }
}

async function getDriverHistory(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await deliveryService.getDriverHistory(req.user.id, { page, limit });
    return sendSuccess(res, { data: result });
  } catch (error) {
    return next(error);
  }
}

async function collectAtPharmacy(req, res, next) {
  try {
    const { id } = req.params;
    const entrega = await deliveryService.collectAtPharmacy(id, req.user.id);
    return sendSuccess(res, { message: "Coleta confirmada", data: { entrega } });
  } catch (error) {
    return next(error);
  }
}

async function confirmReceiptAtCustomer(req, res, next) {
  try {
    const { id } = req.params;
    const entrega = await deliveryService.confirmReceiptAtCustomer(id, req.user.id);
    return sendSuccess(res, { message: "Receita conferida com o cliente", data: { entrega } });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createDelivery,
  getAvailableDeliveries,
  getMyDeliveries,
  getDeliveryById,
  acceptDelivery,
  updateStatus,
  updateLocation,
  confirmDelivery,
  rateByClient,
  rateByDriver,
  cancelDelivery,
  toggleAvailability,
  getDriverEarnings,
  getDriverHistory,
  collectAtPharmacy,
  confirmReceiptAtCustomer,
};
