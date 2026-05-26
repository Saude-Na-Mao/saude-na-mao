const Review = require("../models/Review");
const Pharmacy = require("../models/Pharmacy");
const Order = require("../models/Order");
const mongoose = require("mongoose");

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getReviewsByPharmacy(pharmacyId, { page = 1, limit = 10 }) {
  if (!mongoose.Types.ObjectId.isValid(pharmacyId)) {
    throw createError("Farmácia não encontrada", 404);
  }

  const oid = new mongoose.Types.ObjectId(pharmacyId);
  const skip = (page - 1) * limit;

  const [reviews, agg] = await Promise.all([
    Review.find({ id_farmacia: oid })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.aggregate([
      { $match: { id_farmacia: oid } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          avgRating: { $avg: "$nota" },
        },
      },
    ]),
  ]);

  const total = agg[0]?.total || 0;
  const avgRaw = agg[0]?.avgRating;
  const avgRating =
    avgRaw != null ? Math.round(avgRaw * 10) / 10 : null;

  return {
    reviews,
    total,
    avgRating,
    page,
    totalPages: total ? Math.ceil(total / limit) : 1,
  };
}

async function assertOrderEligibleForPharmacyReview(orderId, userId, pharmacyId) {
  if (!mongoose.Types.ObjectId.isValid(String(orderId))) {
    throw createError("Pedido inválido", 400);
  }
  const order = await Order.findById(orderId);
  if (!order) {
    throw createError("Pedido não encontrado", 404);
  }
  if (String(order.id_usuario) !== String(userId)) {
    throw createError("Pedido não encontrado", 404);
  }
  if (order.status !== "entregue") {
    throw createError("Só é possível avaliar pedidos entregues", 400);
  }
  const farmId = order.id_farmacia?._id || order.id_farmacia;
  if (String(farmId) !== String(pharmacyId)) {
    throw createError("Farmácia não confere com o pedido", 400);
  }
  return order;
}

async function markPedidoFarmaciaAvaliada(order) {
  if (order.farmacia_avaliada_em == null) {
    order.farmacia_avaliada_em = new Date();
    await order.save();
  }
}

async function createReview(
  userId,
  userName,
  { pharmacyId, nota, comentario, id_pedido: idPedidoRaw } = {},
) {
  if (!mongoose.Types.ObjectId.isValid(pharmacyId)) {
    throw createError("Farmácia não encontrada", 404);
  }

  const pharmacy = await Pharmacy.findById(pharmacyId);
  if (!pharmacy) {
    throw createError("Farmácia não encontrada", 404);
  }

  const notaNum = Number(nota);
  if (!Number.isFinite(notaNum) || notaNum < 1 || notaNum > 5) {
    throw createError("Nota deve ser entre 1 e 5", 400);
  }

  const idPedido =
    idPedidoRaw != null && String(idPedidoRaw).trim() !== ""
      ? String(idPedidoRaw).trim()
      : null;

  if (idPedido) {
    await assertOrderEligibleForPharmacyReview(idPedido, userId, pharmacyId);
  }

  const existing = await Review.findOne({
    id_farmacia: pharmacyId,
    id_usuario: userId,
  });

  if (existing) {
    if (idPedido) {
      const freshOrder = await Order.findById(idPedido);
      if (freshOrder) await markPedidoFarmaciaAvaliada(freshOrder);
      return { review: existing, createdNew: false };
    }
    throw createError("Você já avaliou esta farmácia", 409);
  }

  const review = await Review.create({
    id_farmacia: pharmacyId,
    id_usuario: userId,
    nome_usuario: userName,
    nota: notaNum,
    comentario: comentario || null,
  });

  const stats = await Review.aggregate([
    { $match: { id_farmacia: new mongoose.Types.ObjectId(pharmacyId) } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: "$nota" },
        count: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    pharmacy.avaliacao = Math.round(stats[0].avgRating * 10) / 10;
    pharmacy.total_avaliacoes = stats[0].count;
    await pharmacy.save();
  }

  if (idPedido) {
    const freshOrder = await Order.findById(idPedido);
    if (freshOrder) await markPedidoFarmaciaAvaliada(freshOrder);
  }

  return { review, createdNew: true };
}

async function setPharmacyReplyToReview(reviewId, pharmacyId, textoRaw, staffUserId) {
  if (!mongoose.Types.ObjectId.isValid(String(reviewId))) {
    throw createError("Avaliação inválida", 400);
  }
  if (!mongoose.Types.ObjectId.isValid(String(pharmacyId))) {
    throw createError("Farmácia não encontrada", 404);
  }

  const texto = textoRaw != null ? String(textoRaw).trim() : "";
  if (texto.length < 1) {
    throw createError("Escreva uma resposta antes de publicar", 400);
  }
  if (texto.length > 1000) {
    throw createError("Resposta pode ter no máximo 1000 caracteres", 400);
  }

  const review = await Review.findById(reviewId);
  if (!review) {
    throw createError("Avaliação não encontrada", 404);
  }
  if (String(review.id_farmacia) !== String(pharmacyId)) {
    throw createError("Avaliação não pertence a esta farmácia", 403);
  }

  review.resposta_loja = texto;
  review.resposta_loja_em = new Date();
  review.resposta_loja_por = staffUserId || null;
  await review.save();

  return review;
}

module.exports = {
  getReviewsByPharmacy,
  createReview,
  setPharmacyReplyToReview,
};
