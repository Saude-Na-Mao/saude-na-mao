const express = require("express");
const { param, body, validationResult, query } = require("express-validator");
const authMiddleware = require("../middlewares/authMiddleware");
const trackingController = require("../controllers/trackingController");
const multer = require("multer");
const path = require("path");

const router = express.Router();

// Configurar multer para upload de fotos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/tracking/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não permitido"));
    }
  },
});

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// POST - Iniciar rastreamento
router.post(
  "/",
  authMiddleware.protect,
  authMiddleware.authorize("dono_farmacia", "administrador"),
  [
    body("medicamento_id")
      .isMongoId()
      .withMessage("medicamento_id inválido"),
    body("lote")
      .trim()
      .notEmpty()
      .withMessage("lote é obrigatório"),
    body("cliente_id")
      .isMongoId()
      .withMessage("cliente_id inválido"),
  ],
  validateRequest,
  trackingController.iniciarRastreamento
);

// POST - Adicionar etapa ao rastreamento
router.post(
  "/:id/etapa",
  authMiddleware.protect,
  [
    param("id").isMongoId().withMessage("ID inválido"),
    body("tipo")
      .isIn(["SAIDA_FARMACIA", "EM_TRANSITO", "ENTREGA", "ENTREGUE"])
      .withMessage("tipo de etapa inválido"),
    body("localizacao.lat")
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage("latitude inválida"),
    body("localizacao.lng")
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage("longitude inválida"),
  ],
  validateRequest,
  upload.single("foto"),
  trackingController.adicionarEtapa
);

// GET - Obter rastreamento específico
router.get(
  "/:id",
  authMiddleware.protect,
  [param("id").isMongoId().withMessage("ID inválido")],
  validateRequest,
  trackingController.obterRastreamento
);

// GET - Gerar QR Code
router.get(
  "/:id/qr",
  authMiddleware.protect,
  [param("id").isMongoId().withMessage("ID inválido")],
  validateRequest,
  trackingController.gerarQRCode
);

// GET - Obter histórico de um medicamento
router.get(
  "/medicamento/:id/history",
  [
    param("id").isMongoId().withMessage("ID inválido"),
    query("lote").optional().trim(),
  ],
  validateRequest,
  trackingController.obterHistorico
);

// GET - Meus rastreamentos (cliente)
router.get(
  "/meus/rastreamentos",
  authMiddleware.protect,
  [
    query("page").optional().isInt({ min: 1 }).withMessage("página inválida"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("limite inválido"),
  ],
  validateRequest,
  trackingController.obterMeusRastreamentos
);

// GET - Rastreamentos da farmácia
router.get(
  "/farmacia/rastreamentos",
  authMiddleware.protect,
  authMiddleware.authorize("dono_farmacia", "administrador"),
  [
    query("page").optional().isInt({ min: 1 }).withMessage("página inválida"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("limite inválido"),
  ],
  validateRequest,
  trackingController.obterRastreamentosFarmacia
);

// POST - Verificar autenticidade
router.post(
  "/:id/verify",
  authMiddleware.protect,
  [param("id").isMongoId().withMessage("ID inválido")],
  validateRequest,
  trackingController.verificarAutenticidade
);

// GET - Estatísticas
router.get(
  "/",
  authMiddleware.protect,
  trackingController.obterEstatisticas
);

// POST - Cancelar rastreamento
router.post(
  "/:id/cancelar",
  authMiddleware.protect,
  [
    param("id").isMongoId().withMessage("ID inválido"),
    body("motivo")
      .trim()
      .notEmpty()
      .withMessage("motivo é obrigatório"),
  ],
  validateRequest,
  trackingController.cancelarRastreamento
);

module.exports = router;
