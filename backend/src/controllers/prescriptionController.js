const prescriptionService = require("../services/prescriptionService");
const notificationService = require("../services/notificationService");
const User = require("../models/User");

async function uploadPrescription(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        data: {},
        message: "Nenhum arquivo enviado",
      });
    }

    const pharmacyId = req.body?.pharmacyId || req.body?.id_farmacia || null;
    const productId = req.body?.productId || req.body?.id_produto || null;
    const modoValidacao =
      req.body?.modo_validacao === "chat_ao_vivo"
        ? "chat_ao_vivo"
        : "assincrono";

    const paraTerceiro =
      req.body?.para_terceiro === true ||
      req.body?.para_terceiro === "true" ||
      req.body?.para_terceiro === "1";

    const receita = await prescriptionService.uploadPrescription(
      req.user.id,
      req.file,
      pharmacyId,
      modoValidacao,
      productId,
      {
        paraTerceiro,
        paciente: paraTerceiro
          ? {
              nome: req.body?.paciente_nome || "",
              cpf: req.body?.paciente_cpf || "",
              rg: req.body?.paciente_rg || "",
            }
          : null,
      },
    );

    return res.status(201).json({
      success: true,
      message:
        modoValidacao === "chat_ao_vivo"
          ? "Receita recebida. Aguardando o farmacêutico iniciar o chat."
          : "Receita recebida com sucesso. Você será notificado sobre o resultado da validação.",
      data: { receita: prescriptionService.decoratePrescription(receita) },
    });
  } catch (error) {
    return next(error);
  }
}

async function postChatMessage(req, res, next) {
  try {
    const { id } = req.params;
    const { texto } = req.body || {};

    const message = await prescriptionService.sendChatMessage(
      id,
      req.user,
      texto,
    );

    return res.status(201).json({
      success: true,
      data: message,
      message: "Mensagem enviada",
    });
  } catch (error) {
    return next(error);
  }
}

async function closeChat(req, res, next) {
  try {
    const { id } = req.params;
    const { motivo_encerramento, aprovado, observacoes, validade } =
      req.body || {};

    const receita = await prescriptionService.closeChat(id, req.user, {
      motivo_encerramento,
      aprovado,
      observacoes,
      validade,
    });

    return res.status(200).json({
      success: true,
      data: { receita },
      message: "Chat encerrado",
    });
  } catch (error) {
    return next(error);
  }
}

async function getPrescriptionForChat(req, res, next) {
  try {
    const { id } = req.params;
    const receita = await prescriptionService.getPrescriptionForChat(
      id,
      req.user,
    );

    return res.status(200).json({
      success: true,
      data: { receita },
      message: "Receita carregada para chat",
    });
  } catch (error) {
    return next(error);
  }
}

async function reuploadChatImage(req, res, next) {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({
        success: false,
        data: {},
        message: "Nenhum arquivo enviado",
      });
    }

    const receita = await prescriptionService.reuploadChatImage(
      id,
      req.user,
      req.file,
    );

    return res.status(200).json({
      success: true,
      data: { receita },
      message: "Imagem da receita atualizada no chat",
    });
  } catch (error) {
    return next(error);
  }
}

async function getUserPrescriptions(req, res, next) {
  try {
    const { page, limit, status, productId, apenas_disponiveis } = req.query;
    const resultado = await prescriptionService.getUserPrescriptions(
      req.user.id,
      { page, limit, status, productId, apenas_disponiveis },
    );

    return res.status(200).json({
      success: true,
      data: resultado,
      message: "Receitas listadas com sucesso",
    });
  } catch (error) {
    return next(error);
  }
}

async function getPrescriptionById(req, res, next) {
  try {
    const { id } = req.params;
    const receita = await prescriptionService.getPrescriptionById(
      id,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      data: { receita },
      message: "Receita carregada com sucesso",
    });
  } catch (error) {
    return next(error);
  }
}

async function validatePrescription(req, res, next) {
  try {
    const { id } = req.params;
    const { aprovado, observacoes, validade } = req.body;
    const receita = await prescriptionService.validatePrescription(
      id,
      req.user.id,
      { aprovado, observacoes, validade },
    );

    return res.status(200).json({
      success: true,
      message: aprovado ? "Receita aprovada" : "Receita rejeitada",
      data: { receita },
    });
  } catch (error) {
    return next(error);
  }
}

async function cancelPrescription(req, res, next) {
  try {
    const { id } = req.params;
    const receita = await prescriptionService.cancelPrescription(
      id,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      message: "Receita cancelada",
      data: { receita },
    });
  } catch (error) {
    return next(error);
  }
}

