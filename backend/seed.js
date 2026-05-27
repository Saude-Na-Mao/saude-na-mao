require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./src/models/User");
const Pharmacy = require("./src/models/Pharmacy");
const Pharmacist = require("./src/models/Pharmacist");
const Address = require("./src/models/Address");

const DEFAULT_MONGO_URI = "mongodb://localhost:27017/saude-na-mao";

const USERS = [
  // CLIENTES
  { nome: "Cliente Teste", email: "teste@teste.com", senha: "Teste@123", tipo_usuario: "cliente" },

  // FARMACÊUTICO GENÉRICO
  { nome: "Farmacêutico Genérico", email: "farmaceutico@saudenamao.com", senha: "Farm@123", tipo_usuario: "farmaceutico", farmacia: "Drogaria Rosário - Jardim Goiás", crf: "GO-00001" },

  // FARMACÊUTICOS POR FARMÁCIA (Goiânia)
  { nome: "Carla Mendes", email: "farm.jardim@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "farmaceutico", farmacia: "Drogaria Rosário - Jardim Goiás", crf: "GO-12001" },
  { nome: "Renato Souza", email: "farm.bueno@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "farmaceutico", farmacia: "Drogarias Pacheco - Setor Bueno", crf: "GO-12002" },
  { nome: "Beatriz Alves", email: "farm.marista@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "farmaceutico", farmacia: "Droga Raia - Marista", crf: "GO-12003" },
  { nome: "Lucas Pereira", email: "farm.oeste@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "farmaceutico", farmacia: "Drogaria Santa Marta - Setor Oeste", crf: "GO-12004" },
  { nome: "Paula Nogueira", email: "farm.lozandes@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "farmaceutico", farmacia: "Drogasil - Park Lozandes", crf: "GO-12005" },
  { nome: "Marcos Oliveira", email: "farm.central@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "farmaceutico", farmacia: "Farmácia Pague Menos - Central", crf: "GO-12006" },

  // ENTREGADOR
  { nome: "Entregador Teste", email: "entregador@saudenamao.com", senha: "Entrega@123", tipo_usuario: "entregador" },
  { nome: "Juliana Entregas", email: "entregadora.demo@gyn.local", senha: "Entrega@123", tipo_usuario: "entregador" },

  // DONO DE FARMÁCIA GENÉRICO
  { nome: "Dono Genérico", email: "dono@farmacia.com", senha: "Dono@123", tipo_usuario: "dono_farmacia", farmacia: "Drogaria Rosário - Jardim Goiás" },

  // DONOS POR FARMÁCIA
  { nome: "Maria Silva", email: "dono.jardim.demo@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "dono_farmacia", farmacia: "Drogaria Rosário - Jardim Goiás" },
  { nome: "João Santos", email: "dono.bueno.demo@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "dono_farmacia", farmacia: "Drogarias Pacheco - Setor Bueno" },
  { nome: "Ana Costa", email: "dono.marista.demo@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "dono_farmacia", farmacia: "Droga Raia - Marista" },
  { nome: "Pedro Lima", email: "dono.oeste.demo@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "dono_farmacia", farmacia: "Drogaria Santa Marta - Setor Oeste" },
  { nome: "Fernanda Rocha", email: "dono.lozandes.demo@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "dono_farmacia", farmacia: "Drogasil - Park Lozandes" },
  { nome: "Rafael Lima", email: "dono.central.demo@gyn.local", senha: "SeedGyn@2026", tipo_usuario: "dono_farmacia", farmacia: "Farmácia Pague Menos - Central" },

  // ADMIN
  { nome: "Administrador", email: "admin@saudenamao.com", senha: "Admin@123", tipo_usuario: "administrador" },
];

const DEMO_ADDRESSES = [
  { logradouro: "Avenida Jamel Cecílio", numero: "3300", bairro: "Jardim Goiás", cidade: "Goiânia", estado: "GO", cep: "74810100", apelido: "Demo Jardim Goiás" },
  { logradouro: "Avenida T-63", numero: "1296", bairro: "Setor Bueno", cidade: "Goiânia", estado: "GO", cep: "74230090", apelido: "Demo Setor Bueno" },
  { logradouro: "Rua 9", numero: "1855", bairro: "Setor Marista", cidade: "Goiânia", estado: "GO", cep: "74150130", apelido: "Demo Marista" },
  { logradouro: "Avenida Assis Chateaubriand", numero: "1650", bairro: "Setor Oeste", cidade: "Goiânia", estado: "GO", cep: "74130110", apelido: "Demo Setor Oeste" },
  { logradouro: "Avenida Olinda", numero: "960", bairro: "Park Lozandes", cidade: "Goiânia", estado: "GO", cep: "74884120", apelido: "Demo Park Lozandes" },
  { logradouro: "Avenida Goiás", numero: "1001", bairro: "Setor Central", cidade: "Goiânia", estado: "GO", cep: "74063010", apelido: "Demo Centro" },
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
          logado: true,
          disponivel_chat: true,
          status_motivo: "online",
          ultima_atividade: new Date(),
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
    logado: true,
    status_motivo: "online",
    ultima_atividade: new Date(),
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

async function ensureDemoUserAddresses() {
  let n = 0;
  for (let index = 0; index < USERS.length; index += 1) {
    const row = USERS[index];
    const user = await User.findOne({ email: row.email.toLowerCase().trim() }).select("_id");
    if (!user) continue;

    const address = DEMO_ADDRESSES[index % DEMO_ADDRESSES.length];
    await Address.updateOne(
      { id_usuario: user._id, apelido: address.apelido },
      {
        $set: {
          ...address,
          id_usuario: user._id,
          padrao: true,
          ativo: true,
        },
      },
      { upsert: true },
    );
    n += 1;
  }
  console.log(`\n📍 ${n} usuários demo com endereço realista em Goiânia.`);
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
  await ensureDemoUserAddresses();

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
