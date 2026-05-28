const mongoose = require("mongoose");
const Delivery = require("../models/Delivery");
const Order = require("../models/Order");
const Prescription = require("../models/Prescription");
const User = require("../models/User");
const Pharmacy = require("../models/Pharmacy");
const crypto = require("crypto");
const { getIO } = require("../config/socket");
const { haversineDistance } = require("../utils/haversine");
const { emitOrderStatus, notifyOrderStatus } = require("./orderService");
const {
  isOrderEligibleForDispatch,
  buildEligibleOrderDispatchFilter,
  NON_DISPATCH_TYPES,
  orderNeedsPharmacyReceiptReturn,
} = require("../utils/deliveryEligibility");

const ALLOWED_STATUS_TRANSITIONS = {
  disponivel: ["aceita", "cancelada"],
  aceita: ["coletando", "cancelada"],
  coletando: ["coletada", "cancelada"],
  coletada: ["em_transito", "cancelada"],
  em_transito: ["entregue", "cancelada"],
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

function canTransition(atual, novo) {
  return ALLOWED_STATUS_TRANSITIONS[atual]?.includes(novo) || false;
}

async function findDeliveryOrThrow(filter, populate = null) {
  let query = Delivery.findOne(filter);
  if (populate) query = query.populate(populate);
  const delivery = await query;
  if (!delivery) throw createError("Entrega não encontrada", 404);
  return delivery;
}

function emitDeliveryUpdate(deliveryId, event, data) {
  try {
    const io = getIO();
    io.to("delivery:" + deliveryId).emit(event, { deliveryId, ...data });
  } catch (_) {
    // Socket não inicializado em testes
  }
}

/** PIN só para o cliente — nunca retornar ao entregador na API. */
function stripConfirmationCodeForEntregador(deliveryLike) {
  if (!deliveryLike) return deliveryLike;
  const plain = deliveryLike.toObject
    ? deliveryLike.toObject()
    : { ...deliveryLike };
  delete plain.codigo_confirmacao;
  return plain;
}

function toDeliveryResponse(deliveryLike, userRole) {
  if (!deliveryLike) return deliveryLike;
  if (userRole === "entregador") {
    return stripConfirmationCodeForEntregador(deliveryLike);
  }
  return deliveryLike.toObject ? deliveryLike.toObject() : { ...deliveryLike };
}

/**
 * Garante registro de entrega em "disponivel" quando o pedido está pronto para despacho.
 * Não existe tela de farmácia para isso no app — o sistema cria sozinho.
 */
async function ensureDispatchDeliveryForOrder(orderId) {
  const oid = orderId?._id || orderId;
  if (!oid) return null;

  const order = await Order.findById(oid);
  if (!order) return null;

  if (
    order.status === "confirmado" &&
    order.aprovado_farmaceutico === true &&
    order.status_pagamento === "aprovado"
  ) {
    const hasActiveDelivery = await Delivery.exists({
      id_pedido: order._id,
      status: { $ne: "cancelada" },
    });
    if (!hasActiveDelivery) {
      order.adicionarHistoricoStatus(
        "em_processamento",
        "Correção automática: pedido voltou para despacho por ausência de entrega ativa",
      );
      order.entregador = {};
      order.id_entrega = null;
      await order.save();
      console.info(
        "[ensureDispatchDeliveryForOrder] pedido normalizado para em_processamento",
        String(order._id),
      );
    }
  }

  if (!isOrderEligibleForDispatch(order)) {
    console.info(
      "[ensureDispatchDeliveryForOrder] pedido não elegível para despacho",
      JSON.stringify({
        orderId: String(order._id),
        status: order.status,
        aprovado_farmaceutico: order.aprovado_farmaceutico,
        status_pagamento: order.status_pagamento,
        tipo_entrega: order.tipo_entrega,
      }),
    );
    return null;
  }

  const existing = await Delivery.findOne({
    id_pedido: order._id,
    status: { $ne: "cancelada" },
  });
  if (existing) return existing;

  try {
    return await createDelivery(String(order._id), String(order.id_farmacia));
  } catch (err) {
    if (
      err.statusCode === 400 &&
      String(err.message || "").includes("Já existe")
    ) {
      return Delivery.findOne({
        id_pedido: order._id,
        status: { $ne: "cancelada" },
      });
    }
    console.error("[ensureDispatchDeliveryForOrder]", err.message || err);
    return null;
  }
}

/**
 * Cria uma entrega para um pedido (também pode ser chamado via API pela farmácia, se existir).
 */
async function createDelivery(orderIdStr, pharmacyId) {
  const order = await Order.findById(orderIdStr);
  if (!order) throw createError("Pedido não encontrado", 404);

  if (String(order.id_farmacia) !== String(pharmacyId)) {
    throw createError("Pedido não pertence a esta farmácia", 403);
  }

  if (!isOrderEligibleForDispatch(order)) {
    throw createError(
      "Pedido precisa estar em processamento com pagamento e aprovação farmacêutica para criar entrega",
      400,
    );
  }

  if (NON_DISPATCH_TYPES.includes(order.tipo_entrega)) {
    throw createError(
      "Pedidos de retirada/drive-thru não precisam de entrega",
      400,
    );
  }

  const existing = await Delivery.findOne({
    id_pedido: order._id,
    status: { $ne: "cancelada" },
  });
  if (existing)
    throw createError("Já existe uma entrega ativa para este pedido", 400);

  const pharmacy = await Pharmacy.findById(pharmacyId).select(
    "nome logradouro numero complemento bairro cidade estado cep location",
  );
  if (!pharmacy) throw createError("Farmácia não encontrada", 404);

  const codigoConfirmacao = crypto.randomInt(100000, 999999).toString();

  const endereco_coleta = {
    logradouro: pharmacy.logradouro || "",
    numero: pharmacy.numero || "",
    complemento: pharmacy.complemento || "",
    bairro: pharmacy.bairro || "",
    cidade: pharmacy.cidade || "",
    estado: pharmacy.estado || "",
    cep: pharmacy.cep || "",
  };
  if (pharmacy.location?.coordinates?.length === 2) {
    endereco_coleta.location = {
      type: "Point",
      coordinates: pharmacy.location.coordinates,
    };
  }

  const endereco_entrega = {
    logradouro: order.endereco_entrega?.logradouro || "",
    numero: order.endereco_entrega?.numero || "",
    complemento: order.endereco_entrega?.complemento || "",
    bairro: order.endereco_entrega?.bairro || "",
    cidade: order.endereco_entrega?.cidade || "",
    estado: order.endereco_entrega?.estado || "",
    cep: order.endereco_entrega?.cep || "",
  };

  const delivery = new Delivery({
    id_pedido: order._id,
    id_farmacia: pharmacyId,
    id_cliente: order.id_usuario,
    status: "disponivel",
    endereco_coleta,
    endereco_entrega,
    valor_entrega: order.taxa_entrega || 0,
    codigo_confirmacao: codigoConfirmacao,
    historico_status: [
      {
        status: "disponivel",
        observacao: "Entrega criada e disponível para entregadores",
      },
    ],
  });

  await delivery.save();

  order.id_entrega = delivery._id;
  await order.save();

  return delivery;
}

/**
 * Pedidos que já podem ir para entrega mas ficaram sem registro (deploy antigo, falha intermitente).
 */
async function repairMissingDispatchesForEligibleOrders() {
  try {
    // Corrige pedidos legados cujo farmacêutico aprovou a receita,
    // mas o flag do pedido não foi sincronizado.
    const pendingApprovalSync = await Order.find({
      status: "aguardando_pagamento",
      status_pagamento: "aprovado",
      aprovado_farmaceutico: false,
      tipo_entrega: { $nin: NON_DISPATCH_TYPES },
    })
      .select("_id")
      .limit(30)
      .lean();

    for (const o of pendingApprovalSync) {
      const hasApprovedPrescription = await Prescription.exists({
        status: "Aprovada",
        $or: [{ id_pedido_vinculado: o._id }, { id_pedido_utilizado: o._id }],
      });
      if (!hasApprovedPrescription) continue;

      const order = await Order.findById(o._id);
      if (!order) continue;
      if (order.aprovado_farmaceutico !== true) {
        order.aprovado_farmaceutico = true;
      }
      if (
        order.status === "aguardando_pagamento" &&
        order.status_pagamento === "aprovado"
      ) {
        order.adicionarHistoricoStatus(
          "em_processamento",
          "Sincronização automática: receita aprovada e pagamento confirmado",
        );
      }
      await order.save();
      console.info(
        "[repairMissingDispatchesForEligibleOrders] pedido sincronizado via receita aprovada",
        String(order._id),
      );
    }

    const candidates = await Order.find(buildEligibleOrderDispatchFilter())
      .select("_id")
      .limit(30)
      .lean();

    for (const o of candidates) {
      const has = await Delivery.exists({
        id_pedido: o._id,
        status: { $ne: "cancelada" },
      });
      if (!has) {
        await ensureDispatchDeliveryForOrder(o._id);
      }
    }
  } catch (err) {
    console.error(
      "[repairMissingDispatchesForEligibleOrders]",
      err.message || err,
    );
  }
}

/**
 * Lista entregas disponíveis para entregadores (com filtro por proximidade opcional).
 * Com GPS do entregador: filtra por distância só quando a coleta tem coordenadas; sem GPS na farmácia, a entrega continua listada (evita sumir tudo no dev).
 */
async function getAvailableDeliveries({
  latitude,
  longitude,
  raioKm = 10,
  page = 1,
  limit = 20,
} = {}) {
  await repairMissingDispatchesForEligibleOrders();

  const pagination = normalizePagination(page, limit, 20);
  const baseFilter = {
    status: "disponivel",
    id_entregador: null,
  };
  const lat = Number(latitude);
  const lng = Number(longitude);
  const hasDriverLocation = Number.isFinite(lat) && Number.isFinite(lng);
  const maxDistanceKm = Number(raioKm) > 0 ? Number(raioKm) : 10;

  if (!hasDriverLocation) {
    const total = await Delivery.countDocuments(baseFilter);
    const entregasRaw = await Delivery.find(baseFilter)
      .sort({ createdAt: -1 })
      .skip((pagination.page - 1) * pagination.limit)
      .limit(pagination.limit)
      .populate({ path: "id_farmacia", select: "nome cidade estado" })
      .populate({ path: "id_pedido", select: "tipo_entrega total itens" });

    const entregas = entregasRaw.map((entrega) => {
      const plain = entrega.toObject ? entrega.toObject() : entrega;
      plain.distancia_km = null;
      return stripConfirmationCodeForEntregador(plain);
    });

    return {
      entregas,
      total,
      pagina: pagination.page,
      totalPaginas: Math.ceil(total / pagination.limit) || 1,
    };
  }

  const FETCH_CAP = 500;
  const entregasRaw = await Delivery.find(baseFilter)
    .sort({ createdAt: -1 })
    .limit(FETCH_CAP)
    .populate({ path: "id_farmacia", select: "nome cidade estado" })
    .populate({ path: "id_pedido", select: "tipo_entrega total itens" });

  const scored = entregasRaw.map((entrega) => {
    const raw = entrega.toObject ? entrega.toObject() : entrega;
    const plain = stripConfirmationCodeForEntregador(raw);
    const coords = plain?.endereco_coleta?.location?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      const [coletaLng, coletaLat] = coords;
      const distanceKm = haversineDistance(
        { latitude: lat, longitude: lng },
        { latitude: coletaLat, longitude: coletaLng },
      );
      plain.distancia_km = Math.round(distanceKm * 10) / 10;
      plain._distanceKmSort = distanceKm;
    } else {
      plain.distancia_km = null;
      plain._distanceKmSort = Number.POSITIVE_INFINITY;
    }
    return plain;
  });

  const filtered = scored.filter((plain) => {
    if (
      !Number.isFinite(plain._distanceKmSort) ||
      plain._distanceKmSort === Number.POSITIVE_INFINITY
    ) {
      return true;
    }
    return plain._distanceKmSort <= maxDistanceKm;
  });

  filtered.sort((a, b) => {
    if (a._distanceKmSort !== b._distanceKmSort) {
      return a._distanceKmSort - b._distanceKmSort;
    }
    const da = new Date(a.createdAt || 0).getTime();
    const db = new Date(b.createdAt || 0).getTime();
    return db - da;
  });

  for (const p of filtered) {
    delete p._distanceKmSort;
  }

  const total = filtered.length;
  const start = (pagination.page - 1) * pagination.limit;
  const entregas = filtered.slice(start, start + pagination.limit);

  return {
    entregas,
    total,
    pagina: pagination.page,
    totalPaginas: Math.ceil(total / pagination.limit) || 1,
  };
}

