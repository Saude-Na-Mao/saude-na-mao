const express = require("express");
const { body, validationResult } = require("express-validator");
const authMiddleware = require("../middlewares/authMiddleware");
const drugInteractionService = require("../services/drugInteractionService");
const { audit } = require("../middlewares/auditMiddleware");
const logger = require("../utils/logger");

const router = express.Router();

function validarRequisicao(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
}

/**
 * POST /api/drugs/check-interactions
 * Verifica interações medicamentosas entre medicamentos
 */
router.post(
  "/check-interactions",
  authMiddleware.protect,
  [
    body("medicamentos")
      .isArray({ min: 1 })
      .withMessage("Medicamentos deve ser um array com no mínimo 1 medicamento"),
    body("medicamentos.*")
      .isString()
      .withMessage("Cada medicamento deve ser um ID válido"),
  ],
  validarRequisicao,
  audit("DRUG_INTERACTION_CHECK", "Medicamento"),
  async (req, res, next) => {
    try {
      const { medicamentos } = req.body;
      const usuarioId = req.user.id || req.user._id;

      logger.info(`Verificando interações para usuário ${usuarioId}`, {
        medicamentos: medicamentos.length,
      });

      const resultado = await drugInteractionService.verificarInteracoes(
        medicamentos,
        usuarioId
      );

      return res.status(200).json({
        success: true,
        data: resultado,
      });
    } catch (error) {
      logger.error("Erro ao verificar interações:", error);
      return res.status(500).json({
        success: false,
        message: "Erro ao verificar interações medicamentosas",
        erro: error.message,
      });
    }
  }
);

/**
 * POST /api/drugs/check-risk
 * Calcula risco de fraude/comportamento anormal para uma compra
 */
router.post(
  "/check-risk",
  authMiddleware.protect,
  [
    body("medicamentos")
      .isArray({ min: 1 })
      .withMessage("Medicamentos deve ser um array"),
    body("farmaciaId")
      .isString()
      .withMessage("farmaciaId é obrigatório"),
  ],
  validarRequisicao,
  audit("RISK_ASSESSMENT", "Compra"),
  async (req, res, next) => {
    try {
      const { medicamentos, farmaciaId } = req.body;
      const usuarioId = req.user.id || req.user._id;

      logger.info(`Calculando risco para usuário ${usuarioId}`, {
        medicamentos: medicamentos.length,
        farmacia: farmaciaId,
      });

      const riscoAssessment = await drugInteractionService.calcularRiscoCompra(
        usuarioId,
        medicamentos,
        farmaciaId
      );

      // Se risco alto, registrar para auditoria
      if (riscoAssessment.risco > 70) {
        logger.warn(`COMPRA SUSPEITA detectada para usuário ${usuarioId}`, {
          risco: riscoAssessment.risco,
          motivos: riscoAssessment.motivos,
        });
      }

      return res.status(200).json({
        success: true,
        data: riscoAssessment,
      });
    } catch (error) {
      logger.error("Erro ao calcular risco:", error);
      return res.status(500).json({
        success: false,
        message: "Erro ao avaliar risco da compra",
        erro: error.message,
      });
    }
  }
);

/**
 * GET /api/drugs/:drugId/interactions
 * Retorna todas as interações conhecidas de um medicamento
 */
router.get(
  "/:drugId/interactions",
  async (req, res, next) => {
    try {
      const { drugId } = req.params;

      // TODO: Implementar busca no banco
      // const interactions = await DrugInteraction.find({
      //   $or: [
      //     { "medicamento1._id": drugId },
      //     { "medicamento2._id": drugId }
      //   ]
      // });

      return res.status(200).json({
        success: true,
        message: "Endpoint estruturado para futura implementação",
        data: [],
      });
    } catch (error) {
      logger.error("Erro ao buscar interações:", error);
      return res.status(500).json({
        success: false,
        message: "Erro ao buscar interações",
      });
    }
  }
);

/**
 * POST /api/drugs/seed-interactions
 * Popula base de dados com interações conhecidas (apenas admin)
 * Este endpoint seria usado uma única vez para carregar dados iniciais
 */
router.post(
  "/seed-interactions",
  authMiddleware.protect,
  audit("SEED_INTERACTIONS", "DrugDatabase"),
  async (req, res, next) => {
    try {
      // Verificar se é admin
      if (req.user.tipo_usuario !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Apenas administradores podem fazer seed de dados",
        });
      }

      // TODO: Implementar seed com dados reais
      // const interacoesPadroes = [
      //   {
      //     medicamento1: { nome: "Amoxicilina", ... },
      //     medicamento2: { nome: "Contraceptivo oral", ... },
      //     severidade: "MODERADA",
      //     ...
      //   }
      // ];

      return res.status(200).json({
        success: true,
        message:
          "Estrutura preparada para seed de dados (implementação com dados reais necessária)",
      });
    } catch (error) {
      logger.error("Erro ao fazer seed:", error);
      return res.status(500).json({
        success: false,
        message: "Erro ao fazer seed de dados",
      });
    }
  }
);

module.exports = router;
