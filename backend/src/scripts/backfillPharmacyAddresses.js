/**
 * Preenche endereço e/ou location em farmácias incompletas (ViaCEP + geocode quando houver GOOGLE_MAPS_API_KEY).
 * Propaga coleta nas entregas abertas (disponivel | aceita | coletando).
 *
 * Uso: node src/scripts/backfillPharmacyAddresses.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
require("dotenv").config();

const mongoose = require("mongoose");
const Pharmacy = require("../models/Pharmacy");
const geoService = require("../services/geoService");
const deliveryService = require("../services/deliveryService");

function hasCoords(p) {
  return Array.isArray(p.location?.coordinates) && p.location.coordinates.length === 2;
}

function needsTextFill(p) {
  return (
    !String(p.logradouro || "").trim() ||
    !String(p.cidade || "").trim() ||
    !String(p.estado || "").trim()
  );
}

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/ssm";
  await mongoose.connect(uri);
  console.log("Conectado:", uri.replace(/\/\/.*@/, "//***@"));

  const pharmacies = await Pharmacy.find({ ativa: { $ne: false } }).lean();
  let patched = 0;
  let syncedDeliveries = 0;

  for (const raw of pharmacies) {
    const p = await Pharmacy.findById(raw._id);
    if (!p) continue;

    const patch = {};
    const cepDigits = String(p.cep || "").replace(/\D/g, "");

    if (cepDigits.length === 8 && (needsTextFill(p) || !hasCoords(p))) {
      try {
        const g = await geoService.geocodeCep(cepDigits);
        if (!String(p.logradouro || "").trim() && g.logradouro) patch.logradouro = g.logradouro;
        if (!String(p.bairro || "").trim() && g.bairro) patch.bairro = g.bairro;
        if (!String(p.cidade || "").trim() && g.cidade) patch.cidade = g.cidade;
        if (!String(p.estado || "").trim() && g.estado) patch.estado = String(g.estado).toUpperCase().slice(0, 2);
        if (g.cep) patch.cep = g.cep;
        if (!hasCoords(p) && g.latitude != null && g.longitude != null) {
          patch.location = { type: "Point", coordinates: [g.longitude, g.latitude] };
        }
      } catch (err) {
        console.warn(`[CEP] ${p.nome} (${p._id}):`, err.message || err);
      }
    }

    const merged = {
      logradouro: patch.logradouro ?? p.logradouro,
      numero: p.numero,
      bairro: patch.bairro ?? p.bairro,
      cidade: patch.cidade ?? p.cidade,
      estado: patch.estado ?? p.estado,
      cep: patch.cep ?? p.cep,
    };
    const willHaveCoords = hasCoords(p) || patch.location;
    if (!willHaveCoords && process.env.GOOGLE_MAPS_API_KEY) {
      const parts = [
        merged.logradouro,
        merged.numero,
        merged.bairro,
        merged.cidade,
        merged.estado,
        merged.cep,
        "Brasil",
      ].filter((x) => String(x || "").trim());
      if (parts.length >= 3) {
        try {
          const g = await geoService.geocodeAddress(parts.join(", "));
          patch.location = { type: "Point", coordinates: [g.longitude, g.latitude] };
        } catch (err) {
          console.warn(`[Geocode] ${p.nome} (${p._id}):`, err.message || err);
        }
      }
    }

    if (Object.keys(patch).length > 0) {
      await Pharmacy.findByIdAndUpdate(p._id, patch, { runValidators: true });
      const r = await deliveryService.syncPickupAddressFromPharmacy(p._id);
      syncedDeliveries += r.modifiedCount || 0;
      patched += 1;
      console.log(`Atualizada: ${p.nome} (${p._id})`, Object.keys(patch).join(", "));
    }
  }

  console.log(`\nFarmácias alteradas: ${patched}. Entregas (coleta) atualizadas: ${syncedDeliveries}.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
