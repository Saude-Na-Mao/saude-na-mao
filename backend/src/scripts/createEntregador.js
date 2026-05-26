require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");
const User = require(path.join(__dirname, "../models/User"));

async function criar() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("Defina MONGO_URI (ou MONGODB_URI) no .env");
    process.exit(1);
  }
  await mongoose.connect(uri);

  const email = process.env.ENTREGADOR_EMAIL || "entregador@saudenamao.com";
  const jaExiste = await User.findOne({ email });
  if (jaExiste) {
    console.log("Usuário já existe:", email);
    process.exit(0);
  }

  const entregador = await User.create({
    nome: process.env.ENTREGADOR_NOME || "Entregador Teste",
    email,
    senha: process.env.ENTREGADOR_PASSWORD || "Entregador@123",
    tipo_usuario: "entregador",
    dados_entregador: {
      veiculo: { tipo: "moto", modelo: "Honda CG 160", placa: "ABC1D23" },
      disponivel: true,
    },
  });

  console.log("Entregador criado:", entregador.email);
  console.log("Senha:", process.env.ENTREGADOR_PASSWORD || "Entregador@123");
  process.exit(0);
}

criar().catch((err) => {
  console.error(err);
  process.exit(1);
});
