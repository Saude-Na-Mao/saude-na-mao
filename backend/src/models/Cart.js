const mongoose = require("mongoose");

const CART_EXPIRATION_MS = 48 * 60 * 60 * 1000;

const cartItemSchema = new mongoose.Schema(
  {
    id_produto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    nome_produto: {
      type: String,
      trim: true,
    },
    preco_unitario: {
      type: Number,
      required: true,
      min: 0,
    },
    quantidade: {
      type: Number,
      required: true,
      min: 1,
    },
    subtotal: {
      type: Number,
      default: 0,
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
    id_receita: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prescription",
      default: null,
    },
    id_farmacia: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pharmacy",
      required: true,
    },
  },
  {
    _id: false,
  },
);

const cartSchema = new mongoose.Schema(
  {
    id_usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    itens: {
      type: [cartItemSchema],
      default: [],
    },
    id_farmacia: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pharmacy",
      default: null,
    },
    tipo_entrega: {
      type: String,
      enum: ["moto", "drone", "retirada", "drive-thru"],
      default: "moto",
    },
    id_endereco_entrega: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      default: null,
    },
    subtotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxa_entrega: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      default: 0,
      min: 0,
    },
    expira_em: {
      type: Date,
      default: () => new Date(Date.now() + CART_EXPIRATION_MS),
    },
    ativo: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

cartSchema.methods.recalcularTotais = function () {
  this.itens.forEach((item) => {
    item.subtotal = item.preco_unitario * item.quantidade;
  });

  this.subtotal = this.itens.reduce(
    (acumulado, item) => acumulado + item.subtotal,
    0,
  );
  this.total = this.subtotal + this.taxa_entrega;
};

cartSchema.methods.renovarExpiracao = function () {
  this.expira_em = new Date(Date.now() + CART_EXPIRATION_MS);
};

function normalizeObjectId(value) {
  if (!value) {
    return null;
  }

  if (value._id) {
    return String(value._id);
  }

  return String(value);
}

cartSchema.pre("validate", function () {
  if (!this.itens.length) {
    this.id_farmacia = null;
    return;
  }

  const farmaciaId = normalizeObjectId(this.itens[0].id_farmacia);
  const possuiFarmaciasDiferentes = this.itens.some(
    (item) => normalizeObjectId(item.id_farmacia) !== farmaciaId,
  );

  if (possuiFarmaciasDiferentes) {
    const validationError = new mongoose.Error.ValidationError(this);
    validationError.addError(
      "itens",
      new mongoose.Error.ValidatorError({
        path: "itens",
        message: "Todos os itens do carrinho devem pertencer a mesma farmacia.",
      }),
    );
    throw validationError;
  }

  if (this.id_farmacia && normalizeObjectId(this.id_farmacia) !== farmaciaId) {
    const validationError = new mongoose.Error.ValidationError(this);
    validationError.addError(
      "id_farmacia",
      new mongoose.Error.ValidatorError({
        path: "id_farmacia",
        message: "A farmacia do carrinho deve ser a mesma dos itens.",
      }),
    );
    throw validationError;
  }

  this.id_farmacia = this.itens[0].id_farmacia._id || this.itens[0].id_farmacia;
});

module.exports = mongoose.models.Cart || mongoose.model("Cart", cartSchema);
