const mongoose = require("mongoose");

const faqSchema = new mongoose.Schema(
  {
    pergunta: {
      type: String,
      required: true,
      trim: true,
    },
    resposta: {
      type: String,
      required: true,
      trim: true,
    },
    categoria: {
      type: String,
      enum: [
        "medicamentos",
        "receitas",
        "pedidos",
        "pagamento",
        "entrega",
        "conta",
        "geral",
      ],
      default: "geral",
    },
    tags: {
      type: [String],
      default: [],
    },
    visualizacoes: {
      type: Number,
      default: 0,
    },
    util_sim: {
      type: Number,
      default: 0,
    },
    util_nao: {
      type: Number,
      default: 0,
    },
    ativo: {
      type: Boolean,
      default: true,
    },
    ordem: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

faqSchema.index(
  { pergunta: "text", resposta: "text", tags: "text" },
  { weights: { pergunta: 10, tags: 5, resposta: 2 } },
);

faqSchema.index({ categoria: 1 });
faqSchema.index({ ativo: 1 });
faqSchema.index({ ordem: 1 });

module.exports = mongoose.models.FAQ || mongoose.model("FAQ", faqSchema);
