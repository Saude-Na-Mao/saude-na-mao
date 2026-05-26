const geoService = require("../services/geoService");

async function geocodeCep(req, res, next) {
  try {
    const { cep } = req.params;
    const resultado = await geoService.geocodeCep(cep);

    return res.status(200).json({
      success: true,
      data: resultado,
      message: "CEP geocodificado com sucesso",
    });
  } catch (error) {
    return next(error);
  }
}

async function geocodeAddress(req, res, next) {
  try {
    const endereco = req.query.q;

    if (!endereco) {
      return res.status(400).json({
        success: false,
        data: {},
        message: "Parâmetro q (endereço) é obrigatório",
      });
    }

    const resultado = await geoService.geocodeAddress(endereco);

    return res.status(200).json({
      success: true,
      data: resultado,
      message: "Endereço geocodificado com sucesso",
    });
  } catch (error) {
    return next(error);
  }
}

async function findNearbyPharmacies(req, res, next) {
  try {
    const { endereco, cep, latitude, longitude, raioKm, limit } = req.query;

    const resultado = await geoService.findPharmaciesNearAddress({
      endereco,
      cep,
      latitude: latitude !== undefined ? parseFloat(latitude) : undefined,
      longitude: longitude !== undefined ? parseFloat(longitude) : undefined,
      raioKm: raioKm !== undefined ? parseFloat(raioKm) : 5,
      limit: limit !== undefined ? parseInt(limit, 10) : 10,
    });

    return res.status(200).json({
      success: true,
      data: resultado,
      message: "Farmácias próximas encontradas com sucesso",
    });
  } catch (error) {
    return next(error);
  }
}

async function getDistanceMatrix(req, res, next) {
  try {
    const { origem, destinos } = req.body;

    if (!origem || !destinos) {
      return res.status(400).json({
        success: false,
        data: {},
        message: "Origem e destinos são obrigatórios",
      });
    }

    const distancias = await geoService.getDistanceMatrix({
      origem,
      destinos,
    });

    return res.status(200).json({
      success: true,
      data: { distancias },
      message: "Matriz de distância calculada com sucesso",
    });
  } catch (error) {
    return next(error);
  }
}

async function getDirections(req, res, next) {
  try {
    const { origem_lat, origem_lng, destino_lat, destino_lng, modo } =
      req.query;

    const origem = {
      latitude: parseFloat(origem_lat),
      longitude: parseFloat(origem_lng),
    };

    const destino = {
      latitude: parseFloat(destino_lat),
      longitude: parseFloat(destino_lng),
    };

    const rota = await geoService.getDirections({
      origem,
      destino,
      modo,
    });

    return res.status(200).json({
      success: true,
      data: rota,
      message: "Rota obtida com sucesso",
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  geocodeCep,
  geocodeAddress,
  findNearbyPharmacies,
  getDistanceMatrix,
  getDirections,
};
