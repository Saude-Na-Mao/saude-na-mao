const Pharmacist = require("../models/Pharmacist");
const Pharmacy = require("../models/Pharmacy");
const User = require("../models/User");
const Logger = require("../utils/logger");

const logger = new Logger("PharmacistController");

function getOwnerPharmacyId(user = {}) {
  return (
    user?.dados_dono_farmacia?.id_farmacia ||
    user?.dados_farmaceutico?.id_farmacia ||
    user?.id_farmacia ||
    null
  );
}

/**
 * Localiza o registro de Pharmacist do usuário logado. Se o usuário é
 * farmacêutico e ainda não tem o registro (contas criadas só como User),
 * cria/vincula automaticamente a partir dos dados do cadastro, evitando o
 * 404 silencioso que travava o botão "ficar online".
 */
async function resolvePharmacistForUser(reqUser) {
  const userId = reqUser?._id || reqUser?.id;
  if (!userId) return null;

  let pharmacist = await Pharmacist.findOne({ id_usuario: userId, ativo: true });
  if (pharmacist) return pharmacist;

  const user = await User.findById(userId);
  if (!user) return null;
  const tipo = user.tipo_usuario || user.role;
  if (tipo !== "farmaceutico") return null;

  // Vincula um registro existente pelo e-mail (criado por seed sem id_usuario).
  if (user.email) {
    pharmacist = await Pharmacist.findOne({ email: user.email.toLowerCase() });
    if (pharmacist) {
      if (!pharmacist.id_usuario) pharmacist.id_usuario = user._id;
      pharmacist.ativo = true;
      await pharmacist.save();
      return pharmacist;
    }
  }

  // Cria o registro a partir do cadastro do farmacêutico.
  const idFarmacia = user?.dados_farmaceutico?.id_farmacia;
  if (!idFarmacia) return null;

  const baseDoc = {
    id_usuario: user._id,
    nome: user.nome,
    email: (user.email || "").toLowerCase(),
    telefone: user.telefone,
    id_farmacia: idFarmacia,
    foto: user.foto_perfil || null,
    ativo: true,
    disponivel_chat: true,
    logado: false,
  };
  const crfCadastro =
    user?.dados_farmaceutico?.crf && String(user.dados_farmaceutico.crf).trim();
  // CRM sempre único por usuário evita colisão (índice unique) com docs de seed.
  const crmUnico = `CRF-${String(user._id).toUpperCase()}`;

  try {
    pharmacist = await Pharmacist.create({
      ...baseDoc,
      crm: crfCadastro || crmUnico,
    });
  } catch (err) {
    // CRM já em uso por outro registro: tenta de novo com CRM único do usuário.
    if (err?.code === 11000) {
      pharmacist = await Pharmacist.create({ ...baseDoc, crm: crmUnico });
    } else {
      throw err;
    }
  }
  return pharmacist;
}

