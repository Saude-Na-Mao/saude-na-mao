const mongoose = require("mongoose");
require("dotenv").config();

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/saude-na-mao");
  console.log("Connected");

  const db = mongoose.connection.db;

  // Clean up test users
  const result = await db.collection("users").deleteMany({
    email: { $regex: /^test(cli|ent|dono|farm|adm)_/ },
  });
  console.log("Cleaned test users:", result.deletedCount);

  // Clean up test pharmacies
  const result2 = await db.collection("pharmacies").deleteMany({
    $or: [
      { nome: { $regex: /^Farm(acia)?\s+(Teste|X|TT|Isolada)/ } },
      { cnpj: { $regex: /^(123456780001|888777|777666|999888)/ } },
    ],
  });
  console.log("Cleaned test pharmacies:", result2.deletedCount);

  // Drop old 2dsphere indexes if needed and sync
  for (const col of ["users", "pharmacies"]) {
    try {
      const indexes = await db.collection(col).indexes();
      const geoIndex = indexes.find((i) => i.name && i.name.includes("2dsphere") && !i.partialFilterExpression);
      if (geoIndex) {
        await db.collection(col).dropIndex(geoIndex.name);
        console.log(`Dropped old geo index on ${col}:`, geoIndex.name);
      }
    } catch (e) {
      console.log(`Index check on ${col}:`, e.message);
    }
  }

  // Sync indexes (recreates with partial filter)
  const User = require("../models/User");
  const Pharmacy = require("../models/Pharmacy");
  await User.syncIndexes();
  await Pharmacy.syncIndexes();
  console.log("Indexes synced");

  const newUserIdx = await db.collection("users").indexes();
  console.log("User indexes:", newUserIdx.map((i) => i.name).join(", "));
  const newPhIdx = await db.collection("pharmacies").indexes();
  console.log("Pharmacy indexes:", newPhIdx.map((i) => i.name).join(", "));

  await mongoose.disconnect();
  console.log("Done");
}

fix().catch((e) => {
  console.error(e);
  process.exit(1);
});
