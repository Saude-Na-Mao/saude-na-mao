const mongoose = require("mongoose");
const Product = require("../models/Product");
const Pharmacy = require("../models/Pharmacy");
const medicineCatalogService = require("./medicineCatalogService");

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const PRESCRIPTION_CLASSES = new Set([
  "tarja_vermelha",
  "tarja_preta",
  "antimicrobiano",
  "controlado_a",
]);

function normalizeProductPayload(dados) {
  const payload = { ...dados };
  const tipo = payload.tipo_produto || "medicamento_otc";

  if (tipo === "outro") {
    payload.principio_ativo = payload.principio_ativo || "N/A";
    payload.classificacao_receita = "sem_receita";
    payload.receita_obrigatoria = false;
    payload.controlado = false;
    payload.id_catalogo = null;
    return payload;
  }

  if (tipo === "medicamento_otc") {
    payload.classificacao_receita = "sem_receita";
    payload.receita_obrigatoria = false;
    payload.controlado = false;
    payload.id_catalogo = null;
    if (!payload.principio_ativo?.trim()) {
      throw createError("Princípio ativo é obrigatório para medicamentos", 400);
    }
    return payload;
  }

  return payload;
}

function validateCreateRules(payload) {
  const classificacao = payload.classificacao_receita || "sem_receita";
  const needsCatalog =
    PRESCRIPTION_CLASSES.has(classificacao) && !payload.id_catalogo;

  if (needsCatalog && payload.tipo_produto !== "medicamento_catalogo") {
    throw createError(
      "Medicamentos com receita devem ser ativados pelo catálogo oficial, não cadastrados manualmente.",
      400,
    );
  }

  if (payload.tipo_produto === "outro" && PRESCRIPTION_CLASSES.has(classificacao)) {
    throw createError("Outros itens não podem exigir receita médica.", 400);
  }
}

async function searchProducts({
  termo,
  categoria,
  id_farmacia,
  preco_min,
  preco_max,
  disponivel,
  controlado,
  ordenar = "relevancia",
  page = 1,
  limit = 20,
} = {}) {
  const filtro = { ativo: true };

  if (termo) {
    filtro.$text = { $search: termo };
  }

  if (categoria) {
    filtro.categoria = new RegExp(categoria, "i");
  }

  if (id_farmacia) {
    filtro.id_farmacia = id_farmacia;
  }

  if (preco_min !== undefined || preco_max !== undefined) {
    filtro.preco = {};
    if (preco_min !== undefined) filtro.preco.$gte = parseFloat(preco_min);
    if (preco_max !== undefined) filtro.preco.$lte = parseFloat(preco_max);
  }

  if (disponivel === "true") {
    filtro.estoque = { $gt: 0 };
  }

  if (controlado !== undefined) {
    filtro.controlado = controlado === "true";
  }

  let ordenacao;
  if (ordenar === "relevancia" && termo) {
    ordenacao = { score: { $meta: "textScore" } };
  } else if (ordenar === "preco_asc") {
    ordenacao = { preco: 1 };
  } else if (ordenar === "preco_desc") {
    ordenacao = { preco: -1 };
  } else if (ordenar === "nome") {
    ordenacao = { nome: 1 };
  } else if (ordenar === "nome_desc") {
    ordenacao = { nome: -1 };
  } else {
    ordenacao = { createdAt: -1 };
  }

  const resultado = await Product.paginate(filtro, {
    page,
    limit,
    sort: ordenacao,
    populate: { path: "id_farmacia", select: "nome cidade estado avaliacao" },
    projection: termo ? { score: { $meta: "textScore" } } : {},
  });

  return resultado;
}

async function getProductById(productId) {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw createError("Medicamento não encontrado", 404);
  }

  const produto = await Product.findById(productId).populate({
    path: "id_farmacia",
    select: "nome cidade estado telefone bairro logradouro horario_funcionamento avaliacao",
  });

  if (!produto || !produto.ativo) {
    throw createError("Medicamento não encontrado", 404);
  }

  return produto;
}

async function getCategories() {
  const categorias = await Product.distinct("categoria", { ativo: true });
  return categorias.sort();
}

async function getProductsByCategory(categoria, { page = 1, limit = 20 } = {}) {
  const filtro = {
    categoria: new RegExp(categoria, "i"),
    ativo: true,
    estoque: { $gt: 0 },
  };

  const resultado = await Product.paginate(filtro, {
    page,
    limit,
    sort: { nome: 1 },
    populate: { path: "id_farmacia", select: "nome cidade estado avaliacao" },
  });

  return resultado;
}

async function createProduct(dados) {
  if (!mongoose.Types.ObjectId.isValid(dados.id_farmacia)) {
    throw createError("Farmácia não encontrada", 404);
  }

  const farmacia = await Pharmacy.findById(dados.id_farmacia);
  if (!farmacia) {
    throw createError("Farmácia não encontrada", 404);
  }

  const payload = normalizeProductPayload(dados);
  validateCreateRules(payload);

  const produto = new Product(payload);
  await produto.save();

  return produto.populate({ path: "id_farmacia", select: "-__v" });
}

