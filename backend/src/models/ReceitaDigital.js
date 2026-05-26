const mongoose = require("mongoose");
const crypto = require("crypto");

const receitaDigitalSchema = new mongoose.Schema(
  {
    prescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prescription",
      required: true,
      index: true,
    },
    paciente: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      nome: {
        type: String,
        required: true,
      },
      cpf: String,
      dataNascimento: Date,
    },
    farmaceutico: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      nome: String,
      crm: String,
      farmacia: String,
    },
    medicamentos: [
      {
        nome: String,
        dosagem: String,
        quantidade: Number,
        orientacao: String,
        risco: String,
      },
    ],
    observacoes: String,
    assinatura: {
      type: String,
      required: true,
    },
    assinaturaMd5: String,
    hash: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    dataAssinatura: {
      type: Date,
      default: Date.now,
    },
    valido: {
      type: Boolean,
      default: true,
    },
    verificacoes: [
      {
        verificadoEm: Date,
        verificadoPor: mongoose.Schema.Types.ObjectId,
        resultado: String,
      },
    ],
  },
  {
    timestamps: true,
  },
);

receitaDigitalSchema.pre("save", function (next) {
  if (!this.hash) {
    const data = JSON.stringify({
      prescriptionId: this.prescriptionId,
      paciente: this.paciente,
      farmaceutico: this.farmaceutico,
      medicamentos: this.medicamentos,
      assinatura: this.assinatura,
    });
    this.hash = crypto.createHash("sha256").update(data).digest("hex");
  }
  next();
});

receitaDigitalSchema.methods.verificarIntegridade = function (novoHash) {
  return this.hash === novoHash;
};

module.exports =
  mongoose.models.ReceitaDigital ||
  mongoose.model("ReceitaDigital", receitaDigitalSchema);