/**
 * Lista entregas do entregador autenticado.
 */
async function getMyDeliveries(
  entregadorId,
  { page = 1, limit = 20, status } = {},
) {
  const pagination = normalizePagination(page, limit, 20);
  const filter = { id_entregador: entregadorId };
  if (status) filter.status = status;

  const total = await Delivery.countDocuments(filter);
  const entregasRaw = await Delivery.find(filter)
    .sort({ createdAt: -1 })
    .skip((pagination.page - 1) * pagination.limit)
    .limit(pagination.limit)
    .populate({ path: "id_farmacia", select: "nome cidade estado" })
    .populate({ path: "id_cliente", select: "nome telefone" })
    .populate({
      path: "id_pedido",
      select: "tipo_entrega total itens endereco_entrega status id_entrega",
    });

  const entregas = entregasRaw.map((d) =>
    stripConfirmationCodeForEntregador(d),
  );

  return {
    entregas,
    total,
    pagina: pagination.page,
    totalPaginas: Math.ceil(total / pagination.limit) || 1,
  };
}

/**
 * Detalhes de uma entrega.
 */
async function getDeliveryById(deliveryId, userId, userRole) {
  const delivery = await findDeliveryOrThrow({ _id: deliveryId }, [
    { path: "id_farmacia", select: "nome endereco cidade estado telefone" },
    { path: "id_cliente", select: "nome telefone" },
    {
      path: "id_entregador",
      select: "nome telefone dados_entregador.tipo_veiculo dados_entregador.localizacao_atual",
    },
    { path: "id_pedido", select: "itens total tipo_entrega status" },
  ]);

  // Verificar acesso
  if (
    userRole === "cliente" &&
    String(delivery.id_cliente?._id || delivery.id_cliente) !== String(userId)
  ) {
    throw createError("Entrega não encontrada", 404);
  }
  if (
    userRole === "entregador" &&
    delivery.id_entregador &&
    String(delivery.id_entregador?._id || delivery.id_entregador) !==
      String(userId)
  ) {
    // Entregador pode ver entregas disponíveis (sem entregador) ou as próprias
    if (delivery.status !== "disponivel") {
      throw createError("Entrega não encontrada", 404);
    }
  }

  return toDeliveryResponse(delivery, userRole);
}

