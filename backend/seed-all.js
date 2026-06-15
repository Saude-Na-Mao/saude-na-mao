/**
 * Seed completo para máquina nova ou BD vazio após git clone.
 * Ordem: farmácias Goiânia + produtos + donos → cupons demo → usuários de teste.
 *
 * Uso (na pasta backend): npm run seed:all
 */

require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const mongoose = require("mongoose");
const { run: seedGynDonosEProdutos } = require("./src/scripts/seedGynPharmacyOwners");
const {
  ensureCuponsDemo,
  ensureControlledProductBatchesForPharmacy,
} = require("./src/scripts/seed");
const Pharmacy = require("./src/models/Pharmacy");
const { seedUsers } = require("./seed");

function mongoUri() {
  return (
    (process.env.MONGO_URI && process.env.MONGO_URI.trim()) ||
    (process.env.MONGODB_URI && process.env.MONGODB_URI.trim()) ||
    "mongodb://localhost:27017/saude-na-mao"
  );
}

async function seedAll() {
  const uri = mongoUri();

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Saúde Na Mão — seed completo (farmácias, produtos e contas)");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("► Passo 1/3 — Farmácias demo (Goiânia), produtos e cadastro dos donos...\n");
  await seedGynDonosEProdutos();

  console.log("\n► Passo 2/3 — Cupons + lotes/estoque de TODOS os controlados (tarja preta, controlado A, antimicrobiano)...\n");
  await mongoose.connect(uri);
  try {
    await ensureCuponsDemo();

    // Garante estoque + lotes válidos para todos os medicamentos controlados
    // de todas as farmácias (tarja preta inclusive), em qualquer origem.
    const pharmacies = await Pharmacy.find({}).select("_id nome");
    let totalFarmacias = 0;
    for (const ph of pharmacies) {
      await ensureControlledProductBatchesForPharmacy(ph._id);
      totalFarmacias += 1;
    }
    console.log(`  ✅ Lotes/estoque verificados em ${totalFarmacias} farmácia(s)`);
  } finally {
    await mongoose.disconnect();
  }

  console.log("\n► Passo 3/3 — Usuários de teste (clientes, farmacêuticos, entregador, admin)...\n");
  await seedUsers({ disconnectAfter: true });
}

seedAll()
  .then(() => {
    console.log("\n✅ seed:all finalizado. Rode `npm run dev` no backend e no frontend.\n");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ seed:all falhou:", err);
    process.exit(1);
  });
