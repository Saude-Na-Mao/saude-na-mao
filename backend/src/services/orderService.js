const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Pharmacy = require("../models/Pharmacy");
const User = require("../models/User");
const Payment = require("../models/Payment");
const Delivery = require("../models/Delivery");
const Review = require("../models/Review");
const Prescription = require("../models/Prescription");
const AuditLog = require("../models/AuditLog");
const prescriptionService = require("./prescriptionService");
const couponService = require("./couponService");
const compliance = require("../config/compliance");
const { sendOrderStatusNotification } = require("./notificationService");
const { sendPushNotification } = require("./notificationService");
const { sendOrderConfirmation, sendOrderStatusEmail } = require("../utils/emailTemplates");
const { getIO } = require("../config/socket");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { isOrderEligibleForDispatch } = require("../utils/deliveryEligibility");
const {
  hasAvailableBatchForQuantity,
  isControlledProduct,
  isSngpcProduct,
} = require("../utils/batchAvailability");

const DRIVER_READY_NOTIFICATION_TAG = "entregadores_notificados_pedido_pronto";

const ENTREGA_CLIENT_POPULATE_SELECT =
  "codigo_confirmacao status avaliacao_cliente endereco_coleta endereco_entrega historico_status valor_entrega tempo_estimado_min id_entregador pronto_para_retirada separado_em entregador_chegou_em coleta_confirmada_em";

function pharmacyIdStringFromOrderDoc(order) {
  const f = order?.id_farmacia;
  if (!f) return null;
  const id = f._id || f;
  const s = id != null ? String(id) : "";
  return mongoose.Types.ObjectId.isValid(s) ? s : null;
}

function isPedidoRetiradaOuDriveThruPlain(orderLike) {
  const t = String(orderLike?.tipo_entrega ?? "")
    .trim()
    .toLowerCase();
  return t === "retirada" || t === "drive-thru";
}

function orderPlainHasDeliveryRef(orderLike) {
  const raw = orderLike?.id_entrega;
  if (raw == null || raw === "") return false;
  if (typeof raw === "object") {
    if (raw._id != null && raw._id !== "") return true;
    if (raw.id != null && raw.id !== "") return true;
  }
  const s = String(raw);
  return mongoose.Types.ObjectId.isValid(s);
}

/** Retirada/drive-thru: só avaliação da farmácia; nunca exigir nota do entregador. */
function orderNeedsClientDeliveryRatingPlain(orderLike) {
  if (isPedidoRetiradaOuDriveThruPlain(orderLike)) return false;
  return orderPlainHasDeliveryRef(orderLike);
}

function farmaciaPedidoJaAvaliadaPlain(orderPlain) {
  const v = orderPlain?.farmacia_avaliada_em;
  return v != null && v !== "";
}

/** Farmácia “ok” para o card: data no pedido OU legado (Review global antes de farmacia_avaliada_em). */
function pharmacyRatingCompleteForClientPedidoPlain(orderPlain) {
  if (farmaciaPedidoJaAvaliadaPlain(orderPlain)) return true;
  if (orderPlain.cliente_avaliou_farmacia !== true) return false;
  if (isPedidoRetiradaOuDriveThruPlain(orderPlain)) return true;
  return Boolean(orderPlain.id_entrega?.avaliacao_cliente?.avaliado_em);
}

/** Exibir “Avaliar” em Meus pedidos (cliente). */
function computeMostrarBotaoAvaliacaoClient(orderPlain) {
  if (String(orderPlain?.status || "").trim() !== "entregue") {
    return false;
  }
  const farmaciaOk = pharmacyRatingCompleteForClientPedidoPlain(orderPlain);
  const precisaEntrega = orderNeedsClientDeliveryRatingPlain(orderPlain);
  const entregaAvaliada = Boolean(
    orderPlain.id_entrega?.avaliacao_cliente?.avaliado_em,
  );
  const avaliacaoCompleta = farmaciaOk && (!precisaEntrega || entregaAvaliada);
  return !avaliacaoCompleta;
}

const ALLOWED_STATUS_TRANSITIONS = {
  aguardando_pagamento: ["em_processamento", "cancelado"],
  confirmado: ["a_caminho", "cancelado"],
  // "confirmado" só após o entregador aceitar (acceptDelivery); não via PATCH manual.
  em_processamento: ["cancelado"],
  a_caminho: ["entregue", "aguardando_confirmacao_receita_farmacia", "cancelado"],
  aguardando_confirmacao_receita_farmacia: ["aguardando_pagamento", "entregue", "cancelado"],
};

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizePagination(page, limit, defaultLimit = 10) {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);

  return {
    page: Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage,
    limit:
      Number.isNaN(parsedLimit) || parsedLimit < 1 ? defaultLimit : parsedLimit,
  };
}

function normalizeObjectId(value) {
  if (mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }

  return value;
}

function roundMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function normalizeOrderQuantity(value) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw createError("Quantidade inválida no pedido", 400);
  }

  return quantity;
}

function orderItemProductId(item) {
  return item?.id_produto || item?.produto_id || item?.id;
}

function objectIdString(value) {
  const raw = value?._id || value?.id || value;
  return raw != null ? String(raw) : "";
}

function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw createError(`${label} é obrigatório`, 400);
  }
  return text;
}

function normalizeUf(value) {
  const uf = requiredText(value, "UF do CRM").toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) {
    throw createError("UF do CRM inválida", 400);
  }
  return uf;
}

function effectiveProductPrice(product) {
  const basePrice = roundMoney(product.preco);
  const promoPrice = Number(product.preco_promocional);

  if (
    !compliance.requiresPrescription(product) &&
    Number.isFinite(promoPrice) &&
    promoPrice > 0 &&
    promoPrice < basePrice
  ) {
    return roundMoney(promoPrice);
  }

  return basePrice;
}

function missingComplianceDocs(pharmacy) {
  const missing = [];

  if (!pharmacy.alvara_sanitario) missing.push("alvará sanitário");
  if (!pharmacy.afe_anvisa && !pharmacy.licenca_anvisa) {
    missing.push("AFE/licença Anvisa");
  }
  if (
    !pharmacy.farmaceutico_responsavel &&
    !pharmacy.responsavel_tecnico_nome &&
    !pharmacy.crf_responsavel
  ) {
    missing.push("responsável técnico/CRF");
  }
  if (!pharmacy.delivery_medicamentos_autorizado) {
    missing.push("autorização para delivery de medicamentos");
  }

  return missing;
}

function assertPharmacyCanReceiveOrders(pharmacy) {
  if (!pharmacy) {
    throw createError("Farmácia não encontrada", 404);
  }

  if (pharmacy.ativa === false) {
    throw createError("Farmácia indisponível para pedidos", 400);
  }

  if (!compliance.requirePharmacyComplianceDocs) {
    return;
  }

  const missing = missingComplianceDocs(pharmacy);
  if (missing.length) {
    throw createError(
      `Farmácia sem documentação obrigatória para operação real: ${missing.join(", ")}.`,
      403,
    );
  }
}