exports.listAvailable = async (req, res, next) => {
  try {
    const { id_farmacia, especialidade } = req.query;
    
    const filter = {
      disponivel_chat: true,
      logado: true,
      ativo: true,
    };

    if (id_farmacia) {
      filter.id_farmacia = id_farmacia;
    }

    if (especialidade) {
      filter.especialidades = especialidade;
    }

    const pharmacists = await Pharmacist.find(filter)
      .select("nome email telefone crm especialidades foto bio rating tempo_resposta_medio horario_inicio horario_fim")
      .populate("id_farmacia", "nome cidade estado")
      .lean();

    logger.debug("Farmacêuticos disponíveis listados", { count: pharmacists.length });

    res.json({
      success: true,
      data: { pharmacists },
    });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const pharmacist = await Pharmacist.findById(id)
      .populate("id_farmacia")
      .lean();

    if (!pharmacist) {
      return res.status(404).json({
        success: false,
        message: "Farmacêutico não encontrado",
      });
    }

    logger.debug("Farmacêutico obtido", { id });

    res.json({
      success: true,
      data: { pharmacist },
    });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const {
      nome,
      email,
      telefone,
      crm,
      id_farmacia,
      especialidades,
      bio,
      dias_atendimento,
      senha,
      disponivel_chat,
    } = req.body;

    if (req.user?.tipo_usuario === "dono_farmacia") {
      const ownerPharmacyId = getOwnerPharmacyId(req.user);
      if (!ownerPharmacyId || String(ownerPharmacyId) !== String(id_farmacia)) {
        return res.status(403).json({
          success: false,
          message: "Sem permissão para cadastrar farmacêutico nesta farmácia",
        });
      }
    }

    const pharmacy = await Pharmacy.findById(id_farmacia);
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: "Farmácia não encontrada",
      });
    }

    const emailNorm = String(email).toLowerCase().trim();

    if (await User.findOne({ email: emailNorm })) {
      return res.status(409).json({
        success: false,
        message: "E-mail já cadastrado",
      });
    }

    if (await Pharmacist.findOne({ email: emailNorm })) {
      return res.status(409).json({
        success: false,
        message: "E-mail já utilizado por outro farmacêutico",
      });
    }

    const existing = await Pharmacist.findOne({ crm, id_farmacia });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "CRM já cadastrado nesta farmácia",
      });
    }

    let novoUsuario = null;
    try {
      novoUsuario = await User.create({
        nome: String(nome).trim(),
        email: emailNorm,
        telefone: telefone ? String(telefone).trim() : undefined,
        senha,
        tipo_usuario: "farmaceutico",
        dados_farmaceutico: {
          id_farmacia,
          crf: String(crm).trim(),
          crf_verificado: false,
        },
      });

      const pharmacist = new Pharmacist({
        id_usuario: novoUsuario._id,
        nome: String(nome).trim(),
        email: emailNorm,
        telefone: telefone ? String(telefone).trim() : undefined,
        crm: String(crm).trim(),
        id_farmacia,
        especialidades: especialidades || [],
        bio,
        dias_atendimento:
          dias_atendimento || ["segunda", "terca", "quarta", "quinta", "sexta"],
        disponivel_chat: disponivel_chat !== false,
      });

      await pharmacist.save();

      logger.info("Farmacêutico criado", {
        id: pharmacist._id,
        crm,
        id_usuario: String(novoUsuario._id),
      });

      res.status(201).json({
        success: true,
        message: "Farmacêutico cadastrado com sucesso",
        data: { pharmacist },
      });
    } catch (inner) {
      if (novoUsuario?._id) {
        await User.findByIdAndDelete(novoUsuario._id).catch(() => {});
      }
      throw inner;
    }
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      nome,
      email,
      telefone,
      bio,
      especialidades,
      disponivel_chat,
      horario_inicio,
      horario_fim,
      dias_atendimento,
    } = req.body;

    const pharmacist = await Pharmacist.findById(id);
    if (req.user?.tipo_usuario === "dono_farmacia") {
      const ownerPharmacyId = getOwnerPharmacyId(req.user);
      if (
        !ownerPharmacyId ||
        String(ownerPharmacyId) !== String(pharmacist.id_farmacia)
      ) {
        return res.status(403).json({
          success: false,
          message: "Sem permissão para editar este farmacêutico",
        });
      }
    }

    if (!pharmacist) {
      return res.status(404).json({
        success: false,
        message: "Farmacêutico não encontrado",
      });
    }

    if (nome) pharmacist.nome = nome;
    if (email) pharmacist.email = email;
    if (telefone) pharmacist.telefone = telefone;
    if (bio) pharmacist.bio = bio;
    if (especialidades) pharmacist.especialidades = especialidades;
    if (disponivel_chat !== undefined) pharmacist.disponivel_chat = disponivel_chat;
    if (horario_inicio) pharmacist.horario_inicio = horario_inicio;
    if (horario_fim) pharmacist.horario_fim = horario_fim;
    if (dias_atendimento) pharmacist.dias_atendimento = dias_atendimento;

    pharmacist.data_atualizacao = new Date();

    await pharmacist.save();

    logger.info("Farmacêutico atualizado", { id });

    res.json({
      success: true,
      message: "Farmacêutico atualizado com sucesso",
      data: { pharmacist },
    });
  } catch (error) {
    next(error);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const pharmacist = await Pharmacist.findById(id);

    if (!pharmacist) {
      return res.status(404).json({
        success: false,
        message: "Farmacêutico não encontrado",
      });
    }

    if (req.user?.tipo_usuario === "dono_farmacia") {
      const ownerPharmacyId = getOwnerPharmacyId(req.user);
      if (
        !ownerPharmacyId ||
        String(ownerPharmacyId) !== String(pharmacist.id_farmacia)
      ) {
        return res.status(403).json({
          success: false,
          message: "Sem permissão para desativar este farmacêutico",
        });
      }
    }

    pharmacist.ativo = false;
    await pharmacist.save();

    logger.info("Farmacêutico desativado", { id });

    res.json({
      success: true,
      message: "Farmacêutico desativado com sucesso",
    });
  } catch (error) {
    next(error);
  }
};

exports.getByPharmacy = async (req, res, next) => {
  try {
    const { id_farmacia } = req.params;

    const pharmacists = await Pharmacist.find({
      id_farmacia,
      ativo: true,
    })
      .select("nome email crm especialidades foto rating tempo_resposta_medio")
      .lean();

    logger.debug("Farmacêuticos da farmácia listados", { id_farmacia, count: pharmacists.length });

    res.json({
      success: true,
      data: { pharmacists },
    });
  } catch (error) {
    next(error);
  }
};

