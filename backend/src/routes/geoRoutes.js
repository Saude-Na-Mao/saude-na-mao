const express = require("express");
const geoController = require("../controllers/geoController");

const router = express.Router();

router.get("/cep/:cep", geoController.geocodeCep);
router.get("/geocode", geoController.geocodeAddress);
router.get("/pharmacies/nearby", geoController.findNearbyPharmacies);
router.post("/distance-matrix", geoController.getDistanceMatrix);
router.get("/directions", geoController.getDirections);

module.exports = router;