async function buildCompliantOrderItems(idFarmacia, rawItems) {
  const normalizedItems = rawItems.map((item) => {
    const productId = orderItemProductId(item);
    if (!mongoose.Types.ObjectId.isValid(String(productId))) {
      throw createError("Produto inválido no pedido", 400);
    }

    return {
      productId: String(productId),
      quantidade: normalizeOrderQuantity(item.quantidade),
      id_receita: item.id_receita || null,
    };
  });

  const productIds = [...new Set(normalizedItems.map((item) => item.productId))];
  const products = await Product.find({
    _id: { $in: productIds },
    id_farmacia: idFarmacia,
  }).select(
    "nome preco preco_promocional estoque ativo id_farmacia controlado receita_obrigatoria classificacao_receita registro_anvisa batches",
  );

  const productsById = new Map(
    products.map((product) => [String(product._id), product]),
  );

  const quantityByProduct = normalizedItems.reduce((acc, item) => {
    acc.set(item.productId, (acc.get(item.productId) || 0) + item.quantidade);
    return acc;
  }, new Map());

  for (const [productId, quantity] of quantityByProduct.entries()) {
    const product = productsById.get(productId);
    if (!product || product.ativo === false) {
      throw createError("Produto não encontrado nesta farmácia", 404);
    }

    if (Number(product.estoque || 0) < quantity) {
      throw createError(`Estoque insuficiente para "${product.nome}"`, 400);
    }

    if (
      compliance.isControlledMedication(product) &&
      !hasAvailableBatchForQuantity(product, quantity)
    ) {
      throw createError(
        `Medicamento "${product.nome}" indisponível: sem lote disponível para rastreabilidade.`,
        400,
      );
    }
  }

  return normalizedItems.map((item) => {
    const product = productsById.get(item.productId);
    const unitPrice = effectiveProductPrice(product);

    return {
      id_produto: product._id,
      nome_produto: product.nome,
      preco_unitario: unitPrice,
      quantidade: item.quantidade,
      subtotal: roundMoney(unitPrice * item.quantidade),
      controlado: compliance.isControlledMedication(product),
      receita_obrigatoria: compliance.requiresPrescription(product),
      classificacao_receita: product.classificacao_receita || "sem_receita",
      registro_anvisa: product.registro_anvisa || "",
      id_receita: item.id_receita,
    };
  });
}

function couponCodeFromPayload(cupom) {
  if (!cupom) return "";
  if (typeof cupom === "string") return cupom.trim();
  return String(cupom.codigo || "").trim();
}

async function calculateOrderTotals(userId, subtotal, taxaEntregaPayload, cupomPayload) {
  let deliveryFee = roundMoney(Math.max(0, Number(taxaEntregaPayload) || 0));
  let discount = 0;
  let normalizedCoupon = {};

  const couponCode = couponCodeFromPayload(cupomPayload);
  if (couponCode) {
    const couponResult = await couponService.validateCoupon(
      couponCode,
      userId,
      subtotal,
    );
    discount = roundMoney(couponResult.desconto);
    deliveryFee = couponResult.frete_gratis ? 0 : deliveryFee;
    normalizedCoupon = {
      codigo: couponResult.cupom.codigo,
      desconto: discount,
      frete_gratis: Boolean(couponResult.frete_gratis),
    };
  }

  return {
    subtotal: roundMoney(subtotal),
    taxa_entrega: deliveryFee,
    total: roundMoney(Math.max(0, subtotal + deliveryFee - discount)),
    cupom: normalizedCoupon,
  };
}

function formatStatusForNotification(status) {
  const labels = {
    aguardando_pagamento: "Aguardando pagamento",
    confirmado: "Confirmado",
    em_processamento: "Em processamento",
    a_caminho: "A caminho",
    aguardando_confirmacao_receita_farmacia: "Aguardando confirmação na farmácia",
    entregue: "Entregue",
    cancelado: "Cancelado",
    rejeitado: "Rejeitado",
  };

  return labels[status] || status;
}

function canTransitionStatus(statusAtual, novoStatus) {
  return ALLOWED_STATUS_TRANSITIONS[statusAtual]?.includes(novoStatus) || false;
}

function ensureOwnership(order, fieldName, expectedId) {
  if (!expectedId) {
    return;
  }

  if (String(order[fieldName]) !== String(expectedId)) {
    throw createError("Pedido não encontrado", 404);
  }
}

/** Quem pode ler GET /pedidos/:id (além do dono do pedido). */
async function assertOrderReadableByViewer(order, userId, viewerRole) {
  if (!order || !userId) {
    throw createError("Pedido não encontrado", 404);
  }
  const role = viewerRole || "cliente";

  if (role === "administrador") {
    return;
  }
  if (role === "cliente") {
    ensureOwnership(order, "id_usuario", userId);
    return;
  }
  if (role === "entregador") {
    const ok = await Delivery.exists({
      id_pedido: order._id,
      id_entregador: userId,
      status: { $nin: ["cancelada"] },
    });
    if (!ok) {
      throw createError("Pedido não encontrado", 404);
    }
    return;
  }

  ensureOwnership(order, "id_usuario", userId);
}

function orderHasLinkedPrescriptionItems(order) {
  return (order.itens || []).some((i) => i.id_receita || i.receita_obrigatoria);
}

function orderHasSngpcItems(order) {
  return (order.itens || []).some(
    (item) => isSngpcProduct(item) || isSngpcProduct(item?.id_produto),
  );
}

function assertControlledOrderSngpcRegistered(order) {
  if (orderHasSngpcItems(order) && !order.sngpcData?.validatedAt) {
    throw createError(
      "Registre a dispensação ANVISA/SNGPC e vincule o lote antes de aprovar ou rejeitar o pedido.",
      400,
    );
  }
}

/** Espelho da regra `pedidoNaFilaDaFarmacia` no PharmacistDashboard (fila Pedidos). */
function pedidoNaFilaFarmaciaParaNotificacao(order) {
  if (!order) return false;
  const st = String(order.status || "").trim();
  if (["cancelado", "entregue", "rejeitado"].includes(st)) return false;
  if (st === "aguardando_confirmacao_receita_farmacia") return true;
  if (st === "em_processamento") return true;
  return (
    st === "aguardando_pagamento" &&
    String(order.status_pagamento || "").trim() === "aprovado"
  );
}

async function assertLinkedPrescriptionsApproved(order) {
  const receitaIds = [
    ...new Set(
      (order.itens || [])
        .map((item) => item.id_receita)
        .filter(Boolean)
        .map((id) => String(id)),
    ),
  ];

  if (receitaIds.length === 0 && orderHasLinkedPrescriptionItems(order)) {
    throw createError("Pedido com receita sem vínculo de receita aprovada.", 400);
  }

  if (receitaIds.length === 0) return;

  const aprovadas = await Prescription.countDocuments({
    _id: { $in: receitaIds },
    status: "Aprovada",
  });

  if (aprovadas !== receitaIds.length) {
    throw createError("A receita do pedido ainda não foi aprovada.", 400);
  }
}

