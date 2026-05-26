const { Client } = require("@googlemaps/google-maps-services-js");
const axios = require("axios");
const Pharmacy = require("../models/Pharmacy");
const Product = require("../models/Product");

const googleMapsClient = new Client({});
const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseCoordinate(value) {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatDistance(distanceKm) {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }

  return `${distanceKm.toFixed(1)} km`;
}

function estimateDuration(distanceKm) {
  const averageSpeedKmH = 40;
  const durationSeconds = Math.round((distanceKm / averageSpeedKmH) * 3600);
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.max(1, Math.round((durationSeconds % 3600) / 60));

  if (hours > 0) {
    return {
      text: `${hours} h ${minutes} min`,
      seconds: durationSeconds,
    };
  }

  return {
    text: `${minutes} min`,
    seconds: durationSeconds,
  };
}

async function geocodeAddress(endereco) {
  if (!GOOGLE_KEY) {
    throw createError("Google Maps API não configurada", 500);
  }

  const response = await googleMapsClient.geocode({
    params: {
      address: endereco,
      key: GOOGLE_KEY,
      language: "pt-BR",
    },
  });

  const results = response.data.results || [];
  if (!results.length) {
    throw createError("Endereço não encontrado", 404);
  }

  const firstResult = results[0];
  return {
    latitude: firstResult.geometry.location.lat,
    longitude: firstResult.geometry.location.lng,
    endereco_formatado: firstResult.formatted_address,
  };
}

async function geocodeCep(cep) {
  const cepLimpo = String(cep || "").replace(/\D/g, "");

  if (!cepLimpo || cepLimpo.length !== 8) {
    throw createError("CEP não encontrado", 400);
  }

  let response;
  try {
    response = await axios.get(`https://viacep.com.br/ws/${cepLimpo}/json/`);
  } catch {
    throw createError("CEP não encontrado", 400);
  }

  const data = response.data;
  if (!data || data.erro) {
    throw createError("CEP não encontrado", 400);
  }

  const enderecoCompleto = `${data.logradouro}, ${data.localidade}, ${data.uf}, Brasil`;

  let latitude = null;
  let longitude = null;

  if (GOOGLE_KEY) {
    const geocode = await geocodeAddress(enderecoCompleto);
    latitude = geocode.latitude;
    longitude = geocode.longitude;
  }

  return {
    latitude,
    longitude,
    logradouro: data.logradouro || "",
    bairro: data.bairro || "",
    cidade: data.localidade || "",
    estado: data.uf || "",
    cep: data.cep || cepLimpo,
  };
}

async function findPharmaciesNearAddress({
  endereco,
  cep,
  latitude,
  longitude,
  raioKm = 5,
  limit = 10,
}) {
  let lat = parseCoordinate(latitude);
  let lon = parseCoordinate(longitude);

  if (lat === null || lon === null) {
    if (cep) {
      const cepData = await geocodeCep(cep);
      lat = cepData.latitude;
      lon = cepData.longitude;

      if (lat === null || lon === null) {
        throw createError(
          "Não foi possível obter coordenadas a partir do CEP informado",
          400,
        );
      }
    } else if (endereco) {
      const enderecoData = await geocodeAddress(endereco);
      lat = enderecoData.latitude;
      lon = enderecoData.longitude;
    } else {
      throw createError("Forneça localização, CEP ou endereço", 400);
    }
  }

  const farmacias = await Pharmacy.find({
    ativa: true,
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lon, lat] },
        $maxDistance: raioKm * 1000,
      },
    },
  }).limit(parseInt(limit, 10));

  const farmaciasProximas = farmacias.map((farmacia) => {
    const farmaciaObj = farmacia.toObject();
    const [farmaciaLon, farmaciaLat] = farmacia.location?.coordinates || [];
    const distanciaKm =
      farmaciaLat !== undefined && farmaciaLon !== undefined
        ? haversine(lat, lon, farmaciaLat, farmaciaLon)
        : null;

    return {
      ...farmaciaObj,
      distancia_km: distanciaKm !== null ? distanciaKm.toFixed(1) : null,
    };
  });

  return {
    coordenadas: {
      latitude: lat,
      longitude: lon,
    },
    farmaciasPróximas: farmaciasProximas,
  };
}

async function getDistanceMatrix({ origem, destinos }) {
  const origemFormatada = `${origem.latitude},${origem.longitude}`;

  if (!GOOGLE_KEY) {
    return destinos.map((destino) => {
      const distanceKm = haversine(
        origem.latitude,
        origem.longitude,
        destino.latitude,
        destino.longitude,
      );
      const duration = estimateDuration(distanceKm);

      return {
        distancia_texto: formatDistance(distanceKm),
        distancia_metros: Math.round(distanceKm * 1000),
        duracao_texto: duration.text,
        duracao_segundos: duration.seconds,
      };
    });
  }

  const destinosFormatados = destinos.map(
    (destino) => `${destino.latitude},${destino.longitude}`,
  );

  const response = await googleMapsClient.distancematrix({
    params: {
      origins: [origemFormatada],
      destinations: destinosFormatados,
      key: GOOGLE_KEY,
      language: "pt-BR",
      mode: "driving",
    },
  });

  const elements = response.data.rows?.[0]?.elements || [];
  return elements.map((element) => ({
    distancia_texto: element.distance?.text || null,
    distancia_metros: element.distance?.value || null,
    duracao_texto: element.duration?.text || null,
    duracao_segundos: element.duration?.value || null,
  }));
}

async function getDirections({ origem, destino, modo = "driving" }) {
  if (!GOOGLE_KEY) {
    const distanceKm = haversine(
      origem.latitude,
      origem.longitude,
      destino.latitude,
      destino.longitude,
    );
    const duration = estimateDuration(distanceKm);

    return {
      mensagem: "Rotas detalhadas requerem Google Maps API",
      distancia_texto: formatDistance(distanceKm),
      distancia_metros: Math.round(distanceKm * 1000),
      duracao_texto: duration.text,
      duracao_segundos: duration.seconds,
      passos: [],
    };
  }

  const response = await googleMapsClient.directions({
    params: {
      origin: `${origem.latitude},${origem.longitude}`,
      destination: `${destino.latitude},${destino.longitude}`,
      mode: modo,
      language: "pt-BR",
      key: GOOGLE_KEY,
    },
  });

  const route = response.data.routes?.[0];
  const leg = route?.legs?.[0];

  return {
    distancia_texto: leg?.distance?.text || null,
    duracao_texto: leg?.duration?.text || null,
    passos: (leg?.steps || []).map((step) => ({
      instrucoes: step.html_instructions,
      distancia_texto: step.distance?.text || null,
      duracao_texto: step.duration?.text || null,
    })),
  };
}

module.exports = {
  geocodeAddress,
  geocodeCep,
  findPharmaciesNearAddress,
  getDistanceMatrix,
  getDirections,
};
