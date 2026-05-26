const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    codigo: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    tipo_desconto: {
      type: String,
      enum: ["percentual", "fixo"],
      required: true,
    },
    valor: {
      type: Number,
      required: true,
      min: 0,
    },
    desconto_maximo: {
      type: Number,
      default: null,
    },
    minimo_pedido: {
      type: Number,
      default: 0,
    },
    validade: {
      type: Date,
      required: true,
    },
    limite_uso: {
      type: Number,
      default: null,
    },
    usos: {
      type: Number,
      default: 0,
    },
    limite_por_usuario: {
      type: Number,
      default: 1,
    },
    usuarios_utilizaram: [
      {
        id_usuario: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        quantidade: { type: Number, default: 1 },
      },
    ],
    ativo: {
      type: Boolean,
      default: true,
    },
    descricao: {
      type: String,
      trim: true,
    },
    frete_gratis: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

couponSchema.index({ validade: 1 });

module.exports =
  mongoose.models.Coupon || mongoose.model("Coupon", couponSchema);
