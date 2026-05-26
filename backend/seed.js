require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./src/models/User");
const Pharmacy = require("./src/models/Pharmacy");
const Pharmacist = require("./src/models/Pharmacist");

const DEFAULT_MONGO_URI = "mongodb://localhost:27017/saude-na-mao";

const USERS = [
  // CLIENTES
  { nome: "Cliente Teste", email: "teste@teste.com", senha: "Teste@123", tipo_usuario: "cliente" },

  // FARMACÊUTICO GENÉRICO
  { nome: "Farmacêutico Genérico", email: "farmaceutico@saudenamao.com", senha: "Farm@123", tipo_usuario: "farmaceutico", farmacia: "Drogaria Cidade Jardim", crf: "GO-00001" },

  // FARMACÊUTICOS POR FARMÁCIA (Goiânia)
  { nome: "Carla Mendes", email: "farm.jardim@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "farmaceutico", farmacia: "Drogaria Cidade Jardim", crf: "GO-12001" },
  { nome: "Renato Souza", email: "farm.bueno@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "farmaceutico", farmacia: "Farmácia Saúde+ Bueno", crf: "GO-12002" },
  { nome: "Beatriz Alves", email: "farm.marista@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "farmaceutico", farmacia: "Droga Raia - Marista", crf: "GO-12003" },
  { nome: "Lucas Pereira", email: "farm.oeste@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "farmaceutico", farmacia: "Farmácia Popular - Oeste", crf: "GO-12004" },

  // ENTREGADOR
  { nome: "Entregador Teste", email: "entregador@saudenamao.com", senha: "Entrega@123", tipo_usuario: "entregador" },

  // DONO DE FARMÁCIA GENÉRICO
  { nome: "Dono Genérico", email: "dono@farmacia.com", senha: "Dono@123", tipo_usuario: "dono_farmacia", farmacia: "Drogaria Cidade Jardim" },

  // DONOS POR FARMÁCIA
  { nome: "Maria Silva", email: "dono.jardim.demo@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "dono_farmacia", farmacia: "Drogaria Cidade Jardim" },
  { nome: "João Santos", email: "dono.bueno.demo@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "dono_farmacia", farmacia: "Farmácia Saúde+ Bueno" },
  { nome: "Ana Costa", email: "dono.marista.demo@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "dono_farmacia", farmacia: "Droga Raia - Marista" },
  { nome: "Pedro Lima", email: "dono.oeste.demo@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "dono_farmacia", farmacia: "Farmácia Popular - Oeste" },

  // ADMIN
  { nome: "Administrador", email: "admin@saudenamao.com", senha: "Admin@123", tipo_usuario: "administrador" },
];

async function resolvePharmacy(nomeFarmacia) {
  if (!nomeFarmacia) return null;
  const farm = await Pharmacy.findOne({ nome: nomeFarmacia }).select("_id");
  return farm?._id || null;
}

/**
 * Dono cadastra farmacêutico via API cria User + Pharmacist.
 * O seed antigo só criava User — a UI e getPharmacists() leem Pharmacist.
 * Esta rotina alinha os dois e corrige id_farmacia no User se já existir.
 */
async function ensureFarmaceuticoSeedProfile(userData) {
  if (userData.tipo_usuario !== "farmaceutico" || !userData.farmacia || !userData.crf) return;

  const user = await User.findOne({ email: userData.email.toLowerCase().trim() });
  if (!user) return;

  const pharmacyId = await resolvePharmacy(userData.farmacia);
  if (!pharmacyId) {
    console.warn(`  ⚠️ Farmácia "${userData.farmacia}" não encontrada — ${userData.email}`);
    return;
  }

  const crm = String(userData.crf).trim();

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        "dados_farmaceutico.id_farmacia": pharmacyId,
        "dados_farmaceutico.crf": crm,
      },
    },
  );

  let ph = await Pharmacist.findOne({ id_usuario: user._id });
  if (!ph) {
    ph = await Pharmacist.findOne({ email: user.email });
  }

  if (ph) {
    const otherOwner = await Pharmacist.findOne({
      crm,
      _id: { $ne: ph._id },
    });
    if (otherOwner) {
      console.warn(`  ⚠️ CRM ${crm} já ligado a outro registo — não atualizei Pharmacist de ${userData.email}`);
      return;
    }
    await Pharmacist.updateOne(
      { _id: ph._id },
      {
        $set: {
          id_usuario: user._id,
          id_farmacia: pharmacyId,
          crm,
          nome: userData.nome,
          email: user.email,
        },
      },
    );
    console.log(`  🔗 Pharmacist atualizado: ${userData.email} → ${userData.farmacia}`);
    return;
  }

  const crmConflict = await Pharmacist.findOne({ crm });
  if (crmConflict) {
    console.warn(`  ⚠️ CRM ${crm} já existe sem id_usuario esperado — ${userData.email}`);
    return;
  }

  await Pharmacist.create({
    id_usuario: user._id,
    nome: userData.nome,
    email: user.email,
    telefone: user.telefone,
    crm,
    id_farmacia: pharmacyId,
    dias_atendimento: ["segunda", "terca", "quarta", "quinta", "sexta"],
    disponivel_chat: true,
  });
  console.log(`  🔗 Pharmacist criado: ${userData.email} → ${userData.farmacia}`);
}

/**
 * O modelo User faz hash da senha no pre("save"). O seed antigo fazia bcrypt.hash
 * antes do create → hash duplo → login falhava e lockout após 5 tentativas.
 * Reaplica a senha em texto (uma hash) e limpa lockUntil / loginAttempts.
 */
async function syncSeedDemoPasswordsAndUnlock() {
  let n = 0;
  for (const row of USERS) {
    const email = row.email.toLowerCase().trim();
    const user = await User.findOne({ email }).select("+senha +loginAttempts +lockUntil");
    if (!user) continue;
    user.senha = row.senha;
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();
    n += 1;
  }
  console.log(
    `\n🔓 ${n} contas demo: senha conforme lista seed + bloqueio removido (evita hash duplo antigo).`,
  );
}

/**
 * @param {{ disconnectAfter?: boolean }} [opts]
 */
async function seedUsers(opts = {}) {
  const { disconnectAfter = true } = opts;

  const uri =
    (process.env.MONGO_URI && process.env.MONGO_URI.trim()) ||
    (process.env.MONGODB_URI && process.env.MONGODB_URI.trim()) ||
    DEFAULT_MONGO_URI;

  await mongoose.connect(uri);
  console.log("✅ Conectado ao MongoDB");

  let criados = 0;
  let existentes = 0;

  for (const userData of USERS) {
    const existing = await User.findOne({ email: userData.email });
    if (existing) {
      console.log(`  → ${userData.email} já existe (${existing.tipo_usuario})`);
      existentes++;
      continue;
    }

    const pharmacyId = await resolvePharmacy(userData.farmacia);

    const doc = {
      nome: userData.nome,
      email: userData.email,
      senha: userData.senha,
      tipo_usuario: userData.tipo_usuario,
    };

    if (userData.tipo_usuario === "farmaceutico") {
      doc.dados_farmaceutico = {
        crf: userData.crf || null,
        ...(pharmacyId ? { id_farmacia: pharmacyId } : {}),
      };
    }

    if (userData.tipo_usuario === "dono_farmacia") {
      doc.dados_dono_farmacia = {
        ...(pharmacyId ? { id_farmacia: pharmacyId } : {}),
      };
    }

    await User.create(doc);
    const farmLabel = pharmacyId
      ? ` [${userData.farmacia}]`
      : userData.farmacia
        ? ` [${userData.farmacia} — não encontrada no banco]`
        : "";
    console.log(`  ✅ Criado: ${userData.email} (${userData.tipo_usuario})${farmLabel}`);
    criados++;
  }

  console.log("\n🔗 Farmacêuticos seed: vínculo User↔farmácia + coleção Pharmacist (listagens / dono)…");
  for (const userData of USERS) {
    if (userData.tipo_usuario === "farmaceutico") {
      await ensureFarmaceuticoSeedProfile(userData);
    }
  }

  await syncSeedDemoPasswordsAndUnlock();

  console.log(`\n🎉 SEED DE USUÁRIOS CONCLUÍDO — ${criados} criados, ${existentes} já existiam.`);
  if (disconnectAfter) {
    await mongoose.disconnect();
  }
}

module.exports = { seedUsers };

if (require.main === module) {
  seedUsers({ disconnectAfter: true })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Erro no seed:", err);
      process.exit(1);
    });
}
