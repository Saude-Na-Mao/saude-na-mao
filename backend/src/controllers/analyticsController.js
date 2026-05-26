const analyticsService = require("../services/analyticsService");
const Logger = require("../utils/logger");

const logger = new Logger("AnalyticsController");

async function getAnalytics(req, res, next) {
  try {
    const { period } = req.query;
    const pharmacyId = req.user.farmacia_id || req.params.id;

    if (!pharmacyId) {
      return res.status(400).json({
        success: false,
        message: "Farmácia ID não encontrada",
      });
    }

    const analytics = await analyticsService.getAnalyticsByPeriod(
      pharmacyId,
      period || "mes",
    );

    return res.status(200).json({
      success: true,
      data: analytics,
      message: "Analytics recuperados com sucesso",
    });
  } catch (error) {
    logger.error("Erro ao recuperar analytics:", error);
    return next(error);
  }
}

module.exports = {
  getAnalytics,
};
