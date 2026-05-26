const crypto = require("crypto");
const { MercadoPagoConfig, Payment, Preference } = require("mercadopago");

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: { timeout: 5000 },
});

void Preference;

function getPayerNameParts(usuario) {
  const nomeCompleto = String(usuario?.nome || "Usuario").trim();
  const partes = nomeCompleto.split(/\s+/).filter(Boolean);

  return {
    first_name: partes[0] || "Usuario",
    last_name: partes.slice(1).join(" ") || "Usuario",
  };
}

function createPaymentInstance() {
  return new Payment(client);
}

async function createPixPayment({ pedido, usuario, valor }) {
  const payment = createPaymentInstance();
  const expirationDate = new Date(Date.now() + 30 * 60 * 1000);
  const { first_name, last_name } = getPayerNameParts(usuario);

  const response = await payment.create({
    body: {
      transaction_amount: valor,
      description: "Saúde Na Mão - Pedido #" + pedido._id,
      payment_method_id: "pix",
      payer: {
        email: usuario.email,
        first_name,
        last_name,
      },
      date_of_expiration: expirationDate.toISOString(),
    },
  });

  return {
    gateway_payment_id: response.id.toString(),
    gateway_status: response.status,
    pix_qr_code:
      response.point_of_interaction?.transaction_data?.qr_code || null,
    pix_qr_code_base64:
      response.point_of_interaction?.transaction_data?.qr_code_base64 || null,
    pix_expiracao: expirationDate,
  };
}

async function createBoletoPayment({ pedido, usuario, valor, cpf }) {
  const payment = createPaymentInstance();
  const { first_name, last_name } = getPayerNameParts(usuario);

  const response = await payment.create({
    body: {
      transaction_amount: valor,
      description: "Saúde Na Mão - Pedido #" + pedido._id,
      payment_method_id: "bolbradesco",
      payer: {
        email: usuario.email,
        first_name,
        last_name,
        identification: {
          type: "CPF",
          number: cpf,
        },
      },
    },
  });

  return {
    gateway_payment_id: response.id.toString(),
    gateway_status: response.status,
    boleto_url: response.transaction_details?.external_resource_url || null,
    boleto_codigo: response.barcode?.content || null,
    boleto_vencimento: response.date_of_expiration
      ? new Date(response.date_of_expiration)
      : null,
  };
}

async function createCardPayment({
  pedido,
  usuario,
  valor,
  token,
  installments = 1,
  cpf,
}) {
  const payment = createPaymentInstance();

  const response = await payment.create({
    body: {
      transaction_amount: valor,
      token,
      description: "Saúde Na Mão - Pedido #" + pedido._id,
      installments,
      payment_method_id: "visa",
      payer: {
        email: usuario.email,
        identification: {
          type: "CPF",
          number: cpf,
        },
      },
    },
  });

  return {
    gateway_payment_id: response.id.toString(),
    gateway_status: response.status,
    cartao_ultimos_digitos: response.card?.last_four_digits || null,
    cartao_bandeira: response.payment_method_id || null,
  };
}

async function getPaymentStatus(gatewayPaymentId) {
  const payment = createPaymentInstance();
  const response = await payment.get({ id: gatewayPaymentId });

  return {
    gateway_status: response.status,
    gateway_payment_id: response.id.toString(),
  };
}

async function refundPayment(gatewayPaymentId) {
  const payment = createPaymentInstance();
  await payment.refund({ id: gatewayPaymentId });

  return { success: true };
}

function parseSignatureHeader(signatureHeader) {
  return String(signatureHeader || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((accumulator, part) => {
      const [key, value] = part.split("=");
      if (key && value) {
        accumulator[key] = value;
      }
      return accumulator;
    }, {});
}

function verifyWebhookSignature(req) {
  const signatureHeader = req.headers["x-signature"];
  const requestId = req.headers["x-request-id"];
  const secret = process.env.MP_WEBHOOK_SECRET;

  if (!signatureHeader || !requestId || !secret) {
    return false;
  }

  const parsedSignature = parseSignatureHeader(signatureHeader);
  const timestamp = parsedSignature.ts;
  const receivedHash = parsedSignature.v1;

  if (!timestamp || !receivedHash) {
    return false;
  }

  const dataId =
    req.body?.data?.id ||
    req.body?.id ||
    req.query?.["data.id"] ||
    req.query?.id ||
    "";

  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const expectedHash = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  return expectedHash === receivedHash;
}

module.exports = {
  createPixPayment,
  createBoletoPayment,
  createCardPayment,
  getPaymentStatus,
  refundPayment,
  verifyWebhookSignature,
};