/**
 * Entregador aceita uma entrega disponível.
 */
async function acceptDelivery(deliveryId, entregadorId) {
  const delivery = await findDeliveryOrThrow({ _id: deliveryId });

  if (delivery.status !== "disponivel") {
    throw createError("Esta entrega não está mais disponível", 400);
  }
  if (delivery.id_entregador) {
    throw createError("Esta entrega já foi aceita por outro entregador", 400);
  }

  // Verificar se entregador não tem outra entrega ativa
  const entregaAtiva = await Delivery.findOne({
    id_entregador: entregadorId,
    status: { $in: ["aceita", "coletando", "coletada", "em_transito"] },
  });
  if (entregaAtiva) {
    throw createError(
      "Você já possui uma entrega ativa. Finalize-a antes de aceitar outra.",
      400,
    );
  }

  delivery.id_entregador = entregadorId;
  delivery.aceita_em = new Date();
  delivery.adicionarHistorico("aceita", "Entrega aceita pelo entregador");

  await delivery.save();

  // Só vincula o entregador; "a caminho" no pedido só quando a entrega entra em em_transito
  const entregador = await User.findById(entregadorId).select(
    "nome telefone dados_entregador",
  );
  const order = await Order.findById(delivery.id_pedido);
  if (order) {
    order.entregador = {
      nome: entregador?.nome || "",
      telefone: entregador?.telefone || "",
      veiculo: entregador?.dados_entregador?.tipo_veiculo || "",
    };
    let promoveuConfirmado = false;
    if (
      order.aprovado_farmaceutico &&
      order.status_pagamento === "aprovado" &&
      order.status === "em_processamento"
    ) {
      order.adicionarHistoricoStatus(
        "confirmado",
        "Pedido confirmado após o entregador aceitar a entrega",
      );
      promoveuConfirmado = true;
    }
    await order.save();
    if (promoveuConfirmado) {
      await emitOrderStatus(
        String(order._id),
        "confirmado",
        "Entregador aceitou a entrega",
      );
      await notifyOrderStatus(order, "confirmado");
    }
  }

  emitDeliveryUpdate(deliveryId, "delivery:accepted", {
    entregadorId,
    status: "aceita",
  });

  return stripConfirmationCodeForEntregador(delivery);
}

