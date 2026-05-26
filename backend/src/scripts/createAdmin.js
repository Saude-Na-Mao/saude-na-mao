require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/database");
const User = require("../models/User");

async function createAdmin() {
  try {
    await connectDB();

    const adminExiste = await User.findOne({ tipo_usuario: "administrador" });

    if (adminExiste) {
      console.log("Administrador já existe");
      return adminExiste;
    }

    const admin = new User({
      nome: "Administrador",
      email: process.env.ADMIN_EMAIL || "admin@saudenamao.com",
      senha: process.env.ADMIN_PASSWORD || "Admin@123456",
      tipo_usuario: "administrador",
      ativo: true,
    });

    await admin.save();

    console.log(`Administrador criado: ${admin.email}`);
    console.log("ATENÇÃO: Altere a senha no primeiro acesso!");

    return admin;
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { createAdmin };

if (require.main === module) {
  createAdmin()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Erro ao criar administrador:", error);
      process.exit(1);
    });
}
