const mongoose = require("mongoose");
const FAQ = require("../models/FAQ");

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizePagination(page, limit, defaultLimit = 20) {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);

  return {
    page: Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage,
    limit:
      Number.isNaN(parsedLimit) || parsedLimit < 1 ? defaultLimit : parsedLimit,
  };
}

function ensureValidFaqId(faqId) {
  if (!mongoose.Types.ObjectId.isValid(faqId)) {
    throw createError("FAQ não encontrada", 404);
  }
}

async function listFAQs({ categoria, page = 1, limit = 20 } = {}) {
  const pagination = normalizePagination(page, limit, 20);
  const filtro = { ativo: true };

  if (categoria) {
    filtro.categoria = categoria;
  }

  const total = await FAQ.countDocuments(filtro);
  const faqs = await FAQ.find(filtro)
    .sort({ ordem: 1, visualizacoes: -1 })
    .skip((pagination.page - 1) * pagination.limit)
    .limit(pagination.limit);

  return {
    faqs,
    total,
    pagina: pagination.page,
    totalPaginas: Math.ceil(total / pagination.limit) || 1,
  };
}

async function searchFAQs(termo) {
  if (!termo || !String(termo).trim()) {
    const resultado = await listFAQs();
    return resultado.faqs;
  }

  const faqs = await FAQ.find(
    { $text: { $search: termo }, ativo: true },
    { score: { $meta: "textScore" } },
  )
    .sort({ score: { $meta: "textScore" } })
    .limit(10);

  return faqs;
}

async function getFAQById(faqId) {
  ensureValidFaqId(faqId);

  const faq = await FAQ.findOne({ _id: faqId, ativo: true });

  if (!faq) {
    throw createError("FAQ não encontrada", 404);
  }

  await FAQ.findByIdAndUpdate(faqId, { $inc: { visualizacoes: 1 } });
  faq.visualizacoes += 1;

  return faq;
}

async function rateFAQ(faqId, util) {
  ensureValidFaqId(faqId);

  const incrementField = util ? "util_sim" : "util_nao";
  const faq = await FAQ.findOneAndUpdate(
    { _id: faqId, ativo: true },
    { $inc: { [incrementField]: 1 } },
    { new: true },
  );

  if (!faq) {
    throw createError("FAQ não encontrada", 404);
  }

  return {
    util_sim: faq.util_sim,
    util_nao: faq.util_nao,
  };
}

async function getPopularFAQs(limit = 5) {
  const parsedLimit = Number.parseInt(limit, 10);
  const resolvedLimit =
    Number.isNaN(parsedLimit) || parsedLimit < 1 ? 5 : parsedLimit;

  const faqs = await FAQ.find({ ativo: true })
    .sort({ visualizacoes: -1 })
    .limit(resolvedLimit);

  return faqs;
}

async function getFAQsByCategory() {
  const groupedFaqs = await FAQ.aggregate([
    { $match: { ativo: true } },
    { $sort: { ordem: 1, visualizacoes: -1 } },
    {
      $group: {
        _id: "$categoria",
        faqs: { $push: "$$ROOT" },
      },
    },
  ]);

  return groupedFaqs.reduce((accumulator, item) => {
    accumulator[item._id] = item.faqs;
    return accumulator;
  }, {});
}

async function createFAQ({ pergunta, resposta, categoria, tags, ordem }) {
  const faq = new FAQ({
    pergunta,
    resposta,
    categoria,
    tags,
    ordem,
  });

  await faq.save();
  return faq;
}

async function updateFAQ(faqId, dados) {
  ensureValidFaqId(faqId);

  const faq = await FAQ.findByIdAndUpdate(faqId, dados, {
    new: true,
    runValidators: true,
  });

  if (!faq) {
    throw createError("FAQ não encontrada", 404);
  }

  return faq;
}

async function deleteFAQ(faqId) {
  ensureValidFaqId(faqId);

  const faq = await FAQ.findByIdAndUpdate(
    faqId,
    { ativo: false },
    { new: true },
  );

  if (!faq) {
    throw createError("FAQ não encontrada", 404);
  }

  return { message: "FAQ removida" };
}

module.exports = {
  listFAQs,
  searchFAQs,
  getFAQById,
  rateFAQ,
  getPopularFAQs,
  getFAQsByCategory,
  createFAQ,
  updateFAQ,
  deleteFAQ,
};
