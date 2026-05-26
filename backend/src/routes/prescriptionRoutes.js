const express = require("express");
const prescriptionController = require("../controllers/prescriptionController");
const authMiddleware = require("../middlewares/authMiddleware");
const { audit } = require("../middlewares/auditMiddleware");
const {
  upload,
  handleMulterError,
} = require("../middlewares/uploadPrescription");

const router = express.Router();

router.post(
  "/upload",
  authMiddleware.protect,
  upload,
  handleMulterError,
  prescriptionController.uploadPrescription,
  audit("PRESCRIPTION_UPLOADED", "Prescription"),
);

router.get(
  "/admin/pending",
  authMiddleware.protect,
  authMiddleware.authorize("farmaceutico", "administrador"),
  prescriptionController.getPendingPrescriptions,
);

router.get(
  "/admin/all",
  authMiddleware.protect,
  authMiddleware.authorize(
    "farmaceutico",
    "dono_farmacia",
    "administrador",
  ),
  prescriptionController.getAllPrescriptions,
);

// TEMPORÁRIO — endpoint de diagnóstico (remover após confirmar correção)
router.get(
  "/debug/all",
  authMiddleware.protect,
  authMiddleware.authorize("farmaceutico", "administrador"),
  prescriptionController.debugAllPrescriptions,
);

router.patch(
  "/admin/:id/validate",
  authMiddleware.protect,
  authMiddleware.authorize("farmaceutico", "administrador"),
  prescriptionController.validatePrescription,
  audit("PRESCRIPTION_VALIDATED", "Prescription"),
);

router.get(
  "/",
  authMiddleware.protect,
  prescriptionController.getUserPrescriptions,
);

router.patch(
  "/fcm-token",
  authMiddleware.protect,
  prescriptionController.updateFcmToken,
);

router.get(
  "/check-availability/:prescriptionId",
  authMiddleware.protect,
  prescriptionController.checkPrescriptionAvailability,
);

// Endpoints de chat ao vivo de receita
router.get(
  "/:id/chat",
  authMiddleware.protect,
  prescriptionController.getPrescriptionForChat,
);

router.post(
  "/:id/chat/message",
  authMiddleware.protect,
  prescriptionController.postChatMessage,
);

router.post(
  "/:id/chat/close",
  authMiddleware.protect,
  prescriptionController.closeChat,
);

router.post(
  "/:id/chat/reupload",
  authMiddleware.protect,
  upload,
  handleMulterError,
  prescriptionController.reuploadChatImage,
);

router.get(
  "/:id",
  authMiddleware.protect,
  prescriptionController.getPrescriptionById,
);

router.get(
  "/:id/receita",
  authMiddleware.protect,
  prescriptionController.getReceitaDigital,
);

router.delete(
  "/:id/cancel",
  authMiddleware.protect,
  prescriptionController.cancelPrescription,
);

module.exports = router;
