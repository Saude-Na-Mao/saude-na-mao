const orderService = require("../services/orderService");

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

async function createOrder(req, res, next) {
  try {
    const pedido = await orderService.createOrder(req.user.id, req.body);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Pedido criado com sucesso",
      data: { pedido },
    });
  } catch (error) {
    return next(error);
  }
}

async function getOrderById(req, res, next) {
  try {
    const { id } = req.params;
    const pedido = await orderService.getOrderById(
      id,
      req.user.id,
      req.user.tipo_usuario,
    );

    return sendSuccess(res, { data: { pedido } });
  } catch (error) {
    return next(error);
  }
}

async function getUserOrders(req, res, next) {
  try {
    const { page, limit, status } = req.query;
    const pedidos = await orderService.getUserOrders(req.user.id, {
      page,
      limit,
      status,
    });

    return sendSuccess(res, { data: pedidos });
  } catch (error) {
    return next(error);
  }
}

async function getPharmacyOrders(req, res, next) {
  try {
    const { pharmacyId } = req.params;
    const { page, limit, status } = req.query;
    const pedidos = await orderService.getPharmacyOrders(pharmacyId, {
      page,
      limit,
      status,
    });

    return sendSuccess(res, { data: pedidos });
  } catch (error) {
    return next(error);
  }
}

async function updateOrderStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { observacao, entregador, pharmacyId } = req.body;
    const novoStatus = req.body.novoStatus || req.body.status;

    if (
      (req.user.tipo_usuario === "dono_farmacia" ||
        req.user.tipo_usuario === "farmaceutico") &&
      !pharmacyId
    ) {
      throw createError("pharmacyId é obrigatório para atualizar pedido", 400);
    }

    const pedido = await orderService.updateOrderStatus(id, novoStatus, {
      usuarioId: req.user.tipo_usuario === "cliente" ? req.user.id : undefined,
      pharmacyId: ["dono_farmacia", "farmaceutico"].includes(
        req.user.tipo_usuario,
      )
        ? pharmacyId
        : undefined,
      observacao,
      entregador,
    });

    return sendSuccess(res, {
      message: "Status atualizado",
      data: { pedido },
    });
  } catch (error) {
    return next(error);
  }
}

async function cancelOrder(req, res, next) {
  try {
    const { id } = req.params;
    const pedido = await orderService.cancelOrder(id, req.user.id);

    return sendSuccess(res, {
      message: "Pedido cancelado",
      data: { pedido },
    });
  } catch (error) {
    return next(error);
  }
}

async function rejectOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { motivo, pharmacyId } = req.body;

    if (
      (req.user.tipo_usuario === "dono_farmacia" ||
        req.user.tipo_usuario === "farmaceutico") &&
      !pharmacyId
    ) {
      throw createError("pharmacyId é obrigatório para rejeitar pedido", 400);
    }

    const pedido = await orderService.rejectOrder(
      id,
      ["dono_farmacia", "farmaceutico"].includes(req.user.tipo_usuario)
        ? pharmacyId
        : undefined,
      motivo,
    );

    return sendSuccess(res, {
      message: "Pedido rejeitado",
      data: { pedido },
    });
  } catch (error) {
    return next(error);
  }
}

async function approveOrderByPharmacist(req, res, next) {
  try {
    const { id } = req.params;
    const { pharmacyId, observacao } = req.body;

    if (
      (req.user.tipo_usuario === "dono_farmacia" ||
        req.user.tipo_usuario === "farmaceutico") &&
      !pharmacyId
    ) {
      throw createError("pharmacyId é obrigatório para aprovar pedido", 400);
    }

    const pedido = await orderService.approveOrderByPharmacist(
      id,
      ["dono_farmacia", "farmaceutico"].includes(req.user.tipo_usuario)
        ? pharmacyId
        : undefined,
      observacao || "Pedido aprovado pelo farmacêutico",
    );

    return sendSuccess(res, {
      message: "Pedido aprovado pelo farmacêutico",
      data: { pedido },
    });
  } catch (error) {
    return next(error);
  }
}

async function validateSngpcDispensation(req, res, next) {
  try {
    const { id } = req.params;
    const { pharmacyId } = req.body;

    if (
      (req.user.tipo_usuario === "dono_farmacia" ||
        req.user.tipo_usuario === "farmaceutico") &&
      !pharmacyId
    ) {
      throw createError("pharmacyId é obrigatório para validar dispensação", 400);
    }

    const pedido = await orderService.validateSngpcDispensation(
      id,
      ["dono_farmacia", "farmaceutico"].includes(req.user.tipo_usuario)
        ? pharmacyId
        : undefined,
      req.body,
      {
        user: req.user,
        ip: req.ip || req.socket?.remoteAddress,
        userAgent: req.headers["user-agent"],
      },
    );

    return sendSuccess(res, {
      message: "Dispensação registrada",
      data: { pedido },
    });
  } catch (error) {
    return next(error);
  }
}

