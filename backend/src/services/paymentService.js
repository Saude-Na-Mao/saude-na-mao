const Payment = require("../models/Payment");
const Order = require("../models/Order");
const User = require("../models/User");
const mpService = require("./mercadoPagoService");
const { sendOrderStatusNotification } = require("./notificationService");
const {
  notifyAvailableDriversIfEligible,
  assignPickupCodeIfNeeded,
  notifyPharmacyPedidoPendenteSocket,
} = require("./orderService");
const { isOrderEligibleForDispatch } = require("../utils/deliveryEligibility");
const path = require("path");
const fs = require("fs");

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function calcularSplit(valor) {
  const valor_farmacia = parseFloat((valor * 0.9).toFixed(2));
  const valor_plataforma = parseFloat((valor * 0.07).toFixed(2));
  const valor_entregador = parseFloat((valor * 0.03).toFixed(2));

  return {
    valor_farmacia,
    valor_plataforma,
    valor_entregador,
    split: [
      { destinatario: "farmacia", valor: valor_farmacia, percentual: 90 },
      {
        destinatario: "plataforma",
        valor: valor_plataforma,
        percentual: 7,
      },
      {
        destinatario: "entregador",
        valor: valor_entregador,
        percentual: 3,
      },
    ],
  };
}

function resolveGateway(gateway) {
  return gateway === "mercadopago"
    ? gateway
    : process.env.PAYMENT_GATEWAY === "mercadopago"
      ? process.env.PAYMENT_GATEWAY
      : "mercadopago";
}

function resetPaymentGatewayFields(payment) {
  payment.gateway_payment_id = undefined;
  payment.gateway_status = undefined;
  payment.pix_qr_code = undefined;
  payment.pix_qr_code_base64 = undefined;
  payment.pix_expiracao = undefined;
  payment.boleto_url = undefined;
  payment.boleto_codigo = undefined;
  payment.boleto_vencimento = undefined;
  payment.cartao_ultimos_digitos = undefined;
  payment.cartao_bandeira = undefined;
  payment.comprovante_url = payment.comprovante_url || undefined;
  payment.motivo_falha = undefined;
}

async function getOrderOrThrow(orderId, userId) {
  const pedido = await Order.findOne({ _id: orderId, id_usuario: userId });

  if (!pedido) {
    throw createError("Pedido não encontrado", 404);
  }

  return pedido;
}

async function getUserOrThrow(userId) {
  const usuario = await User.findById(userId).select(
    "nome email cpf +fcmToken",
  );

  if (!usuario) {
    throw createError("Usuário não encontrado", 404);
  }

  return usuario;
}

function getGatewayStatusFromMercadoPago(body) {
  return body?.status || body?.data?.status || body?.action || null;
}

function mapGatewayStatus(gateway, gatewayStatus) {
  const normalizedGateway = resolveGateway(gateway);
  const normalizedStatus = String(gatewayStatus || "").toLowerCase();

  if (normalizedGateway === "mercadopago") {
    if (normalizedStatus === "approved") {
      return "aprovado";
    }

    if (
      ["rejected", "cancelled", "cancelled_by_user"].includes(normalizedStatus)
    ) {
      return "falhou";
    }

    if (normalizedStatus === "refunded") {
      return "estornado";
    }

    if (["pending", "in_process", "in_mediation"].includes(normalizedStatus)) {
      return "processando";
    }
  }

  return null;
}

async function callMercadoPagoService({
  formaPagamento,
  pedido,
  usuario,
  valor,
  dadosCartao,
}) {
  if (formaPagamento === "pix") {
    return mpService.createPixPayment({ pedido, usuario, valor });
  }

  if (formaPagamento === "boleto") {
    return mpService.createBoletoPayment({
      pedido,
      usuario,
      valor,
      cpf: usuario.cpf,
    });
  }

  if (
    formaPagamento === "cartao_credito" ||
    formaPagamento === "cartao_debito"
  ) {
    if (!dadosCartao?.token) {
      throw createError("Token do cartão é obrigatório", 400);
    }

    return mpService.createCardPayment({
      pedido,
      usuario,
      valor,
      token: dadosCartao.token,
      installments: dadosCartao.installments || 1,
      cpf: usuario.cpf,
    });
  }

  throw createError("Forma de pagamento inválida", 400);
}

async function gerarComprovante(payment, pedido) {
  const comprovantesDir = path.join(__dirname, "../../uploads/comprovantes");
  fs.mkdirSync(comprovantesDir, { recursive: true });

  const fileName = `comprovante-${pedido._id}.txt`;
  const filePath = path.join(comprovantesDir, fileName);
  const content = [
    "=== COMPROVANTE DE PAGAMENTO - SAUDE NA MAO ===",
    `Pedido: ${pedido._id}`,
    `Data: ${new Date().toLocaleString("pt-BR")}`,
    `Forma de pagamento: ${payment.forma_pagamento}`,
    `Valor total: R$ ${payment.valor.toFixed(2)}`,
    "Status: APROVADO",
    `ID da transação: ${payment.gateway_payment_id}`,
    "================================================",
  ].join("\n");

  fs.writeFileSync(filePath, content, "utf8");
  payment.comprovante_url = `/uploads/comprovantes/${fileName}`;
  await payment.save();

  return payment;
}

