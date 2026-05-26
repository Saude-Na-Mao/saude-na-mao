/**
 * Atribui tipo_produto em produtos legados (one-off).
 * Uso: node src/scripts/migrateProductTipo.js
 */
const mongoose = require("mongoose");
const { loadBackendEnv } = require("../config/envBootstrap");
loadBackendEnv();

const Product = require("../models/Product");
const MedicineCatalog = require("../models/MedicineCatalog");

const DEFAULT_MONGO_URI = "mongodb://127.0.0.1:27017/saude-na-mao";
const PRESCRIPTION = new Set([
  "tarja_vermelha",
  "tarja_preta",
  "antimicrobiano",
  "controlado_a",
]);

async function main() {
  const uri = process.env.MONGO_URI || DEFAULT_MONGO_URI;
  await mongoose.connect(uri);
  console.log("Conectado ao MongoDB");

  const catalog = await MedicineCatalog.find({ ativo: true }).lean();
  const catalogByNome = new Map(
    catalog.map((c) => [String(c.nome).trim().toLowerCase(), c]),
  );

  const products = await Product.find({});
  let updated = 0;

  for (const p of products) {
    if (p.tipo_produto && p.tipo_produto !== "medicamento_otc") continue;

    const classificacao = p.classificacao_receita || "sem_receita";
    let tipo = p.tipo_produto;
    let id_catalogo = p.id_catalogo;

    if (PRESCRIPTION.has(classificacao)) {
      const match = catalogByNome.get(String(p.nome).trim().toLowerCase());
      if (match) {
        tipo = "medicamento_catalogo";
        id_catalogo = match._id;
      } else {
        tipo = "medicamento_otc";
      }
    } else if (
      !p.principio_ativo ||
      p.principio_ativo === "N/A" ||
      ["Higiene", "Cosmético", "Fralda", "Suplemento", "Equipamento"].some((k) =>
        String(p.categoria || "").toLowerCase().includes(k.toLowerCase()),
      )
    ) {
      tipo = "outro";
    } else if (classificacao === "sem_receita") {
      tipo = "medicamento_otc";
    } else {
      tipo = "medicamento_otc";
    }

    if (tipo !== p.tipo_produto || String(id_catalogo || "") !== String(p.id_catalogo || "")) {
      await Product.updateOne(
        { _id: p._id },
        { $set: { tipo_produto: tipo, id_catalogo: id_catalogo || null } },
      );
      updated += 1;
    }
  }

  console.log(`Produtos atualizados: ${updated} de ${products.length}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
