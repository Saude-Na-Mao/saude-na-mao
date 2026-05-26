const mongoose = require("mongoose");

const STATUS_OPTIONS = [
  "Pendente",
  "Em Análise",
  "Aprovada",
  "Rejeitada",
  "Expirada",
  "Cancelada",
];

const pedidoVinculoSchema = new mongoose.Schema(
  {
    id_pedido: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    utilizada_em: {
      type: Date,
      default: Date.now,
    },
    status_pedido_no_uso: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const historicoStatusSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: STATUS_OPTIONS,
      required: true,
    },
    alterado_em: {
      type: Date,
      default: Date.now,
    },
    alterado_por: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    observacao: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const chatMensagemSchema = new mongoose.Schema(
  {
    remetenteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    nomeRemetente: {
      type: String,
      trim: true,
      default: null,
    },
    tipoRemetente: {
      type: String,
      trim: true,
      default: "usuario",
    },
    texto: {
      type: String,
      trim: true,
      required: true,
    },
    enviado_em: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const prescriptionSchema = new mongoose.Schema(
  {
    id_usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    id_farmacia: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pharmacy",
      default: null,
      index: true,
    },
    id_farmaceutico_responsavel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pharmacist",
      default: null,
    },
    tipo_receita: {
      type: String,
      enum: [
        "simples",
        "especial_c1",
        "especial_b",
        "antimicrobiano",
      ],
      default: "simples",
    },
    consumida: {
      type: Boolean,
      default: false,
    },
    /** Histórico de vínculos com pedidos (auditoria); não remove registros ao cancelar */
    pedidos_vinculados: {
      type: [pedidoVinculoSchema],
      default: [],
    },
    /**
     * Quando false, a receita aprovada não pode ser usada em novo pedido (RN01 / Portaria 344).
     * Volta a true se o pedido vinculado for cancelado antes da entrega.
     */
    disponivel_para_novo_pedido: {
      type: Boolean,
      default: true,
      index: true,
    },
    /** Medicamento ao qual a receita se refere (opcional; null = legado / aceito para qualquer item da mesma farmácia). */
    id_produto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      index: true,
    },
    id_pedido_vinculado: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    /** Pedido em que a receita foi efetivamente utilizada no checkout (espelha consumo). */
    id_pedido_utilizado: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    farmaceutico_dispensador: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    url_arquivo: {
      type: String,
      required: true,
      trim: true,
    },
    nome_arquivo: {
      type: String,
      required: true,
      trim: true,
    },
    hash_arquivo: {
      type: String,
      trim: true,
      index: true,
      default: null,
    },
    tipo_arquivo: {
      type: String,
      enum: ["image/jpeg", "image/png", "application/pdf"],
      required: true,
    },
    tamanho_arquivo: {
      type: Number,
      min: 0,
    },
    status: {
      type: String,
      enum: STATUS_OPTIONS,
      default: "Pendente",
      index: true,
    },
    dados_ocr: {
      nome_medico: {
        type: String,
        trim: true,
      },
      crm: {
        type: String,
        trim: true,
      },
      uf_crm: {
        type: String,
        trim: true,
      },
      data_emissao: {
        type: Date,
      },
      principio_ativo: {
        type: String,
        trim: true,
      },
      raw_text: {
        type: String,
      },
    },
    validacao_crm: {
      crm_valido: {
        type: Boolean,
        default: false,
      },
      medico_encontrado: {
        type: String,
        trim: true,
      },
      especialidade: {
        type: String,
        trim: true,
      },
      verificado_em: {
        type: Date,
      },
    },
    validade: {
      type: Date,
      validate: {
        validator(value) {
          if (!value) {
            return true;
          }

          const dataEmissao = this.dados_ocr?.data_emissao;
          if (!dataEmissao) {
            return true;
          }

          const tipo = this.tipo_receita;
          const limite = new Date(dataEmissao);

          if (tipo === "antimicrobiano") {
            limite.setDate(limite.getDate() + 10);
          } else {
            limite.setDate(limite.getDate() + 30);
          }

          return value <= limite;
        },
        message:
          "A validade da receita excedeu o prazo legal (30 dias ou 10 dias para antimicrobianos).",
      },
    },
    observacoes: {
      type: String,
      trim: true,
    },
    validado_por: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    validado_em: {
      type: Date,
    },
    historico_status: {
      type: [historicoStatusSchema],
      default: [],
    },
    modo_validacao: {
      type: String,
      enum: ["assincrono", "chat_ao_vivo"],
      default: "assincrono",
    },
    chat_sessao_id: {
      type: String,
      default: null,
      index: true,
    },
    chat_encerrado: {
      type: Boolean,
      default: false,
    },
    chat_encerrado_por: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    chat_encerrado_em: {
      type: Date,
      default: null,
    },
    chat_mensagens: {
      type: [chatMensagemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

prescriptionSchema.methods.adicionarHistorico = function (
  novoStatus,
  usuarioId,
  obs,
) {
  this.historico_status.push({
    status: novoStatus,
    alterado_por: usuarioId,
    observacao: obs,
  });
  this.status = novoStatus;
};

module.exports =
  mongoose.models.Prescription ||
  mongoose.model("Prescription", prescriptionSchema);
