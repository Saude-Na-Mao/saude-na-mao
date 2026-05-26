const { haversineDistance } = require("../utils/haversine");

const PILOT_CITIES = ["Goiânia", "São Paulo", "Brasília"];

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function hasCoordinates(endereco) {
  return (
    Number.isFinite(Number(endereco?.latitude)) &&
    Number.isFinite(Number(endereco?.longitude))
  );
}

function getMotoFreightByDistance(distanciaKm) {
  if (distanciaKm <= 3) {
    return { taxa_entrega: 5, tempo_estimado_minutos: 30 };
  }

  if (distanciaKm <= 7) {
    return { taxa_entrega: 8, tempo_estimado_minutos: 45 };
  }

  if (distanciaKm <= 15) {
    return { taxa_entrega: 12, tempo_estimado_minutos: 60 };
  }

  return { taxa_entrega: 18, tempo_estimado_minutos: 90 };
}

function getDroneAvailability(enderecoDestino) {
  const cidade = enderecoDestino?.cidade;
  const disponivel = PILOT_CITIES.includes(cidade);

  return {
    disponivel,
    motivo: disponivel ? null : "Drone não disponível nesta cidade",
  };
}

function calculateFreight({
  tipoEntrega,
  enderecoOrigem,
  enderecoDestino,
  subtotal = 0,
}) {
  if (tipoEntrega === "retirada" || tipoEntrega === "drive-thru") {
    return {
      taxa_entrega: 0,
      tempo_estimado_minutos: 0,
      distancia_km: null,
      tipo_entrega: tipoEntrega,
    };
  }

  if (tipoEntrega === "drone") {
    const disponibilidadeDrone = getDroneAvailability(enderecoDestino);

    if (!disponibilidadeDrone.disponivel) {
      throw createError(disponibilidadeDrone.motivo, 400);
    }

    return {
      taxa_entrega: 15,
      tempo_estimado_minutos: 30,
      distancia_km: null,
      tipo_entrega: tipoEntrega,
    };
  }

  if (tipoEntrega !== "moto") {
    throw createError("Tipo de entrega inválido", 400);
  }

  let distanciaKm = null;
  let freight = { taxa_entrega: 8, tempo_estimado_minutos: 60 };

  if (hasCoordinates(enderecoOrigem) && hasCoordinates(enderecoDestino)) {
    distanciaKm = haversineDistance(enderecoOrigem, enderecoDestino);
    freight = getMotoFreightByDistance(distanciaKm);
  }

  if (Number(subtotal) >= 150) {
    freight.taxa_entrega = 0;
  }

  return {
    taxa_entrega: Number(freight.taxa_entrega.toFixed(2)),
    tempo_estimado_minutos: freight.tempo_estimado_minutos,
    distancia_km: distanciaKm !== null ? Number(distanciaKm.toFixed(2)) : null,
    tipo_entrega: tipoEntrega,
  };
}

function getDeliveryOptions(enderecoOrigem, enderecoDestino, subtotal) {
  const moto = calculateFreight({
    tipoEntrega: "moto",
    enderecoOrigem,
    enderecoDestino,
    subtotal,
  });

  const droneAvailability = getDroneAvailability(enderecoDestino);

  const options = [
    {
      tipo: "retirada",
      taxa: 0,
      tempo: 0,
      descricao: "Retire na farmácia",
    },
    {
      tipo: "drive-thru",
      taxa: 0,
      tempo: 0,
      descricao: "Passe de carro",
    },
    {
      tipo: "moto",
      taxa: moto.taxa_entrega,
      tempo: moto.tempo_estimado_minutos,
      descricao: `Entrega em até ${moto.tempo_estimado_minutos}min`,
    },
    {
      tipo: "drone",
      taxa: 15,
      tempo: 30,
      descricao: "Entrega expressa 30min",
      disponivel: droneAvailability.disponivel,
    },
  ];

  if (!droneAvailability.disponivel) {
    options[3].motivo = droneAvailability.motivo;
  }

  return options;
}

module.exports = { calculateFreight, getDeliveryOptions };
