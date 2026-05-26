const express = require("express");
const paymentController = require("../controllers/paymentController");
const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/initiate", protect, paymentController.initiatePayment);
router.post("/order/:orderId/test-confirm", protect, paymentController.confirmTestPayment);
router.get("/order/:orderId", protect, paymentController.getPaymentStatus);
router.post("/order/:orderId/refund", protect, paymentController.requestRefund);
router.get("/saved-methods", protect, paymentController.getSavedPaymentMethods);

router.post(
  "/webhook/mercadopago",
  express.raw({ type: "application/json" }),
  paymentController.handleMercadoPagoWebhook,
);

module.exports = router;
