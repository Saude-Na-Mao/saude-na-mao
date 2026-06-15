const express = require("express");
const deliveryController = require("../controllers/deliveryController");
const { protect, authorize } = require("../middlewares/authMiddleware");
const { audit } = require("../middlewares/auditMiddleware");

const router = express.Router();

// === Rotas do entregador ===
router.get(
  "/available",
  protect,
  authorize("entregador"),
  deliveryController.getAvailableDeliveries,
);

router.get(
  "/my",
  protect,
  authorize("entregador"),
  deliveryController.getMyDeliveries,
);

router.patch(
  "/me/availability",
  protect,
  authorize("entregador"),
  deliveryController.toggleAvailability,
);

router.get(
  "/me/earnings",
  protect,
  authorize("entregador"),
  deliveryController.getDriverEarnings,
);

router.get(
  "/me/history",
  protect,
  authorize("entregador"),
  deliveryController.getDriverHistory,
);

router.post(
  "/:id/accept",
  protect,
  authorize("entregador"),
  deliveryController.acceptDelivery,
  audit("DELIVERY_ACCEPTED", "Delivery"),
);

router.post(
  "/:id/collect",
  protect,
  authorize("entregador"),
  deliveryController.collectAtPharmacy,
  audit("DELIVERY_COLLECTED", "Delivery"),
);

router.post(
  "/:id/arrived",
  protect,
  authorize("entregador"),
  deliveryController.markArrivedAtCustomer,
  audit("DELIVERY_ARRIVED", "Delivery"),
);

router.post(
  "/:id/receipt-at-customer",
  protect,
  authorize("entregador"),
  deliveryController.confirmReceiptAtCustomer,
  audit("DELIVERY_RECEIPT_AT_CUSTOMER", "Delivery"),
);

router.patch(
  "/:id/status",
  protect,
  authorize("entregador", "administrador"),
  deliveryController.updateStatus,
  audit("DELIVERY_STATUS_UPDATED", "Delivery"),
);

router.patch(
  "/:id/location",
  protect,
  authorize("entregador"),
  deliveryController.updateLocation,
);

router.post(
  "/:id/confirm",
  protect,
  authorize("entregador"),
  deliveryController.confirmDelivery,
  audit("DELIVERY_CONFIRMED", "Delivery"),
);

// === Avaliações ===
router.post(
  "/:id/rate/client",
  protect,
  authorize("cliente"),
  deliveryController.rateByClient,
);

router.post(
  "/:id/rate/driver",
  protect,
  authorize("entregador"),
  deliveryController.rateByDriver,
);

// === Farmácia / Admin ===
router.post(
  "/",
  protect,
  authorize("dono_farmacia", "farmaceutico", "administrador"),
  deliveryController.createDelivery,
  audit("DELIVERY_CREATED", "Delivery"),
);

router.post(
  "/:id/cancel",
  protect,
  authorize("entregador", "dono_farmacia", "administrador"),
  deliveryController.cancelDelivery,
  audit("DELIVERY_CANCELLED", "Delivery"),
);

// === Detalhes (qualquer autenticado) ===
router.get("/:id", protect, deliveryController.getDeliveryById);

module.exports = router;
