/**
 * Popula MedicineCatalog com medicamentos que exigem receita (referência do seed de produtos).
 * Uso: node src/scripts/seedMedicineCatalog.js
 */
const mongoose = require("mongoose");
const { loadBackendEnv } = require("../config/envBootstrap");
loadBackendEnv();

const MedicineCatalog = require("../models/MedicineCatalog");

const DEFAULT_MONGO_URI = "mongodb://127.0.0.1:27017/saude-na-mao";

const catalogEntries = [
  {
    nome: "Amoxicilina 500mg",
    principio_ativo: "Amoxicilina",
    categoria: "Antibiótico",
    dosagem: "500mg",
    fabricante: "Teuto",
    descricao: "Antibiótico de amplo espectro para infecções bacterianas.",
    classificacao_receita: "antimicrobiano",
    receita_obrigatoria: true,
    controlado: false,
    validade_receita_dias: 10,
    preco_sugerido: 22.8,
    forma_farmaceutica: "Cápsula",
  },
  {
    nome: "Metformina 850mg",
    principio_ativo: "Cloridrato de metformina",
    categoria: "Antidiabético",
    dosagem: "850mg",
    fabricante: "Merck",
    classificacao_receita: "tarja_vermelha",
    receita_obrigatoria: true,
    controlado: false,
    preco_sugerido: 11.2,
    forma_farmaceutica: "Comprimido",
  },
  {
    nome: "Atenolol 50mg",
    principio_ativo: "Atenolol",
    categoria: "Anti-hipertensivo",
    dosagem: "50mg",
    fabricante: "Astrazeneca",
    classificacao_receita: "tarja_vermelha",
    receita_obrigatoria: true,
    controlado: false,
    preco_sugerido: 8.5,
    forma_farmaceutica: "Comprimido",
  },
  {
    nome: "Rivotril 2mg",
    principio_ativo: "Clonazepam",
    categoria: "Ansiolítico",
    dosagem: "2mg",
    fabricante: "Roche",
    classificacao_receita: "tarja_preta",
    receita_obrigatoria: true,
    controlado: true,
    preco_sugerido: 28.6,
    forma_farmaceutica: "Comprimido",
  },
  {
    nome: "Ritalina 10mg",
    principio_ativo: "Metilfenidato",
    categoria: "Estimulante",
    dosagem: "10mg",
    fabricante: "Novartis",
    classificacao_receita: "controlado_a",
    receita_obrigatoria: true,
    controlado: true,
    preco_sugerido: 89.9,
    forma_farmaceutica: "Comprimido",
  },
  {
    nome: "Alprazolam 0.5mg",
    principio_ativo: "Alprazolam",
    categoria: "Ansiolítico",
    dosagem: "0.5mg",
    fabricante: "Pfizer",
    classificacao_receita: "tarja_preta",
    receita_obrigatoria: true,
    controlado: true,
    preco_sugerido: 43.2,
    forma_farmaceutica: "Comprimido",
  },
  {
    nome: "Sinvastatina 20mg",
    principio_ativo: "Sinvastatina",
    categoria: "Hipolipemiante",
    dosagem: "20mg",
    fabricante: "Sandoz",
    classificacao_receita: "tarja_vermelha",
    receita_obrigatoria: true,
    controlado: false,
    preco_sugerido: 13.9,
    forma_farmaceutica: "Comprimido",
  },
  {
    nome: "Losartana 50mg",
    principio_ativo: "Losartana potássica",
    categoria: "Anti-hipertensivo",
    dosagem: "50mg",
    fabricante: "EMS",
    classificacao_receita: "tarja_vermelha",
    receita_obrigatoria: true,
    controlado: false,
    preco_sugerido: 15.8,
    forma_farmaceutica: "Comprimido",
  },
];

async function seed() {
  const uri =
    (process.env.MONGO_URI && process.env.MONGO_URI.trim()) ||
    (process.env.MONGODB_URI && process.env.MONGODB_URI.trim()) ||
    DEFAULT_MONGO_URI;

  await mongoose.connect(uri);
  console.log("Conectado ao MongoDB");

  let created = 0;
  let skipped = 0;

  for (const entry of catalogEntries) {
    const exists = await MedicineCatalog.findOne({
      nome: entry.nome,
      principio_ativo: entry.principio_ativo,
    });
    if (exists) {
      skipped += 1;
      continue;
    }
    await MedicineCatalog.create(entry);
    created += 1;
  }

  console.log(`Catálogo: ${created} criados, ${skipped} já existiam.`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