function notifyPharmacyPedidoPendenteSocket(order) {
  if (!pedidoNaFilaFarmaciaParaNotificacao(order)) return;
  const roomId = pharmacyIdStringFromOrderDoc(order);
  if (!roomId) return;
  let io;
  try {
    io = getIO();
  } catch (_) {
    return;
  }
  io.to("pharmacy:orders:" + roomId).emit("pharmacy:order:pending", {
    orderId: String(order._id),
    status: order.status,
    statusPagamento: order.status_pagamento,
    total: order.total,
  });
}

function emitPharmacyOrderUpdated(order, reason = "order_updated") {
  const roomId = pharmacyIdStringFromOrderDoc(order);
  if (!roomId) return;
  try {
    const io = getIO();
    io.to("pharmacy:orders:" + roomId).emit("pharmacy:order:updated", {
      orderId: String(order._id),
      status: order.status,
      statusPagamento: order.status_pagamento,
      reason,
      updatedAt: new Date(),
    });
  } catch (_) {
    // Socket indisponível fora do runtime HTTP.
  }
}

/** Gera código de retirada quando o pedido está em processamento (retirada/drive-thru). */
function assignPickupCodeIfNeeded(order) {
  if (!order || order.status !== "em_processamento") {
    return;
  }
  if (!["retirada", "drive-thru"].includes(order.tipo_entrega)) {
    return;
  }
  if (order.codigo_retirada) {
    return;
  }
  order.codigo_retirada = crypto.randomInt(100000, 999999).toString();
}

/**
 * Alinha pedido com Payment (pagamento) e com o fluxo real da entrega.
 * Evita "pagamento aprovado" fantasma e "a caminho" sem rota ao cliente.
 */
async function reconcileClientOrder(order) {
  if (!order || ["entregue", "cancelado", "rejeitado"].includes(order.status)) {
    return order;
  }

  let modified = false;

  const payment = await Payment.findOne({ id_pedido: order._id }).select("status").lean();
  const payApproved = payment?.status === "aprovado";

  if (order.status_pagamento === "aprovado" && !payApproved) {
    order.status_pagamento = "pendente";
    modified = true;
  }
  if (order.status_pagamento !== "aprovado" && payApproved) {
    order.status_pagamento = "aprovado";
    modified = true;
  }

  if (order.status === "a_caminho") {
    const emRotaCliente = await Delivery.findOne({
      id_pedido: order._id,
      status: "em_transito",
    })
      .select("_id")
      .lean();

    if (!emRotaCliente) {
      const temEntregadorAtivo = await Delivery.findOne({
        id_pedido: order._id,
        id_entregador: { $ne: null },
        status: { $in: ["aceita", "coletando", "coletada", "em_transito"] },
      })
        .select("_id")
        .lean();

      let nextStatus;
      if (order.status_pagamento === "aprovado" && order.aprovado_farmaceutico) {
        nextStatus = temEntregadorAtivo ? "confirmado" : "em_processamento";
      } else if (order.aprovado_farmaceutico) {
        nextStatus = "em_processamento";
      } else {
        nextStatus = "aguardando_pagamento";
      }

      order.historico_status.push({
        status: nextStatus,
        observacao:
          "Status corrigido: 'a caminho' só quando a entrega está em trânsito ao cliente",
      });
      order.status = nextStatus;
      modified = true;

      if (!temEntregadorAtivo) {
        order.entregador = {};
        order.id_entrega = null;
      }
    }
  }

  if (modified) {
    await order.save();
  }
  return order;
}

async function findOrderOrThrow(filter, populate = null) {
  try {
    let query = Order.findOne(filter);

    if (populate) {
      query = query.populate(populate);
    }

    const order = await query;

    if (!order) {
      throw createError("Pedido não encontrado", 404);
    }

    return order;
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    if (error.name === "CastError") {
      throw createError("Pedido não encontrado", 404);
    }

    throw error;
  }
}

async function emitOrderStatus(orderId, novoStatus, observacao) {
  let io = null;
  try {
    io = getIO();
  } catch (_) {
    io = null;
  }
  if (!io) return;

  const orderIdStr = String(orderId);
  const payload = {
    orderId: orderIdStr,
    novoStatus,
    atualizadoEm: new Date(),
    observacao,
  };

  io.to("order:" + orderIdStr).emit("order:status", payload);

  const order = await Order.findById(orderId).select("id_usuario").lean();
  const userId = order?.id_usuario;
  if (userId) {
    io.to(`user:${userId}`).emit("order:status", payload);
  }
}

async function notifyOrderStatus(order, novoStatus) {
  const notificacoesEnviadas = order.notificacoes_enviadas || [];

  if (notificacoesEnviadas.includes(novoStatus)) {
    return order;
  }

  const usuario = await User.findById(order.id_usuario).select(
    "nome email telefone +fcmToken",
  );

  if (usuario) {
    await sendOrderStatusNotification(
      usuario,
      order,
      formatStatusForNotification(novoStatus),
    );
    // Send transactional email
    sendOrderStatusEmail(order, novoStatus, usuario.email).catch(() => {});
  }

  order.notificacoes_enviadas.push(novoStatus);
  await order.save();

  return order;
}

async function notifyAvailableDriversIfEligible(orderLike, reason = "status_update") {
  const order = orderLike?._id
    ? orderLike
    : await Order.findById(orderLike);

  if (!order) return;

  const isReadyForDriver = isOrderEligibleForDispatch(order);

  if (!isReadyForDriver) return;

  const alreadyNotified = (order.notificacoes_enviadas || []).includes(
    DRIVER_READY_NOTIFICATION_TAG,
  );
  if (alreadyNotified) return;

  const io = getIO();
  const payload = {
    orderId: String(order._id),
    pharmacyId: String(order.id_farmacia),
    total: order.total,
    tipoEntrega: order.tipo_entrega,
    reason,
    createdAt: order.createdAt,
  };

  if (io) {
    io.to("drivers:available").emit("delivery:order-ready", payload);
  }

  const drivers = await User.find({
    tipo_usuario: "entregador",
    ativo: true,
    "dados_entregador.disponivel": true,
  }).select("_id fcmToken");

  await Promise.all(
    drivers.map(async (driver) => {
      if (io) {
        io.to("driver:" + String(driver._id)).emit("delivery:order-ready", payload);
      }

      if (driver.fcmToken) {
        await sendPushNotification({
          token: driver.fcmToken,
          userId: driver._id,
          title: "Nova entrega disponível",
          body: "Um pedido aprovado e pago está pronto para entrega.",
          data: {
            tipo: "delivery_available",
            pedidoId: String(order._id),
            farmaciaId: String(order.id_farmacia),
          },
        });
      }
    }),
  );

  order.notificacoes_enviadas = order.notificacoes_enviadas || [];
  order.notificacoes_enviadas.push(DRIVER_READY_NOTIFICATION_TAG);
  await order.save();
}

