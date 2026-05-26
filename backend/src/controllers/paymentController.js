const paymentService = require("../services/paymentService");

function sendSuccess(res, { statusCode = 200, message = "", data = {} }) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

async function initiatePayment(req, res, next) {
  try {
    const { orderId, formaPagamento, gateway, dadosCartao } = req.body;
    const resolvedGateway =
      gateway || process.env.PAYMENT_GATEWAY || "mercadopago";

    const { pedido, pagamento } = await paymentService.initiatePayment({
      orderId,
      userId: req.user.id,
      formaPagamento,
      gateway: resolvedGateway,
      dadosCartao,
    });

    if (formaPagamento === "pix") {
      return sendSuccess(res, {
        message: "Aguardando pagamento",
        data: {
          pedido,
          pagamento,
          qr_code: pagamento.pix_qr_code,
          qr_code_base64: pagamento.pix_qr_code_base64,
        },
      });
    }

    if (formaPagamento === "boleto") {
      return sendSuccess(res, {
        message: "Aguardando pagamento",
        data: {
          pedido,
          pagamento,
          boleto_url: pagamento.boleto_url,
          boleto_codigo: pagamento.boleto_codigo,
        },
      });
    }

    return sendSuccess(res, {
      message: "Pagamento iniciado",
      data: {
        pedido,
        pagamento,
        status: pagamento.status,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function handleMercadoPagoWebhook(req, res, next) {
  try {
    res.status(200).json({ received: true });

    paymentService
      .handleWebhook({
        gateway: "mercadopago",
        body: req.body,
        headers: req.headers,
      })
      .catch((error) => {
        console.error("Erro ao processar webhook do Mercado Pago:", error);
      });
  } catch (error) {
    return next(error);
  }
}

async function handlePagSeguroWebhook(req, res, next) {
  try {
    res.status(200).json({ received: true });

    paymentService
      .handleWebhook({
        gateway: "pagseguro",
        body: req.body,
        headers: req.headers,
      })
      .catch((error) => {
        console.error("Erro ao processar webhook de pagamento:", error);
      });
  } catch (error) {
    return next(error);
  }
}

async function getPaymentStatus(req, res, next) {
  try {
    const { orderId } = req.params;
    const pagamento = await paymentService.getPaymentByOrder(
      orderId,
      req.user.id,
    );

    return sendSuccess(res, { data: { pagamento } });
  } catch (error) {
    return next(error);
  }
}

async function requestRefund(req, res, next) {
  try {
    const { orderId } = req.params;
    const pagamento = await paymentService.requestRefund(orderId, req.user.id);

    return sendSuccess(res, {
      message: "Estorno solicitado com sucesso",
      data: { pagamento },
    });
  } catch (error) {
    return next(error);
  }
}

async function getSavedPaymentMethods(req, res, next) {
  try {
    const metodos = await paymentService.getSavedPaymentMethods(req.user.id);
    return sendSuccess(res, { data: { metodos } });
  } catch (error) {
    return next(error);
  }
}

async function confirmTestPayment(req, res, next) {
  try {
    const { orderId } = req.params;
    const { pedido, pagamento } = await paymentService.confirmTestPayment(
      orderId,
      req.user.id,
    );
    return sendSuccess(res, {
      message: "Pagamento de teste confirmado",
      data: { pedido, pagamento },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  initiatePayment,
  handleMercadoPagoWebhook,
  handlePagSeguroWebhook,
  getPaymentStatus,
  requestRefund,
  getSavedPaymentMethods,
  confirmTestPayment,
};
