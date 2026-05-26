function splitOrigins(value) {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function getAllowedOrigins() {
  const origins = [
    ...splitOrigins(process.env.FRONTEND_URLS),
    ...splitOrigins(process.env.FRONTEND_URL),
  ];

  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:3000", "http://localhost:5173");
  }

  return [...new Set(origins)];
}

function validateCorsOrigin(origin, callback) {
  const allowedOrigins = getAllowedOrigins();

  if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  return callback(new Error("Origem não permitida pelo CORS"));
}

module.exports = {
  getAllowedOrigins,
  validateCorsOrigin,
};