async function createOrder(userId, orderData) {
  const {
    itens,
    id_farmacia,
    tipo_entrega,
    endereco_entrega,
    taxa_entrega,
    cupom,
    metodo_pagamento,
    deferPrescriptionApproval,
    aguardar_validacao_receita,
  } = orderData;

  if (!itens || itens.length === 0) {
    throw createError("Pedido deve conter ao menos um item", 400);
  }

  if (!id_farmacia) {
    throw createError("Farmácia é obrigatória", 400);
  }

  if (!mongoose.Types.ObjectId.isValid(String(id_farmacia))) {
    throw createError("Farmácia inválida", 400);
  }

  if (!tipo_entrega) {
    throw createError("Tipo de entrega é obrigatório", 400);
  }

  const pharmacy = await Pharmacy.findById(id_farmacia).select(
    "ativa alvara_sanitario licenca_anvisa afe_anvisa crf_responsavel responsavel_tecnico_nome farmaceutico_responsavel delivery_medicamentos_autorizado",
  );
  assertPharmacyCanReceiveOrders(pharmacy);

  const sanitizedItems = await buildCompliantOrderItems(id_farmacia, itens);
  const subtotalCalculado = roundMoney(
    sanitizedItems.reduce((sum, item) => sum + item.subtotal, 0),
  );
  const totals = await calculateOrderTotals(
    userId,
    subtotalCalculado,
    taxa_entrega,
    cupom,
  );

  const allowPendingPrescriptions =
    deferPrescriptionApproval === true || aguardar_validacao_receita === true;

  const linkedPrescriptions = await prescriptionService.validateOrderItemsPrescriptions(
    userId,
    id_farmacia,
    sanitizedItems,
    { allowPending: allowPendingPrescriptions },
  );

  const hasPrescriptionItems = sanitizedItems.some(
    (item) => item.receita_obrigatoria || item.controlado || item.id_receita,
  );
  // Só fica pendente de validação se houver alguma receita ainda não aprovada.
  // Com a receita já aprovada na tela de Receita, o pedido segue direto para
  // pagamento (igual ao fluxo sem receita).
  const hasPendingPrescriptionValidation =
    hasPrescriptionItems &&
    allowPendingPrescriptions &&
    linkedPrescriptions.some((receita) => receita.status !== "Aprovada");
  const initialStatus = hasPendingPrescriptionValidation
    ? "aguardando_confirmacao_receita_farmacia"
    : "aguardando_pagamento";
  const initialHistoryObservation = hasPendingPrescriptionValidation
    ? "Pedido criado e aguardando validação digital das receitas pela farmácia"
    : "Pedido criado e aguardando pagamento";

  const order = new Order({
    id_usuario: userId,
    id_farmacia,
    itens: sanitizedItems,
    tipo_entrega,
    endereco_entrega: endereco_entrega || {},
    subtotal: totals.subtotal,
    taxa_entrega: totals.taxa_entrega,
    total: totals.total,
    cupom: totals.cupom,
    metodo_pagamento: metodo_pagamento || "pix",
    status: initialStatus,
    status_pagamento: "pendente",
    aprovado_farmaceutico: false,
    modo_demo: compliance.academicDemoMode,
    estoque_baixado: !hasPendingPrescriptionValidation,
    compliance_status: compliance.academicDemoMode
      ? "demo_academico"
      : compliance.requirePharmacyComplianceDocs
        ? "validado"
        : "pendente_validacao",
    observacoes_conformidade: compliance.academicDemoMode
      ? "Protótipo acadêmico: pedido não representa dispensação real de medicamento."
      : undefined,
    historico_status: [
      { status: initialStatus, observacao: initialHistoryObservation },
    ],
  });

  await order.save();

  if (hasPendingPrescriptionValidation) {
    await prescriptionService.linkPrescriptionsToPendingOrder(order);
  } else {
    await prescriptionService.consumePrescriptionsLinkedToOrder(order);
  }

  if (!hasPendingPrescriptionValidation) {
    for (const item of sanitizedItems) {
      if (item.id_produto) {
        await Product.findByIdAndUpdate(item.id_produto, {
          $inc: { estoque: -item.quantidade },
        });
      }
    }
  }

  // Send order confirmation email
  const usuario = await User.findById(userId).select("email");
  if (usuario?.email) {
    sendOrderConfirmation(order, usuario.email).catch(() => {});
  }

  return order;
}

async function getOrderById(orderId, userId, viewerRole) {
  const order = await findOrderOrThrow(
    { _id: orderId },
    [
      {
        path: "id_farmacia",
        select: "nome telefone endereco cidade estado location",
      },
      {
        path: "id_entrega",
        select: ENTREGA_CLIENT_POPULATE_SELECT,
      },
    ],
  );

  await assertOrderReadableByViewer(order, userId, viewerRole);

  await reconcileClientOrder(order);
  if (order.id_entrega) {
    await order.populate({
      path: "id_entrega",
      select: ENTREGA_CLIENT_POPULATE_SELECT,
    });
  }

  const plain = order.toObject();
  const pharmacyId = pharmacyIdStringFromOrderDoc(order);
  let clienteAvaliouFarmacia = false;
  if (pharmacyId) {
    clienteAvaliouFarmacia = Boolean(
      await Review.exists({
        id_usuario: userId,
        id_farmacia: pharmacyId,
      }),
    );
  }
  plain.cliente_avaliou_farmacia = clienteAvaliouFarmacia;
  plain.mostrar_botao_avaliacao = computeMostrarBotaoAvaliacaoClient(plain);
  return plain;
}

