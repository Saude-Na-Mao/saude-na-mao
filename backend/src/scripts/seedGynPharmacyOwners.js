/**
 * Cria donos de farmácia em Goiânia com o mesmo fluxo de negócio do cadastro (authService.registerUser)
 * e associa produtos às farmácias. Idempotente por e-mail / CNPJ.
 *
 * Uso (na pasta backend): npm run seed:gyn
 *
 * Contas demo (todas com a mesma senha):
 *   Ver constante DEMO_OWNERS abaixo — faça login como dono_farmacia no /login
 */

const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

const mongoose = require("mongoose");
const User = require("../models/User");
const Pharmacy = require("../models/Pharmacy");
const Product = require("../models/Product");
const authService = require("../services/authService");
const {
  farmacias,
  buildProdutos,
  ensureControlledProductBatchesForPharmacy,
} = require("./seed");
const { insertReviewsForSinglePharmacyIfEmpty } = require("./seedReviews");

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/saude-na-mao";

const DEMO_SENHA = "SeedGyn@2026";

/** Seis farmácias definidas em seed.js (Goiânia) — um dono por farmácia */
const DEMO_OWNERS = [
  {
    nome: "Maria Silva (Drogasil Bueno)",
    email: "dono.drogasil.demo@gyn.local",
    telefone: "62999991001",
    cpf: "52998224725",
    farmaciaIndex: 0,
  },
  {
    nome: "João Santos (Pacheco Bueno)",
    email: "dono.pacheco.demo@gyn.local",
    telefone: "62999991002",
    cpf: "39053344705",
    farmaciaIndex: 1,
  },
  {
    nome: "Ana Costa (Droga Raia Oeste)",
    email: "dono.dragaraia.demo@gyn.local",
    telefone: "62999991003",
    cpf: "11144477735",
    farmaciaIndex: 2,
  },
  {
    nome: "Pedro Lima (Pague Menos Bueno)",
    email: "dono.paguemenos.demo@gyn.local",
    telefone: "62999991004",
    cpf: "07388813090",
    farmaciaIndex: 3,
  },
  {
    nome: "Fernanda Rocha (Santa Marta Jardim América)",
    email: "dono.santamarta.demo@gyn.local",
    telefone: "62999991005",
    cpf: "32165498791",
    farmaciaIndex: 4,
  },
  {
    nome: "Rafael Lima (Medfacil Pedro Ludovico)",
    email: "dono.medfacil.demo@gyn.local",
    telefone: "62999991006",
    cpf: "32165500010",
    farmaciaIndex: 5,
  },
];

async function removeOrphanPharmacyIfAny(cnpj) {
  const ph = await Pharmacy.findOne({ cnpj });
  if (!ph) return;
  if (ph.id_dono) return;
  await Product.deleteMany({ id_farmacia: ph._id });
  await Pharmacy.deleteOne({ _id: ph._id });
  console.log(`  Removida farmácia órfã (sem dono) CNPJ ${cnpj} e seus produtos`);
}

async function ensureOwnerAndStock(ownerRow) {
  const f = farmacias[ownerRow.farmaciaIndex];
  if (!f) throw new Error(`farmaciaIndex ${ownerRow.farmaciaIndex} inválido`);

  await removeOrphanPharmacyIfAny(f.cnpj);

  const existingByCnpj = await Pharmacy.findOne({ cnpj: f.cnpj });
  if (existingByCnpj?.id_dono) {
    const u = await User.findById(existingByCnpj.id_dono);
    if (u && u.email !== ownerRow.email) {
      console.warn(
        `  CNPJ ${f.cnpj} já pertence a outro usuário (${u.email}). Pulando.`,
      );
      return;
    }
  }

  let pharmacyId;
  const existingUser = await User.findOne({ email: ownerRow.email });

  if (existingUser?.dados_dono_farmacia?.id_farmacia) {
    pharmacyId = existingUser.dados_dono_farmacia.id_farmacia;
    console.log(`  Usuário já existe: ${ownerRow.email} — reutilizando farmácia`);
  } else if (existingUser) {
    console.warn(
      `  E-mail ${ownerRow.email} existe sem vínculo de farmácia — pulando (ajuste manual).`,
    );
    return;
  } else {
    const dados_farmacia = {
      cnpj: f.cnpj,
      nome: f.nome,
      logradouro: f.logradouro,
      numero: f.numero,
      bairro: f.bairro,
      cidade: f.cidade,
      estado: f.estado,
      cep: f.cep,
    };

    console.log(`  Registrando dono: ${ownerRow.email} — ${f.nome}`);
    const { user } = await authService.registerUser({
      nome: ownerRow.nome,
      email: ownerRow.email,
      telefone: ownerRow.telefone,
      cpf: ownerRow.cpf,
      senha: DEMO_SENHA,
      tipo_usuario: "dono_farmacia",
      lgpd_consentimento: true,
      dados_farmacia,
    });
    pharmacyId = user?.dados_dono_farmacia?.id_farmacia;
    if (!pharmacyId) throw new Error("Cadastro não retornou id_farmacia");
  }

  await Pharmacy.findByIdAndUpdate(pharmacyId, {
    location: f.location,
    horario_funcionamento: f.horario_funcionamento,
    avaliacao: f.avaliacao,
    total_avaliacoes: f.total_avaliacoes,
    logo: f.logo,
    foto: f.foto,
    ativa: true,
    descricao: `Farmácia atendendo Goiânia — ${f.bairro}.`,
    formas_pagamento: ["pix", "cartao_credito", "cartao_debito", "dinheiro"],
    tipos_entrega: ["moto", "bicicleta", "retirada"],
    raio_entrega_km: 12,
    taxa_entrega_base: 6,
    taxa_por_km: 1.8,
  });

  const nProd = await Product.countDocuments({
    id_farmacia: pharmacyId,
    ativo: true,
  });
  if (nProd === 0) {
    const batch = buildProdutos([pharmacyId], [ownerRow.farmaciaIndex]);
    if (batch.length) {
      await Product.insertMany(batch);
      console.log(`  ${batch.length} produtos criados`);
    }
  } else {
    console.log(`  ${nProd} produtos já cadastrados — mantendo`);
  }

  await ensureControlledProductBatchesForPharmacy(pharmacyId);

  const phFresh = await Pharmacy.findById(pharmacyId);
  if (phFresh) {
    try {
      await insertReviewsForSinglePharmacyIfEmpty(phFresh);
    } catch (e) {
      console.error(`  Erro ao garantir avaliações demo: ${e.message}`);
    }
  }
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("MongoDB conectado\n=== Seed Goiânia (donos + produtos) ===\n");
  console.log(`Senha demo para todas as contas: ${DEMO_SENHA}\n`);

  for (const row of DEMO_OWNERS) {
    console.log(`${row.email} (${farmacias[row.farmaciaIndex].nome})`);
    try {
      await ensureOwnerAndStock(row);
    } catch (e) {
      console.error(`  Erro: ${e.message}`);
    }
    console.log("");
  }

  await mongoose.disconnect();
  console.log("Concluído.");
}

module.exports = { run };

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
