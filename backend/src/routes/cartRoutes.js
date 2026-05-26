const express = require("express");
const cartController = require("../controllers/cartController");
const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/", protect, cartController.getCart);
router.post("/items", protect, cartController.addItem);
router.delete("/items/:productId", protect, cartController.removeItem);
router.patch("/items/:productId", protect, cartController.updateItemQuantity);
router.delete("/clear", protect, cartController.clearCart);
router.post("/delivery", protect, cartController.setDeliveryOptions);
router.get("/delivery/options", protect, cartController.getDeliveryOptions);
router.post("/checkout", protect, cartController.checkout);
router.post("/abandon", protect, cartController.abandonCart);

module.exports = router;
