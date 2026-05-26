const express = require("express");
const { body, param, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");
const { audit } = require("../middlewares/auditMiddleware");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 10 : 100,
  message: {
    success: false,
    message: "Muitas tentativas, tente novamente mais tarde.",
  },
});

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
}

const passwordValidator = body("senha")
  .isLength({ min: 8 })
  .withMessage("A senha deve ter pelo menos 8 caracteres")
  .matches(/[A-Z]/)
  .withMessage("A senha deve conter uma letra maiúscula")
  .matches(/[a-z]/)
  .withMessage("A senha deve conter uma letra minúscula")
  .matches(/[0-9]/)
  .withMessage("A senha deve conter um número")
  .matches(/[^A-Za-z0-9]/)
  .withMessage("A senha deve conter um caractere especial");

const newPasswordValidator = body("novaSenha")
  .isLength({ min: 8 })
  .withMessage("A senha deve ter pelo menos 8 caracteres")
  .matches(/[A-Z]/)
  .withMessage("A senha deve conter uma letra maiúscula")
  .matches(/[a-z]/)
  .withMessage("A senha deve conter uma letra minúscula")
  .matches(/[0-9]/)
  .withMessage("A senha deve conter um número")
  .matches(/[^A-Za-z0-9]/)
  .withMessage("A senha deve conter um caractere especial");

const registerValidators = [
  body("nome").notEmpty().withMessage("Nome é obrigatório"),
  body("email").isEmail().withMessage("E-mail inválido").normalizeEmail(),
  passwordValidator,
  body("cpf")
    .optional()
    .isLength({ min: 11, max: 11 })
    .withMessage("CPF deve ter 11 dígitos")
    .isNumeric()
    .withMessage("CPF deve conter apenas números"),
];

const loginValidators = [
  body("email").isEmail().withMessage("E-mail inválido").normalizeEmail(),
  body("senha").notEmpty().withMessage("Senha é obrigatória"),
];

const googleValidators = [body("credential").notEmpty().withMessage("Token do Google é obrigatório")];

router.post(
  "/register",
  authLimiter,
  ...registerValidators,
  validateRequest,
  audit("USER_CREATED", "User"),
  authController.register
);

router.post(
  "/login",
  authLimiter,
  ...loginValidators,
  validateRequest,
  audit("LOGIN", "User"),
  authController.login
);

router.post("/refresh-token", authController.refreshToken);

router.post("/logout", audit("LOGOUT", "User"), authController.logout);

router.post(
  "/google",
  authLimiter,
  ...googleValidators,
  validateRequest,
  audit("GOOGLE_LOGIN", "User"),
  authController.googleAuth
);

router.post(
  "/forgot-password",
  [body("email").isEmail().withMessage("E-mail inválido").normalizeEmail()],
  validateRequest,
  authController.forgotPassword,
);

router.post(
  "/reset-password/:token",
  [newPasswordValidator],
  validateRequest,
  authController.resetPassword,
);

module.exports = router;
