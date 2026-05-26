const mongoose = require("mongoose");
const MedicineCatalog = require("../models/MedicineCatalog");

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function searchCatalog({ q, page = 1, limit = 20 } = {}) {
  const filtro = { ativo: true };
  const termo = String(q || "").trim();
  if (termo) {
    filtro.$text = { $search: termo };
  }

  const sort = termo ? { score: { $meta: "textScore" } } : { nome: 1 };

  return MedicineCatalog.paginate(filtro, {
    page: Number(page) || 1,
    limit: Math.min(Number(limit) || 20, 50),
    sort,
    projection: termo ? { score: { $meta: "textScore" } } : {},
  });
}

async function getCatalogById(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError("Item do catálogo não encontrado", 404);
  }
  const item = await MedicineCatalog.findById(id);
  if (!item || !item.ativo) {
    throw createError("Item do catálogo não encontrado", 404);
  }
  return item;
}

async function listCatalogAdmin({ page = 1, limit = 30, q } = {}) {
  const filtro = {};
  const termo = String(q || "").trim();
  if (termo) {
    filtro.$or = [
      { nome: new RegExp(termo, "i") },
      { principio_ativo: new RegExp(termo, "i") },
    ];
  }
  return MedicineCatalog.paginate(filtro, {
    page: Number(page) || 1,
    limit: Math.min(Number(limit) || 30, 100),
    sort: { nome: 1 },
  });
}

async function createCatalogEntry(dados) {
  const item = new MedicineCatalog(dados);
  await item.save();
  return item;
}

async function updateCatalogEntry(id, dados) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError("Item do catálogo não encontrado", 404);
  }
  const item = await MedicineCatalog.findByIdAndUpdate(id, dados, {
    new: true,
    runValidators: true,
  });
  if (!item) {
    throw createError("Item do catálogo não encontrado", 404);
  }
  return item;
}

module.exports = {
  searchCatalog,
  getCatalogById,
  listCatalogAdmin,
  createCatalogEntry,
  updateCatalogEntry,
};
