const express = require("express");
const faqController = require("../controllers/faqController");
const { protect, authorize } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/", faqController.listFAQs);
router.get("/search", faqController.searchFAQs);
router.get("/populares", faqController.getPopularFAQs);
router.get("/categorias", faqController.getFAQsByCategory);
router.get("/:id", faqController.getFAQById);
router.post("/:id/rate", faqController.rateFAQ);

router.post("/", protect, authorize("administrador"), faqController.createFAQ);

router.patch(
  "/:id",
  protect,
  authorize("administrador"),
  faqController.updateFAQ,
);

router.delete(
  "/:id",
  protect,
  authorize("administrador"),
  faqController.deleteFAQ,
);

module.exports = router;