async function initiatePayment({
  orderId,
  userId,
  formaPagamento,
  gateway,
  dadosCartao,
}) {
  const pedido = await getOrderOrThrow(orderId, userId);

  if (pedido.status_pagamento !== "pendente") {
    throw createError("Este pedido já foi pago ou está sendo processado", 400);
  }

  const usuario = await getUserOrThrow(userId);
  const gatewaySelecionado = resolveGateway(gateway);
  let pagamento = await Payment.findOne({ id_pedido: pedido._id });

  if (pagamento) {
    if (pagamento.status === "aprovado") {
      throw createError("Pedido já pago", 400);
    }

    if (pagamento.tentativas >= 3) {
      throw createError(
        "Muitas tentativas. Entre em contato com o suporte",
        400,
      );
    }

    pagamento.tentativas += 1;
  } else {
    pagamento = new Payment({
      id_pedido: pedido._id,
      id_usuario: userId,
      tentativas: 1,
    });
  }

  const splitData = calcularSplit(pedido.total);

  pagamento.gateway = gatewaySelecionado;
  pagamento.forma_pagamento = formaPagamento;
  pagamento.valor = pedido.total;
  pagamento.valor_farmacia = splitData.valor_farmacia;
  pagamento.valor_plataforma = splitData.valor_plataforma;
  pagamento.valor_entregador = splitData.valor_entregador;
  pagamento.split = splitData.split;
  pagamento.status = "processando";
  resetPaymentGatewayFields(pagamento);

  try {
    const gatewayData = await callMercadoPagoService({
      formaPagamento,
      pedido,
      usuario,
      valor: pedido.total,
      dadosCartao,
    });

    Object.assign(pagamento, gatewayData);
    pedido.status_pagamento = "processando";

    await pagamento.save();
    await pedido.save();

    return { pedido, pagamento };
  } catch (error) {
    pagamento.status = "falhou";
    pagamento.motivo_falha = error.message;
    pedido.status_pagamento = "falhou";

    await pagamento.save();
    await pedido.save();

    throw error;
  }
}

async function processPaymentStatus(paymentId, novoStatus) {
  const payment = await Payment.findById(paymentId).populate("id_pedido");

  if (!payment) {
    throw createError("Pagamento não encontrado", 404);
  }

  const pedido = payment.id_pedido;

  const statusUnchanged = payment.status === novoStatus;
  const orderNeedsApprovalSync =
    novoStatus === "aprovado" &&
    pedido &&
    (pedido.status_pagamento !== "aprovado" ||
      (Boolean(pedido.aprovado_farmaceutico) && pedido.status === "aguardando_pagamento"));

  if (statusUnchanged && !(novoStatus === "aprovado" && orderNeedsApprovalSync)) {
    return payment;
  }

  if (!statusUnchanged) {
    payment.status = novoStatus;
  }

  if (novoStatus === "aprovado") {
    payment.pago_em = new Date();
    pedido.status_pagamento = "aprovado";
    const requerFarmaceutico = (pedido.itens || []).some(
      (item) => item.controlado || item.receita_obrigatoria || item.id_receita,
    );
    if (pedido.aprovado_farmaceutico && pedido.status === "aguardando_pagamento") {
      pedido.adicionarHistoricoStatus(
        "em_processamento",
        "Pagamento aprovado e pedido já validado pelo farmacêutico — entrega disponível para entregadores; confirmado após o entregador aceitar",
      );
    } else if (
      pedido.status === "aguardando_pagamento" &&
      !requerFarmaceutico
    ) {
      // Fluxo 1 (venda livre): nada a validar pelo farmacêutico — segue para preparação
      pedido.aprovado_farmaceutico = true;
      pedido.adicionarHistoricoStatus(
        "em_processamento",
        "Pagamento aprovado — pedido em preparação para entrega",
      );
    } else {
      pedido.historico_status.push({
        status: pedido.status,
        observacao: "Pagamento aprovado",
      });
    }
    assignPickupCodeIfNeeded(pedido);
    await payment.save();
    await gerarComprovante(payment, pedido);

    const usuario = await getUserOrThrow(payment.id_usuario);
    await sendOrderStatusNotification(
      usuario,
      pedido,
      pedido.status === "em_processamento" ? "Em processamento" : "Pagamento aprovado",
    );
    await notifyAvailableDriversIfEligible(
      pedido,
      pedido.status === "em_processamento"
        ? "payment_and_pharmacist_confirmed"
        : "payment_approved",
    );
  }

  if (novoStatus === "falhou") {
    pedido.status_pagamento = "falhou";

    const usuario = await getUserOrThrow(payment.id_usuario);
    await sendOrderStatusNotification(usuario, pedido, "Pagamento falhou");
  }

  if (novoStatus === "estornado") {
    payment.estornado_em = new Date();
    pedido.status_pagamento = "estornado";
    pedido.motivo_cancelamento = "Pagamento estornado";
    pedido.adicionarHistoricoStatus("cancelado", "Pagamento estornado");
  }

  await payment.save();
  await pedido.save();

  if (novoStatus === "aprovado") {
    notifyPharmacyPedidoPendenteSocket(pedido);
  }

  if (novoStatus === "aprovado" && isOrderEligibleForDispatch(pedido)) {
    const deliveryService = require("./deliveryService");
    await deliveryService.ensureDispatchDeliveryForOrder(pedido._id);
  }

  return payment;
}

