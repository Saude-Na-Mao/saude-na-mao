const mongoose = require("mongoose");
const Pharmacy = require("../models/Pharmacy");
const Product = require("../models/Product");
const Review = require("../models/Review");
const Order = require("../models/Order");
const Pharmacist = require("../models/Pharmacist");

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const ONLINE_PRESENCE_WINDOW_MS = 2 * 60 * 1000;

function getOnlinePresenceCutoff() {
  return new Date(Date.now() - ONLINE_PRESENCE_WINDOW_MS);
}

async function listPharmacies({
  page = 1,
  limit = 10,
  cidade,
  estado,
  search,
  ativa = true,
} = {}) {
  const filtro = { ativa };
  if (cidade) filtro.cidade = { $regex: cidade, $options: "i" };
  if (estado) filtro.estado = estado.toUpperCase();
  if (search) filtro.nome = { $regex: search, $options: "i" };

  const resultado = await Pharmacy.paginate(filtro, {
    page,
    limit,
    sort: { avaliacao: -1 },
    lean: true,
  });

  const docs = Array.isArray(resultado?.docs) ? resultado.docs : [];
  const ids = docs
    .map((pharmacy) => pharmacy?._id)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (ids.length > 0) {
    const onlineCutoff = getOnlinePresenceCutoff();
    const [reviewStats, pharmacistStats] = await Promise.all([
      Review.aggregate([
        { $match: { id_farmacia: { $in: ids } } },
        {
          $group: {
            _id: "$id_farmacia",
            total: { $sum: 1 },
            avgRating: { $avg: "$nota" },
          },
        },
      ]),
      Pharmacist.aggregate([
        {
          $match: {
            id_farmacia: { $in: ids },
            ativo: true,
            logado: true,
            disponivel_chat: { $ne: false },
            bloqueado: { $ne: true },
            ultima_atividade: { $gte: onlineCutoff },
          },
        },
        {
          $group: {
            _id: "$id_farmacia",
            total: { $sum: 1 },
          },
        },
      ]),
    ]);

    const statsByPharmacy = new Map(
      reviewStats.map((s) => [
        String(s._id),
        {
          total: s.total || 0,
          avg: s.avgRating != null ? Math.round(s.avgRating * 10) / 10 : 0,
        },
      ]),
    );
    const onlineByPharmacy = new Map(
      pharmacistStats.map((s) => [String(s._id), s.total || 0]),
    );

    for (const pharmacy of docs) {
      const stat = statsByPharmacy.get(String(pharmacy._id));
      const onlineCount = onlineByPharmacy.get(String(pharmacy._id)) || 0;
      pharmacy.avaliacao = stat ? stat.avg : 0;
      pharmacy.total_avaliacoes = stat ? stat.total : 0;
      pharmacy.farmaceuticos_online = onlineCount;
      pharmacy.farmaceutico_online = onlineCount > 0;
    }
  }

  return resultado;
}

async function getPharmacyById(pharmacyId) {
  if (!mongoose.Types.ObjectId.isValid(pharmacyId)) {
    throw createError("Farmácia não encontrada", 404);
  }

  const farmacia = await Pharmacy.findById(pharmacyId);
  if (!farmacia) {
    throw createError("Farmácia não encontrada", 404);
  }

  const stats = await Review.aggregate([
    { $match: { id_farmacia: new mongoose.Types.ObjectId(pharmacyId) } },
    {
      $group: {
        _id: "$id_farmacia",
        total: { $sum: 1 },
        avgRating: { $avg: "$nota" },
      },
    },
  ]);

  if (stats.length > 0) {
    farmacia.avaliacao = Math.round(stats[0].avgRating * 10) / 10;
    farmacia.total_avaliacoes = stats[0].total;
  } else {
    farmacia.avaliacao = 0;
    farmacia.total_avaliacoes = 0;
  }

  return farmacia;
}

async function findNearbyPharmacies({
  longitude,
  latitude,
  raioKm = 5,
  limit = 10,
}) {
  if (longitude === undefined || latitude === undefined) {
    throw createError("Longitude e latitude são obrigatórios", 400);
  }

  const lon = parseFloat(longitude);
  const lat = parseFloat(latitude);

  if (isNaN(lon) || isNaN(lat)) {
    throw createError("Longitude e latitude devem ser números válidos", 400);
  }

  const farmacias = await Pharmacy.find({
    ativa: true,
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lon, lat] },
        $maxDistance: raioKm * 1000,
      },
    },
  }).limit(limit);

  return farmacias;
}

async function getPharmacyProducts(
  pharmacyId,
  { page = 1, limit = 20, categoria, disponivel } = {},
) {
  await getPharmacyById(pharmacyId);

  const filtro = { id_farmacia: pharmacyId, ativo: true };
  if (categoria) filtro.categoria = { $regex: categoria, $options: "i" };
  if (disponivel === "true") filtro.estoque = { $gt: 0 };

  const resultado = await Product.paginate(filtro, {
    page,
    limit,
    populate: { path: "id_farmacia", select: "nome cidade estado" },
    sort: { nome: 1 },
  });

  return resultado;
}

