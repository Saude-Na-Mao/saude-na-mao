const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const path = require("path");
const { loadBackendEnv } = require("./config/envBootstrap");
const { waitForMongo, getMongoStatus } = require("./config/database");
const { validateCorsOrigin } = require("./config/cors");
loadBackendEnv();

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const pharmacyRoutes = require("./routes/pharmacyRoutes");
const pharmacistRoutes = require("./routes/pharmacistRoutes");
const productRoutes = require("./routes/productRoutes");
const geoRoutes = require("./routes/geoRoutes");
const prescriptionRoutes = require("./routes/prescriptionRoutes");
const prescriptionUseRoutes = require("./routes/prescriptionUseRoutes");
const cartRoutes = require("./routes/cartRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const orderRoutes = require("./routes/orderRoutes");
const faqRoutes = require("./routes/faqRoutes");
const supportRoutes = require("./routes/supportRoutes");
const adminRoutes = require("./routes/adminRoutes");
const couponRoutes = require("./routes/couponRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const deliveryRoutes = require("./routes/deliveryRoutes");
const drugRoutes = require("./routes/drugRoutes");
const medicineCatalogRoutes = require("./routes/medicineCatalogRoutes");
const auditRoutes = require("./routes/auditRoutes");
const trackingRoutes = require("./routes/trackingRoutes");
const verificationRoutes = require("./routes/verificationRoutes");
const { authenticate, auditLog } = require("./middlewares/auth");
const errorHandler = require("./middlewares/errorHandler");

const app = express();

const corsOptions = {
  origin: validateCorsOrigin,
  credentials: true,
};
app.use(cors(corsOptions));

// helmet com CORP cross-origin para permitir que o frontend (:3000) carregue
// imagens servidas pelo backend (:5000) durante o desenvolvimento.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use((req, res, next) => {
  if (req.path === "/api/v1/payments/webhook/mercadopago") {
    return next();
  }

  return express.json({ limit: "10mb" })(req, res, next);
});

app.use(cookieParser());

app.get("/api/v1/health", (_req, res) => {
  const status = getMongoStatus();
  const ok = status === "connected";
  res.status(ok ? 200 : 503).json({
    success: ok,
    mongo: status,
    readyState: mongoose.connection.readyState,
  });
});

app.use(async (req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  if (req.path === "/api/v1/health") return next();
  if (mongoose.connection.readyState === 1) return next();

  const connected = await waitForMongo(10000);
  if (connected) return next();

  const status = getMongoStatus();
  return res.status(503).json({
    success: false,
    mongo: status,
    message:
      status === "connecting"
        ? "Conectando ao MongoDB Atlas… Aguarde até 1 minuto e tente novamente."
        : "MongoDB indisponível no momento. Verifique o terminal do backend (deve aparecer “MongoDB conectado”) e tente de novo em alguns segundos.",
  });
});

// Middleware de auditoria (log de todas as ações)
app.use(auditLog);

// Caminho absoluto da pasta uploads (independe do cwd onde o processo rodar)
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(
  "/uploads/comprovantes",
  express.static(path.join(UPLOADS_DIR, "comprovantes")),
);

app.use("/api/v1/auth", authRoutes);

app.use("/api/v1/users", userRoutes);

app.use("/api/v1/farmacias", pharmacyRoutes);
app.use("/api/v1/pharmacies", pharmacyRoutes);

app.use("/api/v1/pharmacists", pharmacistRoutes);

app.use("/api/v1/produtos", productRoutes);
app.use("/api/v1/products", productRoutes);

app.use("/api/v1/geo", geoRoutes);

app.use("/api/v1/prescriptions", prescriptionRoutes);
app.use("/api/v1/receitas", prescriptionRoutes);

app.use("/api/v1/prescription-uses", prescriptionUseRoutes);
app.use("/api/v1/receitas-uso", prescriptionUseRoutes);

app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/carrinho", cartRoutes);

app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/pagamentos", paymentRoutes);

app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/pedidos", orderRoutes);

app.use("/api/v1/faq", faqRoutes);

app.use("/api/v1/support", supportRoutes);
app.use("/api/v1/suporte", supportRoutes);

app.use("/api/v1/admin", adminRoutes);

app.use("/api/v1/cupons", couponRoutes);
app.use("/api/v1/coupons", couponRoutes);

app.use("/api/v1/reviews", reviewRoutes);
app.use("/api/v1/avaliacoes", reviewRoutes);

app.use("/api/v1/deliveries", deliveryRoutes);
app.use("/api/v1/entregas", deliveryRoutes);

app.use("/api/v1/drugs", drugRoutes);
app.use("/api/v1/medicamentos", drugRoutes);

app.use("/api/v1/medicine-catalog", medicineCatalogRoutes);
app.use("/api/v1/catalogo-medicamentos", medicineCatalogRoutes);

app.use("/api/v1/audit", auditRoutes);
app.use("/api/v1/auditoria", auditRoutes);

app.use("/api/v1/tracking", trackingRoutes);
app.use("/api/v1/rastreamento", trackingRoutes);

// Rotas de Verificação (RBAC - Proprietário de Farmácia)
app.use("/api/v1/verification", verificationRoutes);
app.use("/api/v1/verificacao", verificationRoutes);

app.use((req, res, next) => {
  res.status(404).json({ success: false, message: "Rota não encontrada" });
});

app.use(errorHandler);

module.exports = app;
