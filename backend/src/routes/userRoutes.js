const express = require("express");
const { body, param, query, validationResult } = require("express-validator");
const authMiddleware = require("../middlewares/authMiddleware");
const userController = require("../controllers/userController");
const uploadMiddleware = require("../middlewares/uploadMiddleware");

const router = express.Router();

const addressIdValidator = param("id")
  .isMongoId()
  .withMessage("ID de endereço inválido");

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

router.get("/profile", authMiddleware.protect, userController.getProfile);

router.patch(
  "/profile",
  authMiddleware.protect,
  uploadMiddleware,
  [body("nome").optional().notEmpty().withMessage("Nome não pode ser vazio")],
  validateRequest,
  userController.updateProfile,
);

router.get("/addresses", authMiddleware.protect, userController.listAddresses);

router.post(
  "/addresses",
  authMiddleware.protect,
  [
    body("cep")
      .matches(/^\d{8}$/)
      .withMessage("CEP deve ter 8 dígitos"),
    body("numero").notEmpty().withMessage("Número não pode ser vazio"),
  ],
  validateRequest,
  userController.addAddress,
);

router.patch(
  "/addresses/:id",
  authMiddleware.protect,
  [addressIdValidator],
  validateRequest,
  userController.updateAddress,
);

router.delete(
  "/addresses/:id",
  authMiddleware.protect,
  [addressIdValidator],
  validateRequest,
  userController.deleteAddress,
);

router.patch(
  "/addresses/:id/default",
  authMiddleware.protect,
  [addressIdValidator],
  validateRequest,
  userController.setDefaultAddress,
);

router.get("/orders", authMiddleware.protect, userController.getOrderHistory);

router.get(
  "/cep/:cep",
  authMiddleware.protect,
  [
    param("cep")
      .matches(/^\d{8}$/)
      .withMessage("CEP inválido"),
  ],
  validateRequest,
  userController.searchCep,
);

// LGPD - Exportar dados pessoais (Art. 18, V)
router.get("/lgpd/export", authMiddleware.protect, userController.exportData);

// LGPD - Solicitar exclusão de conta (Art. 18, VI)
router.delete("/lgpd/delete-account", authMiddleware.protect, userController.deleteAccount);

module.exports = router;
