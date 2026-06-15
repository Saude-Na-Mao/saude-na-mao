const mongoose = require("mongoose");
const connectDB = require("../config/database");
const Product = require("../models/Product");
const { isSngpcProduct } = require("../utils/batchAvailability");

function rint(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addMonths(base, months) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

function batchPrefix(product) {
  return String(product.principio_ativo || product.nome || "LOTE")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, "X");
}

function buildRandomBatches(product) {
  const prefix = batchPrefix(product);
  const now = new Date();
  const numBatches = rint(2, 4);
  const batches = [];
  for (let i = 0; i < numBatches; i++) {
    // validades distintas e crescentes (favorece FEFO), sempre no futuro
    const months = rint(4, 9) + i * rint(5, 9);
    batches.push({
      batchNumber: `${prefix}-${rint(100, 999)}`,
      expirationDate: addMonths(now, months),
      quantity: rint(8, 40),
      receivedAt: now,
      active: true,
    });
  }
  return batches;
}

(async () => {
  await connectDB();
  const products = await Product.find({});
  const sngpc = products.filter((p) => isSngpcProduct(p));
  let updated = 0;
  for (const p of sngpc) {
    const batches = buildRandomBatches(p);
    p.batches = batches;
    p.estoque = batches.reduce((s, b) => s + b.quantity, 0);
    await p.save();
    updated++;
    const qts = batches
      .map((b) => `${b.quantity}un/${b.expirationDate.toISOString().slice(0, 7)}`)
      .join(", ");
    console.log(`OK ${p.nome} [${p.classificacao_receita}] estoque=${p.estoque} | ${qts}`);
  }
  console.log(`\nTotal atualizados: ${updated}`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
