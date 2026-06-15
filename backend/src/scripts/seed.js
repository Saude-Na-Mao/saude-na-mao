require("dotenv").config();
const mongoose = require("mongoose");
const Pharmacy = require("../models/Pharmacy");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");

const farmacias = [
  {
    nome: "Drogasil - Setor Bueno",
    cnpj: "12345678000100",
    telefone: "6232221100",
    email: "bueno85@drogasil.com.br",
    logradouro: "Avenida 85",
    numero: "3022",
    bairro: "Setor Bueno",
    cidade: "Goiânia",
    estado: "GO",
    cep: "74223010",
    horario_funcionamento: "Seg-Sex 07h-22h, Sab-Dom 08h-20h",
    avaliacao: 4.8,
    total_avaliacoes: 412,
    ativa: true,
    logo: "/imagens/farmacias/drogasil-logo.jpg",
    foto: "/imagens/farmacias/drogasil-foto.png",
    location: { type: "Point", coordinates: [-49.2680, -16.7045] },
  },
  {
    nome: "Drogarias Pacheco - Setor Bueno",
    cnpj: "23456789000111",
    telefone: "6233441200",
    email: "t1@drogariaspacheco.com.br",
    logradouro: "Avenida T-1",
    numero: "2326",
    bairro: "Setor Bueno",
    cidade: "Goiânia",
    estado: "GO",
    cep: "74215022",
    horario_funcionamento: "Seg-Sex 08h-22h, Sab 08h-18h",
    avaliacao: 4.5,
    total_avaliacoes: 289,
    ativa: true,
    logo: "/imagens/farmacias/pacheco-logo.jpg",
    foto: "/imagens/farmacias/pacheco-foto.png",
    location: { type: "Point", coordinates: [-49.2670, -16.7090] },
  },
  {
    nome: "Droga Raia - Setor Oeste",
    cnpj: "34567890000122",
    telefone: "6235561300",
    email: "libano@drogaraia.com.br",
    logradouro: "Avenida República do Líbano",
    numero: "2320",
    bairro: "Setor Oeste",
    cidade: "Goiânia",
    estado: "GO",
    cep: "74115030",
    horario_funcionamento: "24 horas",
    avaliacao: 4.6,
    total_avaliacoes: 534,
    ativa: true,
    logo: "/imagens/farmacias/droga-raia-logo.jpg",
    foto: "/imagens/farmacias/droga-raia-foto.png",
    location: { type: "Point", coordinates: [-49.2710, -16.6920] },
  },
  {
    nome: "Farmácia Pague Menos - Setor Bueno",
    cnpj: "45678901000133",
    telefone: "6236671400",
    email: "t9@paguemenos.com.br",
    logradouro: "Avenida T-9",
    numero: "1174",
    bairro: "Setor Bueno",
    cidade: "Goiânia",
    estado: "GO",
    cep: "74215020",
    horario_funcionamento: "Seg-Sab 07h-21h",
    avaliacao: 4.2,
    total_avaliacoes: 178,
    ativa: true,
    logo: "/imagens/farmacias/pague-menos-logo.jpg",
    foto: "/imagens/farmacias/pague-menos-foto.png",
    location: { type: "Point", coordinates: [-49.2720, -16.7050] },
  },
  {
    nome: "Drogaria Santa Marta - Jardim América",
    cnpj: "56789012000144",
    telefone: "6237781500",
    email: "c174@drogariasantamarta.com.br",
    logradouro: "Rua C-174",
    numero: "174",
    bairro: "Jardim América",
    cidade: "Goiânia",
    estado: "GO",
    cep: "74343000",
    horario_funcionamento: "Seg-Sex 07h-23h, Sab-Dom 08h-22h",
    avaliacao: 4.7,
    total_avaliacoes: 367,
    ativa: true,
    logo: "/imagens/farmacias/santa-marta-logo.png",
    foto: "/imagens/farmacias/santa-marta-foto.png",
    location: { type: "Point", coordinates: [-49.2620, -16.7180] },
  },
  {
    nome: "Drogaria Medfacil - Setor Pedro Ludovico",
    cnpj: "67890123000155",
    telefone: "6238891600",
    email: "circular@drogariamedfacil.com.br",
    logradouro: "Avenida Circular",
    numero: "S/N",
    bairro: "Setor Pedro Ludovico",
    cidade: "Goiânia",
    estado: "GO",
    cep: "74823020",
    horario_funcionamento: "Seg-Sab 07h-22h, Dom 08h-18h",
    avaliacao: 4.0,
    total_avaliacoes: 245,
    ativa: true,
    logo: "/imagens/farmacias/medfacil-logo.png",
    foto: "/imagens/farmacias/medfacil-foto.png",
    location: { type: "Point", coordinates: [-49.2560, -16.6960] },
  },
];