async function getUserOrders(userId, { page = 1, limit = 10, status } = {}) {
  const pagination = normalizePagination(page, limit, 10);
  const filtro = { id_usuario: userId };

  if (status) {
    filtro.status = status;
  }

  const total = await Order.countDocuments(filtro);
  const pedidos = await Order.find(filtro)
    .sort({ createdAt: -1 })
    .skip((pagination.page - 1) * pagination.limit)
    .limit(pagination.limit)
    .populate({ path: "id_farmacia", select: "nome cidade" })
    .populate({ path: "id_entrega", select: ENTREGA_CLIENT_POPULATE_SELECT });

  await Promise.all(pedidos.map((p) => reconcileClientOrder(p)));
  await Promise.all(
    pedidos.map((p) =>
      p.id_entrega
        ? p.populate({
            path: "id_entrega",
            select: ENTREGA_CLIENT_POPULATE_SELECT,
          })
        : Promise.resolve(),
    ),
  );

  const uniquePharmacyIds = [
    ...new Set(pedidos.map((p) => pharmacyIdStringFromOrderDoc(p)).filter(Boolean)),
  ].map((id) => new mongoose.Types.ObjectId(id));

  let farmaciasAvaliadasPeloCliente = new Set();
  if (uniquePharmacyIds.length > 0) {
    const reviews = await Review.find({
      id_usuario: userId,
      id_farmacia: { $in: uniquePharmacyIds },
    })
      .select("id_farmacia")
      .lean();
    farmaciasAvaliadasPeloCliente = new Set(reviews.map((r) => String(r.id_farmacia)));
  }

  const pedidosSerializados = pedidos.map((p) => {
    const o = p.toObject();
    const pid = pharmacyIdStringFromOrderDoc(p);
    o.cliente_avaliou_farmacia = Boolean(pid && farmaciasAvaliadasPeloCliente.has(pid));
    o.mostrar_botao_avaliacao = computeMostrarBotaoAvaliacaoClient(o);
    return o;
  });

  return {
    pedidos: pedidosSerializados,
    total,
    pagina: pagination.page,
    totalPaginas: Math.ceil(total / pagination.limit) || 1,
  };
}

async function getPharmacyOrders(
  pharmacyId,
  { page = 1, limit = 20, status } = {},
) {
  const pagination = normalizePagination(page, limit, 20);
  const filtro = { id_farmacia: pharmacyId };

  if (status) {
    filtro.status = status;
  }

  const total = await Order.countDocuments(filtro);
  const pedidos = await Order.find(filtro)
    .sort({ createdAt: -1 })
    .skip((pagination.page - 1) * pagination.limit)
    .limit(pagination.limit)
    .populate({
      path: "id_usuario",
      select: "nome telefone cpf rg lgpd_consentimento",
    })
    .populate({
      path: "itens.id_produto",
      select:
        "nome controlado receita_obrigatoria classificacao_receita registro_anvisa batches",
    })
    .populate({
      path: "itens.id_receita",
      select:
        "url_arquivo nome_arquivo tipo_arquivo hash_arquivo dados_ocr status receita_de_terceiro paciente",
    });

  return {
    pedidos,
    total,
    pagina: pagination.page,
    totalPaginas: Math.ceil(total / pagination.limit) || 1,
  };
}

async function updateOrderStatus(
  orderId,
  novoStatus,
  { usuarioId, pharmacyId, observacao, entregador } = {},
) {
  const order = await findOrderOrThrow({ _id: orderId });

  if (!canTransitionStatus(order.status, novoStatus)) {
    throw createError(
      `Transição inválida de status: ${order.status} -> ${novoStatus}`,
      400,
    );
  }

  if (usuarioId) {
    ensureOwnership(order, "id_usuario", usuarioId);
  }

  if (pharmacyId) {
    ensureOwnership(order, "id_farmacia", pharmacyId);
  }

  order.adicionarHistoricoStatus(novoStatus, observacao);

  if (novoStatus === "a_caminho" && entregador) {
    const entregadorAtual =
      order.entregador?.toObject?.() || order.entregador || {};
    const localizacaoAtual =
      entregador.localizacao_atual || entregadorAtual.localizacao_atual || {};

    order.entregador = {
      ...entregadorAtual,
      ...entregador,
      localizacao_atual: localizacaoAtual,
    };
  }

  if (novoStatus === "entregue") {
    order.avaliacao_entrega = null;
  }

  if (novoStatus === "cancelado") {
    order.cancelado_em = new Date();

    const obsCancel = observacao != null ? String(observacao).trim() : "";
    if (obsCancel && !String(order.motivo_cancelamento || "").trim()) {
      order.motivo_cancelamento = obsCancel;
    }

    await prescriptionService.releasePrescriptionsLinkedToOrder(order);

    const estoqueBaixado = order.estoque_baixado === true;
    let restaurouLote = false;
    // IDs de itens cujo estoque já foi devolvido via lote (evita devolver 2x).
    const estoqueDevolvidoViaLote = new Set();

    // Devolve o lote escolhido na dispensação SNGPC para a lista de seleção do
    // farmacêutico: rejeitado/cancelado → lote volta a ficar disponível.
    for (const item of order.itens || []) {
      const batchNumber = item?.lote_consumido?.batchNumber;
      if (!item.id_produto || !batchNumber) continue;
      const quantity = Number(item.lote_consumido.quantity || item.quantidade || 0);
      await Product.updateOne(
        { _id: item.id_produto, "batches.batchNumber": batchNumber },
        {
          $inc: {
            "batches.$.quantity": quantity,
            ...(estoqueBaixado ? { estoque: quantity } : {}),
          },
        },
      );
      item.lote_consumido = undefined;
      restaurouLote = true;
      if (estoqueBaixado) estoqueDevolvidoViaLote.add(String(item.id_produto));
    }
    if (restaurouLote) {
      order.markModified("itens");
      order.sngpcData = undefined;
    }

    if (order.tipo_entrega !== "retirada" && estoqueBaixado) {
      for (const item of order.itens) {
        if (!item.id_produto || !item.quantidade) continue;
        if (estoqueDevolvidoViaLote.has(String(item.id_produto))) continue;
        await Product.findByIdAndUpdate(item.id_produto, {
          $inc: { estoque: item.quantidade },
        });
      }
    }
    if (estoqueBaixado || restaurouLote) {
      order.estoque_baixado = false;
    }
  }

  await order.save();
  await emitOrderStatus(orderId, novoStatus, observacao);
  await notifyOrderStatus(order, novoStatus);
  await notifyAvailableDriversIfEligible(order, "status_update");

  return order;
}

async function approveOrderByPharmacist(orderId, pharmacyId, observacao) {
  const order = await findOrderOrThrow({ _id: orderId, id_farmacia: pharmacyId });

  if (order.status === "cancelado" || order.status === "rejeitado" || order.status === "entregue") {
    throw createError("Pedido não pode ser aprovado neste status", 400);
  }

  const hasPrescriptionItems = orderHasLinkedPrescriptionItems(order);
  assertControlledOrderSngpcRegistered(order);
  if (hasPrescriptionItems) {
    await assertLinkedPrescriptionsApproved(order);
  }

  order.aprovado_farmaceutico = true;
  order.historico_status.push({
    status: order.status,
    observacao:
      observacao ||
      (hasPrescriptionItems
        ? "Receita aprovada e pedido separado pela farmácia"
        : "Pedido aprovado pelo farmacêutico"),
  });

  if (order.status_pagamento === "aprovado" && order.status === "aguardando_pagamento") {
    order.adicionarHistoricoStatus(
      "em_processamento",
      hasPrescriptionItems
        ? "Pagamento ok, receita validada e pedido separado — entrega liberada para entregadores"
        : "Pagamento ok e pedido validado pelo farmacêutico — entrega liberada para entregadores; confirmado quando um entregador aceitar",
    );
    if (order.estoque_baixado === false) {
      for (const item of order.itens) {
        if (item.id_produto && item.quantidade) {
          await Product.findByIdAndUpdate(item.id_produto, {
            $inc: { estoque: -item.quantidade },
          });
        }
      }
      order.estoque_baixado = true;
    }
  }

  assignPickupCodeIfNeeded(order);

  await order.save();
  if (order.status === "em_processamento") {
    await emitOrderStatus(order._id, "em_processamento", "Pedido pronto para despacho");
    await notifyOrderStatus(order, "em_processamento");
    await notifyAvailableDriversIfEligible(order, "pharmacist_and_payment_confirmed");
    const deliveryService = require("./deliveryService");
    await deliveryService.ensureDispatchDeliveryForOrder(order._id);
  }
  return order;
}

