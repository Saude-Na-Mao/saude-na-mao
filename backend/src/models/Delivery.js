const mongoose = require("mongoose");

const DELIVERY_STATUS = [
  "disponivel",
  "aceita",
  "coletando",
  "coletada",
  "em_transito",
  "entregue",
  "cancelada",
];

const historicoSchema = new mongoose.Schema(
  {
    status: { type: String, enum: DELIVERY_STATUS, required: true },
    alterado_em: { type: Date, default: Date.now },
    observacao: { type: String, trim: true },
    localizacao: {
      latitude: Number,
      longitude: Number,
    },
  },
  { _id: false },
);

const deliverySchema = new mongoose.Schema(
  {
    id_pedido: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    id_entregador: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    id_farmacia: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pharmacy",
      required: true,
    },
    id_cliente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: DELIVERY_STATUS,
      default: "disponivel",
      index: true,
    },
    endereco_coleta: {
      logradouro: { type: String, trim: true },
      numero: { type: String, trim: true },
      complemento: { type: String, trim: true },
      bairro: { type: String, trim: true },
      cidade: { type: String, trim: true },
      estado: { type: String, trim: true, uppercase: true, maxLength: 2 },
      cep: { type: String, trim: true },
      location: {
        type: { type: String, enum: ["Point"] },
        coordinates: { type: [Number] },
      },
    },
    endereco_entrega: {
      logradouro: { type: String, trim: true },
      numero: { type: String, trim: true },
      complemento: { type: String, trim: true },
      bairro: { type: String, trim: true },
      cidade: { type: String, trim: true },
      estado: { type: String, trim: true, uppercase: true, maxLength: 2 },
      cep: { type: String, trim: true },
      location: {
        type: { type: String, enum: ["Point"] },
        coordinates: { type: [Number] },
      },
    },
    distancia_km: {
      type: Number,
      min: 0,
    },
    tempo_estimado_min: {
      type: Number,
      min: 0,
    },
    valor_entrega: {
      type: Number,
      min: 0,
      default: 0,
    },
    foto_comprovante: {
      type: String,
      default: null,
    },
    codigo_confirmacao: {
      type: String,
      trim: true,
    },
    /** Liberada pela farmácia (farmacêutico marcou "separado / pronto para retirada"). */
    pronto_para_retirada: {
      type: Boolean,
      default: false,
    },
    separado_em: {
      type: Date,
      default: null,
    },
    /** Código de 8 dígitos que o entregador informa ao farmacêutico para liberar a coleta. */
    codigo_coleta: {
      type: String,
      trim: true,
    },
    coleta_confirmada_em: {
      type: Date,
      default: null,
    },
    /** Entregador marcou que chegou no endereço do cliente (simulação, sem GPS). */
    entregador_chegou_em: {
      type: Date,
      default: null,
    },
    /** Passos da rota simulada exibidos ao entregador após liberação da coleta. */
    rota_simulada: {
      type: [String],
      default: [],
    },
    /** Código confirmado com o cliente para pedidos que exigem finalização SNGPC na farmácia. */
    receita_fisica_cliente_confirmada_em: {
      type: Date,
      default: null,
    },
    /** Entregador confirmou código com cliente; aguarda farmacêutico finalizar a baixa digital do lote. */
    receita_aguardando_confirmacao_farmacia_em: {
      type: Date,
      default: null,
    },
    aceita_em: { type: Date },
    coletada_em: { type: Date },
    entregue_em: { type: Date },
    cancelada_em: { type: Date },
    motivo_cancelamento: { type: String, trim: true },
    avaliacao_cliente: {
      nota: { type: Number, min: 1, max: 5 },
      comentario: { type: String, trim: true },
      avaliado_em: { type: Date },
    },
    avaliacao_entregador: {
      nota: { type: Number, min: 1, max: 5 },
      comentario: { type: String, trim: true },
      avaliado_em: { type: Date },
    },
    historico_status: {
      type: [historicoSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

deliverySchema.index(
  { "endereco_coleta.location": "2dsphere" },
  { partialFilterExpression: { "endereco_coleta.location.coordinates": { $exists: true } } },
);
deliverySchema.index(
  { "endereco_entrega.location": "2dsphere" },
  { partialFilterExpression: { "endereco_entrega.location.coordinates": { $exists: true } } },
);

deliverySchema.methods.adicionarHistorico = function (novoStatus, obs, loc) {
  this.historico_status.push({
    status: novoStatus,
    observacao: obs,
    localizacao: loc || undefined,
  });
  this.status = novoStatus;
};

module.exports =
  mongoose.models.Delivery || mongoose.model("Delivery", deliverySchema);
