const mongoose = require("mongoose");

const DrugInteractionSchema = new mongoose.Schema(
  {
    medicamento1: {
      nome: {
        type: String,
        required: true,
        lowercase: true,
      },
      codigoANVISA: {
        type: String,
        default: null,
      },
      principioAtivo: {
        type: String,
        required: true,
        lowercase: true,
      },
    },
    medicamento2: {
      nome: {
        type: String,
        required: true,
        lowercase: true,
      },
      codigoANVISA: {
        type: String,
        default: null,
      },
      principioAtivo: {
        type: String,
        required: true,
        lowercase: true,
      },
    },
    severidade: {
      type: String,
      enum: ["LEVE", "MODERADA", "GRAVE", "CONTRAINDICADA"],
      required: true,
    },
    efeitos: [
      {
        type: String,
      },
    ],
    mecanismo: {
      type: String,
      required: true,
    },
    recomendacao: {
      type: String,
      required: true,
    },
    alternativas: [
      {
        nome: String,
        motivo: String,
      },
    ],
    fonte: {
      type: String,
      enum: ["ANVISA", "DrugBank", "BNF", "ManualMSD", "CUSTOMIZADO"],
      default: "CUSTOMIZADO",
    },
    dataAtualizacao: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "drug_interactions",
  }
);

// Índices para busca rápida
DrugInteractionSchema.index({ "medicamento1.principioAtivo": 1, "medicamento2.principioAtivo": 1 });
DrugInteractionSchema.index({ "medicamento1.nome": 1 });
DrugInteractionSchema.index({ "medicamento2.nome": 1 });
DrugInteractionSchema.index({ severidade: 1 });

module.exports = mongoose.model("DrugInteraction", DrugInteractionSchema);
