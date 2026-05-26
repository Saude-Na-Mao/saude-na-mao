const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    id_farmacia: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pharmacy",
      required: true,
      index: true,
    },
    id_usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    nome_usuario: {
      type: String,
      required: true,
      trim: true,
    },
    nota: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comentario: {
      type: String,
      trim: true,
      maxLength: 500,
      default: null,
    },
    /** Resposta pública da farmácia à avaliação (painel do dono). */
    resposta_loja: {
      type: String,
      trim: true,
      maxLength: 1000,
      default: null,
    },
    resposta_loja_em: {
      type: Date,
      default: null,
    },
    resposta_loja_por: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

reviewSchema.index({ id_farmacia: 1, createdAt: -1 });
reviewSchema.index({ id_farmacia: 1, id_usuario: 1 }, { unique: true });

module.exports =
  mongoose.models.Review || mongoose.model("Review", reviewSchema);