async function createPharmacy(dados) {
  const { latitude, longitude, ...resto } = dados;

  const existe = await Pharmacy.findOne({ cnpj: resto.cnpj });
  if (existe) {
    throw createError("CNPJ já cadastrado", 400);
  }

  const dadosFarmacia = { ...resto };
  if (latitude !== undefined && longitude !== undefined) {
    dadosFarmacia.location = {
      type: "Point",
      coordinates: [parseFloat(longitude), parseFloat(latitude)],
    };
  }

  const farmacia = new Pharmacy(dadosFarmacia);
  await farmacia.save();
  return farmacia;
}

async function updatePharmacy(pharmacyId, dados) {
  if (!mongoose.Types.ObjectId.isValid(pharmacyId)) {
    throw createError("Farmácia não encontrada", 404);
  }

  const { latitude, longitude, ...resto } = dados;

  const updateData = { ...resto };
  if (latitude !== undefined && longitude !== undefined) {
    updateData.location = {
      type: "Point",
      coordinates: [parseFloat(longitude), parseFloat(latitude)],
    };
  }

  const farmacia = await Pharmacy.findByIdAndUpdate(pharmacyId, updateData, {
    new: true,
    runValidators: true,
  });

  if (!farmacia) {
    throw createError("Farmácia não encontrada", 404);
  }

  const pickupKeys = [
    "logradouro",
    "numero",
    "complemento",
    "bairro",
    "cidade",
    "estado",
    "cep",
    "latitude",
    "longitude",
    "location",
  ];
  if (pickupKeys.some((k) => dados[k] !== undefined)) {
    const deliveryService = require("./deliveryService");
    await deliveryService.syncPickupAddressFromPharmacy(pharmacyId);
  }

  return farmacia;
}

const STAFF_ADDRESS_FIELDS = [
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "cep",
  "telefone",
];

/**
 * Atualização restrita (dono / farmacêutico / admin): endereço e ponto no mapa para entregas.
 */
async function updatePharmacyAddressStaff(pharmacyId, body) {
  if (!mongoose.Types.ObjectId.isValid(pharmacyId)) {
    throw createError("Farmácia não encontrada", 404);
  }

  const { latitude, longitude, ...rest } = body || {};
  const updateData = {};

  for (const key of STAFF_ADDRESS_FIELDS) {
    if (rest[key] === undefined) continue;
    const v = rest[key];
    if (typeof v === "string") {
      const t = v.trim();
      if (key === "estado") {
        updateData[key] = t.toUpperCase().slice(0, 2);
      } else {
        updateData[key] = t;
      }
    } else {
      updateData[key] = v;
    }
  }

  if (latitude !== undefined && longitude !== undefined) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      updateData.location = {
        type: "Point",
        coordinates: [lng, lat],
      };
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw createError("Informe ao menos um campo de endereço ou latitude/longitude", 400);
  }

  const farmacia = await Pharmacy.findByIdAndUpdate(pharmacyId, updateData, {
    new: true,
    runValidators: true,
  });

  if (!farmacia) {
    throw createError("Farmácia não encontrada", 404);
  }

  const deliveryService = require("./deliveryService");
  await deliveryService.syncPickupAddressFromPharmacy(pharmacyId);

  return farmacia;
}

function isPharmacistOnline(doc) {
  if (!doc || doc.ativo === false) return false;
  const lastActivity = doc.ultima_atividade ? new Date(doc.ultima_atividade) : null;
  return Boolean(
    doc.logado &&
      doc.disponivel_chat !== false &&
      lastActivity &&
      lastActivity >= getOnlinePresenceCutoff(),
  );
}

async function getPharmacists(pharmacyId) {
  if (!mongoose.Types.ObjectId.isValid(pharmacyId)) {
    throw createError("Farmácia não encontrada", 404);
  }

  const Pharmacist = require("../models/Pharmacist");
  const rows = await Pharmacist.find({ id_farmacia: pharmacyId, ativo: true })
    .select(
      "id_usuario nome email crm logado status_motivo disponivel_chat crm_verificado atendimentos_dia receitas_validadas ativo",
    )
    .populate("id_usuario", "nome email")
    .sort({ logado: -1, receitas_validadas: -1 })
    .lean();

  const pharmacists = rows.map((p) => ({
    ...p,
    isOnline: isPharmacistOnline(p),
  }));
  const onlineCount = pharmacists.filter((p) => p.isOnline).length;

  return {
    pharmacists,
    onlineCount,
    hasOnline: onlineCount > 0,
  };
}

function getPeriodStart(periodo) {
  const now = new Date();
  if (periodo === "semana") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (periodo === "mes") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return start;
  }
  return null;
}

