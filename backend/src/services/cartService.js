const mongoose = require("mongoose");
const Cart = require("../models/Cart");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Prescription = require("../models/Prescription");
const Address = require("../models/Address");
const Pharmacy = require("../models/Pharmacy");
const prescriptionService = require("./prescriptionService");
const {
  calculateFreight,
  getDeliveryOptions: getFreightOptions,
} = require("./freightService");
const { verificarInteracoes } = require("../utils/drugInteractions");
const crypto = require("crypto");

const CART_POPULATE = [
  {
    path: "itens.id_produto",
    select: "nome preco estoque controlado receita_obrigatoria classificacao_receita principio_ativo",
  },
  {
    path: "itens.id_farmacia",
    select: "nome cidade",
  },
];

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function toObjectId(value) {
  return new mongoose.Types.ObjectId(value);
}

function buildPharmacyCoordinates(pharmacy) {
  const coordinates = pharmacy?.location?.coordinates || [];

  return {
    latitude: coordinates[1],
    longitude: coordinates[0],
    cidade: pharmacy?.cidade,
  };
}

function buildAddressCoordinates(address) {
  if (!address) {
    return null;
  }

  return {
    latitude: address.latitude,
    longitude: address.longitude,
    cidade: address.cidade,
  };
}

function buildAddressSnapshot(address) {
  if (!address) {
    return {};
  }

  return {
    logradouro: address.logradouro,
    numero: address.numero,
    complemento: address.complemento,
    bairro: address.bairro,
    cidade: address.cidade,
    estado: address.estado,
    cep: address.cep,
  };
}

function resetCart(cart) {
  cart.itens = [];
  cart.id_farmacia = null;
  cart.id_endereco_entrega = null;
  cart.tipo_entrega = "moto";
  cart.subtotal = 0;
  cart.taxa_entrega = 0;
  cart.total = 0;
  cart.ativo = true;
  cart.renovarExpiracao();
  return cart;
}

async function populateCart(cart) {
  return cart.populate(CART_POPULATE);
}

async function findCurrentCart(userId) {
  return Cart.findOne({
    id_usuario: userId,
    ativo: true,
    expira_em: { $gt: new Date() },
  });
}

async function getCartForUser(userId) {
  if (!isValidObjectId(userId)) {
    throw createError("Usuário não encontrado", 404);
  }

  const cart = await getOrCreateCart(userId);
  return cart;
}

async function getProductOrThrow(productId) {
  if (!isValidObjectId(productId)) {
    throw createError("Medicamento não encontrado", 404);
  }

  const product = await Product.findById(productId);
  if (!product || !product.ativo) {
    throw createError("Medicamento não encontrado", 404);
  }

  return product;
}

async function getPharmacyOrThrow(pharmacyId) {
  if (!isValidObjectId(pharmacyId)) {
    throw createError("Farmácia não encontrada", 404);
  }

  const pharmacy = await Pharmacy.findById(pharmacyId);
  if (!pharmacy) {
    throw createError("Farmácia não encontrada", 404);
  }

  return pharmacy;
}

async function getAddressOrThrow(addressId, userId) {
  if (!isValidObjectId(addressId)) {
    throw createError("Endereço não encontrado", 404);
  }

  const address = await Address.findOne({ _id: addressId, id_usuario: userId });
  if (!address) {
    throw createError("Endereço não encontrado", 404);
  }

  return address;
}

async function getPrescriptionOrThrow(receitaId, userId) {
  if (!isValidObjectId(receitaId)) {
    throw createError("Receita não encontrada", 404);
  }

  const payload =
    await prescriptionService.getPrescriptionAvailabilityPayload(
      userId,
      receitaId,
    );

  if (!payload.disponivel) {
    throw createError(
      payload.motivo || "Receita indisponível.",
      payload.httpStatus || 400,
    );
  }

  const prescription = await Prescription.findOne({
    _id: receitaId,
    id_usuario: userId,
  });

  if (!prescription) {
    throw createError("Receita não encontrada", 404);
  }

  return prescription;
}

function getProductUnitPrice(product) {
  if (
    product.preco_promocional !== null &&
    product.preco_promocional !== undefined &&
    product.preco_promocional < product.preco
  ) {
    return product.preco_promocional;
  }

  return product.preco;
}

function getPrescriptionQuantityLimit(prescription) {
  const rawValue =
    prescription?.dados_ocr?.quantidade_prescrita ??
    prescription?.dados_ocr?.quantidade ??
    prescription?.dados_ocr?.qtd;

  const parsed = Number(rawValue);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return 1;
}

