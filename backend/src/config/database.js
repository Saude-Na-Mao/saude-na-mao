const mongoose = require("mongoose");
const {
  loadBackendEnv,
  cleanMongoEnv,
  mongoHostnameForLog,
  isLocalMongoHostname,
} = require("./envBootstrap");

loadBackendEnv();

const MAX_RETRIES = 12;
const RETRY_DELAY_MS = 2000;
const DEFAULT_MONGO_URI = "mongodb://localhost:27017/saude-na-mao";

const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 20000,
  socketTimeoutMS: 45000,
  family: 4,
  retryWrites: true,
};

let connectionPromise = null;

function resolveMongoUri() {
  const fromEnv =
    cleanMongoEnv(process.env.MONGO_URI) || cleanMongoEnv(process.env.MONGODB_URI);
  if (!fromEnv) {
    console.warn(
      `[MongoDB] Nenhum valor utilizável em MONGO_URI/MONGODB_URI — a usar URI local (${DEFAULT_MONGO_URI}).`,
    );
    return DEFAULT_MONGO_URI;
  }
  return fromEnv;
}

function mongoTargetLabel(uri) {
  if (!uri) return "(vazio)";
  const host = mongoHostnameForLog(uri);
  if (isLocalMongoHostname(uri)) return `localhost (local) — ${host}`;
  return host;
}

function getMongoStatus() {
  const state = mongoose.connection.readyState;
  if (state === 1) return "connected";
  if (state === 2 || connectionPromise) return "connecting";
  return "disconnected";
}

async function resetMongooseIfNeeded() {
  const state = mongoose.connection.readyState;
  if (state === 0) return;
  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore
  }
}

async function attemptConnect(retries = MAX_RETRIES) {
  const mongoUri = resolveMongoUri();
  console.log(`[MongoDB] Destino da ligação: ${mongoTargetLabel(mongoUri)}`);

  if (process.env.NODE_ENV === "production" && isLocalMongoHostname(mongoUri)) {
    console.error(
      "[MongoDB] Recusado: em NODE_ENV=production a URI aponta para localhost.",
    );
    process.exit(1);
  }

  await resetMongooseIfNeeded();

  try {
    await mongoose.connect(mongoUri, MONGO_OPTIONS);
    const host = mongoose.connection.host || mongoTargetLabel(mongoUri);
    console.log(`MongoDB conectado: ${host}`);
    return mongoose.connection;
  } catch (error) {
    console.error(`Erro ao conectar ao MongoDB: ${error.message}`);
    await resetMongooseIfNeeded();
    if (retries > 0) {
      console.log(
        `Tentando reconectar em ${RETRY_DELAY_MS / 1000}s... (${retries} tentativas restantes)`,
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return attemptConnect(retries - 1);
    }
    throw error;
  }
}

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = attemptConnect()
    .catch((err) => {
      connectionPromise = null;
      throw err;
    });

  return connectionPromise;
};

/** Aguarda ligação já em curso (não inicia novo ciclo de retries). */
async function waitForMongo(maxMs = 10000) {
  if (mongoose.connection.readyState === 1) return true;
  if (!connectionPromise) return false;

  try {
    await Promise.race([
      connectionPromise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("waitForMongo timeout")), maxMs);
      }),
    ]);
  } catch (_) {
    // timeout ou falha — verifica estado abaixo
  }

  return mongoose.connection.readyState === 1;
}

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB desconectado");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB erro de conexão:", err.message);
});

module.exports = connectDB;
module.exports.waitForMongo = waitForMongo;
module.exports.getMongoStatus = getMongoStatus;
