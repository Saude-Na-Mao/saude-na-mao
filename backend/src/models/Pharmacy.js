const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const pharmacySchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: true,
      trim: true,
    },
    cnpj: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    telefone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    logradouro: {
      type: String,
      required: true,
      trim: true,
    },
    numero: {
      type: String,
      required: true,
      trim: true,
    },
    complemento: {
      type: String,
      trim: true,
    },
    bairro: {
      type: String,
      required: true,
      trim: true,
    },
    cidade: {
      type: String,
      required: true,
      trim: true,
    },
    estado: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxLength: 2,
    },
    cep: {
      type: String,
      required: true,
      trim: true,
    },
    horario_funcionamento: {
      type: String,
      trim: true,
    },
    avaliacao: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    total_avaliacoes: {
      type: Number,
      default: 0,
    },
    ativa: {
      type: Boolean,
      default: true,
    },
    id_dono: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    alvara_sanitario: {
      type: String,
      trim: true,
    },
    licenca_anvisa: {
      type: String,
      trim: true,
    },
    afe_anvisa: {
      type: String,
      trim: true,
    },
    autorizacao_especial: {
      type: String,
      trim: true,
    },
    crf_responsavel: {
      type: String,
      trim: true,
    },
    responsavel_tecnico_nome: {
      type: String,
      trim: true,
    },
    licenca_sanitaria_validada: {
      type: Boolean,
      default: false,
    },
    delivery_medicamentos_autorizado: {
      type: Boolean,
      default: false,
    },
    documentacao_validada_em: {
      type: Date,
      default: null,
    },
    modo_demo: {
      type: Boolean,
      default: true,
    },
    observacoes_conformidade: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    farmaceutico_responsavel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    logo: {
      type: String,
      default: null,
    },
    foto: {
      type: String,
      default: null,
    },
    descricao: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    formas_pagamento: [{
      type: String,
      enum: ["pix", "cartao_credito", "cartao_debito", "dinheiro"],
    }],
    tipos_entrega: [{
      type: String,
      enum: ["moto", "bicicleta", "retirada"],
    }],
    raio_entrega_km: {
      type: Number,
      default: 10,
      min: 1,
      max: 50,
    },
    taxa_entrega_base: {
      type: Number,
      default: 5,
      min: 0,
    },
    taxa_por_km: {
      type: Number,
      default: 1.5,
      min: 0,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
      },
    },
  },
  {
    timestamps: true,
  },
);

pharmacySchema.index(
  { location: "2dsphere" },
  { partialFilterExpression: { "location.coordinates": { $exists: true } } }
);

pharmacySchema.plugin(mongoosePaginate);

module.exports =
  mongoose.models.Pharmacy || mongoose.model("Pharmacy", pharmacySchema);
