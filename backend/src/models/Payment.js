const mongoose = require("mongoose");

const splitSchema = new mongoose.Schema(
  {
    destinatario: {
      type: String,
      enum: ["farmacia", "plataforma", "entregador"],
      trim: true,
    },
    valor: {
      type: Number,
      min: 0,
    },
    percentual: {
      type: Number,
      min: 0,
    },
  },
  {
    _id: false,
  },
);

const paymentSchema = new mongoose.Schema(
  {
    id_pedido: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
      index: true,
    },
    id_usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    gateway: {
      type: String,
      enum: ["mercadopago", "pagseguro", "teste"],
      required: true,
    },
    gateway_payment_id: {
      type: String,
      trim: true,
      index: true,
    },
    gateway_status: {
      type: String,
      trim: true,
    },
    forma_pagamento: {
      type: String,
      enum: ["cartao_credito", "cartao_debito", "pix", "boleto"],
      required: true,
    },
    valor: {
      type: Number,
      required: true,
      min: 0,
    },
    valor_farmacia: {
      type: Number,
      min: 0,
    },
    valor_plataforma: {
      type: Number,
      min: 0,
    },
    valor_entregador: {
      type: Number,
      min: 0,
    },
    status: {
      type: String,
      enum: [
        "pendente",
        "processando",
        "aprovado",
        "falhou",
        "estornado",
        "cancelado",
      ],
      default: "pendente",
      index: true,
    },
    pix_qr_code: {
      type: String,
    },
    pix_qr_code_base64: {
      type: String,
    },
    pix_expiracao: {
      type: Date,
    },
    boleto_url: {
      type: String,
      trim: true,
    },
    boleto_codigo: {
      type: String,
      trim: true,
    },
    boleto_vencimento: {
      type: Date,
    },
    cartao_ultimos_digitos: {
      type: String,
      trim: true,
      maxLength: 4,
    },
    cartao_bandeira: {
      type: String,
      trim: true,
    },
    comprovante_url: {
      type: String,
      trim: true,
    },
    tentativas: {
      type: Number,
      default: 0,
      min: 0,
    },
    pago_em: {
      type: Date,
    },
    estornado_em: {
      type: Date,
    },
    motivo_falha: {
      type: String,
      trim: true,
    },
    split: {
      type: [splitSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

module.exports =
  mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
