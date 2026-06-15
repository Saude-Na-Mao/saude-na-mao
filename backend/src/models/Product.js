const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const productBatchSchema = new mongoose.Schema(
  {
    batchNumber: {
      type: String,
      required: true,
      trim: true,
    },
    expirationDate: {
      type: Date,
      required: true,
    },
    quantity: {
      type: Number,
      min: 0,
      default: 0,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: true,
      trim: true,
    },
    principio_ativo: {
      type: String,
      trim: true,
      default: "",
    },
    tipo_produto: {
      type: String,
      enum: ["medicamento_catalogo", "medicamento_otc", "outro"],
      default: "medicamento_otc",
    },
    id_catalogo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MedicineCatalog",
      default: null,
    },
    categoria: {
      type: String,
      required: true,
      trim: true,
    },
    dosagem: {
      type: String,
      trim: true,
    },
    fabricante: {
      type: String,
      trim: true,
    },
    descricao: {
      type: String,
      trim: true,
    },
    preco: {
      type: Number,
      required: true,
      min: 0,
    },
    preco_promocional: {
      type: Number,
      min: 0,
      default: null,
    },
    estoque: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    receita_obrigatoria: {
      type: Boolean,
      default: false,
    },
    controlado: {
      type: Boolean,
      default: false,
    },
    batches: {
      type: [productBatchSchema],
      default: [],
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
    /** Prazo em dias para uso da receita após emissão (ex.: antimicrobianos). */
    validade_receita_dias: {
      type: Number,
      min: 0,
      default: null,
    },
    registro_anvisa: {
      type: String,
      trim: true,
    },
    codigo_ean: {
      type: String,
      trim: true,
    },
    forma_farmaceutica: {
      type: String,
      trim: true,
    },
    interacoes: [{
      principio_ativo: { type: String, trim: true },
      severidade: {
        type: String,
        enum: ["leve", "moderada", "grave"],
        default: "moderada",
      },
      descricao: { type: String, trim: true },
    }],
    contraindicacoes: {
      type: String,
      trim: true,
    },
    imagens: {
      type: [String],
      default: [],
    },
    id_farmacia: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pharmacy",
      required: true,
      index: true,
    },
    ativo: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

productSchema.virtual("preco_final").get(function () {
  if (
    this.preco_promocional !== null &&
    this.preco_promocional !== undefined &&
    this.preco_promocional < this.preco
  ) {
    return this.preco_promocional;
  }
  return this.preco;
});

productSchema
  .virtual("isControlled")
  .get(function () {
    return Boolean(this.controlado);
  })
  .set(function (value) {
    this.controlado = Boolean(value);
  });

productSchema.index(
  {
    nome: "text",
    principio_ativo: "text",
    categoria: "text",
    fabricante: "text",
    descricao: "text",
  },
  {
    weights: {
      nome: 10,
      principio_ativo: 8,
      categoria: 5,
      fabricante: 3,
      descricao: 1,
    },
  },
);

productSchema.index({ preco: 1 });
productSchema.index({ estoque: 1 });
productSchema.index({ controlado: 1 });
productSchema.index({ classificacao_receita: 1 });
productSchema.index({ "batches.batchNumber": 1 });

productSchema.plugin(mongoosePaginate);

module.exports =
  mongoose.models.Product || mongoose.model("Product", productSchema);