const produtosBase = [
  {
    nome: "Paracetamol 750mg",
    principio_ativo: "Paracetamol",
    categoria: "Analgésico",
    dosagem: "750mg",
    fabricante: "EMS",
    descricao: "Indicado para dores leves a moderadas e febre.",
    receita_obrigatoria: false,
    controlado: false,
    classificacao_receita: "sem_receita",
    imagens: ["/imagens/paracetamol-750mg-teuto.jpg"],
    precos: [7.90, 8.50, 6.99, 7.20, 8.90, 5.99],
  },
  {
    nome: "Ibuprofeno Cimed 400mg",
    principio_ativo: "Ibuprofeno",
    categoria: "Anti-inflamatório",
    dosagem: "400mg",
    fabricante: "Cimed",
    descricao: "Anti-inflamatório, analgésico e antitérmico.",
    receita_obrigatoria: false,
    controlado: false,
    classificacao_receita: "sem_receita",
    imagens: ["/imagens/ibuprofeno-cimed-400mg.webp"],
    precos: [14.50, 12.90, 15.80, 11.90, 13.50, 10.90],
  },
  {
    nome: "Dipirona 500mg",
    principio_ativo: "Metamizol sódico",
    categoria: "Analgésico",
    dosagem: "500mg",
    fabricante: "Sanofi",
    descricao: "Analgésico e antitérmico de uso oral.",
    receita_obrigatoria: false,
    controlado: false,
    classificacao_receita: "sem_receita",
    imagens: ["/imagens/dipirona-500mg-prati.jpg"],
    precos: [9.90, 8.50, 10.50, 7.90, 9.20, 6.90],
  },
  {
    nome: "Amoxicilina 500mg Genérico",
    principio_ativo: "Amoxicilina",
    categoria: "Antibiótico",
    dosagem: "500mg",
    fabricante: "Genérico",
    descricao: "Antibiótico de amplo espectro para infecções bacterianas.",
    receita_obrigatoria: true,
    controlado: false,
    classificacao_receita: "antimicrobiano",
    imagens: ["/imagens/amoxicilina-generico.jpg"],
    precos: [22.80, 24.90, 19.90, 21.50, 23.40, 18.90],
  },
  {
    nome: "Loratadina 10mg",
    principio_ativo: "Loratadina",
    categoria: "Antialérgico",
    dosagem: "10mg",
    fabricante: "Mantecorp",
    descricao: "Anti-histamínico para rinite alérgica e urticária.",
    receita_obrigatoria: false,
    controlado: false,
    classificacao_receita: "sem_receita",
    imagens: ["/imagens/loratadina-cimed-1mg-ml.jpg"],
    precos: [12.40, 14.90, 11.50, 13.20, 10.90, 9.90],
  },
  {
    nome: "Vitamina C 1g",
    principio_ativo: "Ácido ascórbico",
    categoria: "Vitamina",
    dosagem: "1g",
    fabricante: "Vitafor",
    descricao: "Suplemento de vitamina C efervescente.",
    receita_obrigatoria: false,
    controlado: false,
    classificacao_receita: "sem_receita",
    imagens: ["/imagens/vitamina-c-1g.jpg"],
    precos: [18.90, 21.50, 16.90, 19.90, 17.50, 15.90],
  },
  {
    nome: "Vitamina D 2000UI",
    principio_ativo: "Colecalciferol",
    categoria: "Vitamina",
    dosagem: "2000UI",
    fabricante: "Cellgenix",
    descricao: "Suplemento de vitamina D3 em cápsulas.",
    receita_obrigatoria: false,
    controlado: false,
    classificacao_receita: "sem_receita",
    imagens: ["/imagens/vitamina-d-2000ui.jpg"],
    precos: [34.90, 32.50, 36.90, 29.90, 33.80, 28.90],
  },
  {
    nome: "Complexo B Concentrado 60 Comprimidos",
    principio_ativo: "Vitaminas do complexo B",
    categoria: "Vitamina",
    dosagem: "60 comprimidos",
    fabricante: "Maxinutri",
    descricao: "Suplemento com vitaminas B1, B2, B3, B5, B6, B7, B9 e B12.",
    receita_obrigatoria: false,
    controlado: false,
    classificacao_receita: "sem_receita",
    imagens: ["/imagens/complexo-b-maxinutri.jpg"],
    precos: [21.50, 19.90, 23.80, 18.50, 22.40, 17.90],
  },
  {
    nome: "Omeprazol 20mg",
    principio_ativo: "Omeprazol",
    categoria: "Antiulceroso",
    dosagem: "20mg",
    fabricante: "EMS",
    descricao: "Inibidor de bomba de prótons para gastrite e úlcera.",
    receita_obrigatoria: false,
    controlado: false,
    classificacao_receita: "sem_receita",
    imagens: ["/imagens/omeprazol-20mg-ems.jpg"],
    precos: [16.80, 18.90, 14.50, 17.20, 15.90, 13.50],
  },
  {
    nome: "Metformina 850mg",
    principio_ativo: "Cloridrato de metformina",
    categoria: "Antidiabético",
    dosagem: "850mg",
    fabricante: "Laproff",
    descricao: "Hipoglicemiante oral para diabetes tipo 2.",
    receita_obrigatoria: true,
    controlado: false,
    classificacao_receita: "tarja_vermelha",
    imagens: ["/imagens/metformina-850mg-laproff.jpg"],
    precos: [11.20, 13.50, 10.80, 12.90, 11.90, 9.90],
  },
  {
    nome: "Atenolol 25mg Genérico",
    principio_ativo: "Atenolol",
    categoria: "Anti-hipertensivo",
    dosagem: "25mg",
    fabricante: "Medley",
    descricao: "Betabloqueador para hipertensão e angina.",
    receita_obrigatoria: true,
    controlado: false,
    classificacao_receita: "tarja_vermelha",
    imagens: ["/imagens/atenolol-25mg-generico-medley.jpg"],
    precos: [8.50, 9.90, 7.80, 10.50, 8.20, 7.50],
  },
  {
    nome: "Rivotril Roche 20ml",
    principio_ativo: "Clonazepam",
    categoria: "Ansiolítico",
    dosagem: "20ml",
    fabricante: "Roche",
    descricao: "Benzodiazepínico indicado para ansiedade e epilepsia.",
    receita_obrigatoria: true,
    controlado: true,
    classificacao_receita: "tarja_preta",
    imagens: ["/imagens/rivotril-roche-20ml.png"],
    precos: [28.60, 31.90, 26.50, null, 29.90, 25.80],
  },
  {
    nome: "Ritalina 10mg",
    principio_ativo: "Metilfenidato",
    categoria: "Estimulante",
    dosagem: "10mg",
    fabricante: "Novartis",
    descricao: "Indicado para TDAH e narcolepsia.",
    receita_obrigatoria: true,
    controlado: true,
    classificacao_receita: "controlado_a",
    imagens: ["/imagens/ritalina-10mg-novartis.jpg"],
    precos: [89.90, null, 84.50, null, 92.30, 79.90],
  },
  {
    nome: "Alprazolam 1mg",
    principio_ativo: "Alprazolam",
    categoria: "Ansiolítico",
    dosagem: "1mg",
    fabricante: "Medley",
    descricao: "Benzodiazepínico de curta duração para ansiedade.",
    receita_obrigatoria: true,
    controlado: true,
    classificacao_receita: "tarja_preta",
    imagens: ["/imagens/alprazolam-1mg-medley.jpg"],
    precos: [43.20, 45.90, null, 40.50, 44.80, 38.90],
  },
  {
    nome: "Sinvastatina 20mg",
    principio_ativo: "Sinvastatina",
    categoria: "Hipolipemiante",
    dosagem: "20mg",
    fabricante: "Sandoz",
    descricao: "Redutor de colesterol LDL.",
    receita_obrigatoria: true,
    controlado: false,
    classificacao_receita: "tarja_vermelha",
    imagens: ["/imagens/sinvastatina-20mg-cimed.jpg"],
    precos: [13.90, 15.50, 12.80, 14.20, 13.50, 11.90],
  },
  {
    nome: "Dorflex",
    principio_ativo: "Dipirona + Orfenadrina + Cafeína",
    categoria: "Analgésico",
    dosagem: "1 comprimido",
    fabricante: "Sanofi",
    descricao: "Analgésico e relaxante muscular.",
    receita_obrigatoria: false,
    controlado: false,
    classificacao_receita: "sem_receita",
    imagens: ["/imagens/dorflex-24-comprimidos.webp"],
    precos: [11.90, 13.50, 10.50, 12.80, 11.20, 9.90],
  },
  {
    nome: "Buscopan",
    principio_ativo: "Escopolamina + Dipirona",
    categoria: "Antiespasmódico",
    dosagem: "1 comprimido",
    fabricante: "Boehringer",
    descricao: "Para cólicas e dores abdominais.",
    receita_obrigatoria: false,
    controlado: false,
    classificacao_receita: "sem_receita",
    imagens: ["/imagens/buscopan.jpg"],
    precos: [19.90, 22.50, 17.80, 20.90, 18.50, 16.90],
  },
  {
    nome: "Allegra 120mg",
    principio_ativo: "Fexofenadina",
    categoria: "Antialérgico",
    dosagem: "120mg",
    fabricante: "Sanofi",
    descricao: "Anti-histamínico de segunda geração para alergias.",
    receita_obrigatoria: false,
    controlado: false,
    classificacao_receita: "sem_receita",
    imagens: ["/imagens/allegra-120mg.jpg"],
    precos: [32.90, 35.50, 29.90, 34.80, 31.50, 28.90],
  },
  {
    nome: "Neosaldina",
    principio_ativo: "Dipirona + Isometepteno + Cafeína",
    categoria: "Analgésico",
    dosagem: "1 drágea",
    fabricante: "Takeda",
    descricao: "Para dores de cabeça e enxaqueca.",
    receita_obrigatoria: false,
    controlado: false,
    classificacao_receita: "sem_receita",
    imagens: ["/imagens/neosaldina.jpg"],
    precos: [14.90, 16.50, 13.20, 15.80, 14.20, 12.50],
  },
];

