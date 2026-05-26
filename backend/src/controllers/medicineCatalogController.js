const medicineCatalogService = require("../services/medicineCatalogService");

async function searchCatalog(req, res, next) {
  try {
    const { q, page, limit } = req.query;
    const resultado = await medicineCatalogService.searchCatalog({ q, page, limit });
    res.json({
      success: true,
      data: {
        itens: resultado.docs,
        total: resultado.totalDocs,
        pagina: resultado.page,
        totalPaginas: resultado.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function listAdmin(req, res, next) {
  try {
    const { q, page, limit } = req.query;
    const resultado = await medicineCatalogService.listCatalogAdmin({ q, page, limit });
    res.json({
      success: true,
      data: {
        itens: resultado.docs,
        total: resultado.totalDocs,
        pagina: resultado.page,
        totalPaginas: resultado.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function createAdmin(req, res, next) {
  try {
    const item = await medicineCatalogService.createCatalogEntry(req.body);
    res.status(201).json({
      success: true,
      message: "Item adicionado ao catálogo",
      data: { item },
    });
  } catch (error) {
    next(error);
  }
}

async function updateAdmin(req, res, next) {
  try {
    const item = await medicineCatalogService.updateCatalogEntry(req.params.id, req.body);
    res.json({
      success: true,
      message: "Catálogo atualizado",
      data: { item },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  searchCatalog,
  listAdmin,
  createAdmin,
  updateAdmin,
};
