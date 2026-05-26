const productService = require("../services/productService");
const Product = require("../models/Product");
const { verificarInteracoes } = require("../utils/drugInteractions");
const { buildPublicImageUrl } = require("../utils/publicUrl");

async function searchProducts(req, res, next) {
  try {
    const {
      q,
      termo,
      categoria,
      id_farmacia,
      preco_min,
      preco_max,
      disponivel,
      controlado,
      ordenar,
      sort,
      page,
      limit,
    } = req.query;

    let ordenacaoFinal = ordenar;
    if (!ordenacaoFinal && sort) {
      const sortMap = {
        preco: "preco_asc",
        "-preco": "preco_desc",
        nome: "nome",
        "-nome": "nome_desc",
      };
      ordenacaoFinal = sortMap[sort] || sort;
    }

    const resultado = await productService.searchProducts({
      termo: termo || q,
      categoria,
      id_farmacia,
      preco_min,
      preco_max,
      disponivel,
      controlado,
      ordenar: ordenacaoFinal,
      page,
      limit,
    });
    res.json({ success: true, data: resultado });
  } catch (error) {
    next(error);
  }
}

async function getProductById(req, res, next) {
  try {
    const produto = await productService.getProductById(req.params.id);
    res.json({ success: true, data: { produto } });
  } catch (error) {
    next(error);
  }
}

async function getCategories(req, res, next) {
  try {
    const categorias = await productService.getCategories();
    res.json({ success: true, data: { categorias } });
  } catch (error) {
    next(error);
  }
}

async function getProductsByCategory(req, res, next) {
  try {
    const { categoria } = req.params;
    const { page, limit } = req.query;
    const resultado = await productService.getProductsByCategory(categoria, {
      page,
      limit,
    });
    res.json({ success: true, data: resultado });
  } catch (error) {
    next(error);
  }
}

async function createProduct(req, res, next) {
  try {
    const produto = await productService.createProduct(req.body);
    res.status(201).json({
      success: true,
      message: "Produto cadastrado com sucesso",
      data: { produto },
    });
  } catch (error) {
    next(error);
  }
}

async function updateProduct(req, res, next) {
  try {
    const produto = await productService.updateProduct(req.params.id, req.body);
    res.json({
      success: true,
      message: "Produto atualizado com sucesso",
      data: { produto },
    });
  } catch (error) {
    next(error);
  }
}

async function getFeaturedProducts(req, res, next) {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const produtos = await productService.getFeaturedProducts(limit);
    res.json({ success: true, data: { produtos } });
  } catch (error) {
    next(error);
  }
}

async function checkInteractions(req, res, next) {
  try {
    const { principios_ativos, product_ids } = req.body;
    let ativos = [];

    if (principios_ativos && Array.isArray(principios_ativos)) {
      ativos = principios_ativos;
    } else if (product_ids && Array.isArray(product_ids)) {
      const products = await Product.find({ _id: { $in: product_ids } }).select("nome principio_ativo interacoes");
      ativos = products
        .map((p) => p.principio_ativo || p.nome)
        .filter(Boolean);
    }

    if (ativos.length < 2) {
      return res.json({ success: true, data: { interacoes: [], mensagem: "Mínimo de 2 princípios ativos para verificar interações" } });
    }

    const interacoes = verificarInteracoes(ativos);
    return res.json({
      success: true,
      data: {
        interacoes,
        total: interacoes.length,
        tem_grave: interacoes.some((i) => i.severidade === "grave"),
      },
    });
  } catch (error) {
    next(error);
  }
}

async function uploadProductImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Nenhuma imagem enviada",
      });
    }

    const relativePath = `uploads/produtos/${req.file.filename}`.replace(/\\/g, "/");
    const url = `/${relativePath}`;
    const url_publica = buildPublicImageUrl(relativePath);

    res.status(201).json({
      success: true,
      message: "Imagem enviada com sucesso",
      data: { url, url_publica },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  searchProducts,
  getProductById,
  getCategories,
  getProductsByCategory,
  createProduct,
  updateProduct,
  getFeaturedProducts,
  checkInteractions,
  uploadProductImage,
};
