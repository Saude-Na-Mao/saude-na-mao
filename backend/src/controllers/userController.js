const userService = require("../services/userService");
const Address = require("../models/Address");
const { buscarCep } = require("../utils/viaCep");

function normalizeUser(user) {
  if (!user) return user;
  
  const userObj = user.toObject ? user.toObject() : user;
  return {
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
    foto_perfil: userObj.foto_perfil,
    fotoPerfil: userObj.foto_perfil,
    lgpd_consentimento: userObj.lgpd_consentimento,
    cartoes: userObj.cartoes,
    criado_em: userObj.createdAt,
  };
}

async function getProfile(req, res, next) {
  try {
    const { user, enderecos } = await userService.getProfile(req.user.id);
    res.json({ success: true, data: { user: normalizeUser(user), enderecos } });
  } catch (error) {
    next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { nome, telefone, cpf, rg, dados_entregador } = req.body;
    const updateData = { nome, telefone };
    if (cpf !== undefined) {
      updateData.cpf = String(cpf).replace(/\D/g, "") || undefined;
    }
    if (rg !== undefined) {
      updateData.rg = String(rg).trim() || undefined;
    }
    if (dados_entregador !== undefined) {
      // Em upload multipart o objeto chega como string JSON.
      updateData.dados_entregador =
        typeof dados_entregador === "string"
          ? JSON.parse(dados_entregador)
          : dados_entregador;
    }
    if (req.file) {
      updateData.foto_perfil = `/${String(req.file.path).replace(/\\/g, "/")}`;
    } else if (req.body.remover_foto === "true" || req.body.remover_foto === true) {
      updateData.foto_perfil = null;
    }
    const user = await userService.updateProfile(req.user.id, updateData);
    res.json({ success: true, message: "Perfil atualizado", data: { user: normalizeUser(user) } });
  } catch (error) {
    next(error);
  }
}

async function listAddresses(req, res, next) {
  try {
    const enderecos = await Address.find({
      id_usuario: req.user.id,
      ativo: true,
    });
    res.json({ success: true, data: { enderecos } });
  } catch (error) {
    next(error);
  }
}

async function addAddress(req, res, next) {
  try {
    const endereco = await userService.addAddress(req.user.id, req.body);
    res
      .status(201)
      .json({
        success: true,
        message: "Endereço adicionado",
        data: { endereco },
      });
  } catch (error) {
    next(error);
  }
}

async function updateAddress(req, res, next) {
  try {
    const addressId = req.params.id;
    const endereco = await userService.updateAddress(
      req.user.id,
      addressId,
      req.body,
    );
    res.json({
      success: true,
      message: "Endereço atualizado",
      data: { endereco },
    });
  } catch (error) {
    next(error);
  }
}

async function deleteAddress(req, res, next) {
  try {
    const addressId = req.params.id;
    await userService.deleteAddress(req.user.id, addressId);
    res.json({ success: true, message: "Endereço removido" });
  } catch (error) {
    next(error);
  }
}

async function setDefaultAddress(req, res, next) {
  try {
    const addressId = req.params.id;
    const endereco = await userService.setDefaultAddress(
      req.user.id,
      addressId,
    );
    res.json({
      success: true,
      message: "Endereço padrão definido",
      data: { endereco },
    });
  } catch (error) {
    next(error);
  }
}

async function getOrderHistory(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const resultado = await userService.getOrderHistory(req.user.id, {
      page,
      limit,
    });
    res.json({ success: true, data: resultado });
  } catch (error) {
    next(error);
  }
}

async function searchCep(req, res, next) {
  try {
    const cep = req.params.cep;
    const endereco = await buscarCep(cep);
    res.json({ success: true, data: endereco });
  } catch (error) {
    next(error);
  }
}

async function exportData(req, res, next) {
  try {
    const data = await userService.exportUserData(req.user.id);
    res.json({ success: true, message: "Dados exportados com sucesso", data });
  } catch (error) {
    next(error);
  }
}

async function deleteAccount(req, res, next) {
  try {
    const resultado = await userService.requestAccountDeletion(req.user.id);
    res.json({ success: true, message: resultado.message, data: {} });
  } catch (error) {
    next(error);
  }
}

async function recordConsent(req, res, next) {
  try {
    const ip = req.ip || req.socket?.remoteAddress;
    const user = await userService.recordLgpdConsent(req.user.id, ip);
    res.json({
      success: true,
      message: "Consentimento registrado",
      data: { user: normalizeUser(user) },
    });
  } catch (error) {
    next(error);
  }
}

async function listCards(req, res, next) {
  try {
    const cartoes = await userService.listCards(req.user.id);
    res.json({ success: true, data: { cartoes } });
  } catch (error) {
    next(error);
  }
}

async function addCard(req, res, next) {
  try {
    const cartao = await userService.addCard(req.user.id, req.body);
    res
      .status(201)
      .json({ success: true, message: "Cartão salvo", data: { cartao } });
  } catch (error) {
    next(error);
  }
}

async function deleteCard(req, res, next) {
  try {
    await userService.removeCard(req.user.id, req.params.cardId);
    res.json({ success: true, message: "Cartão removido" });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  listAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getOrderHistory,
  searchCep,
  exportData,
  deleteAccount,
  recordConsent,
  listCards,
  addCard,
  deleteCard,
};