/**
 * Atualiza status da entrega (entregador).
 */
async function updateDeliveryStatus(
  deliveryId,
  novoStatus,
  {
    entregadorId,
    observacao,
    latitude,
    longitude,
    responseRole: explicitResponseRole,
  } = {},
) {
  const delivery = await findDeliveryOrThrow({ _id: deliveryId });

  if (entregadorId && String(delivery.id_entregador) !== String(entregadorId)) {
    throw createError("Você não é o entregador desta entrega", 403);
  }

  if (!canTransition(delivery.status, novoStatus)) {
    throw createError(
      `Transição inválida: ${delivery.status} → ${novoStatus}`,
      400,
    );
  }

  const localizacao =
    latitude && longitude
      ? { latitude: Number(latitude), longitude: Number(longitude) }
      : undefined;
  delivery.adicionarHistorico(novoStatus, observacao, localizacao);

  if (novoStatus === "coletada") {
    delivery.coletada_em = new Date();
  }
  if (novoStatus === "em_transito") {
    const order = await Order.findById(delivery.id_pedido);
    if (
      order &&
      order.status !== "a_caminho" &&
      order.status !== "entregue" &&
      order.status === "confirmado"
    ) {
      order.adicionarHistoricoStatus(
        "a_caminho",
        observacao || "Pedido em rota para o endereço de entrega",
      );
      await order.save();
      await emitOrderStatus(String(order._id), "a_caminho", observacao || "");
      await notifyOrderStatus(order, "a_caminho");
    }
  }
  if (novoStatus === "entregue") {
    delivery.entregue_em = new Date();
    // Atualizar pedido
    const order = await Order.findById(delivery.id_pedido);
    if (order && order.status !== "entregue") {
      order.adicionarHistoricoStatus("entregue", "Pedido entregue ao cliente");
      await order.save();
      await emitOrderStatus(String(order._id), "entregue", "Pedido entregue ao cliente");
      await notifyOrderStatus(order, "entregue");
    }
    // Incrementar entregas do entregador
    await User.findByIdAndUpdate(delivery.id_entregador, {
      $inc: { "dados_entregador.entregas_realizadas": 1 },
    });
  }
  if (novoStatus === "cancelada") {
    delivery.cancelada_em = new Date();
    delivery.motivo_cancelamento = observacao || "Cancelada";
    const order = await Order.findById(delivery.id_pedido);
    if (order && String(order.id_entrega || "") === String(delivery._id)) {
      if (order.status === "aguardando_confirmacao_receita_farmacia") {
        order.adicionarHistoricoStatus(
          "em_processamento",
          "Entrega cancelada após código no cliente — pedido disponível para novo despacho",
        );
      } else if (order.status === "a_caminho") {
        order.adicionarHistoricoStatus(
          "em_processamento",
          "Entrega cancelada - pedido retornado para processamento",
        );
      } else if (order.status === "confirmado") {
        order.adicionarHistoricoStatus(
          "em_processamento",
          "Entrega cancelada após aceite do entregador — pedido disponível para novo despacho",
        );
      } else {
        order.historico_status.push({
          status: order.status,
          observacao: "Entrega cancelada; pedido disponível para novo despacho",
        });
      }
      order.entregador = {};
      order.id_entrega = null;
      await order.save();
    }
  }

  await delivery.save();

  emitDeliveryUpdate(deliveryId, "delivery:status", {
    status: novoStatus,
    atualizadoEm: new Date(),
    observacao,
  });

  const viewerRole =
    explicitResponseRole !== undefined
      ? explicitResponseRole
      : entregadorId
        ? "entregador"
        : undefined;

  return toDeliveryResponse(delivery, viewerRole);
}

