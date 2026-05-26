const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

/**
 * Localiza `backend/.env` (este ficheiro está em `backend/src/config/`).
 */
function resolveBackendEnvFile() {
  const fromThisFile = path.resolve(__dirname, "../../.env");
  const candidates = [
    fromThisFile,
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "backend", ".env"),
    path.resolve(process.cwd(), "saude-na-mao", "backend", ".env"),
  ];
  const seen = new Set();
  for (const p of candidates) {
    const k = path.normalize(p);
    if (seen.has(k)) continue;
    seen.add(k);
    if (fs.existsSync(p)) {
      return { path: p, found: true };
    }
  }
  return { path: fromThisFile, found: false };
}

function loadBackendEnv() {
  const { path: envPath, found } = resolveBackendEnvFile();
  dotenv.config({ path: envPath, override: true });
  return { envPath, found };
}

/** Remove BOM, espaços e aspas externas (erros comuns em .env no Windows). */
function cleanMongoEnv(value) {
  if (value == null) return "";
  return String(value)
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

/** Hostname extraído da URI (só para logs; não expõe user/password). */
function mongoHostnameForLog(uri) {
  if (!uri || typeof uri !== "string") return "(vazio)";
  const lower = uri.trim().toLowerCase();
  if (!lower.startsWith("mongodb://") && !lower.startsWith("mongodb+srv://")) {
    return "(não começa por mongodb:// nem mongodb+srv:// — confere a linha MONGO_URI)";
  }
  try {
    const normalized = uri
      .replace(/^mongodb\+srv:\/\//i, "https://")
      .replace(/^mongodb:\/\//i, "http://");
    const u = new URL(normalized);
    return u.hostname || "(sem hostname)";
  } catch {
    return "(URI inválida — password com @ ou caracteres especiais? usa encodeURIComponent na password na URI)";
  }
}

function isLocalMongoHostname(uri) {
  const h = mongoHostnameForLog(uri).toLowerCase();
  return h === "localhost" || h === "127.0.0.1";
}

module.exports = {
  loadBackendEnv,
  resolveBackendEnvFile,
  cleanMongoEnv,
  mongoHostnameForLog,
  isLocalMongoHostname,
};