function addMonths(base, months) {
  const date = new Date(base);
  date.setMonth(date.getMonth() + months);
  return date;
}

function controlledBatchPrefix(product, productIndex, pharmacyIndex) {
  const base = String(product.principio_ativo || product.nome || "LOTE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, "X");
  return `${base}${String(productIndex + 1).padStart(2, "0")}${String(pharmacyIndex + 1).padStart(2, "0")}`;
}

function buildControlledBatches(product, stock, productIndex, pharmacyIndex) {
  // SNGPC = tarja_preta, controlado_a e antimicrobiano. Todos precisam de lote
  // válido senão o batchAvailability marca o produto como indisponível.
  const isSngpc =
    product.controlado ||
    product.classificacao_receita === "tarja_preta" ||
    product.classificacao_receita === "controlado_a" ||
    product.classificacao_receita === "antimicrobiano";
  if (!isSngpc) return [];
  const total = Math.max(3, Number(stock) || 3);
  const firstQty = Math.max(1, Math.floor(total * 0.35));
  const secondQty = Math.max(1, Math.floor(total * 0.4));
  const thirdQty = Math.max(1, total - firstQty - secondQty);
  const prefix = controlledBatchPrefix(product, productIndex, pharmacyIndex);
  const baseDate = new Date();

  return [
    {
      batchNumber: `${prefix}-${String(101 + productIndex).padStart(3, "0")}`,
      expirationDate: addMonths(baseDate, 8 + productIndex),
      quantity: firstQty,
      active: true,
    },
    {
      batchNumber: `${prefix}-${String(200 + pharmacyIndex).padStart(3, "0")}`,
      expirationDate: addMonths(baseDate, 18 + productIndex),
      quantity: secondQty,
      active: true,
    },
    {
      batchNumber: `${prefix}-${String(310 + productIndex + pharmacyIndex).padStart(3, "0")}`,
      expirationDate: addMonths(baseDate, 28 + productIndex),
      quantity: thirdQty,
      active: true,
    },
  ];
}

/** priceColumnPerPharmacy[j] seleciona qual coluna de precos usar para farmaciaIds[j] (omitir = mesmo índice j). */
function buildProdutos(farmaciaIds, priceColumnPerPharmacy = null) {
  const produtos = [];
  const estoqueBase = [85, 60, 100, 40, 70, 55, 30, 45, 90, 75, 65, 20, 10, 15, 50, 35, 80, 42, 25, 68];

  for (let i = 0; i < produtosBase.length; i++) {
    const { precos, ...dadosProduto } = produtosBase[i];

    for (let j = 0; j < farmaciaIds.length; j++) {
      const pIdx =
        priceColumnPerPharmacy != null && priceColumnPerPharmacy[j] !== undefined
          ? priceColumnPerPharmacy[j]
          : j;
      if (precos[pIdx] === null || precos[pIdx] === undefined) continue;
      const estoque = estoqueBase[i] + Math.floor(Math.random() * 30);

      produtos.push({
        ...dadosProduto,
        preco: precos[pIdx],
        estoque,
        batches: buildControlledBatches(dadosProduto, estoque, i, pIdx),
        id_farmacia: farmaciaIds[j],
        ativo: true,
      });
    }
  }

  return produtos;
}

const cupons = [
  {
    codigo: "BEMVINDO10",
    tipo_desconto: "percentual",
    valor: 10,
    desconto_maximo: 20,
    minimo_pedido: 30,
    validade: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    limite_uso: 500,
    limite_por_usuario: 1,
    ativo: true,
    descricao: "10% de desconto na primeira compra",
  },
  {
    codigo: "FRETEGRATIS",
    tipo_desconto: "fixo",
    valor: 0,
    minimo_pedido: 50,
    validade: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    limite_uso: 200,
    limite_por_usuario: 3,
    ativo: true,
    descricao: "Frete grátis em compras acima de R$ 50",
    frete_gratis: true,
  },
  {
    codigo: "SAUDE15",
    tipo_desconto: "percentual",
    valor: 15,
    desconto_maximo: 30,
    minimo_pedido: 80,
    validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    limite_uso: 100,
    limite_por_usuario: 1,
    ativo: true,
    descricao: "15% de desconto em pedidos acima de R$ 80",
  },
  {
    codigo: "VITAMINAS20",
    tipo_desconto: "percentual",
    valor: 20,
    desconto_maximo: 25,
    minimo_pedido: 40,
    validade: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
    limite_uso: 150,
    limite_por_usuario: 2,
    ativo: true,
    descricao: "20% off em vitaminas e suplementos",
  },
  {
    codigo: "DESCONTO5",
    tipo_desconto: "fixo",
    valor: 5,
    minimo_pedido: 25,
    validade: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000),
    limite_uso: null,
    limite_por_usuario: 5,
    ativo: true,
    descricao: "R$ 5 de desconto em qualquer pedido acima de R$ 25",
  },
];

