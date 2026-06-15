const {
  loadBackendEnv,
  cleanMongoEnv,
  mongoHostnameForLog,
  isLocalMongoHostname,
} = require("./config/envBootstrap");

const { envPath, found } = loadBackendEnv();

console.log("📍 Diretório do server.js:", __dirname);
console.log("📍 Ficheiro .env:", envPath, found ? "(encontrado)" : "(não encontrado — variáveis podem vir só do ambiente)");
console.log("✅ dotenv aplicado com override.");
console.log(
  "[Env] .env.example não é lido em runtime — só o ficheiro .env (caminho acima).",
);

const mongoClean =
  cleanMongoEnv(process.env.MONGO_URI) || cleanMongoEnv(process.env.MONGODB_URI) || "";
const hasUsefulMongo = Boolean(mongoClean);
const keyMongoUriPresent = process.env.MONGO_URI !== undefined && process.env.MONGO_URI !== "";
const keyMongoDbUriPresent =
  process.env.MONGODB_URI !== undefined && process.env.MONGODB_URI !== "";
console.log(
  "[Env] MONGO_URI com valor utilizável:",
  hasUsefulMongo ? "sim" : "não",
  "| chave MONGO_URI existe:",
  keyMongoUriPresent ? "sim" : "não",
  "| chave MONGODB_URI existe:",
  keyMongoDbUriPresent ? "sim" : "não",
);

const mongoUri = mongoClean;
if (!mongoUri) {
  console.log("🔗 Resumo URI:", "❌ Nenhum valor utilizável (cai no default local em database.js)");
} else {
  const host = mongoHostnameForLog(mongoUri);
  console.log("[Env] Hostname na MONGO_URI:", host);
  const okRemote = !isLocalMongoHostname(mongoUri);
  console.log("🔗 Resumo URI:", okRemote ? "✅ remoto (hostname não é localhost)" : "⚠️ aponta para Mongo local");
  if (!okRemote) {
    console.warn(
      "⚠️ Substitui MONGO_URI em backend/.env pela connection string do Atlas (mongodb+srv://...). O valor atual ainda usa hostname local.",
    );
  }
}

const http = require("http");
const mongoose = require("mongoose");
const connectDB = require("./config/database");
const { initSocket } = require("./config/socket");
const { setupStockSocket } = require("./sockets/stockSocket");
const { setupOrderSocket } = require("./sockets/orderSocket");
const { setupChatSocket } = require("./sockets/chatSocket");
const { setupPrescriptionSocket } = require("./sockets/prescriptionSocket");
const { setupDeliverySocket } = require("./sockets/deliverySocket");
const { setupCronJobs } = require("./scripts/cronJobs");
const app = require("./app");

const startServer = async () => {
  const PORT = process.env.PORT || 5000;
  const server = http.createServer(app);
  const io = initSocket(server);

  setupStockSocket(io);
  setupOrderSocket(io);
  setupChatSocket(io);
  setupPrescriptionSocket(io);
  setupDeliverySocket(io);

  server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log("GET /api/v1/health — estado da ligação ao MongoDB");
    console.log("Socket.io ativo");
    console.log("Order tracking socket ativo");
    console.log("Chat de suporte ativo");
    console.log("Roteamento de receitas ativo");
  });

  try {
    await connectDB();
    setupCronJobs();
    console.log("Cron jobs configurados");
  } catch (error) {
    console.error("❌ Erro ao conectar ao MongoDB:", error?.message || error);
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
    console.warn(
      "⚠️ Modo desenvolvimento: reconexão automática ativa. Login aguarda até o MongoDB conectar.",
    );
    scheduleMongoReconnect();
  }
};

function scheduleMongoReconnect() {
  const tick = async () => {
    if (mongoose.connection.readyState === 1) return;
    try {
      await connectDB();
      setupCronJobs();
      console.log("✅ MongoDB reconectado — login e pedidos liberados");
    } catch (_) {
      setTimeout(tick, 15000);
    }
  };
  setTimeout(tick, 15000);
}

startServer();