function selectSngpcOrderItem(order, requestedProductId) {
  const sngpcItems = (order.itens || []).filter(
    (item) => isSngpcProduct(item) || isSngpcProduct(item?.id_produto),
  );

  if (sngpcItems.length === 0) {
    throw createError("Pedido sem medicamento sujeito ao SNGPC", 400);
  }

  if (requestedProductId) {
    const match = sngpcItems.find(
      (item) => objectIdString(item.id_produto) === String(requestedProductId),
    );
    if (!match) {
      throw createError("Produto sujeito ao SNGPC não encontrado no pedido", 404);
    }
    return match;
  }

  if (sngpcItems.length > 1) {
    throw createError("Informe o produto sujeito ao SNGPC para validação", 400);
  }

  return sngpcItems[0];
}

async function auditSngpcDispensation({
  order,
  batchNumber,
  user,
  ip,
  userAgent,
}) {
  try {
    await AuditLog.create({
      usuario_id: user?.id || user?._id || null,
      usuario_email: user?.email || "sistema",
      usuario_tipo: user?.tipo_usuario || user?.role || "sistema",
      ip_origem: ip || "sistema",
      user_agent: userAgent,
      acao: "SNGPC_DISPENSATION_VALIDATED",
      recurso: "Order",
      recurso_id: String(order._id),
      valores_novos: {
        sngpcData: order.sngpcData,
      },
      descricao: `Dispensação de medicamento controlado - Lote ${batchNumber} associado ao pedido ${order._id}`,
      status: "sucesso",
    });
  } catch (error) {
    console.error("Erro ao registrar auditoria SNGPC:", error.message);
  }
}

async function validateSngpcDispensation(
  orderId,
  pharmacyId,
  payload = {},
  context = {},
) {
  const order = await findOrderOrThrow(
    { _id: orderId, id_farmacia: pharmacyId },
    {
      path: "id_usuario",
      select: "nome cpf rg telefone lgpd_consentimento",
    },
  );

  if (order.status === "cancelado" || order.status === "rejeitado" || order.status === "entregue") {
    throw createError("Pedido não pode receber dispensação neste status", 400);
  }

  if (order.sngpcData?.validatedAt) {
    throw createError("Dispensação já registrada para este pedido", 400);
  }

  const doctorName = requiredText(payload.doctorName, "Nome do prescritor");
  const doctorCrm = requiredText(payload.doctorCrm, "CRM do prescritor");
  const doctorUf = normalizeUf(payload.doctorUf);
  const digitalSignatureCode = requiredText(
    payload.digitalSignatureCode || payload.signatureValidationCode,
    "Código de validação da assinatura digital",
  );
  const selectedBatchNumber = requiredText(
    payload.selectedBatchNumber,
    "Lote",
  );

  const targetItem = selectSngpcOrderItem(order, payload.productId);
  const productId = objectIdString(targetItem.id_produto);
  const quantity = normalizeOrderQuantity(targetItem.quantidade || 1);

  const product = await Product.findOne({
    _id: productId,
    id_farmacia: pharmacyId,
  }).select("nome estoque batches controlado receita_obrigatoria classificacao_receita");

  if (!product || !isSngpcProduct(product)) {
    throw createError("Medicamento sujeito ao SNGPC não encontrado", 404);
  }

  const selectedBatch = (product.batches || []).find(
    (batch) => String(batch.batchNumber).trim() === selectedBatchNumber,
  );

  if (!selectedBatch || selectedBatch.active === false) {
    throw createError("Lote indisponível para este medicamento", 400);
  }

  const now = new Date();
  if (selectedBatch.expirationDate && new Date(selectedBatch.expirationDate) < now) {
    throw createError("Lote vencido para este medicamento", 400);
  }

  if (Number(selectedBatch.quantity || 0) < quantity) {
    throw createError("Quantidade insuficiente no lote selecionado", 400);
  }

  const incPayload = {
    "batches.$.quantity": -quantity,
  };
  if (order.estoque_baixado === false) {
    incPayload.estoque = -quantity;
  }

  const updatedProduct = await Product.findOneAndUpdate(
    {
      _id: productId,
      id_farmacia: pharmacyId,
      batches: {
        $elemMatch: {
          batchNumber: selectedBatchNumber,
          active: true,
          expirationDate: { $gte: now },
          quantity: { $gte: quantity },
        },
      },
    },
    { $inc: incPayload },
    { new: true },
  ).select("nome estoque batches");

  if (!updatedProduct) {
    throw createError("Lote indisponível para baixa de estoque", 409);
  }

  if (order.estoque_baixado === false) {
    for (const item of order.itens) {
      const itemProductId = objectIdString(item.id_produto);
      if (!itemProductId || itemProductId === productId) continue;
      await Product.findByIdAndUpdate(itemProductId, {
        $inc: { estoque: -normalizeOrderQuantity(item.quantidade || 1) },
      });
    }
    order.estoque_baixado = true;
  }

  targetItem.lote_consumido = {
    batchNumber: selectedBatchNumber,
    expirationDate: selectedBatch.expirationDate,
    quantity,
    debitedAt: new Date(),
  };
  order.markModified("itens");

  const buyer = order.id_usuario;

  // Modalidade da receita: própria (paciente = comprador) ou de terceiro
  // (paciente informado pelo cliente). O SNGPC varia conforme a modalidade.
  let prescricaoVinculada = null;
  if (targetItem.id_receita) {
    prescricaoVinculada = await Prescription.findById(targetItem.id_receita)
      .select("receita_de_terceiro paciente")
      .lean();
  }
  const deTerceiro = Boolean(
    prescricaoVinculada?.receita_de_terceiro || payload.receita_de_terceiro,
  );
  const patientName = deTerceiro
    ? prescricaoVinculada?.paciente?.nome || payload.patientName || ""
    : buyer?.nome || "";
  const patientCpf = deTerceiro
    ? prescricaoVinculada?.paciente?.cpf || payload.patientCpf || ""
    : buyer?.cpf || "";
  const patientRg = deTerceiro
    ? prescricaoVinculada?.paciente?.rg || payload.patientRg || ""
    : buyer?.rg || payload.buyerRg || "";

  order.sngpcData = {
    buyerName: buyer?.nome || "",
    buyerCpf: buyer?.cpf || "",
    buyerRg: buyer?.rg || payload.buyerRg || "",
    buyerPhone: buyer?.telefone || payload.buyerPhone || "",
    lgpdConsentAccepted: Boolean(buyer?.lgpd_consentimento?.aceito),
    receita_de_terceiro: deTerceiro,
    patientName,
    patientCpf,
    patientRg,
    doctorName,
    doctorCrm,
    doctorUf,
    digitalSignatureCode,
    selectedBatchNumber,
    batchExpirationDate: selectedBatch.expirationDate,
    productId,
    productName: product.nome,
    quantity,
    pharmacistId: context.user?.id || context.user?._id || null,
    validatedAt: new Date(),
    traceabilityCode: `SNGPC-${String(order._id).slice(-8).toUpperCase()}-${selectedBatchNumber}`,
  };

  order.aprovado_farmaceutico = true;
  order.farmaceutico_dispensador = context.user?.id || context.user?._id || null;

  order.historico_status.push({
    status: order.status,
    observacao: `Dispensação ANVISA registrada para o lote ${selectedBatchNumber}`,
  });

  if (order.status_pagamento === "aprovado" && order.status === "aguardando_pagamento") {
    order.adicionarHistoricoStatus(
      "em_processamento",
      "Pagamento ok, dispensação registrada e pedido separado para despacho",
    );
  }

  assignPickupCodeIfNeeded(order);
  await order.save();

  await auditSngpcDispensation({
    order,
    batchNumber: selectedBatchNumber,
    user: context.user,
    ip: context.ip,
    userAgent: context.userAgent,
  });
  emitPharmacyOrderUpdated(order, "sngpc_dispensation_validated");

  if (order.status === "em_processamento") {
    await emitOrderStatus(order._id, "em_processamento", "Dispensação registrada");
    await notifyOrderStatus(order, "em_processamento");
    await notifyAvailableDriversIfEligible(order, "sngpc_dispensation_validated");
    const deliveryService = require("./deliveryService");
    await deliveryService.ensureDispatchDeliveryForOrder(order._id);
  }

  return order;
}