async function main() {
  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017/saude-na-mao";
  await mongoose.connect(mongoUri);
  console.log("Conectado ao MongoDB");

  await Pharmacy.deleteMany({});
  await Product.deleteMany({});
  await Coupon.deleteMany({});
  console.log("Collections limpas");

  const farmaciasCriadas = await Pharmacy.insertMany(farmacias);
  console.log(`${farmaciasCriadas.length} farmácias criadas`);

  const ids = farmaciasCriadas.map((f) => f._id);
  const produtos = buildProdutos(ids);

  const produtosCriados = await Product.insertMany(produtos);
  console.log(`${produtosCriados.length} produtos criados`);

  const cuponsCriados = await Coupon.insertMany(cupons);
  console.log(`${cuponsCriados.length} cupons criados`);

  await mongoose.disconnect();
  console.log("Seed concluído com sucesso");
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Erro no seed:", err.message);
      process.exit(1);
    });
}

/** Assume mongoose já conectado (uso pelo seed-all). */
async function ensureCuponsDemo() {
  const Coupon = require("../models/Coupon");
  const count = await Coupon.countDocuments();
  if (count > 0) {
    console.log(`  Cupons já existem (${count}) — mantendo`);
    return;
  }
  await Coupon.insertMany(cupons);
  console.log(`  ✅ ${cupons.length} cupons demo criados`);
}

