const mongoose = require("mongoose");

const ORDER_STATUS = [
  "aguardando_pagamento",
  "confirmado",
  "em_processamento",
  "a_caminho",
  "aguardando_confirmacao_receita_farmacia",
  "entregue",
  "cancelado",
  "rejeitado",
];

const PAYMENT_STATUS = ["pendente", "processando", "aprovado", "falhou", "estornado"];

const orderItemSchema = new mongoose.Schema(
  {
    id_produto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    nome_produto: {
      type: String,
      trim: true,
    },
    preco_unitario: {
      type: Number,
      min: 0,
    },
    quantidade: {
      type: Number,
      min: 1,
    },
    subtotal: {
      type: Number,
      min: 0,
    },
    controlado: {
      type: Boolean,
      default: false,
    },
    receita_obrigatoria: {
      type: Boolean,
      default: false,
    },
    classificacao_receita: {
      type: String,
      enum: [
        "sem_receita",
        "tarja_vermelha",
        "tarja_preta",
        "antimicrobiano",
        "controlado_a",
      ],
      default: "sem_receita",
    },
    registro_anvisa: {
      type: String,
      trim: true,
    },
    id_receita: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prescription",
      default: null,
    },
    lote_consumido: {
      batchNumber: { type: String, trim: true },
      expirationDate: { type: Date },
      quantity: { type: Number, min: 0 },
      debitedAt: { type: Date },
    },
  },
  {
    _id: false,
  },
);

const enderecoEntregaSchema = new mongoose.Schema(
  {
    logradouro: {
      type: String,
      trim: true,
    },
    numero: {
      type: String,
      trim: true,
    },
    complemento: {
      type: String,
      trim: true,
    },
    bairro: {
      type: String,
      trim: true,
    },
    cidade: {
      type: String,
      trim: true,
    },
    estado: {
      type: String,
      trim: true,
      uppercase: true,
      maxLength: 2,
    },
    cep: {
      type: String,
      trim: true,
    },
  },
  {
    _id: false,
  },
);

const historicoStatusSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      trim: true,
    },
    alterado_em: {
      type: Date,
      default: Date.now,
    },
    observacao: {
      type: String,
      trim: true,
    },
  },
  {
    _id: false,
  },
);

const localizacaoAtualSchema = new mongoose.Schema(
  {
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
    atualizado_em: {
      type: Date,
    },
  },
  {
    _id: false,
  },
);

const entregadorSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      trim: true,
    },
    telefone: {
      type: String,
      trim: true,
    },
    veiculo: {
      type: String,
      trim: true,
    },
    localizacao_atual: {
      type: localizacaoAtualSchema,
      default: () => ({}),
    },
  },
  {
    _id: false,
  },
);

const sngpcDataSchema = new mongoose.Schema(
  {
    buyerName: { type: String, trim: true },
    buyerCpf: { type: String, trim: true },
    buyerRg: { type: String, trim: true },
    buyerPhone: { type: String, trim: true },
    lgpdConsentAccepted: { type: Boolean, default: false },
    doctorName: { type: String, trim: true },
    doctorCrm: { type: String, trim: true },
    doctorUf: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 2,
    },
    digitalSignatureCode: { type: String, trim: true },
    selectedBatchNumber: { type: String, trim: true },
    batchExpirationDate: { type: Date },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: { type: String, trim: true },
    quantity: { type: Number, min: 0 },
    pharmacistId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    validatedAt: { type: Date },
    traceabilityCode: { type: String, trim: true },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    id_entrega: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      default: null,
    },
    itens: {
      type: [orderItemSchema],
      default: [],
    },
    tipo_entrega: {
      type: String,
      enum: ["moto", "drone", "retirada", "drive-thru", "emergencia"],
      required: true,
    },
    endereco_entrega: {
      type: enderecoEntregaSchema,
      default: () => ({}),
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    taxa_entrega: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    cupom: {
      codigo: { type: String, trim: true },
      desconto: { type: Number, default: 0 },
      frete_gratis: { type: Boolean, default: false },
    },
    metodo_pagamento: {
      type: String,
      enum: ["pix", "cartao_credito", "cartao_debito", "dinheiro"],
      default: "pix",
    },
    status: {
      type: String,
      enum: ORDER_STATUS,
      default: "aguardando_pagamento",
      index: true,
    },
    status_pagamento: {
      type: String,
      enum: PAYMENT_STATUS,
      default: "pendente",
    },
    aprovado_farmaceutico: {
      type: Boolean,
      default: false,
    },
    modo_demo: {
      type: Boolean,
      default: false,
    },
    compliance_status: {
      type: String,
      enum: ["demo_academico", "pendente_validacao", "validado"],
      default: "demo_academico",
    },
    estoque_baixado: {
      type: Boolean,
      default: false,
    },
    observacoes_conformidade: {
      type: String,
      trim: true,
    },
    tempo_estimado_entrega: {
      type: Number,
      min: 0,
    },
    entregador: {
      type: entregadorSchema,
      default: () => ({}),
    },
    codigo_retirada: {
      type: String,
      trim: true,
    },
    qr_token: {
      type: String,
      select: false,
    },
    entregue_em: {
      type: Date,
    },
    /** Farmacêutico marcou o pedido como separado / pronto para retirada. */
    separado_em: {
      type: Date,
      default: null,
    },
    /** Cliente concluiu avaliação da farmácia neste pedido (Meus pedidos). */
    farmacia_avaliada_em: {
      type: Date,
      default: null,
    },
    avaliacao_entrega: {
      type: Number,
      min: 1,
      max: 5,
    },
    comentario_avaliacao: {
      type: String,
      trim: true,
    },
    avaliado_em: {
      type: Date,
    },
    cancelado_em: {
      type: Date,
    },
    motivo_cancelamento: {
      type: String,
      trim: true,
    },
    historico_status: {
      type: [historicoStatusSchema],
      default: [],
    },
    notificacoes_enviadas: {
      type: [String],
      default: [],
    },
    farmaceutico_dispensador: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    sngpcData: {
      type: sngpcDataSchema,
      default: null,
    },
    numero_nf: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

orderSchema.methods.adicionarHistoricoStatus = function (novoStatus, obs) {
  this.historico_status.push({
    status: novoStatus,
    observacao: obs,
  });
  this.status = novoStatus;
};

module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema);
