const authService = require("../services/authService");
const sendEmail = require("../utils/sendEmail");

function normalizeUser(user) {
  if (!user) return user;
  
  const userObj = user.toObject ? user.toObject() : user;
  const normalized = {
    id: userObj._id,
    nome: userObj.nome,
    email: userObj.email,
    telefone: userObj.telefone,
    cpf: userObj.cpf,
    role: userObj.tipo_usuario || userObj.role,
    tipo_usuario: userObj.tipo_usuario,
    id_farmacia: userObj.id_farmacia,
    dados_dono_farmacia: userObj.dados_dono_farmacia,
    dados_farmaceutico: userObj.dados_farmaceutico,
    dados_entregador: userObj.dados_entregador,
    isPharmacyOwner: userObj.isPharmacyOwner,
    isPharmacyOwnerVerified: userObj.isPharmacyOwnerVerified,
    documentVerificationStatus: userObj.documentVerificationStatus,
    criado_em: userObj.createdAt,
  };
  
  return normalized;
}

exports.register = async (req, res, next) => {
  try {
    const { nome, email, telefone, cpf, senha, tipo_usuario } = req.body;
    const { accessToken, refreshToken, user } = await authService.registerUser({
      nome,
      email,
      telefone,
      cpf,
      senha,
      tipo_usuario,
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.status(201).json({
      success: true,
      message: "Cadastro realizado com sucesso",
      data: { accessToken, user: normalizeUser(user) },
    });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, senha } = req.body;
    const { accessToken, refreshToken, user } = await authService.loginUser({
      email,
      senha,
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.json({
      success: true,
      data: { accessToken, user: normalizeUser(user) },
    });
  } catch (error) {
    next(error);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res
        .status(401)
        .json({ success: false, message: "Refresh token não encontrado" });
    }
    const accessToken = await authService.refreshAccessToken(refreshToken);
    return res.json({
      success: true,
      data: { accessToken },
    });
  } catch (error) {
    next(error);
  }
};

exports.logout = (req, res, next) => {
  try {
    res.clearCookie("refreshToken");
    return res.json({
      success: true,
      message: "Logout realizado com sucesso",
    });
  } catch (error) {
    next(error);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    let token;
    try {
      token = await authService.forgotPassword(email);
      await sendEmail({
        to: email,
        subject: "Recuperação de senha - Saúde Na Mão",
        text: `Seu token de recuperação é: ${token} (válido por 10 minutos)`,
      });
    } catch (e) {
    }
    return res.json({
      success: true,
      message: "E-mail de recuperação enviado",
    });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { novaSenha } = req.body;
    await authService.resetPassword(token, novaSenha);
    return res.json({
      success: true,
      message: "Senha redefinida com sucesso",
    });
  } catch (error) {
    next(error);
  }
};

exports.googleAuth = async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({
        success: false,
        message: "Token do Google é obrigatório",
      });
    }
    
    // Placeholder for Google auth logic
    // This would typically verify the token with Google OAuth library
    return res.status(501).json({
      success: false,
      message: "Google authentication não está implementado",
    });
  } catch (error) {
    next(error);
  }
};
