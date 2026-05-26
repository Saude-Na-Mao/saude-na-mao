const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    id_remetente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tipo_remetente: {
      type: String,
      enum: ["usuario", "farmaceutico", "admin", "sistema"],
      required: true,
    },
    texto: {
      type: String,
      required: true,
      trim: true,
      maxLength: 2000,
    },
    lida: {
      type: Boolean,
      default: false,
    },
    enviado_em: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  },
);

const supportSchema = new mongoose.Schema(
  {
    id_usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    id_atendente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    id_farmacia: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pharmacy",
      default: null,
      index: true,
    },
    origem: {
      type: String,
      enum: ["chat_geral", "pagina_produto", "pedido", "perfil", "outro"],
      default: "chat_geral",
    },
    assunto: {
      type: String,
      required: true,
      trim: true,
      maxLength: 200,
    },
    categoria: {
      type: String,
      enum: [
        "duvida_medicamento",
        "problema_pedido",
        "receita",
        "pagamento",
        "entrega",
        "outro",
      ],
      default: "outro",
    },
    status: {
      type: String,
      enum: ["aberta", "em_atendimento", "respondida", "encerrada"],
      default: "aberta",
      index: true,
    },
    prioridade: {
      type: String,
      enum: ["baixa", "normal", "alta", "urgente"],
      default: "normal",
    },
    mensagens: {
      type: [messageSchema],
      default: [],
    },
    avaliacao_atendimento: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    comentario_avaliacao: {
      type: String,
      trim: true,
    },
    avaliado_em: {
      type: Date,
    },
    aberta_em: {
      type: Date,
      default: Date.now,
    },
    encerrada_em: {
      type: Date,
    },
    primeira_resposta_em: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

supportSchema.index({ assunto: "text" });

supportSchema.methods.adicionarMensagem = function ({
  remetenteId,
  tipoRemetente,
  texto,
}) {
  this.mensagens.push({
    id_remetente: remetenteId,
    tipo_remetente: tipoRemetente,
    texto,
  });

  if (tipoRemetente !== "usuario" && !this.primeira_resposta_em) {
    this.primeira_resposta_em = new Date();
  }
};

module.exports =
  mongoose.models.SupportMessage ||
  mongoose.model("SupportMessage", supportSchema);