exports.setPresence = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Usuário não autenticado",
      });
    }

    const online =
      req.body?.online !== undefined
        ? Boolean(req.body.online)
        : req.body?.disponivel_chat !== undefined
          ? Boolean(req.body.disponivel_chat)
          : null;

    if (online === null) {
      return res.status(400).json({
        success: false,
        message: "Informe online (boolean)",
      });
    }

    const pharmacist = await resolvePharmacistForUser(req.user);

    if (!pharmacist) {
      return res.status(404).json({
        success: false,
        message: "Farmacêutico não vinculado a uma farmácia",
      });
    }

    if (online) {
      pharmacist.logado = true;
      pharmacist.disponivel_chat = true;
      pharmacist.status_motivo = "online";
    } else {
      pharmacist.logado = false;
      pharmacist.disponivel_chat = false;
      pharmacist.status_motivo = "pausa";
    }
    pharmacist.ultima_atividade = new Date();
    pharmacist.data_atualizacao = new Date();
    await pharmacist.save();

    return res.json({
      success: true,
      message: online
        ? "Você está disponível para atendimento"
        : "Você ficou indisponível para atendimento",
      data: {
        pharmacist,
        isOnline: Boolean(pharmacist.logado && pharmacist.disponivel_chat),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Usuário não autenticado",
      });
    }

    const resolved = await resolvePharmacistForUser(req.user);
    if (!resolved) {
      return res.status(404).json({
        success: false,
        message: "Farmacêutico não vinculado a uma farmácia",
      });
    }
    const pharmacist = await Pharmacist.findById(resolved._id)
      .populate("id_farmacia", "nome cidade estado")
      .lean();

    return res.json({
      success: true,
      data: { pharmacist },
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateRating = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating deve estar entre 1 e 5",
      });
    }

    const pharmacist = await Pharmacist.findById(id);
    if (!pharmacist) {
      return res.status(404).json({
        success: false,
        message: "Farmacêutico não encontrado",
      });
    }

    const novoTotal = pharmacist.total_avaliacoes + 1;
    const novaMedia = 
      (pharmacist.rating * pharmacist.total_avaliacoes + rating) / novoTotal;

    pharmacist.rating = Math.round(novaMedia * 10) / 10;
    pharmacist.total_avaliacoes = novoTotal;

    await pharmacist.save();

    logger.info("Rating atualizado", { id, novoRating: pharmacist.rating });

    res.json({
      success: true,
      message: "Avaliação registrada com sucesso",
      data: { pharmacist },
    });
  } catch (error) {
    next(error);
  }
};

exports.getStats = async (req, res, next) => {
  try {
    const { _id } = req.user;
    
    // Tentar encontrar pelo usuario_id ou retornar stats padrão
    const pharmacist = await Pharmacist.findOne({ 
      $or: [
        { usuario_id: _id },
        { usuario_id: _id.toString() }
      ]
    });
    
    // Se não encontrar, retornar stats padrão
    const stats = {
      validacoes_pendentes: pharmacist?.validacoes_pendentes || 0,
      alertas_ativos: pharmacist?.alertas_ativos || 0,
      receitas_validadas_hoje: pharmacist?.receitas_validadas_hoje || 0,
      atendimentos_media_resposta: pharmacist?.tempo_resposta_medio || 0,
      rating: pharmacist?.rating || 0,
      total_atendimentos: pharmacist?.total_atendimentos || 0,
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

exports.getPendingValidations = async (req, res, next) => {
  try {
    const { _id } = req.user;
    
    // Buscar pedidos que requerem validação do farmacêutico
    const Order = require("../models/Order");
    const validations = await Order.find({
      farmacia_id: req.user.farmacia_id,
      status_validacao: 'pendente',
    })
      .select("_id pedido_numero medicamentos interacoes_verificadas cliente_email")
      .populate("cliente_id", "name email")
      .sort({ criado_em: -1 })
      .limit(10);

    res.json({
      success: true,
      data: validations,
    });
  } catch (error) {
    next(error);
  }
};

exports.getAlerts = async (req, res, next) => {
  try {
    // Retornar array vazio por enquanto
    // TODO: Implementar lógica de alertas quando o modelo for definido
    res.json({
      success: true,
      data: [],
    });
  } catch (error) {
    next(error);
  }
};

exports.validatePrescription = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { aprovado, motivo } = req.body;

    const Order = require("../models/Order");
    const order = await Order.findByIdAndUpdate(
      id,
      {
        status_validacao: aprovado ? 'aprovado' : 'rejeitado',
        validacao_motivo: motivo,
        validacao_data: new Date(),
        validado_por: req.user._id,
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Pedido não encontrado",
      });
    }

    // Atualizar stats do farmacêutico
    const Pharmacist = require("../models/Pharmacist");
    await Pharmacist.findOneAndUpdate(
      { usuario_id: req.user._id },
      {
        $inc: { receitas_validadas: 1 },
        validacoes_pendentes: Math.max(0, (req.user.validacoes_pendentes || 1) - 1),
      }
    );

    logger.info("Prescrição validada", { 
      orderId: id, 
      aprovado,
      validadoPor: req.user._id 
    });

    res.json({
      success: true,
      message: aprovado ? "Prescrição aprovada" : "Prescrição rejeitada",
      data: { order },
    });
  } catch (error) {
    next(error);
  }
};