async function confirmTestPayment(orderId, userId) {
  const pedido = await getOrderOrThrow(orderId, userId);
  if (pedido.status_pagamento === "aprovado") {
    return { pedido, pagamento: await Payment.findOne({ id_pedido: pedido._id }) };
  }

  let pagamento = await Payment.findOne({ id_pedido: pedido._id });
  if (!pagamento) {
    const splitData = calcularSplit(pedido.total);
    pagamento = new Payment({
      id_pedido: pedido._id,
      id_usuario: userId,
      gateway: "teste",
      forma_pagamento: "pix",
      valor: pedido.total,
      valor_farmacia: splitData.valor_farmacia,
      valor_plataforma: splitData.valor_plataforma,
      valor_entregador: splitData.valor_entregador,
      split: splitData.split,
      tentativas: 1,
      status: "pendente",
    });
  }

  // Não gravar como aprovado antes de processPaymentStatus — senão o early-return
  // impedia de atualizar o pedido (fluxo de teste parecia “não fazer nada”).
  pagamento.gateway = "teste";
  pagamento.gateway_status = "approved_test";
  pagamento.gateway_payment_id = pagamento.gateway_payment_id || `test_${Date.now()}`;
  if (pagamento.status === "aprovado" && pedido.status_pagamento !== "aprovado") {
    pagamento.status = "pendente";
  }
  await pagamento.save();

  await processPaymentStatus(pagamento._id, "aprovado");
  const pedidoAtualizado = await Order.findById(pedido._id);
  return { pedido: pedidoAtualizado, pagamento };
}

async function handleWebhook({ gateway, body, headers, rawBody }) {
  const gatewaySelecionado = resolveGateway(gateway);
  const signatureValid = mpService.verifyWebhookSignature({
    headers,
    body,
    rawBody,
  });

  if (!signatureValid) {
    throw createError("Webhook inválido", 401);
  }

  let gatewayPaymentId = null;
  let novoStatusGateway = null;

  if (gatewaySelecionado === "mercadopago") {
    gatewayPaymentId = body?.data?.id?.toString?.() || null;
    novoStatusGateway = getGatewayStatusFromMercadoPago(body);

    if (
      gatewayPaymentId &&
      !mapGatewayStatus(gatewaySelecionado, novoStatusGateway)
    ) {
      const currentStatus = await mpService.getPaymentStatus(gatewayPaymentId);
      novoStatusGateway = currentStatus.gateway_status;
    }
  }

  if (!gatewayPaymentId) {
    return;
  }

  const statusInterno = mapGatewayStatus(gatewaySelecionado, novoStatusGateway);
  if (!statusInterno) {
    return;
  }

  const payment = await Payment.findOne({
    gateway_payment_id: gatewayPaymentId,
  });

  if (!payment) {
    return;
  }

  payment.gateway_status = novoStatusGateway;
  await payment.save();

  await processPaymentStatus(payment._id, statusInterno);
}

async function getPaymentByOrder(orderId, userId) {
  await getOrderOrThrow(orderId, userId);

  return Payment.findOne({ id_pedido: orderId }).select("-__v");
}

async function requestRefund(orderId, userId) {
  await getOrderOrThrow(orderId, userId);

  const payment = await Payment.findOne({ id_pedido: orderId });
  if (!payment) {
    throw createError("Pagamento não encontrado", 404);
  }

  if (payment.status !== "aprovado") {
    throw createError("Pagamento não pode ser estornado", 400);
  }

  await mpService.refundPayment(payment.gateway_payment_id);

  return processPaymentStatus(payment._id, "estornado");
}

async function getSavedPaymentMethods(userId) {
  const pagamentos = await Payment.find({
    id_usuario: userId,
    status: "aprovado",
  })
    .sort({ pago_em: -1, updatedAt: -1 })
    .limit(20)
    .lean();

  const uniqueMethods = [];
  const seen = new Set();

  for (const pagamento of pagamentos) {
    if (!pagamento.cartao_bandeira || !pagamento.cartao_ultimos_digitos) {
      continue;
    }

    const key = `${pagamento.cartao_bandeira}:${pagamento.cartao_ultimos_digitos}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueMethods.push({
      forma_pagamento: pagamento.forma_pagamento,
      cartao_bandeira: pagamento.cartao_bandeira,
      cartao_ultimos_digitos: pagamento.cartao_ultimos_digitos,
    });

    if (uniqueMethods.length === 5) {
      break;
    }
  }

  return uniqueMethods;
}

module.exports = {
  initiatePayment,
  handleWebhook,
  processPaymentStatus,
  confirmTestPayment,
  getPaymentByOrder,
  requestRefund,
  getSavedPaymentMethods,
};
