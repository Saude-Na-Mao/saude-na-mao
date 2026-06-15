/**
 * Cria um dono_farmacia e um farmaceutico para cada farmácia demo (que possua produtos),
 * vinculando-os via dados_dono_farmacia.id_farmacia / dados_farmaceutico.id_farmacia e
 * Pharmacy.id_dono. Cada usuário responde apenas pela sua própria farmácia.
 *
 * Mantém os logins demo existentes (dono@farmacia.com / farmaceutico@saudenamao.com)
 * apontando para a primeira farmácia.
 */
const mongoose = require("mongoose");
const connectDB = require("../config/database");
const Pharmacy = require("../models/Pharmacy");
const Product = require("../models/Product");
const User = require("../models/User");

const DONO_SENHA = "Dono@123";
const FARM_SENHA = "Farm@123";

function slugify(nome) {
  return String(nome || "farmacia")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16) || "farmacia";
}

async function upsertStaff({ email, nome, tipo, senha, pharmacyId }) {
  let user = await User.findOne({ email });
  if (!user) {
    user = new User({ email, nome, senha, tipo_usuario: tipo });
  } else {
    user.nome = nome;
    user.tipo_usuario = tipo;
    user.senha = senha; // re-hash via pre-save
  }
  user.role = tipo === "dono_farmacia" ? "dono_farmacia" : "farmaceutico";
  user.ativo = true;
  if (tipo === "dono_farmacia") {
    user.dados_dono_farmacia = { id_farmacia: pharmacyId };
  } else {
    user.dados_farmaceutico = {
      ...(user.dados_farmaceutico || {}),
      id_farmacia: pharmacyId,
      crf: user.dados_farmaceutico?.crf || `CRF-GO ${Math.floor(10000 + Math.random() * 89999)}`,
      crf_verificado: true,
    };
  }
  await user.save();
  return user;
}

(async () => {
  await connectDB();

  // Farmácias que realmente têm produtos (as demo reais)
  const pharmacyIdsWithProducts = await Product.distinct("id_farmacia");
  const pharmacies = await Pharmacy.find({ _id: { $in: pharmacyIdsWithProducts } })
    .sort({ _id: 1 })
    .select("nome cidade id_dono");

  console.log(`Farmácias com produtos: ${pharmacies.length}\n`);
  const credenciais = [];

  for (let i = 0; i < pharmacies.length; i++) {
    const ph = pharmacies[i];
    const slug = slugify(ph.nome);

    // Primeira farmácia mantém também os logins demo originais
    const isFirst = i === 0;

    const donoEmail = `dono.${slug}@saudenamao.com`;
    const farmEmail = `farmaceutico.${slug}@saudenamao.com`;

    const dono = await upsertStaff({
      email: donoEmail,
      nome: `Dono ${ph.nome}`,
      tipo: "dono_farmacia",
      senha: DONO_SENHA,
      pharmacyId: ph._id,
    });
    const farm = await upsertStaff({
      email: farmEmail,
      nome: `Farmacêutico ${ph.nome}`,
      tipo: "farmaceutico",
      senha: FARM_SENHA,
      pharmacyId: ph._id,
    });

    ph.id_dono = dono._id;
    await ph.save();

    credenciais.push({ farmacia: ph.nome, donoEmail, farmEmail });
    console.log(`✓ ${ph.nome}`);
    console.log(`    DONO        ${donoEmail} / ${DONO_SENHA}`);
    console.log(`    FARMACEUTICO ${farmEmail} / ${FARM_SENHA}`);

    if (isFirst) {
      // Religa os logins demo genéricos à primeira farmácia
      const demoDono = await User.findOne({ email: "dono@farmacia.com" });
      if (demoDono) {
        demoDono.tipo_usuario = "dono_farmacia";
        demoDono.role = "dono_farmacia";
        demoDono.dados_dono_farmacia = { id_farmacia: ph._id };
        demoDono.ativo = true;
        await demoDono.save();
        console.log(`    (demo) dono@farmacia.com -> ${ph.nome}`);
      }
      const demoFarm = await User.findOne({ email: "farmaceutico@saudenamao.com" });
      if (demoFarm) {
        demoFarm.tipo_usuario = "farmaceutico";
        demoFarm.role = "farmaceutico";
        demoFarm.dados_farmaceutico = {
          ...(demoFarm.dados_farmaceutico || {}),
          id_farmacia: ph._id,
          crf_verificado: true,
        };
        demoFarm.ativo = true;
        await demoFarm.save();
        console.log(`    (demo) farmaceutico@saudenamao.com -> ${ph.nome}`);
      }
    }
    console.log("");
  }

  console.log("Concluído.");
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
