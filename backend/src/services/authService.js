const User = require("../models/User");
const Pharmacy = require("../models/Pharmacy");
const Pharmacist = require("../models/Pharmacist");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const { getJwtSecrets } = require("../config/jwtSecrets");

function generateAccessToken(userId, tipo_usuario, role) {
  const { JWT_SECRET } = getJwtSecrets();
  return jwt.sign(
    {
      id: userId,
      tipo: tipo_usuario,
      role: role || tipo_usuario,
    },
    JWT_SECRET,
    {
      expiresIn: "1h",
    },
  );
}

function generateRefreshToken(userId) {
  const { JWT_REFRESH_SECRET } = getJwtSecrets();
  return jwt.sign({ id: userId }, JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });
}

async function registerUser({
  nome,
  email,
  telefone,
  cpf,
  senha,
  tipo_usuario,
  dados_entregador,
  dados_farmacia,
  lgpd_consentimento,
}) {
  const tiposPermitidos = ["cliente", "entregador", "dono_farmacia"];
  if (!tiposPermitidos.includes(tipo_usuario)) {
    const err = new Error(
      `Tipo de usuário '${tipo_usuario}' não é permitido para auto-cadastro. Tipos permitidos: ${tiposPermitidos.join(", ")}`
    );
    err.statusCode = 400;
    throw err;
  }
  const tipo = tipo_usuario;

  if (await User.findOne({ email })) {
    const err = new Error("E-mail já cadastrado");
    err.statusCode = 409;
    throw err;
  }
  if (cpf && (await User.findOne({ cpf }))) {
    const err = new Error("CPF já cadastrado");
    err.statusCode = 409;
    throw err;
  }

  const userData = {
    nome,
    email,
    telefone,
    cpf,
    senha,
    tipo_usuario: tipo,
    lgpd_consentimento: lgpd_consentimento || undefined,
  };

  if (tipo === "entregador" && dados_entregador) {
    if (!dados_entregador.tipo_veiculo || !dados_entregador.cnh) {
      const err = new Error("Tipo de veículo e CNH são obrigatórios para entregadores");
      err.statusCode = 400;
      throw err;
    }
    userData.dados_entregador = {
      tipo_veiculo: dados_entregador.tipo_veiculo,
      placa: dados_entregador.placa,
      cnh: dados_entregador.cnh,
      disponivel: false,
    };
  }

  if (tipo === "dono_farmacia" && dados_farmacia) {
    if (!dados_farmacia.cnpj || !dados_farmacia.nome) {
      const err = new Error("CNPJ e nome da farmácia são obrigatórios");
      err.statusCode = 400;
      throw err;
    }

    const camposEndereco = ["logradouro", "numero", "bairro", "cidade", "estado", "cep"];
    const faltando = camposEndereco.filter((c) => !dados_farmacia[c]);
    if (faltando.length > 0) {
      const err = new Error(`Campos de endereço obrigatórios: ${faltando.join(", ")}`);
      err.statusCode = 400;
      throw err;
    }

    if (await Pharmacy.findOne({ cnpj: dados_farmacia.cnpj })) {
      const err = new Error("CNPJ já cadastrado");
      err.statusCode = 409;
      throw err;
    }
  }

  const user = await User.create(userData);

  if (tipo === "dono_farmacia" && dados_farmacia) {
    const pharmacy = await Pharmacy.create({
      nome: dados_farmacia.nome,
      cnpj: dados_farmacia.cnpj,
      telefone: dados_farmacia.telefone || telefone,
      email: dados_farmacia.email || email,
      logradouro: dados_farmacia.logradouro || "",
      numero: dados_farmacia.numero || "",
      bairro: dados_farmacia.bairro || "",
      cidade: dados_farmacia.cidade || "",
      estado: dados_farmacia.estado || "",
      cep: dados_farmacia.cep || "",
      alvara_sanitario: dados_farmacia.alvara_sanitario,
      licenca_anvisa: dados_farmacia.licenca_anvisa,
      id_dono: user._id,
    });
    user.dados_dono_farmacia = { id_farmacia: pharmacy._id };
    await user.save();
  }

  const accessToken = generateAccessToken(user._id, user.tipo_usuario);
  const refreshToken = generateRefreshToken(user._id);
  user.refreshToken = refreshToken;
  await user.save();

  const userObj = user.toObject();
  delete userObj.senha;
  delete userObj.refreshToken;
  return { accessToken, refreshToken, user: userObj };
}