async function cancelOrder(orderId, userId) {
  const order = await findOrderOrThrow({ _id: orderId, id_usuario: userId });

  if (order.status === "a_caminho" || order.status === "entregue") {
    throw createError(
      "Pedido não pode ser cancelado após saída para entrega",
      400,
    );
  }

  if (order.status === "cancelado") {
    throw createError("Pedido já cancelado", 400);
  }

  return updateOrderStatus(orderId, "cancelado", {
    usuarioId: userId,
    observacao: "Cancelado pelo usuário",
  });
}

async function rejectOrder(orderId, pharmacyId, motivo) {
  const order = await findOrderOrThrow({
    _id: orderId,
    id_farmacia: pharmacyId,
  });

  const aguardandoComPagamentoOk =
    order.status === "aguardando_pagamento" &&
    order.status_pagamento === "aprovado";
  const aguardandoReceitaNaFarmacia =
    order.status === "aguardando_confirmacao_receita_farmacia";

  assertControlledOrderSngpcRegistered(order);

  if (
    order.status !== "em_processamento" &&
    !aguardandoComPagamentoOk &&
    !aguardandoReceitaNaFarmacia
  ) {
    throw createError("Pedido não pode ser rejeitado neste status", 400);
  }

  order.motivo_cancelamento = motivo;
  await order.save();

  return updateOrderStatus(orderId, "cancelado", {
    observacao: motivo,
    pharmacyId,
  });
}

/**
 * Finaliza pedido de retirada ou drive-thru na loja (sem entregador).
 */
async function completePharmacyPickup(
  orderId,
  pharmacyId,
  observacao,
  codigoRetirada,
) {
  const order = await findOrderOrThrow({
    _id: orderId,
    id_farmacia: pharmacyId,
  });

  if (order.status !== "em_processamento") {
    throw createError(
      "Só é possível finalizar retirada para pedidos em processamento na farmácia.",
      400,
    );
  }

  if (!["retirada", "drive-thru"].includes(order.tipo_entrega)) {
    throw createError(
      "Esta ação é apenas para pedidos de retirada ou drive-thru. Pedidos com entrega no endereço seguem o fluxo do entregador.",
      400,
    );
  }

  if (order.status_pagamento !== "aprovado") {
    throw createError(
      "Confirme o pagamento antes de marcar o pedido como entregue.",
      400,
    );
  }

  if (!order.codigo_retirada) {
    throw createError(
      "Pedido sem código de retirada. Peça ao cliente atualizar Meus pedidos; se persistir, confirme a compra na farmácia novamente ou gere o código no painel.",
      400,
    );
  }

  const codigoInformado = String(codigoRetirada ?? "").trim();
  if (!codigoInformado) {
    throw createError(
      "Informe o código de retirada exibido no celular do cliente.",
      400,
    );
  }
  if (codigoInformado !== String(order.codigo_retirada).trim()) {
    throw createError(
      "Código de retirada incorreto. Confira com o cliente.",
      403,
    );
  }

  order.adicionarHistoricoStatus(
    "entregue",
    observacao || "Retirada entregue ao cliente na farmácia",
  );
  order.entregue_em = new Date();
  order.avaliacao_entrega = null;

  await order.save();
  await emitOrderStatus(
    orderId,
    "entregue",
    observacao || "Retirada concluída na farmácia",
  );
  await notifyOrderStatus(order, "entregue");
  await notifyAvailableDriversIfEligible(order, "status_update");

  return order;
}

async function updateDeliveryLocation(
  orderId,
  { latitude, longitude, pharmacyId } = {},
) {
  const order = await findOrderOrThrow({ _id: orderId });

  if (pharmacyId) {
    ensureOwnership(order, "id_farmacia", pharmacyId);
  }

  if (order.status !== "a_caminho") {
    throw createError("Pedido não está em rota de entrega", 400);
  }

  const latitudeNumerica = Number(latitude);
  const longitudeNumerica = Number(longitude);

  if (
    !Number.isFinite(latitudeNumerica) ||
    !Number.isFinite(longitudeNumerica)
  ) {
    throw createError("Latitude e longitude devem ser números válidos", 400);
  }

  const atualizadoEm = new Date();
  const entregadorAtual =
    order.entregador?.toObject?.() || order.entregador || {};

  order.entregador = {
    ...entregadorAtual,
    localizacao_atual: {
      latitude: latitudeNumerica,
      longitude: longitudeNumerica,
      atualizado_em: atualizadoEm,
    },
  };

  await order.save();

  const io = getIO();
  io.to("order:" + orderId).emit("delivery:location", {
    orderId,
    latitude: latitudeNumerica,
    longitude: longitudeNumerica,
    atualizadoEm: atualizadoEm,
  });

  return { success: true };
}

