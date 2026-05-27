function envFlag(name, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "sim", "s"].includes(
    String(value).trim().toLowerCase(),
  );
}

const PRESCRIPTION_CLASSES = new Set([
  "tarja_vermelha",
  "tarja_preta",
  "antimicrobiano",
  "controlado_a",
]);

const CONTROLLED_CLASSES = new Set(["tarja_preta", "controlado_a"]);

const compliance = {
  academicDemoMode: envFlag("TCC_DEMO_MODE", true),
  allowControlledRemoteSale: envFlag("ALLOW_CONTROLLED_REMOTE_SALE", true),
  requirePharmacyComplianceDocs: envFlag(
    "REQUIRE_PHARMACY_COMPLIANCE_DOCS",
    false,
  ),
};

function requiresPrescription(product) {
  const classification = product?.classificacao_receita || "sem_receita";
  return Boolean(
    product?.receita_obrigatoria ||
      product?.controlado ||
      PRESCRIPTION_CLASSES.has(classification),
  );
}

function isControlledMedication(product) {
  const classification = product?.classificacao_receita || "sem_receita";
  return Boolean(product?.controlado || CONTROLLED_CLASSES.has(classification));
}

function isRemoteControlledSaleBlocked(product) {
  return isControlledMedication(product) && !compliance.allowControlledRemoteSale;
}

function prescriptionClassLabel(classification = "sem_receita") {
  const labels = {
    sem_receita: "sem receita",
    tarja_vermelha: "tarja vermelha",
    tarja_preta: "tarja preta",
    antimicrobiano: "antimicrobiano",
    controlado_a: "controle especial",
  };

  return labels[classification] || labels.sem_receita;
}

module.exports = {
  ...compliance,
  requiresPrescription,
  isControlledMedication,
  isRemoteControlledSaleBlocked,
  prescriptionClassLabel,
};
