/**
 * Garante que TODO produto que exige lote (SNGPC: tarja_preta, controlado_a,
 * antimicrobiano) em TODAS as farmácias tenha estoque >= MIN e pelo menos 3
 * lotes ativos, com validade futura, somando >= MIN unidades.
 *
 * Idempotente. Uso (na pasta backend): node src/scripts/fixControlledStockAll.js
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const Product = require("../models/Product");
const { isSngpcProduct } = require("../utils/batchAvailability");

const MIN = 12; // "número considerável" pedido pelo cliente (>10)

function addMonths(base, months) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

function prefix(p) {
  return String(p.principio_ativo || p.nome || "LOTE")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, "X");
}

function activeQty(product) {
  const now = new Date();
  return (Array.isArray(product.batches) ? product.batches : [])
    .filter(
      (b) =>
        b &&
        b.active !== false &&
        (!b.expirationDate || new Date(b.expirationDate) > now),
    )
    .reduce((t, b) => t + Math.max(0, Number(b.quantity || 0)), 0);
}

function buildBatches(product) {
  const px = prefix(product);
  const now = new Date();
  return [
    { batchNumber: `${px}-101`, expirationDate: addMonths(now, 6), quantity: 20, receivedAt: now, active: true },
    { batchNumber: `${px}-102`, expirationDate: addMonths(now, 14), quantity: 18, receivedAt: now, active: true },
    { batchNumber: `${px}-103`, expirationDate: addMonths(now, 22), quantity: 15, receivedAt: now, active: true },
  ];
}

function uri() {
  return (
    (process.env.MONGO_URI && process.env.MONGO_URI.trim()) ||
    (process.env.MONGODB_URI && process.env.MONGODB_URI.trim()) ||
    "mongodb://localhost:27017/saude-na-mao"
  );
}

(async () => {
  await mongoose.connect(uri());
  const all = await Product.find({});
  const sngpc = all.filter((p) => isSngpcProduct(p));
  let semLote = 0;
  let semEstoque = 0;
  let corrigidos = 0;

  for (const p of sngpc) {
    const qty = activeQty(p);
    const precisaLote = qty < MIN || !Array.isArray(p.batches) || p.batches.length < 3;
    const precisaEstoque = Number(p.estoque || 0) < MIN;
    if (qty < MIN) semLote += 1;
    if (precisaEstoque) semEstoque += 1;

    if (precisaLote || precisaEstoque) {
      if (precisaLote) p.batches = buildBatches(p);
      const loteTotal = (p.batches || []).reduce((t, b) => t + Number(b.quantity || 0), 0);
      p.estoque = Math.max(Number(p.estoque || 0), loteTotal, MIN);
      await p.save();
      corrigidos += 1;
    }
  }

  console.log(`SNGPC total: ${sngpc.length}`);
  console.log(`  sem lote válido (<${MIN}un): ${semLote}`);
  console.log(`  sem estoque (<${MIN}): ${semEstoque}`);
  console.log(`  corrigidos agora: ${corrigidos}`);

  // OTC com receita (tarja_vermelha) e demais: garante estoque mínimo também.
  const naoSngpc = all.filter((p) => !isSngpcProduct(p));
  let otcCorrigidos = 0;
  for (const p of naoSngpc) {
    if (Number(p.estoque || 0) < MIN) {
      p.estoque = MIN + 8;
      await p.save();
      otcCorrigidos += 1;
    }
  }
  console.log(`Não-SNGPC com estoque ajustado: ${otcCorrigidos}`);

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
