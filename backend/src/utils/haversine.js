function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistance(coord1, coord2) {
  const latitudeOrigem = Number(coord1.latitude);
  const longitudeOrigem = Number(coord1.longitude);
  const latitudeDestino = Number(coord2.latitude);
  const longitudeDestino = Number(coord2.longitude);

  const earthRadiusKm = 6371;
  const deltaLatitude = toRadians(latitudeDestino - latitudeOrigem);
  const deltaLongitude = toRadians(longitudeDestino - longitudeOrigem);

  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(latitudeOrigem)) *
      Math.cos(toRadians(latitudeDestino)) *
      Math.sin(deltaLongitude / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusKm * c).toFixed(2));
}

module.exports = { haversineDistance };
