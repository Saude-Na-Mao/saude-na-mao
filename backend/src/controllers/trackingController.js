const medicineTrackingService = require("../services/medicineTrackingService");
const blockchainAuditService = require("../services/blockchainAuditService");
const Logger = require("../utils/logger");

const logger = new Logger("TrackingController");

async function iniciarRastreamento(req, res, next) {
  try {
    const { medicamento_id, lote, cliente_id } = req.body;

    if (!medicamento_id || !lote || !cliente_id) {
      return res.status(400).json({
        success: false,
        message:
          "medicamento_id, lote e cliente_id são obrigatórios",
      });
    }

    // Usar ID da farmácia do usuário autenticado (para dono de farmácia)
    const farmacia_id =
      req.user.dados_dono_farmacia?.id_farmacia || req.user.id;

    const rastreamento = await medicineTrackingService.criarRastreamento(
      medicamento_id,
      lote,
      farmacia_id,
      cliente_id
    );

    // Registrar auditoria
    blockchainAuditService.auditarAcao(
      "CRIAR_RASTREAMENTO",
      req.user.id,
      `MedicineTracking:${rastreamento._id}`,
      {
        medicamento_id,
        lote,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      }
    );

    res.status(201).json({
      success: true,
      message: "Rastreamento iniciado com sucesso",
      data: { rastreamento },
    });
  } catch (error) {
    logger.error("Erro ao iniciar rastreamento:", error);
    next(error);
  }
}

async function adicionarEtapa(req, res, next) {
  try {
    const { id: rastreamento_id } = req.params;
    const { tipo, localizacao, observacoes } = req.body;
    let foto = null;

    if (!tipo) {
      return res.status(400).json({
        success: false,
        message: "tipo de etapa é obrigatório",
      });
    }

    // Se houver upload de foto
    if (req.file) {
      foto = `/uploads/${req.file.filename}`;
    }

    const rastreamento = await medicineTrackingService.adicionarEtapa(
      rastreamento_id,
      tipo,
      localizacao,
      foto,
      req.user.id,
      observacoes
    );

    // Registrar auditoria
    blockchainAuditService.auditarAcao(
      "ADICIONAR_ETAPA",
      req.user.id,
      `MedicineTracking:${rastreamento_id}`,
      {
        tipo,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      }
    );

    res.json({
      success: true,
      message: "Etapa adicionada com sucesso",
      data: { rastreamento },
    });
  } catch (error) {
    logger.error("Erro ao adicionar etapa:", error);
    next(error);
  }
}

async function gerarQRCode(req, res, next) {
  try {
    const { id: rastreamento_id } = req.params;

    const resultado = await medicineTrackingService.gerarQRCode(
      rastreamento_id
    );

    // Registrar auditoria
    blockchainAuditService.auditarAcao(
      "GERAR_QRCODE",
      req.user.id,
      `MedicineTracking:${rastreamento_id}`,
      {
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      }
    );

    res.json({
      success: true,
      message: "QR code gerado com sucesso",
      data: resultado,
    });
  } catch (error) {
    logger.error("Erro ao gerar QR code:", error);
    next(error);
  }
}

async function obterRastreamento(req, res, next) {
  try {
    const { id: rastreamento_id } = req.params;

    const rastreamento =
      await medicineTrackingService.obterRastreamento(rastreamento_id);

    // Verificar permissão: cliente, farmácia origem ou admin
    const isAuthorized =
      req.user.tipo_usuario === "administrador" ||
      rastreamento.cliente_destino._id.toString() === req.user.id ||
      rastreamento.farmacia_origem._id.toString() ===
        req.user.dados_dono_farmacia?.id_farmacia;

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: "Você não tem permissão para acessar este rastreamento",
      });
    }

    res.json({
      success: true,
      data: { rastreamento },
    });
  } catch (error) {
    logger.error("Erro ao obter rastreamento:", error);
    next(error);
  }
}

async function obterHistorico(req, res, next) {
  try {
    const { id: medicamento_id } = req.params;
    const { lote } = req.query;

    const rastreamentos = await medicineTrackingService.obterHistorico(
      medicamento_id,
      lote
    );

    res.json({
      success: true,
      data: {
        total: rastreamentos.length,
        rastreamentos,
      },
    });
  } catch (error) {
    logger.error("Erro ao obter histórico:", error);
    next(error);
  }
}