/**
 * Atualiza localização do entregador durante a entrega.
 */
async function updateLocation(
  deliveryId,
  entregadorId,
  { latitude, longitude },
) {
  const delivery = await findDeliveryOrThrow({ _id: deliveryId });

  if (String(delivery.id_entregador) !== String(entregadorId)) {
    throw createError("Você não é o entregador desta entrega", 403);
  }

  if (
    !["aceita", "coletando", "coletada", "em_transito"].includes(
      delivery.status,
    )
  ) {
    throw createError("Entrega não está em andamento", 400);
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw createError("Latitude e longitude devem ser números válidos", 400);
  }

  // Atualizar localização no User também
  await User.findByIdAndUpdate(entregadorId, {
    "dados_entregador.localizacao_atual": {
      type: "Point",
      coordinates: [lng, lat],
    },
  });

  // Emitir via socket para tracking em tempo real
  emitDeliveryUpdate(deliveryId, "delivery:location", {
    latitude: lat,
    longitude: lng,
    atualizadoEm: new Date(),
  });

  // Também emitir no canal do pedido (compatível com orderService)
  try {
    const io = getIO();
    io.to("order:" + delivery.id_pedido).emit("delivery:location", {
      orderId: String(delivery.id_pedido),
      latitude: lat,
      longitude: lng,
      atualizadoEm: new Date(),
    });
  } catch (_) {}

  return { success: true };
}

