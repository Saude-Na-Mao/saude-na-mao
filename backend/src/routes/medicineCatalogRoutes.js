const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const medicineCatalogController = require("../controllers/medicineCatalogController");

const router = express.Router();

router.get(
  "/",
  authMiddleware.protect,
  authMiddleware.authorize(
    "dono_farmacia",
    "farmaceutico",
    "administrador",
  ),
  medicineCatalogController.searchCatalog,
);

module.exports = router;
