const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const AuditLog = require("../models/AuditLog");
const Logger = require("../utils/logger");

const logger = new Logger("AuditRoutes");
const router = express.Router();

router.get("/", authMiddleware.protect, async (req, res, next) => {
  try {
    const { filter, limit, page } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;

    const query = {};

    if (filter && filter !== "all") {
      query.acao = { $regex: filter, $options: "i" };
    }

    const logs = await AuditLog.find(query)
      .sort({ criado_em: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await AuditLog.countDocuments(query);

    return res.status(200).json({
      success: true,
      logs,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      message: "Logs de auditoria recuperados com sucesso",
    });
  } catch (error) {
    logger.error("Erro ao recuperar logs de auditoria:", error);
    return next(error);
  }
});

router.get("/:recurso", authMiddleware.protect, async (req, res, next) => {
  try {
    const { recurso } = req.params;
    const { limit, page } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;

    const logs = await AuditLog.find({ recurso })
      .sort({ criado_em: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await AuditLog.countDocuments({ recurso });

    return res.status(200).json({
      success: true,
      logs,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      message: `Logs para recurso ${recurso} recuperados com sucesso`,
    });
  } catch (error) {
    logger.error("Erro ao recuperar logs de auditoria:", error);
    return next(error);
  }
});

module.exports = router;
