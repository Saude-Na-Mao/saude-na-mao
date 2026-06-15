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

function isPrivateDevOrigin(origin) {
  if (process.env.NODE_ENV === "production") return false;

  try {
    const url = new URL(origin);
    const host = url.hostname;
    const port = url.port;
    const isDevPort = port === "3000" || port === "5173";
    const isPrivateHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

    return (url.protocol === "http:" || url.protocol === "https:") && isDevPort && isPrivateHost;
  } catch (_) {
    return false;
  }
}

function validateCorsOrigin(origin, callback) {
  const allowedOrigins = getAllowedOrigins();

  if (
    !origin ||
    allowedOrigins.includes("*") ||
    allowedOrigins.includes(origin) ||
    isPrivateDevOrigin(origin)
  ) {
    return callback(null, true);
  }

  return callback(new Error("Origem não permitida pelo CORS"));
}

module.exports = {
  getAllowedOrigins,
  isPrivateDevOrigin,
  validateCorsOrigin,
};