async function getPendingPrescriptions(req, res, next) {
  try {
    const { page, limit } = req.query;
    let pharmacyId = req.query.pharmacyId || null;

    // Farmacêutico só vê receitas da própria farmácia.
    // Fallback: se não tiver associação a uma farmácia, mostra todas (modo admin).
    const tipo = req.user?.tipo_usuario || req.user?.role;
    if (tipo === "farmaceutico") {
      const Pharmacist = require("../models/Pharmacist");
      const userId = req.user?._id || req.user?.id;
      const reg = await Pharmacist.findOne({ id_usuario: userId }).select(
        "id_farmacia",
      );
      if (reg?.id_farmacia) {
        pharmacyId = reg.id_farmacia.toString();
      } else if (req.user?.dados_farmaceutico?.id_farmacia) {
        pharmacyId = req.user.dados_farmaceutico.id_farmacia.toString();
      } else {
        // Sem farmácia associada — exibe todas as pendentes (fallback de admin)
        pharmacyId = null;
      }
    }

    const resultado = await prescriptionService.getPendingPrescriptions({
      page,
      limit,
      pharmacyId,
    });

    console.log(
      `[receitas/pending] usuario=${req.user?.email} tipo=${tipo} pharmacyId=${pharmacyId || "TODAS"} encontradas=${resultado.receitas?.length || 0}`,
    );

    return res.status(200).json({
      success: true,
      data: resultado,
      message: "Receitas pendentes listadas com sucesso",
    });
  } catch (error) {
    return next(error);
  }
}

async function getAllPrescriptions(req, res, next) {
  try {
    const { page, limit, status } = req.query;
    let pharmacyId = req.query.pharmacyId || null;

    const tipo = req.user?.tipo_usuario || req.user?.role;
    if (tipo === "farmaceutico") {
      const Pharmacist = require("../models/Pharmacist");
      const userId = req.user?._id || req.user?.id;
      const reg = await Pharmacist.findOne({ id_usuario: userId }).select(
        "id_farmacia",
      );
      if (reg?.id_farmacia) {
        pharmacyId = reg.id_farmacia.toString();
      } else if (req.user?.dados_farmaceutico?.id_farmacia) {
        pharmacyId = req.user.dados_farmaceutico.id_farmacia.toString();
      } else {
        pharmacyId = null;
      }
    } else if (tipo === "dono_farmacia") {
      const raw =
        req.user?.dados_dono_farmacia?.id_farmacia || req.user?.id_farmacia;
      if (!raw) {
        return res.status(200).json({
          success: true,
          data: {
            receitas: [],
            total: 0,
            pagina: 1,
            totalPaginas: 0,
          },
          message: "Nenhuma farmácia vinculada ao perfil",
        });
      }
      pharmacyId = String(raw);
    }

    const resultado =
      await prescriptionService.getAllPrescriptionsForPharmacist({
        page,
        limit,
        status,
        pharmacyId,
      });

    return res.status(200).json({
      success: true,
      data: resultado,
      message: "Receitas listadas com sucesso",
    });
  } catch (error) {
    return next(error);
  }
}

async function debugAllPrescriptions(req, res, next) {
  try {
    const Prescription = require("../models/Prescription");
    const todas = await Prescription.find({})
      .populate("id_usuario", "nome email")
      .populate("id_farmacia", "nome cidade")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json({
      success: true,
      data: { total: todas.length, receitas: todas },
      message: "TEMPORÁRIO — diagnóstico de receitas",
    });
  } catch (error) {
    return next(error);
  }
}

async function updateFcmToken(req, res, next) {
  try {
    const { fcmToken } = req.body;

    if (
      fcmToken !== null &&
      fcmToken !== undefined &&
      !notificationService.isLikelyValidFcmToken(fcmToken)
    ) {
      return res.status(400).json({
        success: false,
        data: {},
        message: "Token FCM inválido",
      });
    }

    await User.findByIdAndUpdate(req.user.id, { fcmToken });

    return res.status(200).json({
      success: true,
      data: {},
      message: "Token de notificação atualizado",
    });
  } catch (error) {
    return next(error);
  }
}

async function checkPrescriptionAvailability(req, res, next) {
  try {
    const { prescriptionId } = req.params;
    const data = await prescriptionService.getPrescriptionAvailabilityPayload(
      req.user.id,
      prescriptionId,
    );

    return res.status(200).json({
      success: true,
      data,
      message: data.disponivel
        ? "Receita disponível para uso."
        : "Receita indisponível.",
    });
  } catch (error) {
    return next(error);
  }
}

async function getReceitaDigital(req, res, next) {
  try {
    const { id } = req.params;
    const receita = await prescriptionService.getReceitaDigital(id, req.user.id);

    if (!receita) {
      return res.status(404).json({
        success: false,
        data: {},
        message: "Receita digital não encontrada",
      });
    }

    return res.status(200).json({
      success: true,
      data: receita,
      message: "Receita digital recuperada com sucesso",
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  uploadPrescription,
  getUserPrescriptions,
  getPrescriptionById,
  validatePrescription,
  cancelPrescription,
  getPendingPrescriptions,
  getAllPrescriptions,
  updateFcmToken,
  checkPrescriptionAvailability,
  getReceitaDigital,
  debugAllPrescriptions,
  postChatMessage,
  closeChat,
  getPrescriptionForChat,
  reuploadChatImage,
};
