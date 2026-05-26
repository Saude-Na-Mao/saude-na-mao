const mongoose = require("mongoose");

const auditSchema = new mongoose.Schema(
  {
    usuario_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    usuario_email: {
      type: String,
      trim: true,
    },
    usuario_tipo: {
      type: String,
      trim: true,
    },
    ip_origem: {
      type: String,
      required: true,
      trim: true,
    },
    user_agent: {
      type: String,
      trim: true,
    },
    acao: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    recurso: {
      type: String,
      required: true,
      trim: true,
    },
    recurso_id: {
      type: String,
      trim: true,
    },
    valores_anteriores: {
      type: mongoose.Schema.Types.Mixed,
    },
    valores_novos: {
      type: mongoose.Schema.Types.Mixed,
    },
    descricao: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["sucesso", "falha", "tentativa"],
      default: "sucesso",
    },
    motivo_falha: {
      type: String,
      trim: true,
    },
    criado_em: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  },
);

auditSchema.index(
  { criado_em: 1 },
  { expireAfterSeconds: 7 * 365 * 24 * 60 * 60 },
);
auditSchema.index({ acao: 1, criado_em: -1 });
auditSchema.index({ usuario_id: 1, criado_em: -1 });
auditSchema.index({ recurso: 1, recurso_id: 1, criado_em: -1 });

auditSchema.statics.findOneAndUpdate = undefined;
auditSchema.statics.findOneAndDelete = undefined;
auditSchema.statics.updateOne = undefined;
auditSchema.statics.deleteOne = undefined;
auditSchema.statics.deleteMany = undefined;

module.exports =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditSchema);
