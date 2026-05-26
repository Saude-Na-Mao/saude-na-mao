const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const PRESCRIPTION_CLASSIFICATIONS = [
  "tarja_vermelha",
  "tarja_preta",
  "antimicrobiano",
  "controlado_a",
];

const medicineCatalogSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true, trim: true },
    principio_ativo: { type: String, required: true, trim: true },
    categoria: { type: String, required: true, trim: true },
    dosagem: { type: String, trim: true },
    fabricante: { type: String, trim: true },
    forma_farmaceutica: { type: String, trim: true },
    descricao: { type: String, trim: true },
    classificacao_receita: {
      type: String,
      enum: PRESCRIPTION_CLASSIFICATIONS,
      required: true,
    },
    receita_obrigatoria: { type: Boolean, default: true },
    controlado: { type: Boolean, default: false },
    validade_receita_dias: { type: Number, min: 0, default: null },
    registro_anvisa: { type: String, trim: true },
    codigo_ean: { type: String, trim: true },
    imagem_url: { type: String, trim: true },
    preco_sugerido: { type: Number, min: 0, default: null },
    ativo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

medicineCatalogSchema.index(
  { nome: "text", principio_ativo: "text", categoria: "text" },
  {
    weights: { nome: 10, principio_ativo: 8, categoria: 4 },
  },
);

medicineCatalogSchema.plugin(mongoosePaginate);

module.exports =
  mongoose.models.MedicineCatalog ||
  mongoose.model("MedicineCatalog", medicineCatalogSchema);

module.exports.PRESCRIPTION_CLASSIFICATIONS = PRESCRIPTION_CLASSIFICATIONS;
