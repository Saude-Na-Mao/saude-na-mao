const reviewService = require("../services/reviewService");

async function getReviews(req, res, next) {
  try {
    const { pharmacyId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await reviewService.getReviewsByPharmacy(pharmacyId, {
      page,
      limit,
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
}

async function createReview(req, res, next) {
  try {
    const { pharmacyId } = req.params;
    const { nota, comentario, id_pedido } = req.body;

    const { review, createdNew } = await reviewService.createReview(
      req.user.id,
      req.user.nome,
      { pharmacyId, nota, comentario, id_pedido },
    );

    const statusCode = createdNew ? 201 : 200;
    const message = createdNew
      ? "Avaliação enviada com sucesso"
      : "Pedido registrado como avaliado";

    return res.status(statusCode).json({
      success: true,
      message,
      data: { review },
    });
  } catch (error) {
    return next(error);
  }
}

async function replyToReview(req, res, next) {
  try {
    const { pharmacyId, reviewId } = req.params;
    const { texto } = req.body;
    const userId = req.user?._id || req.user?.id;

    const review = await reviewService.setPharmacyReplyToReview(
      reviewId,
      pharmacyId,
      texto,
      userId,
    );

    return res.json({
      success: true,
      message: "Resposta publicada",
      data: { review },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getReviews,
  createReview,
  replyToReview,
};
