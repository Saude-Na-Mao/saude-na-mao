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
    rg: userObj.rg,
    role: userObj.tipo_usuario || userObj.role,
    tipo_usuario: userObj.tipo_usuario,
    id_farmacia: userObj.id_farmacia,
    dados_dono_farmacia: userObj.dados_dono_farmacia,
    dados_farmaceutico: userObj.dados_farmaceutico,
    dados_entregador: userObj.dados_entregador,
    lgpd_consentimento: userObj.lgpd_consentimento,
    isPharmacyOwner: userObj.isPharmacyOwner,
    isPharmacyOwnerVerified: userObj.isPharmacyOwnerVerified,
    documentVerificationStatus: userObj.documentVerificationStatus,
    criado_em: userObj.createdAt,
  };
  
  return normalized;
}

function setRefreshTokenCookie(res, refreshToken) {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

exports.register = async (req, res, next) => {
  try {
    const {
      nome,
      email,
      telefone,
      cpf,
      senha,
      tipo_usuario,
      dados_entregador,
      dados_farmacia,
      lgpd_consentimento,
    } = req.body;
    const { accessToken, refreshToken, user } = await authService.registerUser({
      nome,
      email,
      telefone,
      cpf,
      senha,
      tipo_usuario,
      dados_entregador,
      dados_farmacia,
      lgpd_consentimento,
    });
    setRefreshTokenCookie(res, refreshToken);
    sendEmail({
      to: email,
      subject: "Bem-vindo ao Saúde na Mão",
      text: `Olá, ${nome}. Sua conta no Saúde na Mão foi criada com sucesso.`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
          <h2 style="margin: 0 0 12px; color: #059669;">Saúde na Mão</h2>
          <p>Olá, ${nome}.</p>
          <p>Sua conta foi criada com sucesso. Agora você pode comprar medicamentos, acompanhar pedidos e receber atualizações pelo app.</p>
        </div>
      `,
    }).catch(() => {});
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
    setRefreshTokenCookie(res, refreshToken);
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
    const { accessToken, refreshToken, user } = await authService.googleAuth(credential);
    setRefreshTokenCookie(res, refreshToken);

    return res.json({
      success: true,
      data: { accessToken, user: normalizeUser(user) },
    });
  } catch (error) {
    next(error);
  }
};

exports.requestEmailLoginCode = async (req, res, next) => {
  try {
    const { email } = req.body;
    const { code, expiresInMinutes } = await authService.requestEmailLoginCode(email);

    if (code) {
      await sendEmail({
        to: email,
        subject: "Código de acesso - Saúde Na Mão",
        text: `Seu código de acesso é: ${code}. Ele expira em ${expiresInMinutes} minutos.`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
            <h2 style="margin: 0 0 12px; color: #059669;">Saúde na Mão</h2>
            <p>Use o código abaixo para acessar sua conta:</p>
            <p style="font-size: 28px; font-weight: 700; letter-spacing: 8px; margin: 20px 0;">${code}</p>
            <p>Este código expira em ${expiresInMinutes} minutos. Se você não solicitou o acesso, ignore este e-mail.</p>
          </div>
        `,
      });
    }

    return res.json({
      success: true,
      message: "Se o e-mail estiver cadastrado, enviaremos um código de acesso.",
      data: { expiresInMinutes },
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyEmailLoginCode = async (req, res, next) => {
  try {
    const { email, code } = req.body;
    const { accessToken, refreshToken, user } =
      await authService.verifyEmailLoginCode({ email, code });

    setRefreshTokenCookie(res, refreshToken);

    return res.json({
      success: true,
      data: { accessToken, user: normalizeUser(user) },
    });
  } catch (error) {
    next(error);
  }
};
