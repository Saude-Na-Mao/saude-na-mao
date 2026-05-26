const mongoose = require("mongoose");

const DrugContraindicationSchema = new mongoose.Schema(
  {
    medicamento: {
      nome: {
        type: String,
        required: true,
        lowercase: true,
      },
      codigoANVISA: String,
      principioAtivo: String,
    },
    condicoes: [
      {
        nome: {
          type: String,
          required: true,
        },
        risco: {
          type: String,
          enum: ["LEVE", "MODERADA", "GRAVE", "CONTRAINDICADA"],
          default: "MODERADA",
        },
        motivo: String,
      },
    ],
    restricoes_populacao: [
      {
        categoria: {
          type: String,
          enum: ["GESTANTES", "AMAMENTANDO", "MENORES_18", "IDOSOS", "INSUFICIENCIA_RENAL", "INSUFICIENCIA_HEPATICA"],
        },
        restricao: String,
        alternativa: String,
      },
    ],
    alergias_cruzadas: [
      {
        principioAtivo: String,
        motivo: String,
      },
    ],
    recomendacoes_dosagem: {
      maiorIdade: Boolean,
      idadeMinima: Number,
      idadeMaxima: Number,
      doserAjustar: Boolean,
      motivo: String,
    },
    fonte: {
      type: String,
      enum: ["ANVISA", "BNF", "DrugBank", "CUSTOMIZADO"],
      default: "CUSTOMIZADO",
    },
    dataAtualizacao: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "drug_contraindications",
  }
);

DrugContraindicationSchema.index({ "medicamento.nome": 1 });
DrugContraindicationSchema.index({ "condicoes.nome": 1 });

module.exports = mongoose.model("DrugContraindication", DrugContraindicationSchema);
