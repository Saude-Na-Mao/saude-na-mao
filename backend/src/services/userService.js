const mongoose = require("mongoose");
const User = require("../models/User");
const Address = require("../models/Address");
const Order = require("../models/Order");
const Prescription = require("../models/Prescription");
const Delivery = require("../models/Delivery");
const { buscarCep } = require("../utils/viaCep");

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizePlate(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeCnh(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidPlate(value) {
  // Aceita placa antiga (AAA1234) e Mercosul (AAA1A23).
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(value);
}

function isValidCnh(value) {
  return /^\d{11}$/.test(value);
}

function normalizeObjectId(id) {
  if (typeof id !== "string") {
    throw createError("ID de endereço inválido", 400);
  }

  const normalizedId = id.trim().replace(/^\{+|\}+$/g, "");

  if (!mongoose.Types.ObjectId.isValid(normalizedId)) {
    throw createError("ID de endereço inválido", 400);
  }

  return normalizedId;
}

/**
 * Recalcula média e total de avaliações do entregador a partir das entregas concluídas
 * (corrige perfil quando a média no User ficou desatualizada ou nunca foi gravada).
 */
async function syncEntregadorAvaliacaoFromDeliveries(userId) {
  if (!mongoose.Types.ObjectId.isValid(String(userId))) return;
  const uid = new mongoose.Types.ObjectId(String(userId));
  const agg = await Delivery.aggregate([
    {
      $match: {
        id_entregador: uid,
        status: "entregue",
        "avaliacao_cliente.avaliado_em": { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: null,
        media: { $avg: "$avaliacao_cliente.nota" },
        total: { $sum: 1 },
      },
    },
  ]);
  const total = agg[0]?.total || 0;
  const media = total
    ? Math.round(Number(agg[0].media) * 100) / 100
    : 0;
  await User.updateOne(
    { _id: uid, tipo_usuario: "entregador" },
    {
      $set: {
        "dados_entregador.avaliacao": media,
        "dados_entregador.total_avaliacoes": total,
      },
    },
  );
}

async function getProfile(userId) {
  const enderecos = await Address.find({ id_usuario: userId, ativo: true });
  const user = await User.findById(userId).select("-senha");
  if (!user) {
    throw createError("Usuário não encontrado", 404);
  }
  if (user.tipo_usuario === "entregador") {
    await syncEntregadorAvaliacaoFromDeliveries(userId);
    const refreshed = await User.findById(userId).select("-senha");
    return { user: refreshed || user, enderecos };
  }
  return { user, enderecos };
}

async function updateProfile(userId, updates) {
  const user = await User.findById(userId).select("-senha");
  if (!user) {
    throw createError("Usuário não encontrado", 404);
  }

  const allowedFields = ["nome", "telefone", "cpf", "rg", "foto_perfil"];
  allowedFields.forEach((field) => {
    if (updates[field] !== undefined) {
      user[field] = updates[field];
    }
  });

  // Entregador pode atualizar dados profissionais básicos no próprio perfil.
  if (user.tipo_usuario === "entregador" && updates?.dados_entregador) {
    if (!user.dados_entregador) user.dados_entregador = {};
    const allowedDriverFields = ["tipo_veiculo", "placa", "cnh"];

    allowedDriverFields.forEach((field) => {
      if (updates.dados_entregador[field] !== undefined) {
        const rawValue = updates.dados_entregador[field];
        user.dados_entregador[field] =
          typeof rawValue === "string" ? rawValue.trim() : rawValue;
      }
    });

    if (updates.dados_entregador.placa !== undefined) {
      user.dados_entregador.placa = normalizePlate(user.dados_entregador.placa);
    }
    if (updates.dados_entregador.cnh !== undefined) {
      user.dados_entregador.cnh = normalizeCnh(user.dados_entregador.cnh);
    }

    if (
      user.dados_entregador.tipo_veiculo === "moto" ||
      user.dados_entregador.tipo_veiculo === "carro"
    ) {
      const placa = (user.dados_entregador.placa || "").trim();
      const cnh = (user.dados_entregador.cnh || "").trim();
      if (!placa || !cnh) {
        throw createError(
          "Para moto e carro, os campos placa e CNH são obrigatórios",
          400,
        );
      }
    }

    const placa = (user.dados_entregador.placa || "").trim();
    const cnh = (user.dados_entregador.cnh || "").trim();

    if (placa && !isValidPlate(placa)) {
      throw createError(
        "Placa inválida. Use formato AAA1234 ou AAA1A23",
        400,
      );
    }

    if (cnh && !isValidCnh(cnh)) {
      throw createError("CNH inválida. Informe 11 dígitos numéricos", 400);
    }
  }

  await user.save();
  return user;
}

async function addAddress(userId, dadosEndereco) {
  const activeCount = await Address.countDocuments({
    id_usuario: userId,
    ativo: true,
  });
  if (activeCount >= 10) {
    throw createError("Limite de 10 endereços atingido", 400);
  }
  if (dadosEndereco.cep && !dadosEndereco.logradouro) {
    const cepData = await buscarCep(dadosEndereco.cep);
    dadosEndereco.logradouro = cepData.logradouro;
    dadosEndereco.bairro = cepData.bairro;
    dadosEndereco.cidade = cepData.cidade;
    dadosEndereco.estado = cepData.estado;
  }
  const isFirst = activeCount === 0;
  const address = new Address({
    ...dadosEndereco,
    id_usuario: userId,
    padrao: isFirst,
  });
  await address.save();
  return address;
}

async function updateAddress(userId, addressId, dadosEndereco) {
  const normalizedAddressId = normalizeObjectId(addressId);
  const address = await Address.findOne({
    _id: normalizedAddressId,
    id_usuario: userId,
  });
  if (!address) {
    throw createError("Endereço não encontrado", 404);
  }
  Object.assign(address, dadosEndereco);
  await address.save();
  return address;
}

async function deleteAddress(userId, addressId) {
  const normalizedAddressId = normalizeObjectId(addressId);
  const address = await Address.findOne({
    _id: normalizedAddressId,
    id_usuario: userId,
  });
  if (!address) {
    throw createError("Endereço não encontrado", 404);
  }
  if (address.padrao) {
    const nextDefault = await Address.findOne({
      id_usuario: userId,
      ativo: true,
      _id: { $ne: normalizedAddressId },
    });
    if (nextDefault) {
      nextDefault.padrao = true;
      await nextDefault.save();
    }
  }
  address.ativo = false;
  await address.save();
  return { message: "Endereço removido com sucesso" };
}

async function setDefaultAddress(userId, addressId) {
  const normalizedAddressId = normalizeObjectId(addressId);
  const address = await Address.findOne({
    _id: normalizedAddressId,
    id_usuario: userId,
  });
  if (!address) {
    throw createError("Endereço não encontrado", 404);
  }
  address.padrao = true;
  await address.save();
  return address;
}

async function getOrderHistory(userId, { page = 1, limit = 10 }) {
  const pagina = Number(page);
  const limite = Number(limit);
  const total = await Order.countDocuments({ id_usuario: userId });
  const pedidos = await Order.find({ id_usuario: userId })
    .sort({ createdAt: -1 })
    .skip((pagina - 1) * limite)
    .limit(limite)
    .populate("id_farmacia", "nome cidade estado");
  const totalPaginas = Math.ceil(total / limite);
  return { pedidos, total, pagina, totalPaginas };
}

/**
 * LGPD - Exporta todos os dados do usuário (Art. 18, V da LGPD)
 */
async function exportUserData(userId) {
  const user = await User.findById(userId).select("-senha -refreshToken -resetPasswordToken -resetPasswordExpire");
  if (!user) {
    throw createError("Usuário não encontrado", 404);
  }

  const [enderecos, pedidos, receitas] = await Promise.all([
    Address.find({ id_usuario: userId }),
    Order.find({ id_usuario: userId }).populate("id_farmacia", "nome").sort({ createdAt: -1 }),
    Prescription.find({ id_usuario: userId }).sort({ createdAt: -1 }),
  ]);

  return {
    dados_pessoais: {
      nome: user.nome,
      email: user.email,
      telefone: user.telefone,
      cpf: user.cpf,
      tipo_usuario: user.tipo_usuario,
      data_cadastro: user.data_cadastro,
      lgpd_consentimento: user.lgpd_consentimento,
    },
    enderecos: enderecos.map((e) => ({
      logradouro: e.logradouro,
      numero: e.numero,
      complemento: e.complemento,
      bairro: e.bairro,
      cidade: e.cidade,
      estado: e.estado,
      cep: e.cep,
    })),
    pedidos: pedidos.map((p) => ({
      id: p._id,
      data: p.createdAt,
      status: p.status,
      total: p.total,
      farmacia: p.id_farmacia?.nome,
      itens: p.itens.map((i) => ({
        nome: i.nome_produto,
        quantidade: i.quantidade,
        preco: i.preco_unitario,
      })),
      numero_nf: p.numero_nf,
    })),
    receitas: receitas.map((r) => ({
      id: r._id,
      data: r.createdAt,
      status: r.status,
      tipo_receita: r.tipo_receita,
      consumida: r.consumida,
      dados_ocr: r.dados_ocr ? {
        nome_medico: r.dados_ocr.nome_medico,
        crm: r.dados_ocr.crm,
        data_emissao: r.dados_ocr.data_emissao,
      } : null,
    })),
    exportado_em: new Date(),
  };
}

/**
 * LGPD - Solicita exclusão da conta (Art. 18, VI da LGPD)
 * Anonimiza dados pessoais mas mantém registros de pedidos por obrigação fiscal.
 */
async function requestAccountDeletion(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw createError("Usuário não encontrado", 404);
  }

  const activeOrders = await Order.countDocuments({
    id_usuario: userId,
    status: {
      $in: [
        "aguardando_pagamento",
        "em_processamento",
        "confirmado",
        "a_caminho",
        "aguardando_confirmacao_receita_farmacia",
      ],
    },
  });

  if (activeOrders > 0) {
    throw createError(
      "Não é possível excluir a conta com pedidos em andamento. Aguarde a conclusão dos pedidos.",
      400,
    );
  }

  // Anonimize personal data
  user.nome = "Usuário Removido";
  user.email = `deleted_${userId}@removed.local`;
  user.telefone = null;
  user.cpf = null;
  user.foto_perfil = null;
  user.ativo = false;
  user.lgpd_consentimento = {
    ...user.lgpd_consentimento?.toObject?.() || user.lgpd_consentimento || {},
    conta_excluida_em: new Date(),
  };

  await user.save();

  // Deactivate all addresses
  await Address.updateMany(
    { id_usuario: userId },
    { $set: { ativo: false } },
  );

  return { message: "Conta excluída com sucesso. Dados pessoais foram anonimizados." };
}

/** Registra o consentimento LGPD do usuário (Art. 7º, I e 8º da LGPD). */
async function recordLgpdConsent(userId, ip) {
  const user = await User.findById(userId).select("-senha");
  if (!user) {
    throw createError("Usuário não encontrado", 404);
  }
  user.lgpd_consentimento = {
    aceito: true,
    data_aceite: new Date(),
    ip_aceite: ip || user.lgpd_consentimento?.ip_aceite || null,
    versao_termo: "1.0",
  };
  await user.save();
  return user;
}

async function listCards(userId) {
  const user = await User.findById(userId).select("cartoes");
  if (!user) {
    throw createError("Usuário não encontrado", 404);
  }
  return user.cartoes || [];
}

/** Salva um cartão. Por segurança, guarda apenas bandeira/últimos 4/titular/validade. */
async function addCard(userId, dados = {}) {
  const user = await User.findById(userId);
  if (!user) {
    throw createError("Usuário não encontrado", 404);
  }
  if (!Array.isArray(user.cartoes)) user.cartoes = [];
  if (user.cartoes.length >= 5) {
    throw createError("Limite de 5 cartões atingido", 400);
  }
  const ultimos4 = String(dados.ultimos4 || "").replace(/\D/g, "").slice(-4);
  if (ultimos4.length !== 4) {
    throw createError("Informe os últimos 4 dígitos do cartão", 400);
  }
  const titular = String(dados.titular || "").trim();
  if (!titular) {
    throw createError("Informe o nome do titular", 400);
  }
  user.cartoes.push({
    apelido: dados.apelido ? String(dados.apelido).trim() : undefined,
    bandeira: dados.bandeira ? String(dados.bandeira).trim() : "Cartão",
    ultimos4,
    titular,
    validade: dados.validade ? String(dados.validade).trim() : undefined,
  });
  await user.save();
  return user.cartoes[user.cartoes.length - 1];
}

async function removeCard(userId, cardId) {
  const user = await User.findById(userId);
  if (!user) {
    throw createError("Usuário não encontrado", 404);
  }
  const antes = (user.cartoes || []).length;
  user.cartoes = (user.cartoes || []).filter(
    (c) => String(c._id) !== String(cardId),
  );
  if (user.cartoes.length === antes) {
    throw createError("Cartão não encontrado", 404);
  }
  await user.save();
  return { message: "Cartão removido" };
}

module.exports = {
  getProfile,
  updateProfile,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getOrderHistory,
  exportUserData,
  requestAccountDeletion,
  recordLgpdConsent,
  listCards,
  addCard,
  removeCard,
};