function warnControlledQuantity(product, quantity, prescription) {
  if (!product.controlado) {
    return;
  }

  const limit = getPrescriptionQuantityLimit(prescription);
  if (quantity > limit) {
    console.warn(
      `[cartService] Quantidade ${quantity} acima do limite estimado ${limit} para o medicamento controlado ${product._id}. A validação final ficará com o farmacêutico.`,
    );
  }
}

async function getDeliveredQuantityLast30Days(userId, productId) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const result = await Order.aggregate([
    {
      $match: {
        id_usuario: toObjectId(userId),
        status: "entregue",
        createdAt: { $gte: thirtyDaysAgo },
      },
    },
    { $unwind: "$itens" },
    {
      $match: {
        "itens.id_produto": toObjectId(productId),
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$itens.quantidade" },
      },
    },
  ]);

  return result[0]?.total || 0;
}

async function validateControlledMonthlyLimit(
  userId,
  product,
  intendedQuantity,
) {
  if (!product.controlado) {
    return;
  }

  const deliveredQuantity = await getDeliveredQuantityLast30Days(
    userId,
    product._id,
  );
  if (deliveredQuantity + intendedQuantity > 5) {
    throw createError(
      "Limite mensal de 5 unidades para este medicamento atingido",
      400,
    );
  }
}

function ensureCartHasItems(cart) {
  if (!cart.itens.length) {
    throw createError("Carrinho vazio", 400);
  }
}

async function saveAndPopulateCart(cart) {
  await cart.save();
  return populateCart(cart);
}

async function getOrCreateCart(userId) {
  if (!isValidObjectId(userId)) {
    throw createError("Usuário não encontrado", 404);
  }

  let cart = await findCurrentCart(userId);

  if (!cart) {
    cart = await Cart.findOne({ id_usuario: userId });

    if (cart) {
      resetCart(cart);
    } else {
      cart = new Cart({ id_usuario: userId });
    }

    await cart.save();
  }

  return populateCart(cart);
}

async function addItem(userId, { productId, quantidade = 1, receitaId }) {
  const quantityToAdd = Number(quantidade);
  if (!Number.isFinite(quantityToAdd) || quantityToAdd < 1) {
    throw createError("Quantidade inválida", 400);
  }

  const product = await getProductOrThrow(productId);

  if (product.estoque < quantityToAdd) {
    throw createError("Estoque insuficiente", 400);
  }

  const cart = await getCartForUser(userId);

  if (
    cart.id_farmacia &&
    String(cart.id_farmacia) !== String(product.id_farmacia)
  ) {
    throw createError(
      "Seu carrinho já contém itens de outra farmácia. Esvazie o carrinho antes de adicionar itens desta farmácia.",
      400,
    );
  }

  const existingItem = cart.itens.find(
    (item) =>
      String(item.id_produto?._id || item.id_produto) === String(product._id),
  );

  let prescription = null;
  const effectiveReceitaId = receitaId || existingItem?.id_receita;

  if (product.receita_obrigatoria) {
    if (!effectiveReceitaId) {
      throw createError(
        "Este medicamento requer receita médica. Faça o upload da receita primeiro.",
        400,
      );
    }

    prescription = await getPrescriptionOrThrow(effectiveReceitaId, userId);
  } else if (effectiveReceitaId) {
    prescription = await getPrescriptionOrThrow(effectiveReceitaId, userId);
  }

  const nextQuantity = (existingItem?.quantidade || 0) + quantityToAdd;

  if (product.estoque < nextQuantity) {
    throw createError("Estoque insuficiente", 400);
  }

  warnControlledQuantity(product, nextQuantity, prescription);
  await validateControlledMonthlyLimit(userId, product, nextQuantity);

  if (existingItem) {
    existingItem.quantidade = nextQuantity;
    existingItem.preco_unitario = getProductUnitPrice(product);
    existingItem.nome_produto = product.nome;
    existingItem.controlado = product.controlado;
    existingItem.receita_obrigatoria = product.receita_obrigatoria;
    existingItem.id_receita = effectiveReceitaId || null;
    existingItem.id_farmacia = product.id_farmacia;
  } else {
    cart.itens.push({
      id_produto: product._id,
      nome_produto: product.nome,
      preco_unitario: getProductUnitPrice(product),
      quantidade: quantityToAdd,
      subtotal: getProductUnitPrice(product) * quantityToAdd,
      controlado: product.controlado,
      receita_obrigatoria: product.receita_obrigatoria,
      id_receita: effectiveReceitaId || null,
      id_farmacia: product.id_farmacia,
    });
  }

  if (!cart.id_farmacia) {
    cart.id_farmacia = product.id_farmacia;
  }

  cart.recalcularTotais();
  cart.renovarExpiracao();

  const populatedCart = await saveAndPopulateCart(cart);

  // Check drug interactions after adding item
  const principiosAtivos = [];
  for (const item of cart.itens) {
    const prod = await Product.findById(item.id_produto?._id || item.id_produto).select("principio_ativo");
    if (prod?.principio_ativo) {
      principiosAtivos.push(prod.principio_ativo);
    }
  }
  const interacoes = verificarInteracoes(principiosAtivos);
  if (interacoes.length > 0) {
    populatedCart._doc.alertas_interacao = interacoes;
  }

  return populatedCart;
}

