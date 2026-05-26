const User = require("../models/User");

let admin = null;
let fcmEnabled = false;

function isLikelyValidFcmToken(token) {
  return (
    typeof token === "string" &&
    token.trim().length >= 64 &&
    !token.includes(" ")
  );
}

async function clearInvalidFcmToken(userId, token) {
  if (!userId || !token) {
    return;
  }

  await User.findOneAndUpdate(
    { _id: userId, fcmToken: token },
    { $set: { fcmToken: null } },
  );
}

try {
  if (process.env.FCM_ENABLED === "true") {
    admin = require("firebase-admin");
    const serviceAccount = require("../config/firebase-service-account.json");

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    fcmEnabled = true;
  }
} catch (error) {
  fcmEnabled = false;
  console.error(
    "FCM desabilitado: falha ao inicializar Firebase Admin:",
    error.message,
  );
}

async function sendPushNotification({ token, title, body, data = {}, userId }) {
  if (!fcmEnabled) {
    console.log("[FCM SIMULADO]", { token, title, body, data });
    return { simulated: true };
  }

  if (!isLikelyValidFcmToken(token)) {
    console.warn("Push notification ignorada: token FCM com formato inválido");
    await clearInvalidFcmToken(userId, token);
    return { skipped: true, reason: "invalid-token-format" };
  }

  try {
    const message = {
      notification: { title, body },
      data,
      token,
    };

    const result = await admin.messaging().send(message);
    return result;
  } catch (error) {
    if (
      error.code === "messaging/invalid-registration-token" ||
      error.code === "messaging/registration-token-not-registered"
    ) {
      console.warn(
        "Token FCM inválido/removido. Limpando token salvo do usuário.",
      );
      await clearInvalidFcmToken(userId, token);
      return { skipped: true, reason: error.code };
    }

    console.error("Erro ao enviar push notification:", error.message);
    return null;
  }
}

async function sendPrescriptionStatusNotification(
  usuario,
  prescription,
  novoStatus,
) {
  let title = "Atualização da receita";
  let body = `Status: ${novoStatus}`;

  switch (novoStatus) {
    case "Em Análise":
      title = "Receita em análise";
      body = "Sua receita está sendo verificada";
      break;
    case "Aprovada":
      title = "Receita aprovada!";
      body = "Sua receita foi aprovada. Você já pode finalizar a compra";
      break;
    case "Rejeitada":
      title = "Receita rejeitada";
      body = `Sua receita foi rejeitada: ${prescription?.observacoes || "sem observações"}`;
      break;
    case "Expirada":
      title = "Receita expirada";
      body = "Sua receita expirou. Faça upload de uma nova";
      break;
  }

  console.log("[NOTIFICACAO RECEITA]", {
    usuario: usuario?._id || usuario?.id || null,
    prescription: prescription?._id || null,
    status: novoStatus,
    title,
    body,
  });

  if (!usuario?.fcmToken) {
    return null;
  }

  return sendPushNotification({
    token: usuario.fcmToken,
    userId: usuario._id || usuario.id,
    title,
    body,
    data: {
      tipo: "prescription_status",
      prescriptionId: prescription?._id?.toString?.() || "",
      status: novoStatus || "",
    },
  });
}

async function sendOrderStatusNotification(usuario, pedido, novoStatus) {
  let title = "Atualização do pedido";
  let body = `Status do pedido: ${novoStatus}`;

  const pedidoIdStr = pedido?._id?.toString?.() || pedido?.id?.toString?.() || "";

  switch (novoStatus) {
    case "Confirmado":
      title = "Entregador a caminho";
      body =
        "Um entregador aceitou seu pedido. Abra o app para acompanhar a entrega e ver seu código de confirmação.";
      break;
    case "Em processamento":
      title = "Pedido em processamento";
      body = "Seu pedido está sendo preparado pela farmácia";
      break;
    case "A caminho":
      title = "Pedido a caminho";
      body = "Seu pedido saiu para entrega";
      break;
    case "Aguardando confirmação na farmácia":
      title = "Receita na farmácia";
      body =
        "O entregador confirmou seu código. Quando a farmácia conferir a receita devolvida, seu pedido será marcado como entregue.";
      break;
    case "Entregue":
      title = "Pedido entregue";
      body = "Seu pedido foi entregue com sucesso";
      break;
    case "Cancelado":
      title = "Pedido cancelado";
      body = "Seu pedido foi cancelado";
      break;
  }

  console.log("[NOTIFICACAO PEDIDO]", {
    usuario: usuario?._id || usuario?.id || null,
    pedido: pedido?._id || pedido?.id || null,
    status: novoStatus,
    title,
    body,
  });

  if (!usuario?.fcmToken) {
    return null;
  }

  return sendPushNotification({
    token: usuario.fcmToken,
    userId: usuario._id || usuario.id,
    title,
    body,
    data: {
      tipo: novoStatus === "Confirmado" ? "delivery_accepted" : "order_status",
      pedidoId: pedidoIdStr,
      status: novoStatus || "",
      urlPath: pedidoIdStr ? `/rastreamento/${pedidoIdStr}` : "",
    },
  });
}

module.exports = {
  sendPushNotification,
  sendPrescriptionStatusNotification,
  sendOrderStatusNotification,
  isLikelyValidFcmToken,
};
