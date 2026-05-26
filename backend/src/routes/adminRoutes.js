const express = require("express");
const adminController = require("../controllers/adminController");
const medicineCatalogController = require("../controllers/medicineCatalogController");
const { protect, authorize } = require("../middlewares/authMiddleware");
const { audit } = require("../middlewares/auditMiddleware");

const router = express.Router();

router.use(protect);
router.use(authorize("administrador"));

router.get("/dashboard", adminController.getDashboard);
router.get("/reports/revenue", adminController.getRevenueReport);
router.get("/reports/top-products", adminController.getTopProducts);
router.get("/reports/top-pharmacies", adminController.getTopPharmacies);

router.get("/users", adminController.listUsers);
router.get("/users/:userId", adminController.getUserDetails);
router.patch(
  "/users/:userId/status",
  adminController.toggleUserStatus,
  audit("USER_STATUS_CHANGED", "User"),
);
router.patch(
  "/users/:userId/role",
  adminController.changeUserRole,
  audit("USER_ROLE_CHANGED", "User"),
);

router.get("/pharmacies", adminController.listPharmacies);
router.post(
  "/pharmacies",
  adminController.createPharmacy,
  audit("PHARMACY_CREATED", "Pharmacy"),
);
router.patch(
  "/pharmacies/:id",
  adminController.updatePharmacy,
  audit("PHARMACY_UPDATED", "Pharmacy"),
);
router.patch(
  "/pharmacies/:id/status",
  adminController.togglePharmacyStatus,
  audit("PHARMACY_STATUS_CHANGED", "Pharmacy"),
);

router.get(
  "/medicine-catalog",
  medicineCatalogController.listAdmin,
);
router.post(
  "/medicine-catalog",
  medicineCatalogController.createAdmin,
  audit("MEDICINE_CATALOG_CREATED", "MedicineCatalog"),
);
router.patch(
  "/medicine-catalog/:id",
  medicineCatalogController.updateAdmin,
  audit("MEDICINE_CATALOG_UPDATED", "MedicineCatalog"),
);

router.get("/products", adminController.listProducts);
router.post(
  "/products",
  adminController.createProduct,
  audit("PRODUCT_CREATED", "Product"),
);
router.patch(
  "/products/:id",
  adminController.updateProduct,
  audit("PRODUCT_UPDATED", "Product"),
);
router.patch(
  "/products/:id/status",
  adminController.toggleProductStatus,
  audit("PRODUCT_STATUS_CHANGED", "Product"),
);

router.get("/audit", adminController.getAuditLogs);
router.get("/audit/user/:userId", adminController.getAuditLogsByUser);
router.get(
  "/audit/resource/:recurso/:recurso_id",
  adminController.getAuditLogsByResource,
);

router.get("/support/stats", adminController.getSupportStats);

module.exports = router;
