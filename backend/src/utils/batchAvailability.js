const CONTROLLED_CLASSES = new Set(["tarja_preta", "controlado_a"]);
const SNGPC_CLASSES = new Set(["tarja_preta", "controlado_a", "antimicrobiano"]);

function isControlledProduct(product) {
  const classification = product?.classificacao_receita || "sem_receita";
  return Boolean(product?.controlado || CONTROLLED_CLASSES.has(classification));
}

function isSngpcProduct(product) {
  const classification = product?.classificacao_receita || "sem_receita";
  return Boolean(product?.controlado || SNGPC_CLASSES.has(classification));
}

function activeAvailableBatches(product) {
  const now = new Date();
  return (Array.isArray(product?.batches) ? product.batches : []).filter((batch) => {
    if (!batch || batch.active === false) return false;
    if (Number(batch.quantity || 0) <= 0) return false;
    if (batch.expirationDate && new Date(batch.expirationDate) < now) return false;
    return true;
  });
}

function getAvailableBatchQuantity(product) {
  if (!isSngpcProduct(product)) return null;
  return activeAvailableBatches(product).reduce(
    (total, batch) => total + Math.max(0, Number(batch.quantity || 0)),
    0,
  );
}

function hasAvailableBatchForQuantity(product, quantity = 1) {
  if (!isSngpcProduct(product)) return true;
  const required = Math.max(1, Number(quantity) || 1);
  return activeAvailableBatches(product).some(
    (batch) => Number(batch.quantity || 0) >= required,
  );
}

function addMonths(base, months) {
  const date = new Date(base);
  date.setMonth(date.getMonth() + months);
  return date;
}

function batchPrefix(product, productIndex = 0, pharmacyIndex = 0) {
  const base = String(product?.principio_ativo || product?.nome || "LOTE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, "X");

  return `${base}${String(productIndex + 1).padStart(2, "0")}${String(pharmacyIndex + 1).padStart(2, "0")}`;
}

function buildControlledBatches(product, stock, productIndex = 0, pharmacyIndex = 0) {
  if (!isSngpcProduct(product)) return [];

  const total = Math.max(3, Number(stock) || 3);
  const firstQty = Math.max(1, Math.floor(total * 0.35));
  const secondQty = Math.max(1, Math.floor(total * 0.4));
  const thirdQty = Math.max(1, total - firstQty - secondQty);
  const prefix = batchPrefix(product, productIndex, pharmacyIndex);
  const baseDate = new Date();

  return [
    {
      batchNumber: `${prefix}-${String(101 + productIndex).padStart(3, "0")}`,
      expirationDate: addMonths(baseDate, 7 + productIndex),
      quantity: firstQty,
      active: true,
    },
    {
      batchNumber: `${prefix}-${String(200 + pharmacyIndex).padStart(3, "0")}`,
      expirationDate: addMonths(baseDate, 14 + productIndex),
      quantity: secondQty,
      active: true,
    },
    {
      batchNumber: `${prefix}-${String(310 + productIndex + pharmacyIndex).padStart(3, "0")}`,
      expirationDate: addMonths(baseDate, 24 + productIndex),
      quantity: thirdQty,
      active: true,
    },
  ];
}

module.exports = {
  activeAvailableBatches,
  buildControlledBatches,
  getAvailableBatchQuantity,
  hasAvailableBatchForQuantity,
  isControlledProduct,
  isSngpcProduct,
};