async function removeItem(userId, productId) {
  const cart = await getCartForUser(userId);

  cart.itens = cart.itens.filter(
    (item) =>
      String(item.id_produto?._id || item.id_produto) !== String(productId),
  );

  if (!cart.itens.length) {
    cart.id_farmacia = null;
    cart.id_endereco_entrega = null;
  }

  cart.recalcularTotais();
  cart.renovarExpiracao();

  return saveAndPopulateCart(cart);
}

async function updateItemQuantity(userId, productId, novaQuantidade) {
  const quantity = Number(novaQuantidade);
  if (!Number.isFinite(quantity)) {
    throw createError("Quantidade inválida", 400);
  }

  if (quantity <= 0) {
    return removeItem(userId, productId);
  }

  const cart = await getCartForUser(userId);
  const item = cart.itens.find(
    (currentItem) =>
      String(currentItem.id_produto?._id || currentItem.id_produto) ===
      String(productId),
  );

  if (!item) {
    throw createError("Item não encontrado no carrinho", 404);
  }

  const product = await getProductOrThrow(productId);
  if (product.estoque < quantity) {
    throw createError("Estoque insuficiente", 400);
  }

  let prescription = null;
  if (item.id_receita) {
    prescription = await getPrescriptionOrThrow(item.id_receita, userId);
  }

  warnControlledQuantity(product, quantity, prescription);
  await validateControlledMonthlyLimit(userId, product, quantity);

  item.quantidade = quantity;
  item.preco_unitario = getProductUnitPrice(product);
  item.nome_produto = product.nome;
  item.controlado = product.controlado;
  item.receita_obrigatoria = product.receita_obrigatoria;
  item.subtotal = item.preco_unitario * item.quantidade;

  cart.recalcularTotais();
  cart.renovarExpiracao();

  return saveAndPopulateCart(cart);
}

async function clearCart(userId) {
  const cart = await getCartForUser(userId);

  cart.itens = [];
  cart.id_farmacia = null;
  cart.id_endereco_entrega = null;
  cart.subtotal = 0;
  cart.taxa_entrega = 0;
  cart.total = 0;

  return saveAndPopulateCart(cart);
}

async function setDeliveryOptions(userId, { tipoEntrega, enderecoId }) {
  const cart = await getCartForUser(userId);
  ensureCartHasItems(cart);

  let address = null;
  if (tipoEntrega === "moto" || tipoEntrega === "drone") {
    if (!enderecoId) {
      throw createError("Endereço de entrega obrigatório", 400);
    }

    address = await getAddressOrThrow(enderecoId, userId);
  } else if (enderecoId) {
    address = await getAddressOrThrow(enderecoId, userId);
  }

  const pharmacy = await getPharmacyOrThrow(cart.id_farmacia);
  const freight = calculateFreight({
    tipoEntrega,
    enderecoOrigem: buildPharmacyCoordinates(pharmacy),
    enderecoDestino: buildAddressCoordinates(address),
    subtotal: cart.subtotal,
  });

  cart.tipo_entrega = tipoEntrega;
  cart.id_endereco_entrega =
    tipoEntrega === "retirada" || tipoEntrega === "drive-thru"
      ? null
      : address._id;
  cart.taxa_entrega = freight.taxa_entrega;
  cart.recalcularTotais();
  cart.renovarExpiracao();

  const carrinho = await saveAndPopulateCart(cart);

  return {
    carrinho,
    frete: {
      taxa_entrega: freight.taxa_entrega,
      tempo_estimado: freight.tempo_estimado_minutos,
    },
  };
}

