const DISPATCHABLE_ORDER_STATUS = ["em_processamento"];
const NON_DISPATCH_TYPES = ["retirada", "drive-thru"];

function isOrderEligibleForDispatch(order) {
  if (!order) return false;
  if (!DISPATCHABLE_ORDER_STATUS.includes(order.status)) return false;
  if (order.aprovado_farmaceutico !== true) return false;
  if (order.status_pagamento !== "aprovado") return false;
  if (NON_DISPATCH_TYPES.includes(order.tipo_entrega)) return false;
  return true;
}

function buildEligibleOrderDispatchFilter() {
  return {
    status: { $in: DISPATCHABLE_ORDER_STATUS },
    aprovado_farmaceutico: true,
    status_pagamento: "aprovado",
    tipo_entrega: { $nin: NON_DISPATCH_TYPES },
  };
}

/** Pedidos com receita em entrega no endereço: após código do cliente, encerra só na farmácia. */
function orderNeedsPharmacyReceiptReturn(order) {
  if (!order) return false;
  if (NON_DISPATCH_TYPES.includes(order.tipo_entrega)) return false;
  return (order.itens || []).some(
    (i) => i.id_receita || i.receita_obrigatoria || i.controlado,
  );
}

module.exports = {
  DISPATCHABLE_ORDER_STATUS,
  NON_DISPATCH_TYPES,
  isOrderEligibleForDispatch,
  buildEligibleOrderDispatchFilter,
  orderNeedsPharmacyReceiptReturn,
};
