const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const couponController = require("../controllers/couponController");

const router = express.Router();

router.get("/ativos", couponController.listActiveCoupons);

router.post("/validar", couponController.validateCoupon);

router.get("/", protect, couponController.listCoupons);

router.post("/", protect, couponController.createCoupon);

module.exports = router;