async function completePharmacyPickup(req, res, next) {
  try {
    const { id } = req.params;
    const { pharmacyId, observacao, codigo, codigo_retirada } = req.body;
    const codigoRetirada = codigo ?? codigo_retirada;

    if (
      (req.user.tipo_usuario === "dono_farmacia" ||
        req.user.tipo_usuario === "farmaceutico") &&
      !pharmacyId
    ) {
      throw createError(
        "pharmacyId é obrigatório para finalizar retirada na farmácia",
        400,
      );
    }

    const pedido = await orderService.completePharmacyPickup(
      id,
      ["dono_farmacia", "farmaceutico"].includes(req.user.tipo_usuario)
        ? pharmacyId
        : undefined,
      observacao,
      codigoRetirada,
    );

    return sendSuccess(res, {
      message: "Retirada registrada como entregue",
      data: { pedido },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateDeliveryLocation(req, res, next) {
  try {
    const { id } = req.params;
    const { latitude, longitude, pharmacyId } = req.body;

    if (
      (req.user.tipo_usuario === "dono_farmacia" ||
        req.user.tipo_usuario === "farmaceutico") &&
      !pharmacyId
    ) {
      throw createError(
        "pharmacyId é obrigatório para atualizar localização do pedido",
        400,
      );
    }

    await orderService.updateDeliveryLocation(id, {
      latitude,
      longitude,
      pharmacyId: ["dono_farmacia", "farmaceutico"].includes(
        req.user.tipo_usuario,
      )
        ? pharmacyId
        : undefined,
    });

    return sendSuccess(res, {
      message: "Localização atualizada",
      data: {},
    });
  } catch (error) {
    return next(error);
  }
}

async function rateDelivery(req, res, next) {
  try {
    const { id } = req.params;
    const { nota, comentario } = req.body;
    const pedido = await orderService.rateDelivery(id, req.user.id, {
      nota,
      comentario,
    });

    return sendSuccess(res, {
      message: "Avaliação registrada",
      data: { pedido },
    });
  } catch (error) {
    return next(error);
  }
}

async function generatePickupCode(req, res, next) {
  try {
    const { id } = req.params;
    const { pharmacyId } = req.body;

    if (
      (req.user.tipo_usuario === "dono_farmacia" ||
        req.user.tipo_usuario === "farmaceutico") &&
      !pharmacyId
    ) {
      throw createError(
        "pharmacyId é obrigatório para gerar código de retirada",
        400,
      );
    }

    const codigo_retirada = await orderService.generatePickupCode(
      id,
      ["dono_farmacia", "farmaceutico"].includes(req.user.tipo_usuario)
        ? pharmacyId
        : undefined,
    );

    return sendSuccess(res, {
      data: { codigo_retirada },
    });
  } catch (error) {
    return next(error);
  }
}

async function getOrderStats(req, res, next) {
  try {
    const { pharmacyId } = req.params;
    const stats = await orderService.getOrderStats(pharmacyId);

    return sendSuccess(res, {
      data: stats,
    });
  } catch (error) {
    return next(error);
  }
}

async function generateDeliveryQRCode(req, res, next) {
  try {
    const result = await orderService.generateDeliveryQRCode(
      req.params.id,
      req.user.id,
    );
    return sendSuccess(res, { data: result, message: "QR Code gerado" });
  } catch (error) {
    next(error);
  }
}

async function confirmReceiptReturnAtPharmacy(req, res, next) {
  try {
    const { id } = req.params;
    const { pharmacyId, codigo } = req.body;

    if (
      (req.user.tipo_usuario === "dono_farmacia" ||
        req.user.tipo_usuario === "farmaceutico") &&
      !pharmacyId
    ) {
      throw createError(
        "pharmacyId é obrigatório para confirmar devolução da receita",
        400,
      );
    }

    const pedido = await orderService.confirmReceiptReturnAtPharmacy(
      id,
      ["dono_farmacia", "farmaceutico"].includes(req.user.tipo_usuario)
        ? pharmacyId
        : undefined,
      codigo,
    );

    return sendSuccess(res, {
      message: "Pedido encerrado — receita conferida na farmácia",
      data: { pedido },
    });
  } catch (error) {
    return next(error);
  }
}

async function confirmDeliveryByQR(req, res, next) {
  try {
    const { token } = req.body;
    if (!token) {
      return res
        .status(400)
        .json({ success: false, message: "Token é obrigatório" });
    }
    const pedido = await orderService.confirmDeliveryByQR(req.params.id, token);
    return sendSuccess(res, {
      data: { pedido },
      message: "Entrega confirmada via QR Code",
    });
  } catch (error) {
    next(error);
  }
}

function resolvePharmacyId(req) {
  const { pharmacyId } = req.body;
  if (
    (req.user.tipo_usuario === "dono_farmacia" ||
      req.user.tipo_usuario === "farmaceutico") &&
    !pharmacyId
  ) {
    throw createError("pharmacyId é obrigatório", 400);
  }
  return ["dono_farmacia", "farmaceutico"].includes(req.user.tipo_usuario)
    ? pharmacyId
    : undefined;
}

async function markOrderReadyForPickup(req, res, next) {
  try {
    const deliveryService = require("../services/deliveryService");
    const pharmacyId = resolvePharmacyId(req);
    const entrega = await deliveryService.markReadyForPickup(
      req.params.id,
      pharmacyId,
    );
    return sendSuccess(res, {
      message: "Pedido marcado como separado / pronto para retirada",
      data: { entrega },
    });
  } catch (error) {
    return next(error);
  }
}

async function confirmDeliveryPickupCode(req, res, next) {
  try {
    const deliveryService = require("../services/deliveryService");
    const pharmacyId = resolvePharmacyId(req);
    const { codigo, codigo_coleta } = req.body;
    const entrega = await deliveryService.confirmPickupWithCode(
      req.params.id,
      pharmacyId,
      codigo ?? codigo_coleta,
    );
    return sendSuccess(res, {
      message: "Coleta liberada — pedido a caminho do cliente",
      data: { entrega },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createOrder,
  getOrderById,
  getUserOrders,
  getPharmacyOrders,
  updateOrderStatus,
  cancelOrder,
  rejectOrder,
  approveOrderByPharmacist,
  validateSngpcDispensation,
  completePharmacyPickup,
  confirmReceiptReturnAtPharmacy,
  markOrderReadyForPickup,
  confirmDeliveryPickupCode,
  updateDeliveryLocation,
  rateDelivery,
  generatePickupCode,
  generateDeliveryQRCode,
  confirmDeliveryByQR,
  getOrderStats,
};