async function getOwnerDashboardStats(pharmacyId, { periodo = "mes" } = {}) {
  if (!mongoose.Types.ObjectId.isValid(pharmacyId)) {
    throw createError("Farmácia não encontrada", 404);
  }

  const pharmacyOid = new mongoose.Types.ObjectId(pharmacyId);
  const periodStart = getPeriodStart(periodo);

  const baseMatch = { id_farmacia: pharmacyOid, status: "entregue" };
  const periodMatch = periodStart
    ? { ...baseMatch, createdAt: { $gte: periodStart } }
    : baseMatch;

  const orderPeriodMatch = { id_farmacia: pharmacyOid };
  if (periodStart) {
    orderPeriodMatch.createdAt = { $gte: periodStart };
  }

  const [
    faturamentoAgg,
    pedidosEntregues,
    pedidosHoje,
    reviewStats,
    pedidosPorStatusAgg,
    pedidosPorTipoAgg,
    faturamentoPorMesAgg,
    itensPorClassificacaoAgg,
  ] =
    await Promise.all([
      Order.aggregate([
        { $match: periodMatch },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
      Order.countDocuments(periodMatch),
      Order.countDocuments({
        id_farmacia: pharmacyOid,
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      }),
      Review.aggregate([
        { $match: { id_farmacia: pharmacyOid } },
        {
          $group: {
            _id: "$id_farmacia",
            total: { $sum: 1 },
            avgRating: { $avg: "$nota" },
          },
        },
      ]),
      Order.aggregate([
        { $match: orderPeriodMatch },
        { $group: { _id: "$status", total: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: orderPeriodMatch },
        { $group: { _id: "$tipo_entrega", total: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { ...baseMatch, createdAt: { $gte: new Date(new Date().getFullYear(), 0, 1) } } },
        {
          $group: {
            _id: { ano: { $year: "$createdAt" }, mes: { $month: "$createdAt" } },
            total: { $sum: "$total" },
            pedidos: { $sum: 1 },
          },
        },
        { $sort: { "_id.ano": 1, "_id.mes": 1 } },
      ]),
      Order.aggregate([
        { $match: orderPeriodMatch },
        { $unwind: "$itens" },
        {
          $group: {
            _id: "$itens.classificacao_receita",
            quantidade: { $sum: "$itens.quantidade" },
            total: { $sum: "$itens.subtotal" },
          },
        },
      ]),
    ]);

  const faturamentoTotalAgg = await Order.aggregate([
    { $match: baseMatch },
    { $group: { _id: null, total: { $sum: "$total" } } },
  ]);

  const faturamento_periodo = faturamentoAgg[0]?.total || 0;
  const faturamento_total = faturamentoTotalAgg[0]?.total || 0;

  const avaliacao_media =
    reviewStats.length > 0
      ? Math.round(reviewStats[0].avgRating * 10) / 10
      : 0;
  const total_avaliacoes = reviewStats[0]?.total || 0;

  const pedidos_por_status = pedidosPorStatusAgg.reduce((acc, item) => {
    if (item._id) acc[item._id] = item.total;
    return acc;
  }, {});

  const pedidos_por_tipo_entrega = pedidosPorTipoAgg.reduce((acc, item) => {
    if (item._id) acc[item._id] = item.total;
    return acc;
  }, {});

  const faturamento_por_mes = faturamentoPorMesAgg.map((item) => ({
    ano: item._id.ano,
    mes: item._id.mes,
    label: `${String(item._id.mes).padStart(2, "0")}/${item._id.ano}`,
    total: Math.round((item.total || 0) * 100) / 100,
    pedidos: item.pedidos || 0,
  }));

  const itens_por_classificacao = itensPorClassificacaoAgg.reduce((acc, item) => {
    const key = item._id || "sem_receita";
    acc[key] = {
      quantidade: item.quantidade || 0,
      total: Math.round((item.total || 0) * 100) / 100,
    };
    return acc;
  }, {});

  const total_pedidos_periodo = Object.values(pedidos_por_status).reduce(
    (sum, n) => sum + n,
    0,
  );

  const ticket_medio_periodo =
    pedidosEntregues > 0
      ? Math.round((faturamento_periodo / pedidosEntregues) * 100) / 100
      : 0;

  return {
    faturamento_total,
    faturamento_periodo,
    pedidos_entregues: pedidosEntregues,
    pedidos_hoje: pedidosHoje,
    avaliacao_media,
    total_avaliacoes,
    pedidos_por_status,
    pedidos_por_tipo_entrega,
    faturamento_por_mes,
    itens_por_classificacao,
    total_pedidos_periodo,
    ticket_medio_periodo,
    periodo,
  };
}

module.exports = {
  listPharmacies,
  getPharmacyById,
  findNearbyPharmacies,
  getPharmacyProducts,
  createPharmacy,
  updatePharmacy,
  updatePharmacyAddressStaff,
  getPharmacists,
  getOwnerDashboardStats,
};