async function getDeliveryOptions(userId) {
  const cart = await getCartForUser(userId);
  ensureCartHasItems(cart);

  const pharmacy = await getPharmacyOrThrow(cart.id_farmacia);
  const defaultAddress = await Address.findOne({
    id_usuario: userId,
    padrao: true,
    ativo: true,
  });

  return getFreightOptions(
    buildPharmacyCoordinates(pharmacy),
    buildAddressCoordinates(defaultAddress),
    cart.subtotal,
  );
}

async function checkout(userId) {
  const cart = await Cart.findOne({
    id_usuario: userId,
    ativo: true,
    expira_em: { $gt: new Date() },
  }).populate([
    ...CART_POPULATE,
    {
      path: "id_endereco_entrega",
      select: "logradouro numero complemento bairro cidade estado cep",
    },
  ]);

  if (!cart) {
    throw createError("Carrinho vazio", 400);
  }

  ensureCartHasItems(cart);

  if (
    (cart.tipo_entrega === "moto" || cart.tipo_entrega === "drone") &&
    !cart.id_endereco_entrega
  ) {
    throw createError("Defina o endereço de entrega antes de finalizar", 400);
  }

  const refreshedItems = [];

  for (const item of cart.itens) {
    const product = await getProductOrThrow(
      item.id_produto?._id || item.id_produto,
    );

    if (product.estoque < item.quantidade) {
      throw createError(`Produto ${product.nome} sem estoque suficiente`, 400);
    }

    if (item.receita_obrigatoria && !item.id_receita) {
      throw createError(`Receita obrigatória para ${product.nome}`, 400);
    }

    refreshedItems.push({
      id_produto: product._id,
      nome_produto: item.nome_produto || product.nome,
      preco_unitario: item.preco_unitario,
      quantidade: item.quantidade,
      subtotal: item.preco_unitario * item.quantidade,
      controlado: item.controlado,
      id_receita: item.id_receita || null,
    });
  }

  cart.recalcularTotais();

  if (cart.total > 5000) {
    throw createError(
      "Pedido bloqueado para análise de segurança. Entre em contato com o suporte.",
      400,
    );
  }

  await prescriptionService.validateOrderItemsPrescriptions(
    userId,
    cart.id_farmacia,
    refreshedItems,
  );

  const deliveryAddress = cart.id_endereco_entrega
    ? await getAddressOrThrow(
        cart.id_endereco_entrega._id || cart.id_endereco_entrega,
        userId,
      )
    : null;

  // Generate NF number (simulated)
  const nfTimestamp = Date.now().toString(36).toUpperCase();
  const nfRandom = crypto.randomInt(1000, 9999);
  const numero_nf = `NF-${nfTimestamp}-${nfRandom}`;

  const order = new Order({
    id_usuario: userId,
    id_farmacia: cart.id_farmacia,
    itens: refreshedItems,
    tipo_entrega: cart.tipo_entrega,
    endereco_entrega: buildAddressSnapshot(deliveryAddress),
    subtotal: cart.subtotal,
    taxa_entrega: cart.taxa_entrega,
    total: cart.total,
    numero_nf,
    metodo_pagamento: cart.metodo_pagamento || "pix",
    status: "aguardando_pagamento",
    status_pagamento: "pendente",
    aprovado_farmaceutico: false,
    historico_status: [
      {
        status: "aguardando_pagamento",
        observacao: "Pedido criado a partir do carrinho",
      },
    ],
  });

  await order.save();

  // Marca receitas como utilizadas neste pedido (RN01 / uma dispensação por compra)
  const prescriptionIds = refreshedItems
    .map((item) => item.id_receita)
    .filter(Boolean);

  if (prescriptionIds.length > 0) {
    await prescriptionService.consumePrescriptionsLinkedToOrder(order);
  }

  cart.ativo = false;
  await cart.save();

  return order;
}

async function abandonCart(userId) {
  if (!isValidObjectId(userId)) {
    throw createError("Usuário não encontrado", 404);
  }

  const cart = await Cart.findOne({ id_usuario: userId, ativo: true });
  if (cart) {
    cart.ativo = false;
    await cart.save();
  }

  return { message: "Carrinho abandonado" };
}

async function expireAbandonedCarts() {
  const carts = await Cart.find({
    ativo: true,
    expira_em: { $lt: new Date() },
  });

  for (const cart of carts) {
    cart.ativo = false;
    await cart.save();
  }

  return carts.length;
}

module.exports = {
  getOrCreateCart,
  addItem,
  removeItem,
  updateItemQuantity,
  clearCart,
  setDeliveryOptions,
  getDeliveryOptions,
  checkout,
  abandonCart,
  expireAbandonedCarts,
};
