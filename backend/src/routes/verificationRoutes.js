/**
 * Rotas de Verificação de Proprietário de Farmácia
 * Processa documentos e valida propriedade
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRoles, requireVerifiedPharmacyOwner } = require('../middlewares/auth');
const { ROLES } = require('../constants/roles');
const User = require('../models/User');

/**
 * POST /api/verification/submit-document
 * Submeter documento de verificação de proprietário
 * Requer: CPF/CNPJ, documento (imagem/PDF), comprovante de endereço
 */
router.post('/submit-document', authenticate, async (req, res) => {
  try {
    const { documentType, documentFile, comprovante } = req.body;
    const userId = req.user.id;

    // Validar tipo de documento
    const validDocuments = ['cpf', 'cnpj', 'rg', 'residency_proof'];
    if (!validDocuments.includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de documento inválido',
        validTypes: validDocuments,
      });
    }

    // Atualizar usuário com informações de documento
    const user = await User.findByIdAndUpdate(
      userId,
      {
        isPharmacyOwner: true,
        documentVerificationStatus: 'pending',
        documentVerification: {
          documentType,
          documentUrl: documentFile, // Em produção, salvar em S3/Cloudinary
          submittedAt: new Date(),
        },
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Documento enviado com sucesso. Aguarde a verificação (máximo 24h).',
      verificationStatus: 'pending',
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao submeter documento',
      error: error.message,
    });
  }
});

/**
 * GET /api/verification/status
 * Obter status de verificação do usuário
 */
router.get('/status', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('documentVerificationStatus isPharmacyOwnerVerified documentVerification');

    res.json({
      success: true,
      verificationStatus: user.documentVerificationStatus,
      isVerified: user.isPharmacyOwnerVerified,
      submittedAt: user.documentVerification?.submittedAt,
      rejectionReason: user.documentVerification?.rejectionReason,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao obter status',
      error: error.message,
    });
  }
});

/**
 * POST /api/verification/approve/:userId
 * ADMIN ONLY: Aprovar verificação de proprietário
 */
router.post('/approve/:userId', authenticate, requireRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        isPharmacyOwnerVerified: true,
        documentVerificationStatus: 'approved',
        'documentVerification.verifiedAt': new Date(),
        'documentVerification.verifiedBy': req.user.id,
      },
      { new: true }
    );

    // Log de auditoria
    console.log(`[AUDIT] Admin ${req.user.id} aprovou propriedade de farmácia para ${userId}`);

    res.json({
      success: true,
      message: 'Proprietário verificado com sucesso',
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        isVerified: true,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao aprovar verificação',
      error: error.message,
    });
  }
});

/**
 * POST /api/verification/reject/:userId
 * ADMIN ONLY: Rejeitar verificação de proprietário
 */
router.post('/reject/:userId', authenticate, requireRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { userId } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Motivo de rejeição é obrigatório',
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        isPharmacyOwnerVerified: false,
        documentVerificationStatus: 'rejected',
        'documentVerification.rejectionReason': rejectionReason,
      },
      { new: true }
    );

    console.log(`[AUDIT] Admin ${req.user.id} rejeitou propriedade de farmácia para ${userId}. Motivo: ${rejectionReason}`);

    res.json({
      success: true,
      message: 'Verificação rejeitada. Usuário foi notificado.',
      rejectionReason,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao rejeitar verificação',
      error: error.message,
    });
  }
});

/**
 * GET /api/verification/pending
 * ADMIN ONLY: Listar verificações pendentes
 */
router.get('/pending', authenticate, requireRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const pendingVerifications = await User.find({
      documentVerificationStatus: 'pending',
    }).select('nome email documentVerification createdAt');

    res.json({
      success: true,
      count: pendingVerifications.length,
      data: pendingVerifications,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao listar verificações pendentes',
      error: error.message,
    });
  }
});

module.exports = router;
