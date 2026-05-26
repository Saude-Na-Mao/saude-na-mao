const mongoose = require("mongoose");

const PharmacistSchema = new mongoose.Schema(
  {
    id_usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    nome: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    telefone: {
      type: String,
      trim: true,
    },
    crm: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    crm_verificado: {
      type: Boolean,
      default: false,
    },
    id_farmacia: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pharmacy",
      required: true,
    },
    especialidades: [
      {
        type: String,
        enum: [
          "farmacologia_clinica",
          "farmacovigilancia",
          "farmacoeconomia",
          "analises_clinicas",
          "cosmetologia",
          "nutricao",
          "homeopatia",
          "fitoterapia",
          "outras",
        ],
      },
    ],
    foto: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      maxlength: 500,
    },
    disponivel_chat: {
      type: Boolean,
      default: true,
    },
    horario_inicio: {
      type: String,
      default: "09:00",
    },
    horario_fim: {
      type: String,
      default: "18:00",
    },
    dias_atendimento: [
      {
        type: String,
        enum: ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"],
      },
    ],
    tempo_resposta_medio: {
      type: Number,
      default: 30,
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    total_avaliacoes: {
      type: Number,
      default: 0,
    },
    chats_ativos: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Chat",
      },
    ],
    
    // Status Real-time
    logado: {
      type: Boolean,
      default: false,
    },
    status_motivo: {
      type: String,
      enum: ["online", "pausa", "saiu", "ausente"],
      default: "saiu",
    },
    ultima_atividade: {
      type: Date,
      default: null,
    },
    token_sessao: {
      type: String,
      default: null,
    },
    
    // Validação CRF
    crm_validado_data: {
      type: Date,
      default: null,
    },
    crm_validado_por: {
      type: String,
      default: null,
    },
    crm_valido_ate: {
      type: Date,
      default: null,
    },
    
    // Métricas de Desempenho
    atendimentos_dia: {
      type: Number,
      default: 0,
    },
    receitas_validadas: {
      type: Number,
      default: 0,
    },
    alertas_emitidos: {
      type: Number,
      default: 0,
    },
    medicamentos_dispensados: {
      type: Number,
      default: 0,
    },
    
    // Anti-Fraude & Auditoria
    suspicoes: [
      {
        tipo: String,
        data: Date,
        motivo: String,
        resolvido: { type: Boolean, default: false },
      },
    ],
    ultima_auditoria: {
      type: Date,
      default: null,
    },
    bloqueado: {
      type: Boolean,
      default: false,
    },
    motivo_bloqueio: String,
    
    ativo: {
      type: Boolean,
      default: true,
    },
    data_cadastro: {
      type: Date,
      default: Date.now,
    },
    data_atualizacao: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "pharmacists",
  }
);

PharmacistSchema.index({ id_farmacia: 1 });
PharmacistSchema.index({ logado: 1 });
PharmacistSchema.index({ status_motivo: 1 });
PharmacistSchema.index({ ultima_atividade: 1 });
PharmacistSchema.index({ bloqueado: 1 });

module.exports = mongoose.model("Pharmacist", PharmacistSchema);