async function ensureControlledProductBatchesForPharmacy(pharmacyId) {
  const products = await Product.find({
    id_farmacia: pharmacyId,
    $or: [
      { controlado: true },
      { classificacao_receita: { $in: ["tarja_preta", "controlado_a", "antimicrobiano"] } },
    ],
    ativo: true,
  });

  let updated = 0;
  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    const activeBatchQuantity = (Array.isArray(product.batches) ? product.batches : [])
      .filter((batch) => batch?.active !== false)
      .reduce((total, batch) => total + Math.max(0, Number(batch?.quantity || 0)), 0);
    if (Array.isArray(product.batches) && product.batches.length >= 3 && activeBatchQuantity > 0) continue;
    const productIndex = produtosBase.findIndex((item) => item.nome === product.nome);
    product.batches = buildControlledBatches(
      {
        nome: product.nome,
        principio_ativo: product.principio_ativo,
        controlado: true,
        classificacao_receita: product.classificacao_receita,
      },
      Math.max(Number(product.estoque || 0), 3),
      productIndex >= 0 ? productIndex : index,
      index,
    );
    product.estoque = Math.max(
      Number(product.estoque || 0),
      product.batches.reduce((total, batch) => total + Number(batch.quantity || 0), 0),
    );
    await product.save();
    updated += 1;
  }

  if (updated > 0) {
    console.log(`  ${updated} medicamento(s) controlado(s) com lotes atualizados`);
  }
}

module.exports = {
  main,
  farmacias,
  produtosBase,
  buildProdutos,
  ensureCuponsDemo,
  ensureControlledProductBatchesForPharmacy,
};
