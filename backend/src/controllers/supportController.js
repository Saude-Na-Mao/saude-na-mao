const supportService = require("../services/supportService");

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

function resolveTipoRemetente(tipoUsuario) {
  if (tipoUsuario === "cliente") {
    return "usuario";
  }

  if (tipoUsuario === "farmaceutico" || tipoUsuario === "dono_farmacia") {
    return "farmaceutico";
  }

  if (tipoUsuario === "farmacia") {
    return "farmaceutico";
  }

  if (tipoUsuario === "administrador") {
    return "admin";
  }

  return "usuario";
}

async function createTicket(req, res, next) {
  try {
    const {
      assunto,
      categoria,
      mensagemInicial,
      prioridade,
      origem,
      id_farmacia,
    } = req.body;

    if (!mensagemInicial || !String(mensagemInicial).trim()) {
      throw createError("Descreva sua dúvida ou problema", 400);
    }

    const ticket = await supportService.createTicket(req.user.id, {
      assunto,
      categoria,
      mensagemInicial,
      prioridade,
      origem,
      id_farmacia,
    });

    return sendSuccess(res, {
      statusCode: 201,
      message: "Ticket criado com sucesso",
      data: { ticket },
    });
  } catch (error) {
    return next(error);
  }
}

async function getUserTickets(req, res, next) {
  try {
    const { page, limit, status } = req.query;
    const tickets = await supportService.getUserTickets(req.user.id, {
      page,
      limit,
      status,
    });

    return sendSuccess(res, { data: tickets });
  } catch (error) {
    return next(error);
  }
}

async function getTicketById(req, res, next) {
  try {
    const { id } = req.params;
    const ticket = await supportService.getTicketById(
      id,
      req.user.id,
      req.user.tipo_usuario,
    );

    return sendSuccess(res, { data: { ticket } });
  } catch (error) {
    return next(error);
  }
}

async function sendMessage(req, res, next) {
  try {
    const { id } = req.params;
    const { texto } = req.body;

    if (!texto || !String(texto).trim()) {
      throw createError("Texto da mensagem é obrigatório", 400);
    }

    const ticket = await supportService.sendMessage(id, {
      remetenteId: req.user.id,
      tipoRemetente: resolveTipoRemetente(req.user.tipo_usuario),
      texto,
    });

    return sendSuccess(res, { data: { ticket } });
  } catch (error) {
    return next(error);
  }
}

async function closeTicket(req, res, next) {
  try {
    const { id } = req.params;
    await supportService.closeTicket(id, req.user);

    return sendSuccess(res, {
      message: "Ticket encerrado",
      data: {},
    });
  } catch (error) {
    return next(error);
  }
}

async function rateSupport(req, res, next) {
  try {
    const { id } = req.params;
    const { nota, comentario } = req.body;
    const notaNumerica = Number(nota);

    if (
      !Number.isFinite(notaNumerica) ||
      notaNumerica < 1 ||
      notaNumerica > 5
    ) {
      throw createError("Nota deve ser um número entre 1 e 5", 400);
    }

    await supportService.rateSupport(id, req.user.id, {
      nota: notaNumerica,
      comentario,
    });

    return sendSuccess(res, {
      message: "Avaliação registrada. Obrigado!",
      data: {},
    });
  } catch (error) {
    return next(error);
  }
}

async function getAllTickets(req, res, next) {
  try {
    const { page, limit, status, categoria, prioridade } = req.query;
    const tickets = await supportService.getAllTickets({
      page,
      limit,
      status,
      categoria,
      prioridade,
      requestingUser: req.user,
    });

    return sendSuccess(res, { data: tickets });
  } catch (error) {
    return next(error);
  }
}

async function assignTicket(req, res, next) {
  try {
    const { id } = req.params;
    const atendenteId = req.user.id;
    const ticket = await supportService.assignTicket(id, atendenteId);

    return sendSuccess(res, { data: { ticket } });
  } catch (error) {
    return next(error);
  }
}

async function getUnreadCount(req, res, next) {
  try {
    const { nao_lidas } = await supportService.getUnreadCount(
      req.user.id,
      req.user.tipo_usuario,
    );

    return sendSuccess(res, { data: { nao_lidas } });
  } catch (error) {
    return next(error);
  }
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