/**
 * Entregador confirma que conferiu a receita física com o cliente (remédios controlados).
 */
async function confirmReceiptAtCustomer(deliveryId, entregadorId) {
  const delivery = await findDeliveryOrThrow({ _id: deliveryId });

  if (String(delivery.id_entregador) !== String(entregadorId)) {
    throw createError("Você não é o entregador desta entrega", 403);
  }

  if (!["coletada", "em_transito"].includes(delivery.status)) {
    throw createError(
      "Confirme a coleta na farmácia antes de registrar a receita com o cliente",
      400,
    );
  }

  delivery.receita_fisica_cliente_confirmada_em = new Date();
  await delivery.save();

  return stripConfirmationCodeForEntregador(delivery);
}

/**
 * Confirmar entrega com código de confirmação.
 */
async function confirmDelivery(deliveryId, entregadorId, codigo) {
  const delivery = await findDeliveryOrThrow({ _id: deliveryId });

  if (String(delivery.id_entregador) !== String(entregadorId)) {
    throw createError("Você não é o entregador desta entrega", 403);
  }

  if (delivery.status !== "em_transito") {
    throw createError("Entrega precisa estar em trânsito para confirmar", 400);
  }

  const codigoNorm = String(codigo ?? "").trim();
  const codigoEsperado = String(delivery.codigo_confirmacao ?? "").trim();
  if (!codigoEsperado || codigoEsperado !== codigoNorm) {
    throw createError("Código de confirmação inválido", 400);
  }

  const order = await Order.findById(delivery.id_pedido);
  if (orderNeedsPharmacyReceiptReturn(order)) {
    const now = new Date();
    delivery.receita_fisica_cliente_confirmada_em = now;
    delivery.receita_aguardando_confirmacao_farmacia_em = now;
    delivery.historico_status.push({
      status: "em_transito",
      alterado_em: now,
      observacao:
        "Código confirmado com o cliente; aguardando conferência da receita física na farmácia",
    });
    await delivery.save();

    if (order.status !== "aguardando_confirmacao_receita_farmacia") {
      order.adicionarHistoricoStatus(
        "aguardando_confirmacao_receita_farmacia",
        "Código confirmado pelo entregador; aguardando conferência da receita física na farmácia",
      );
      await order.save();
      await emitOrderStatus(
        String(order._id),
        "aguardando_confirmacao_receita_farmacia",
        "Aguardando confirmação da receita na farmácia",
      );
      await notifyOrderStatus(order, "aguardando_confirmacao_receita_farmacia");
    }

    emitDeliveryUpdate(deliveryId, "delivery:status", {
      status: delivery.status,
      atualizadoEm: now,
      aguardando_confirmacao_farmacia: true,
    });

    return {
      entrega: stripConfirmationCodeForEntregador(delivery),
      aguardando_confirmacao_farmacia: true,
    };
  }

  const finalDelivery = await updateDeliveryStatus(deliveryId, "entregue", {
    entregadorId,
    observacao: "Entrega confirmada com código",
    responseRole: "entregador",
  });
  return {
    entrega: finalDelivery,
    aguardando_confirmacao_farmacia: false,
  };
}

