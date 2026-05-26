const mongoose = require("mongoose");
const SupportMessage = require("../models/SupportMessage");
const User = require("../models/User");
const Pharmacist = require("../models/Pharmacist");

/** Conta demo genérica (mesma farmácia que a dedicada); não deve receber dúvidas de produto por defeito. */
const GENERIC_PRODUCT_CHAT_PHARMACIST_EMAIL = String(
  process.env.GENERIC_PRODUCT_CHAT_PHARMACIST_EMAIL || "farmaceutico@saudenamao.com",
).toLowerCase();
const { getIO } = require("../config/socket");
const { sendPushNotification } = require("./notificationService");

const STAFF_ROLES = ["farmaceutico", "admin", "farmacia", "administrador"];

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

function isEndUser(tipoUsuario) {
  return tipoUsuario === "usuario" || tipoUsuario === "cliente";
}

function ensureValidTicketId(ticketId) {
  if (!ticketId || !SupportMessage.db.base.Types.ObjectId.isValid(ticketId)) {
    throw createError("Ticket não encontrado", 404);
  }
}

function getSafeIO() {
  try {
    return getIO();
  } catch (error) {
    return null;
  }
}

function toPharmacyObjectId(id_farmacia) {
  if (id_farmacia == null) return null;
  if (id_farmacia instanceof mongoose.Types.ObjectId) return id_farmacia;
  const s = String(id_farmacia).trim();
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

/**
 * Farmacêutico para chat a partir da página do produto: prioriza quem não é a conta
 * genérica de demo (vários Pharmacist na mesma farmácia → findOne pegava o errado).
 */
async function pickPharmacistForProductChat(id_farmacia) {
  const oid = toPharmacyObjectId(id_farmacia);
  if (!oid) return null;

  const base = {
    id_farmacia: oid,
    ativo: true,
    disponivel_chat: true,
    bloqueado: { $ne: true },
  };

  let ph = await Pharmacist.findOne({
    ...base,
    email: { $ne: GENERIC_PRODUCT_CHAT_PHARMACIST_EMAIL },
  })
    .sort({ email: 1 })
    .select("_id id_usuario nome email");

  if (!ph?.id_usuario) {
    ph = await Pharmacist.findOne(base).sort({ email: 1 }).select("_id id_usuario nome email");
  }

  return ph?.id_usuario ? ph : null;
}

function markMessagesAsRead(ticket, tipoUsuario) {
  const markUserMessages = STAFF_ROLES.includes(tipoUsuario);
  const markStaffMessages = isEndUser(tipoUsuario);
  let changed = false;

  for (const mensagem of ticket.mensagens) {
    if (mensagem.lida) {
      continue;
    }

    if (markUserMessages && mensagem.tipo_remetente === "usuario") {
      mensagem.lida = true;
      changed = true;
    }

    if (markStaffMessages && mensagem.tipo_remetente !== "usuario") {
      mensagem.lida = true;
      changed = true;
    }
  }

  return changed;
}

async function findTicketOrThrow(ticketId) {
  ensureValidTicketId(ticketId);

  const ticket = await SupportMessage.findById(ticketId);

  if (!ticket) {
    throw createError("Ticket não encontrado", 404);
  }

  return ticket;
}

async function createTicket(
  userId,
  {
    assunto,
    categoria,
    mensagemInicial,
    prioridade,
    origem = "chat_geral",
    id_farmacia = null,
  } = {},
) {
  const pharmacyOid = origem === "chat_geral" ? null : toPharmacyObjectId(id_farmacia);

  const ticket = new SupportMessage({
    id_usuario: userId,
    assunto,
    categoria,
    prioridade,
    origem,
    id_farmacia: pharmacyOid,
    status: "aberta",
  });

  let routedToPharmacy = false;
  let assignedFarmaceutico = null;

  if (origem === "pagina_produto" && pharmacyOid) {
    try {
      const farmaceutico = await pickPharmacistForProductChat(pharmacyOid);
      if (farmaceutico?.id_usuario) {
        ticket.id_atendente = farmaceutico.id_usuario;
        ticket.status = "em_atendimento";
        assignedFarmaceutico = farmaceutico;
        routedToPharmacy = true;
      }
    } catch (err) {
      console.error("Falha ao rotear suporte para farmacêutico:", err.message);
    }
  }

  ticket.adicionarMensagem({
    remetenteId: userId,
    tipoRemetente: "usuario",
    texto: mensagemInicial,
  });

  const sistemaTexto =
    origem === "pagina_produto" && pharmacyOid && routedToPharmacy
      ? `Ticket #${ticket._id} criado. Um farmacêutico da farmácia responderá em breve.`
      : origem === "pagina_produto" && pharmacyOid
        ? `Ticket #${ticket._id} criado. Nossa equipe responderá em breve.`
        : `Ticket #${ticket._id} criado. Um admin responderá em breve.`;

  ticket.mensagens.push({
    id_remetente: userId,
    tipo_remetente: "sistema",
    texto: sistemaTexto,
  });

  await ticket.save();

  const io = getSafeIO();
  if (io) {
    const farmaciaRoomId = pharmacyOid ? String(pharmacyOid) : null;
    if (routedToPharmacy && farmaciaRoomId) {
      io.to(`pharmacy:${farmaciaRoomId}:support`).emit("support:new_ticket", {
        ticketId: ticket._id.toString(),
        assunto: ticket.assunto,
        categoria: ticket.categoria,
        origem,
        id_farmacia: farmaciaRoomId,
        atendente: assignedFarmaceutico?._id?.toString(),
      });
    } else {
      io.to("support:admin").emit("support:new_ticket", {
        ticketId: ticket._id.toString(),
        assunto: ticket.assunto,
        categoria: ticket.categoria,
        origem,
        id_farmacia: farmaciaRoomId,
      });
    }
  }

  return ticket;
}

async function getUserTickets(userId, { page = 1, limit = 10, status } = {}) {
  const pagination = normalizePagination(page, limit, 10);
  const filtro = { id_usuario: userId };

  if (status) {
    filtro.status = status;
  }

  const total = await SupportMessage.countDocuments(filtro);
  const tickets = await SupportMessage.find(filtro)
    .sort({ updatedAt: -1 })
    .skip((pagination.page - 1) * pagination.limit)
    .limit(pagination.limit);

  return {
    tickets,
    total,
    pagina: pagination.page,
    totalPaginas: Math.ceil(total / pagination.limit) || 1,
  };
}

async function getTicketById(ticketId, userId, tipoUsuario) {
  ensureValidTicketId(ticketId);

  const ticket = await SupportMessage.findById(ticketId)
    .populate({ path: "id_usuario", select: "nome email telefone" })
    .populate({ path: "id_atendente", select: "nome" });

  if (!ticket) {
    throw createError("Ticket não encontrado", 404);
  }

  if (
    isEndUser(tipoUsuario) &&
    String(ticket.id_usuario?._id || "") !== String(userId)
  ) {
    throw createError("Ticket não encontrado", 404);
  }

  if (markMessagesAsRead(ticket, tipoUsuario)) {
    await ticket.save();
  }

  return ticket;
}

async function sendMessage(ticketId, { remetenteId, tipoRemetente, texto }) {
  const ticket = await findTicketOrThrow(ticketId);

  if (ticket.status === "encerrada") {
    throw createError("Ticket encerrado. Abra um novo para continuar.", 400);
  }

  ticket.adicionarMensagem({ remetenteId, tipoRemetente, texto });

  if (tipoRemetente !== "usuario") {
    if (ticket.status === "aberta") {
      ticket.status = "em_atendimento";
      ticket.id_atendente = remetenteId;
    } else {
      ticket.status = "respondida";
      ticket.id_atendente = ticket.id_atendente || remetenteId;
    }
  }

  if (tipoRemetente === "usuario" && ticket.status === "respondida") {
    ticket.status = "em_atendimento";
  }

  await ticket.save();

  const enviadoEm = new Date();
  const io = getSafeIO();
  const payload = {
    ticketId: String(ticketId),
    mensagem: {
      remetenteId,
      tipoRemetente,
      texto,
      enviado_em: enviadoEm,
    },
  };

  if (io) {
    io.to("support:" + ticketId).emit("support:message", payload);

    const farmaciaRoomId = ticket.id_farmacia?._id || ticket.id_farmacia;
    if (farmaciaRoomId) {
      io.to(`pharmacy:${String(farmaciaRoomId)}:support`).emit("support:ticket_updated", {
        ticketId: String(ticketId),
        mensagem: payload.mensagem,
        status: ticket.status,
      });
    }

    if (tipoRemetente !== "usuario") {
      const ownerId = ticket.id_usuario?._id || ticket.id_usuario;
      if (ownerId) {
        io.to(`user:${ownerId}`).emit("support:message", payload);
      }
    }
  }

  if (tipoRemetente !== "usuario") {
    const usuario = await User.findById(ticket.id_usuario).select(
      "nome +fcmToken",
    );

    if (usuario?.fcmToken) {
      await sendPushNotification({
        token: usuario.fcmToken,
        userId: usuario._id,
        title: "Nova resposta no seu suporte",
        body: "O farmacêutico respondeu seu ticket: " + ticket.assunto,
        data: {
          tipo: "support_message",
          ticketId: ticket._id.toString(),
        },
      });
    }
  }

  return ticket;
}

async function resolveRequestingUserPharmacyId(requestingUser) {
  if (!requestingUser) return null;
  let pid =
    requestingUser.dados_farmaceutico?.id_farmacia ||
    requestingUser.dados_dono_farmacia?.id_farmacia ||
    requestingUser.id_farmacia;
  if (pid) return String(pid);
  const uid = requestingUser.id || requestingUser._id;
  if (!uid) return null;
  const ph = await Pharmacist.findOne({ id_usuario: uid, ativo: true }).select("id_farmacia");
  return ph?.id_farmacia ? String(ph.id_farmacia) : null;
}

/**
 * @param {string} ticketId
 * @param {{ id?: unknown, _id?: unknown, tipo_usuario?: string, dados_farmaceutico?: object, dados_dono_farmacia?: object, id_farmacia?: unknown }} requestingUser
 */
async function closeTicket(ticketId, requestingUser) {
  const ticket = await findTicketOrThrow(ticketId);
  const usuarioId = requestingUser?.id || requestingUser?._id;
  const tipoUsuario = requestingUser?.tipo_usuario;

  if (isEndUser(tipoUsuario)) {
    if (String(ticket.id_usuario) !== String(usuarioId)) {
      throw createError("Ticket não encontrado", 404);
    }
  } else if (tipoUsuario === "administrador") {
    // sem restrição extra
  } else if (tipoUsuario === "farmaceutico") {
    if (!ticket.id_farmacia) {
      throw createError("Sem permissão para encerrar este ticket", 403);
    }
    const myPharmacy = await resolveRequestingUserPharmacyId(requestingUser);
    const ticketPharmacy = String(ticket.id_farmacia);
    if (!myPharmacy || myPharmacy !== ticketPharmacy) {
      throw createError("Sem permissão para encerrar este ticket", 403);
    }
    const at = ticket.id_atendente ? String(ticket.id_atendente) : null;
    const self = String(usuarioId);
    if (at && at !== self) {
      throw createError("Apenas o farmacêutico responsável por este atendimento pode encerrá-lo", 403);
    }
  } else if (tipoUsuario === "dono_farmacia") {
    if (!ticket.id_farmacia) {
      throw createError("Sem permissão para encerrar este ticket", 403);
    }
    const myPharmacy = await resolveRequestingUserPharmacyId(requestingUser);
    const ticketPharmacy = String(ticket.id_farmacia);
    if (!myPharmacy || myPharmacy !== ticketPharmacy) {
      throw createError("Sem permissão para encerrar este ticket", 403);
    }
  } else {
    throw createError("Sem permissão para encerrar este ticket", 403);
  }

  if (ticket.status === "encerrada") {
    throw createError("Ticket já encerrado", 400);
  }

  ticket.status = "encerrada";
  ticket.encerrada_em = new Date();
  ticket.mensagens.push({
    id_remetente: usuarioId,
    tipo_remetente: "sistema",
    texto: "Ticket encerrado.",
  });

  await ticket.save();

  return ticket;
}

async function rateSupport(ticketId, userId, { nota, comentario }) {
  const ticket = await findTicketOrThrow(ticketId);

  if (String(ticket.id_usuario) !== String(userId)) {
    throw createError("Ticket não encontrado", 404);
  }

  if (ticket.status !== "encerrada") {
    throw createError("Avalie apenas após o encerramento do ticket", 400);
  }

  if (ticket.avaliado_em) {
    throw createError("Ticket já avaliado", 400);
  }

  ticket.avaliacao_atendimento = nota;
  ticket.comentario_avaliacao = comentario;
  ticket.avaliado_em = new Date();

  await ticket.save();

  return ticket;
}

async function getAllTickets({
  page = 1,
  limit = 20,
  status,
  categoria,
  prioridade,
  requestingUser = null,
} = {}) {
  const pagination = normalizePagination(page, limit, 20);
  const filtro = {};

  if (status) {
    filtro.status = status;
  }

  if (categoria) {
    filtro.categoria = categoria;
  }

  if (prioridade) {
    filtro.prioridade = prioridade;
  }

  if (requestingUser?.tipo_usuario === "farmaceutico") {
    let farmaciaId =
      requestingUser?.dados_farmaceutico?.id_farmacia || requestingUser?.id_farmacia;

    // Fallback: alguns tokens/usuários não trazem dados_farmaceutico completos.
    if (!farmaciaId && requestingUser?._id) {
      const farmacRecord = await Pharmacist.findOne({
        id_usuario: requestingUser._id,
        ativo: true,
      }).select("id_farmacia");
      farmaciaId = farmacRecord?.id_farmacia || null;
    }

    if (farmaciaId) {
      filtro.id_farmacia = farmaciaId;
    }

    // Farmacêutico vê chats da própria farmácia, incluindo não atribuídos e atribuídos a si.
    filtro.$or = [
      { id_atendente: null },
      { id_atendente: requestingUser._id },
    ];
  }

  if (requestingUser?.tipo_usuario === "dono_farmacia") {
    const farmaciaId =
      requestingUser?.dados_dono_farmacia?.id_farmacia || requestingUser?.id_farmacia;
    if (farmaciaId) {
      filtro.id_farmacia = farmaciaId;
    }
  }

  const total = await SupportMessage.countDocuments(filtro);
  const tickets = await SupportMessage.aggregate([
    { $match: filtro },
    {
      $addFields: {
        prioridade_ordem: {
          $switch: {
            branches: [
              { case: { $eq: ["$prioridade", "urgente"] }, then: 0 },
              { case: { $eq: ["$prioridade", "alta"] }, then: 1 },
              { case: { $eq: ["$prioridade", "normal"] }, then: 2 },
              { case: { $eq: ["$prioridade", "baixa"] }, then: 3 },
            ],
            default: 4,
          },
        },
      },
    },
    { $sort: { prioridade_ordem: 1, updatedAt: -1 } },
    { $skip: (pagination.page - 1) * pagination.limit },
    { $limit: pagination.limit },
    {
      $lookup: {
        from: "users",
        localField: "id_usuario",
        foreignField: "_id",
        as: "id_usuario",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "id_atendente",
        foreignField: "_id",
        as: "id_atendente",
      },
    },
    {
      $unwind: {
        path: "$id_usuario",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $unwind: {
        path: "$id_atendente",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 1,
        id_farmacia: 1,
        "id_usuario.nome": 1,
        "id_usuario.telefone": 1,
        "id_usuario.email": 1,
        "id_atendente.nome": 1,
        assunto: 1,
        categoria: 1,
        status: 1,
        prioridade: 1,
        mensagens: 1,
        avaliacao_atendimento: 1,
        comentario_avaliacao: 1,
        avaliado_em: 1,
        aberta_em: 1,
        encerrada_em: 1,
        primeira_resposta_em: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ]);

  return {
    tickets,
    total,
    pagina: pagination.page,
    totalPaginas: Math.ceil(total / pagination.limit) || 1,
  };
}

async function assignTicket(ticketId, atendenteId) {
  const ticket = await findTicketOrThrow(ticketId);
  const atendente = await User.findById(atendenteId).select("nome");

  if (!atendente) {
    throw createError("Atendente não encontrado", 404);
  }

  ticket.id_atendente = atendenteId;
  if (ticket.status === "aberta") {
    ticket.status = "em_atendimento";
  }

  await ticket.save();

  return ticket;
}

async function getUnreadCount(userId, tipoUsuario) {
  if (isEndUser(tipoUsuario)) {
    const resultado = await SupportMessage.aggregate([
      { $match: { id_usuario: userId } },
      { $unwind: "$mensagens" },
      {
        $match: {
          "mensagens.lida": false,
          "mensagens.tipo_remetente": { $ne: "usuario" },
        },
      },
      { $count: "nao_lidas" },
    ]);

    return { nao_lidas: resultado[0]?.nao_lidas || 0 };
  }

  const naoLidas = await SupportMessage.countDocuments({
    status: "aberta",
    id_atendente: null,
  });

  return { nao_lidas: naoLidas };
}

module.exports = {
  createTicket,
  getUserTickets,
  getTicketById,
  sendMessage,
  closeTicket,
  rateSupport,
  getAllTickets,
  assignTicket,
  getUnreadCount,
};