async function activateFromCatalog(pharmacyId, { id_catalogo, estoque, preco }) {
  if (!mongoose.Types.ObjectId.isValid(pharmacyId)) {
    throw createError("Farmácia não encontrada", 404);
  }

  const farmacia = await Pharmacy.findById(pharmacyId);
  if (!farmacia) {
    throw createError("Farmácia não encontrada", 404);
  }

  const catalogItem = await medicineCatalogService.getCatalogById(id_catalogo);

  const existing = await Product.findOne({
    id_farmacia: pharmacyId,
    id_catalogo: catalogItem._id,
    ativo: true,
  });
  if (existing) {
    throw createError("Este medicamento já está ativo na sua farmácia", 409);
  }

  const estoqueNum = Number(estoque);
  const precoNum =
    preco != null && preco !== ""
      ? Number(preco)
      : catalogItem.preco_sugerido != null
        ? Number(catalogItem.preco_sugerido)
        : null;

  if (!Number.isFinite(estoqueNum) || estoqueNum < 0) {
    throw createError("Estoque inválido", 400);
  }
  if (!Number.isFinite(precoNum) || precoNum < 0) {
    throw createError("Preço é obrigatório na ativação", 400);
  }

  const imagens = catalogItem.imagem_url ? [catalogItem.imagem_url] : [];

  const produto = new Product({
    nome: catalogItem.nome,
    principio_ativo: catalogItem.principio_ativo,
    categoria: catalogItem.categoria,
    dosagem: catalogItem.dosagem,
    fabricante: catalogItem.fabricante,
    forma_farmaceutica: catalogItem.forma_farmaceutica,
    descricao: catalogItem.descricao,
    classificacao_receita: catalogItem.classificacao_receita,
    receita_obrigatoria: catalogItem.receita_obrigatoria,
    controlado: catalogItem.controlado,
    validade_receita_dias: catalogItem.validade_receita_dias,
    registro_anvisa: catalogItem.registro_anvisa,
    codigo_ean: catalogItem.codigo_ean,
    imagens,
    preco: precoNum,
    estoque: estoqueNum,
    id_farmacia: pharmacyId,
    tipo_produto: "medicamento_catalogo",
    id_catalogo: catalogItem._id,
    ativo: true,
  });

  await produto.save();
  return produto.populate({ path: "id_farmacia", select: "nome cidade estado" });
}

async function updateProduct(productId, dados) {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw createError("Medicamento não encontrado", 404);
  }

  const existing = await Product.findById(productId);
  if (!existing) {
    throw createError("Medicamento não encontrado", 404);
  }

  const { id_farmacia, ...updateData } = dados;

  if (existing.tipo_produto === "medicamento_catalogo") {
    const allowed = new Set(["estoque", "preco", "ativo", "preco_promocional"]);
    const keys = Object.keys(updateData);
    const invalid = keys.filter((k) => !allowed.has(k));
    if (invalid.length > 0) {
      throw createError(
        "Produtos do catálogo só permitem alterar estoque, preço, status ativo e preço promocional.",
        400,
      );
    }
  }

  if (existing.tipo_produto === "medicamento_catalogo") {
    if (updateData.classificacao_receita || updateData.nome || updateData.principio_ativo) {
      throw createError("Dados do catálogo não podem ser alterados manualmente.", 400);
    }
  }

  const produto = await Product.findByIdAndUpdate(productId, updateData, {
    new: true,
    runValidators: true,
  }).populate({ path: "id_farmacia", select: "nome cidade estado avaliacao" });

  return produto;
}

async function updateStock(productId, quantidade) {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw createError("Medicamento não encontrado", 404);
  }

  const produto = await Product.findByIdAndUpdate(
    productId,
    { $inc: { estoque: quantidade } },
    { new: true, runValidators: true },
  );

  if (!produto) {
    throw createError("Medicamento não encontrado", 404);
  }

  if (produto.estoque < 0) {
    await Product.findByIdAndUpdate(productId, {
      $inc: { estoque: -quantidade },
    });
    throw createError("Estoque insuficiente", 400);
  }

  return produto;
}

async function getFeaturedProducts(limit = 10) {
  const produtos = await Product.find({ ativo: true, estoque: { $gt: 0 } })
    .populate({ path: "id_farmacia", select: "nome cidade estado avaliacao" })
    .sort({ "id_farmacia.avaliacao": -1, createdAt: -1 })
    .limit(limit);

  return produtos;
}

module.exports = {
  searchProducts,
  getProductById,
  getCategories,
  getProductsByCategory,
  createProduct,
  activateFromCatalog,
  updateProduct,
  updateStock,
  getFeaturedProducts,
};
