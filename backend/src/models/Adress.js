const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    id_usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    logradouro: {
      type: String,
      required: true,
      trim: true,
    },
    numero: {
      type: String,
      required: true,
      trim: true,
    },
    complemento: {
      type: String,
      trim: true,
      default: "",
    },
    bairro: {
      type: String,
      required: true,
      trim: true,
    },
    cidade: {
      type: String,
      required: true,
      trim: true,
    },
    estado: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxLength: 2,
    },
    cep: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function (value) {
          return /^\d{8}$/.test(value);
        },
        message: "CEP must be exactly 8 numeric digits",
      },
    },
    apelido: {
      type: String,
      trim: true,
      default: "Endereço",
    },
    padrao: {
      type: Boolean,
      default: false,
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

addressSchema.pre("save", async function () {
  if (this.padrao) {
    await this.constructor.updateMany(
      { id_usuario: this.id_usuario, _id: { $ne: this._id } },
      { padrao: false },
    );
  }
});

module.exports =
  mongoose.models.Address || mongoose.model("Address", addressSchema);
