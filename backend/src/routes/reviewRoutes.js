const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const {
  protect,
  authorize,
  assertPharmacyStaffAccess,
} = require("../middlewares/authMiddleware");

router.get("/pharmacy/:pharmacyId", reviewController.getReviews);

router.post("/pharmacy/:pharmacyId", protect, reviewController.createReview);

router.patch(
  "/pharmacy/:pharmacyId/reviews/:reviewId/reply",
  protect,
  authorize("dono_farmacia", "farmaceutico", "administrador"),
  assertPharmacyStaffAccess("pharmacyId"),
  reviewController.replyToReview,
);

module.exports = router;