/**
 * Cliente avalia a entrega.
 */
async function rateDeliveryByClient(
  deliveryId,
  clienteId,
  { nota, comentario },
) {
  const delivery = await findDeliveryOrThrow({ _id: deliveryId });

  if (String(delivery.id_cliente) !== String(clienteId)) {
    throw createError("Entrega não encontrada", 404);
  }
  if (delivery.status !== "entregue") {
    throw createError("Só é possível avaliar entregas finalizadas", 400);
  }
  if (delivery.avaliacao_cliente?.avaliado_em) {
    throw createError("Entrega já avaliada", 400);
  }

  const notaNum = Number(nota);
  if (!Number.isFinite(notaNum) || notaNum < 1 || notaNum > 5) {
    throw createError("Nota deve ser entre 1 e 5", 400);
  }

  delivery.avaliacao_cliente = {
    nota: notaNum,
    comentario,
    avaliado_em: new Date(),
  };
  await delivery.save();

  // Atualizar média do entregador (garante subdocumento — antes pulava se dados_entregador não existisse)
  if (delivery.id_entregador) {
    const entregador = await User.findById(delivery.id_entregador);
    if (entregador) {
      if (!entregador.dados_entregador) {
        entregador.dados_entregador = {};
      }
      const totalAval = (entregador.dados_entregador.total_avaliacoes || 0) + 1;
      const mediaAnterior = entregador.dados_entregador.avaliacao || 0;
      const novaMedia = (mediaAnterior * (totalAval - 1) + notaNum) / totalAval;

      entregador.dados_entregador.avaliacao = Math.round(novaMedia * 100) / 100;
      entregador.dados_entregador.total_avaliacoes = totalAval;
      entregador.markModified("dados_entregador");
      await entregador.save();
    }
  }

  return delivery;
}

/**
 * Entregador avalia o cliente.
 */
async function rateDeliveryByDriver(
  deliveryId,
  entregadorId,
  { nota, comentario },
) {
  const delivery = await findDeliveryOrThrow({ _id: deliveryId });

  if (String(delivery.id_entregador) !== String(entregadorId)) {
    throw createError("Entrega não encontrada", 404);
  }
  if (delivery.status !== "entregue") {
    throw createError("Só é possível avaliar entregas finalizadas", 400);
  }
  if (delivery.avaliacao_entregador?.avaliado_em) {
    throw createError("Você já avaliou esta entrega", 400);
  }

  const notaNum = Number(nota);
  if (!Number.isFinite(notaNum) || notaNum < 1 || notaNum > 5) {
    throw createError("Nota deve ser entre 1 e 5", 400);
  }

  delivery.avaliacao_entregador = {
    nota: notaNum,
    comentario,
    avaliado_em: new Date(),
  };
  await delivery.save();

  return stripConfirmationCodeForEntregador(delivery);
}

/**
 * Cancelar entrega (farmácia, entregador ou admin).
 */
async function cancelDelivery(deliveryId, { userId, userRole, motivo }) {
  const delivery = await findDeliveryOrThrow({ _id: deliveryId });

  if (delivery.status === "entregue" || delivery.status === "cancelada") {
    throw createError("Entrega não pode ser cancelada neste status", 400);
  }

  if (
    userRole === "entregador" &&
    String(delivery.id_entregador) !== String(userId)
  ) {
    throw createError("Você não é o entregador desta entrega", 403);
  }

  return updateDeliveryStatus(deliveryId, "cancelada", {
    entregadorId: userRole === "entregador" ? userId : undefined,
    observacao: motivo || "Cancelada",
    responseRole: userRole,
  });
}

