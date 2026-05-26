const faqService = require("../services/faqService");

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sendSuccess(res, { statusCode = 200, message = "", data = {} }) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

async function listFAQs(req, res, next) {
  try {
    const { categoria, page, limit } = req.query;
    const resultado = await faqService.listFAQs({ categoria, page, limit });

    return sendSuccess(res, { data: resultado });
  } catch (error) {
    return next(error);
  }
}

async function searchFAQs(req, res, next) {
  try {
    const { q } = req.query;

    if (!q) {
      throw createError("Parâmetro de busca obrigatório", 400);
    }

    const resultados = await faqService.searchFAQs(q);

    return sendSuccess(res, { data: { resultados } });
  } catch (error) {
    return next(error);
  }
}

async function getFAQById(req, res, next) {
  try {
    const { id } = req.params;
    const faq = await faqService.getFAQById(id);

    return sendSuccess(res, { data: { faq } });
  } catch (error) {
    return next(error);
  }
}

async function rateFAQ(req, res, next) {
  try {
    const { id } = req.params;
    const { util } = req.body;
    const contagens = await faqService.rateFAQ(id, util);

    return sendSuccess(res, { data: contagens });
  } catch (error) {
    return next(error);
  }
}

async function getPopularFAQs(req, res, next) {
  try {
    const { limit } = req.query;
    const faqs = await faqService.getPopularFAQs(limit);

    return sendSuccess(res, { data: { faqs } });
  } catch (error) {
    return next(error);
  }
}

async function getFAQsByCategory(req, res, next) {
  try {
    const faqs = await faqService.getFAQsByCategory();

    return sendSuccess(res, { data: faqs });
  } catch (error) {
    return next(error);
  }
}

async function createFAQ(req, res, next) {
  try {
    const faq = await faqService.createFAQ(req.body);

    return sendSuccess(res, {
      statusCode: 201,
      data: { faq },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateFAQ(req, res, next) {
  try {
    const { id } = req.params;
    const faq = await faqService.updateFAQ(id, req.body);

    return sendSuccess(res, { data: { faq } });
  } catch (error) {
    return next(error);
  }
}

async function deleteFAQ(req, res, next) {
  try {
    const { id } = req.params;
    const resultado = await faqService.deleteFAQ(id);

    return sendSuccess(res, {
      message: resultado.message,
      data: {},
    });
  } catch (error) {
    return next(error);
  }
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
