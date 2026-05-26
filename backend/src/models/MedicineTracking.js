const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const medicineTrackingSchema = new mongoose.Schema(
  {
    medicamento_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    lote: {
      type: String,
      required: true,
      index: true,
    },
    farmacia_origem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pharmacy",
      required: true,
      index: true,
    },
    cliente_destino: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    farmaceutico_validador: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Blockchain tracking
    blockchain_hash: {
      type: String,
      unique: true,
      sparse: true,
    },
    qr_code_data: {
      type: String,
    },

    // Etapas do rastreamento
    etapas: [
      {
        tipo: {
          type: String,
          enum: ["SAIDA_FARMACIA", "EM_TRANSITO", "ENTREGA", "ENTREGUE"],
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        localizacao: {
          lat: Number,
          lng: Number,
        },
        assinatura_blockchain: String,
        validado_por: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        foto_prova: String,
        observacoes: String,
      },
    ],

    // Segurança e verificação
    autenticidade_verificada: {
      type: Boolean,
      default: false,
    },
    assinatura_farmaceutico: String,
    status: {
      type: String,
      enum: ["pendente", "em_transito", "entregue", "cancelado"],
      default: "pendente",
      index: true,
    },

    criado_em: {
      type: Date,
      default: Date.now,
      index: true,
    },
    atualizado_em: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

medicineTrackingSchema.virtual("etapa_atual").get(function () {
  if (this.etapas && this.etapas.length > 0) {
    return this.etapas[this.etapas.length - 1];
  }
  return null;
});

medicineTrackingSchema.index({
  medicamento_id: 1,
  lote: 1,
});

medicineTrackingSchema.index({
  cliente_destino: 1,
  criado_em: -1,
});

medicineTrackingSchema.index({
  status: 1,
  criado_em: -1,
});

medicineTrackingSchema.plugin(mongoosePaginate);

module.exports =
  mongoose.models.MedicineTracking ||
  mongoose.model("MedicineTracking", medicineTrackingSchema);