async function obterMeusRastreamentos(req, res, next) {
  try {
    const { page = 1, limit = 10 } = req.query;

    const rastreamentos =
      await medicineTrackingService.obterRastreamentosPorCliente(req.user.id, {
        page: parseInt(page),
        limit: parseInt(limit),
      });

    res.json({
      success: true,
      data: rastreamentos,
    });
  } catch (error) {
    logger.error("Erro ao obter meus rastreamentos:", error);
    next(error);
  }
}

async function obterRastreamentosFarmacia(req, res, next) {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Verificar se é dono de farmácia
    if (!req.user.dados_dono_farmacia?.id_farmacia) {
      return res.status(403).json({
        success: false,
        message:
          "Apenas donos de farmácia podem acessar este endpoint",
      });
    }

    const rastreamentos =
      await medicineTrackingService.obterRastreamentosPorFarmacia(
        req.user.dados_dono_farmacia.id_farmacia,
        {
          page: parseInt(page),
          limit: parseInt(limit),
        }
      );

    res.json({
      success: true,
      data: rastreamentos,
    });
  } catch (error) {
    logger.error("Erro ao obter rastreamentos da farmácia:", error);
    next(error);
  }
}

async function verificarAutenticidade(req, res, next) {
  try {
    const { id: rastreamento_id } = req.params;

    // Apenas farmacêuticos podem verificar
    if (req.user.tipo_usuario !== "farmaceutico" && req.user.tipo_usuario !== "administrador") {
      return res.status(403).json({
        success: false,
        message:
          "Apenas farmacêuticos podem verificar autenticidade",
      });
    }

    const resultado = await medicineTrackingService.verificarAutenticidade(
      rastreamento_id,
      req.user.id
    );

    // Registrar auditoria
    blockchainAuditService.auditarAcao(
      "VERIFICAR_AUTENTICIDADE",
      req.user.id,
      `MedicineTracking:${rastreamento_id}`,
      {
        resultado: resultado.autenticidade,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      }
    );

    res.json({
      success: true,
      data: resultado,
    });
  } catch (error) {
    logger.error("Erro ao verificar autenticidade:", error);
    next(error);
  }
}

async function obterEstatisticas(req, res, next) {
  try {
    let farmacia_id = null;

    // Se for dono de farmácia, usar sua farmácia
    if (
      req.user.tipo_usuario === "dono_farmacia" &&
      req.user.dados_dono_farmacia?.id_farmacia
    ) {
      farmacia_id = req.user.dados_dono_farmacia.id_farmacia;
    }

    const estatisticas =
      await medicineTrackingService.obterEstatisticas(farmacia_id);

    res.json({
      success: true,
      data: { estatisticas },
    });
  } catch (error) {
    logger.error("Erro ao obter estatísticas:", error);
    next(error);
  }
}

async function cancelarRastreamento(req, res, next) {
  try {
    const { id: rastreamento_id } = req.params;
    const { motivo } = req.body;

    if (!motivo) {
      return res.status(400).json({
        success: false,
        message: "motivo é obrigatório",
      });
    }

    const rastreamento =
      await medicineTrackingService.cancelarRastreamento(
        rastreamento_id,
        motivo
      );

    // Registrar auditoria
    blockchainAuditService.auditarAcao(
      "CANCELAR_RASTREAMENTO",
      req.user.id,
      `MedicineTracking:${rastreamento_id}`,
      {
        motivo,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      }
    );

    res.json({
      success: true,
      message: "Rastreamento cancelado com sucesso",
      data: { rastreamento },
    });
  } catch (error) {
    logger.error("Erro ao cancelar rastreamento:", error);
    next(error);
  }
}

module.exports = {
  iniciarRastreamento,
  adicionarEtapa,
  gerarQRCode,
  obterRastreamento,
  obterHistorico,
  obterMeusRastreamentos,
  obterRastreamentosFarmacia,
  verificarAutenticidade,
  obterEstatisticas,
  cancelarRastreamento,
};