async function loginUser({ email, senha }) {
  const user = await User.findOne({ email }).select(
    "+senha +loginAttempts +lockUntil +refreshToken",
  );
  if (!user) {
    const err = new Error("Credenciais inválidas");
    err.statusCode = 401;
    throw err;
  }
  if (user.isLocked) {
    const err = new Error("Conta bloqueada por 15 minutos");
    err.statusCode = 429;
    throw err;
  }
  const senhaCorreta = await user.comparePassword(senha);
  if (!senhaCorreta) {
    await user.incrementLoginAttempts();
    const err = new Error("Credenciais inválidas");
    err.statusCode = 401;
    throw err;
  }
  await user.resetLoginAttempts();
  const accessToken = generateAccessToken(user._id, user.tipo_usuario, user.role);
  const refreshToken = generateRefreshToken(user._id);
  user.refreshToken = refreshToken;
  await user.save();

  const tipo = user.tipo_usuario || user.role;
  if (tipo === "farmaceutico" || tipo === "dono_farmacia") {
    const ph = await Pharmacist.findOne({ id_usuario: user._id, ativo: true });
    if (ph) {
      ph.logado = true;
      if (ph.disponivel_chat !== false) {
        ph.disponivel_chat = true;
        ph.status_motivo = "online";
      }
      ph.ultima_atividade = new Date();
      await ph.save();
    }
  }

  const userObj = user.toObject();
  delete userObj.senha;
  delete userObj.refreshToken;
  return { accessToken, refreshToken, user: userObj };
}

async function googleAuth(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    const err = new Error("Login com Google não está configurado");
    err.statusCode = 503;
    throw err;
  }

  const client = new OAuth2Client(clientId);
  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
  } catch {
    const err = new Error("Token do Google inválido");
    err.statusCode = 401;
    throw err;
  }

  const payload = ticket.getPayload();
  const { sub: googleId, email, name, picture } = payload;

  if (!email) {
    const err = new Error("Conta Google sem e-mail associado");
    err.statusCode = 400;
    throw err;
  }

  let user = await User.findOne({
    $or: [{ google_id: googleId }, { email }],
  });

  if (user) {
    if (!user.google_id) {
      user.google_id = googleId;
    }
    if (picture && !user.foto_perfil) {
      user.foto_perfil = picture;
    }
  } else {
    user = await User.create({
      nome: name || email.split("@")[0],
      email,
      google_id: googleId,
      foto_perfil: picture,
      senha: crypto.randomBytes(32).toString("hex"),
      tipo_usuario: "cliente",
      lgpd_consentimento: {
        aceito: true,
        data_aceite: new Date(),
        versao_termo: "1.0",
      },
    });
  }

  const accessToken = generateAccessToken(user._id, user.tipo_usuario);
  const refreshToken = generateRefreshToken(user._id);
  user.refreshToken = refreshToken;
  await user.save();

  const userObj = user.toObject();
  delete userObj.senha;
  delete userObj.refreshToken;
  return { accessToken, refreshToken, user: userObj };
}

async function refreshAccessToken(refreshToken) {
  let payload;
  try {
    const { JWT_REFRESH_SECRET } = getJwtSecrets();
    payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
  } catch {
    const err = new Error("Refresh token inválido");
    err.statusCode = 401;
    throw err;
  }
  const user = await User.findById(payload.id).select("+refreshToken");
  if (!user || user.refreshToken !== refreshToken) {
    const err = new Error("Refresh token inválido");
    err.statusCode = 401;
    throw err;
  }
  return generateAccessToken(user._id, user.tipo_usuario, user.role);
}

async function forgotPassword(email) {
  const user = await User.findOne({ email });
  if (!user) {
    const err = new Error("Usuário não encontrado");
    err.statusCode = 404;
    throw err;
  }
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  user.resetPasswordToken = hash;
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  await user.save();
  return token;
}

async function resetPassword(token, novaSenha) {
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    resetPasswordToken: hash,
    resetPasswordExpire: { $gt: Date.now() },
  }).select("+senha +resetPasswordToken +resetPasswordExpire");
  if (!user) {
    const err = new Error("Token inválido ou expirado");
    err.statusCode = 400;
    throw err;
  }
  user.senha = novaSenha;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();
  const userObj = user.toObject();
  delete userObj.senha;
  return userObj;
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  registerUser,
  loginUser,
  googleAuth,
  refreshAccessToken,
  forgotPassword,
  resetPassword,
};
