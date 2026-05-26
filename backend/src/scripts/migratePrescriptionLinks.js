const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "../../.env"),
});

const mongoose = require("mongoose");
const Order = require("../models/Order");
const Prescription = require("../models/Prescription");

async function migrar() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("Defina MONGO_URI (ou MONGODB_URI) no .env da pasta backend.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Conectado. Iniciando migração...");

  const pedidos = await Order.find({
    status: { $in: ["em_processamento", "a_caminho", "entregue"] },
    "itens.id_receita": { $exists: true, $ne: null },
  }).lean();

  let vinculados = 0;
  for (const pedido of pedidos) {
    for (const item of pedido.itens || []) {
      if (!item.id_receita) continue;
      await Prescription.findByIdAndUpdate(item.id_receita, {
        $set: {
          id_pedido_utilizado: pedido._id,
          id_pedido_vinculado: pedido._id,
          disponivel_para_novo_pedido: false,
          consumida: true,
        },
      });
      vinculados++;
    }
  }

  console.log(`Migração concluída. ${vinculados} receitas atualizadas com vínculo ao pedido.`);
  await mongoose.disconnect();
  process.exit(0);
}

migrar().catch((err) => {
  console.error("Erro na migração:", err);
  process.exit(1);
});