async function setDriverAvailability(entregadorId, disponivel) {
  const driver = await User.findById(entregadorId);
  if (!driver || driver.tipo_usuario !== "entregador") {
    throw createError("Entregador não encontrado", 404);
  }

  if (!driver.dados_entregador) driver.dados_entregador = {};
  driver.dados_entregador.disponivel = Boolean(disponivel);
  await driver.save();

  return {
    disponivel: driver.dados_entregador.disponivel,
    dados_entregador: driver.dados_entregador,
  };
}

function getDriverEarningsRange(periodo = "hoje") {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (periodo === "hoje") {
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (periodo === "semana") {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  if (periodo === "mes") {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
  }
  if (periodo === "ano") {
    return { start: new Date(now.getFullYear(), 0, 1), end };
  }
  return null;
}

async function getDriverEarnings(entregadorId, { periodo = "hoje" } = {}) {
  const match = {
    id_entregador: new mongoose.Types.ObjectId(entregadorId),
    status: "entregue",
  };
  const range = getDriverEarningsRange(periodo);
  if (range) {
    match.entregue_em = { $gte: range.start, $lte: range.end };
  }

  const stats = await Delivery.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total_entregas: { $sum: 1 },
        total_ganho: { $sum: { $ifNull: ["$valor_entrega", 0] } },
      },
    },
  ]);

  return {
    periodo,
    inicio: range?.start || null,
    fim: range?.end || null,
    total_entregas: stats[0]?.total_entregas || 0,
    total_ganho: Number((stats[0]?.total_ganho || 0).toFixed(2)),
  };
}

async function getDriverHistory(entregadorId, { page = 1, limit = 10 } = {}) {
  return getMyDeliveries(entregadorId, { page, limit });
}

async function collectAtPharmacy(deliveryId, entregadorId) {
  const delivery = await findDeliveryOrThrow({ _id: deliveryId });
  if (String(delivery.id_entregador) !== String(entregadorId)) {
    throw createError("Você não é o entregador desta entrega", 403);
  }

  if (delivery.status === "aceita") {
    await updateDeliveryStatus(deliveryId, "coletando", {
      entregadorId,
      observacao: "Entregador chegou na farmácia",
    });
  }

  return updateDeliveryStatus(deliveryId, "coletada", {
    entregadorId,
    observacao: "Coleta confirmada na farmácia",
  });
}

/**
 * Atualiza endereco_coleta das entregas ainda na farmácia após mudança de endereço/GPS da loja.
 */
async function syncPickupAddressFromPharmacy(pharmacyId) {
  const pid = pharmacyId?._id || pharmacyId;
  if (!pid) return { modifiedCount: 0 };

  const pharmacy = await Pharmacy.findById(pid).select(
    "logradouro numero complemento bairro cidade estado cep location",
  );
  if (!pharmacy) return { modifiedCount: 0 };

  const endereco_coleta = {
    logradouro: pharmacy.logradouro || "",
    numero: pharmacy.numero || "",
    complemento: pharmacy.complemento || "",
    bairro: pharmacy.bairro || "",
    cidade: pharmacy.cidade || "",
    estado: pharmacy.estado || "",
    cep: pharmacy.cep || "",
  };
  if (pharmacy.location?.coordinates?.length === 2) {
    endereco_coleta.location = {
      type: "Point",
      coordinates: pharmacy.location.coordinates,
    };
  }

  const result = await Delivery.updateMany(
    {
      id_farmacia: pid,
      status: { $in: ["disponivel", "aceita", "coletando"] },
    },
    { $set: { endereco_coleta } },
  );

  return { modifiedCount: result.modifiedCount };
}

module.exports = {
  createDelivery,
  ensureDispatchDeliveryForOrder,
  getAvailableDeliveries,
  getMyDeliveries,
  getDriverHistory,
  getDeliveryById,
  acceptDelivery,
  updateDeliveryStatus,
  updateLocation,
  confirmDelivery,
  rateDeliveryByClient,
  rateDeliveryByDriver,
  cancelDelivery,
  setDriverAvailability,
  getDriverEarnings,
  collectAtPharmacy,
  confirmReceiptAtCustomer,
  syncPickupAddressFromPharmacy,
};