async function rateDelivery(orderId, userId, { nota, comentario } = {}) {
  const order = await findOrderOrThrow({ _id: orderId, id_usuario: userId });

  if (order.status !== "entregue") {
    throw createError("Só é possível avaliar pedidos entregues", 400);
  }

  if (order.avaliado_em) {
    throw createError("Pedido já avaliado", 400);
  }

  const notaNumerica = Number(nota);

  if (!Number.isFinite(notaNumerica) || notaNumerica < 1 || notaNumerica > 5) {
    throw createError("Nota deve ser um número inteiro entre 1 e 5", 400);
  }

  order.avaliacao_entrega = notaNumerica;
  order.comentario_avaliacao = comentario;
  order.avaliado_em = new Date();

  await order.save();

  return order;
}

async function generatePickupCode(orderId, pharmacyId) {
  const order = await findOrderOrThrow({ _id: orderId });

  if (pharmacyId) {
    ensureOwnership(order, "id_farmacia", pharmacyId);
  }

  if (!["retirada", "drive-thru"].includes(order.tipo_entrega)) {
    throw createError(
      "Código de retirada disponível apenas para pedidos de retirada ou drive-thru",
      400,
    );
  }

  const codigo = crypto.randomInt(100000, 999999).toString();
  order.codigo_retirada = codigo;
  await order.save();

  return codigo;
}

async function getOrderStats(pharmacyId) {
  const pharmacyObjectId = normalizeObjectId(pharmacyId);

  const porStatusAggregation = await Order.aggregate([
    { $match: { id_farmacia: pharmacyObjectId } },
    { $group: { _id: "$status", total: { $sum: 1 } } },
  ]);

  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);

  const totalHoje = await Order.countDocuments({
    id_farmacia: pharmacyObjectId,
    createdAt: { $gte: inicioDoDia },
  });

  const por_status = porStatusAggregation.reduce((accumulator, item) => {
    accumulator[item._id] = item.total;
    return accumulator;
  }, {});

  return {
    por_status,
    total_hoje: totalHoje,
  };
}

async function generateDeliveryQRCode(orderId, userId) {
  const order = await findOrderOrThrow({ _id: orderId, id_usuario: userId });

  if (order.status === "cancelado" || order.status === "entregue") {
    throw createError("QR Code indisponível para este status", 400);
  }

  const token = crypto.randomBytes(16).toString("hex");
  order.qr_token = token;
  await order.save();

  const payload = JSON.stringify({
    orderId: order._id.toString(),
    token,
    ts: Date.now(),
  });

  const qrDataUrl = await QRCode.toDataURL(payload, {
    width: 300,
    margin: 2,
    color: { dark: "#059669", light: "#ffffff" },
  });

  return { qrDataUrl, token };
}

/**
 * Farmacêutico confirma a finalização SNGPC com o mesmo código que o cliente deu ao entregador.
 */
async function confirmReceiptReturnAtPharmacy(orderId, pharmacyId, codigo) {
  const order = await findOrderOrThrow({
    _id: orderId,
    id_farmacia: pharmacyId,
  });

  if (order.status !== "aguardando_confirmacao_receita_farmacia") {
    throw createError(
      "Pedido não está aguardando confirmação da receita na farmácia.",
      400,
    );
  }

  const codigoInformado = String(codigo ?? "").trim();
  if (!codigoInformado) {
    throw createError("Informe o código confirmado com o cliente.", 400);
  }

  let delivery = null;
  if (order.id_entrega) {
    delivery = await Delivery.findById(order.id_entrega);
  }
  if (!delivery || delivery.status !== "em_transito") {
    delivery = await Delivery.findOne({
      id_pedido: order._id,
      status: "em_transito",
    });
  }

  if (!delivery) {
    throw createError("Entrega não encontrada ou já finalizada.", 400);
  }

  if (!delivery.receita_aguardando_confirmacao_farmacia_em) {
    throw createError(
      "O entregador ainda não registrou o código com o cliente.",
      400,
    );
  }

  if (codigoInformado !== String(delivery.codigo_confirmacao || "").trim()) {
    throw createError("Código incorreto. Confira com o entregador e o cliente.", 403);
  }

  order.adicionarHistoricoStatus(
    "entregue",
    "Baixa digital do lote conferida na farmácia - pedido encerrado.",
  );
  order.entregue_em = new Date();
  order.avaliacao_entrega = null;
  await order.save();

  delivery.adicionarHistorico(
    "entregue",
    "Entrega encerrada após confirmação do farmacêutico na farmácia",
    undefined,
  );
  delivery.entregue_em = new Date();
  delivery.receita_aguardando_confirmacao_farmacia_em = null;
  await delivery.save();

  if (delivery.id_entregador) {
    await User.findByIdAndUpdate(delivery.id_entregador, {
      $inc: { "dados_entregador.entregas_realizadas": 1 },
    });
  }

  await emitOrderStatus(String(order._id), "entregue", "Pedido entregue");
  await notifyOrderStatus(order, "entregue");

  try {
    const io = getIO();
    io.to("delivery:" + String(delivery._id)).emit("delivery:status", {
      deliveryId: String(delivery._id),
      status: "entregue",
      atualizadoEm: new Date(),
      observacao: "Confirmado na farmácia",
    });
  } catch (_) {}

  return order;
}

async function confirmDeliveryByQR(orderId, token) {
  const order = await findOrderOrThrow({ _id: orderId });

  if (order.status === "entregue") {
    throw createError("Pedido já foi entregue", 400);
  }

  if (!order.qr_token || order.qr_token !== token) {
    throw createError("QR Code inválido", 403);
  }

  order.status = "entregue";
  order.entregue_em = new Date();
  order.qr_token = undefined;
  order.historico_status.push({
    status: "entregue",
    observacao: "Entrega confirmada via QR Code",
  });
  await order.save();

  await emitOrderStatus(orderId, "entregue", "Confirmado via QR Code");
  await notifyOrderStatus(order, "entregue");

  return order;
}

module.exports = {
  createOrder,
  getOrderById,
  getUserOrders,
  getPharmacyOrders,
  updateOrderStatus,
  approveOrderByPharmacist,
  validateSngpcDispensation,
  assignPickupCodeIfNeeded,
  completePharmacyPickup,
  cancelOrder,
  rejectOrder,
  confirmReceiptReturnAtPharmacy,
  updateDeliveryLocation,
  rateDelivery,
  generatePickupCode,
  generateDeliveryQRCode,
  confirmDeliveryByQR,
  getOrderStats,
  notifyAvailableDriversIfEligible,
  emitOrderStatus,
  notifyOrderStatus,
  notifyPharmacyPedidoPendenteSocket,
  emitPharmacyOrderUpdated,
};
