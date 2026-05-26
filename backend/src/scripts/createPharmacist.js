require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/database");
const User = require("../models/User");
const Pharmacy = require("../models/Pharmacy");

async function createPharmacist() {
  try {
    await connectDB();

    const email = "farmaceutico@farmaceutico.com";

    const existing = await User.findOne({ email });
    if (existing) {
      console.log("Farmacêutico já existe:", email);
      process.exit(0);
    }

    // Pick the first active pharmacy
    const pharmacy = await Pharmacy.findOne({ ativa: true }).sort({ createdAt: 1 });
    if (!pharmacy) {
      console.error("Nenhuma farmácia encontrada. Execute o seed primeiro.");
      process.exit(1);
    }

    const user = new User({
      nome: "Dr. Carlos Farmacêutico",
      email,
      senha: "Farmaceutico@123",
      telefone: "62999990000",
      tipo_usuario: "farmaceutico",
      ativo: true,
    });

    await user.save();

    console.log(`\nFarmacêutico criado com sucesso!`);
    console.log(`  Email: ${email}`);
    console.log(`  Senha: Farmaceutico@123`);
    console.log(`  Farmácia: ${pharmacy.nome} (${pharmacy._id})`);
    console.log(`  Role: farmacia`);
    process.exit(0);
  } catch (err) {
    console.error("Erro ao criar farmacêutico:", err.message);
    process.exit(1);
  }
}

createPharmacist();
