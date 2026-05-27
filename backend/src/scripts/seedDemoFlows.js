const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

const mongoose = require("mongoose");
const User = require("../models/User");
const Pharmacy = require("../models/Pharmacy");
const Product = require("../models/Product");
const Pharmacist = require("../models/Pharmacist");
const Order = require("../models/Order");
const Delivery = require("../models/Delivery");
const Payment = require("../models/Payment");
const Prescription = require("../models/Prescription");
const SupportMessage = require("../models/SupportMessage");

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/saude-na-mao";

const MARKER = "DEMO_FLOW:";

const DESTINATIONS = {
  jardimGoias: {
    logradouro: "Rua 72",
    numero: "325",
    bairro: "Jardim Goias",
    cidade: "Goiania",
    estado: "GO",
    cep: "74810180",
    location: { type: "Point", coordinates: [-49.2442, -16.7042] },
  },
  bueno: {
    logradouro: "Avenida T-4",
    numero: "970",
    bairro: "Setor Bueno",
    cidade: "Goiania",
    estado: "GO",
    cep: "74230030",
    location: { type: "Point", coordinates: [-49.2584, -16.7067] },
  },
  marista: {
    logradouro: "Rua 1136",
    numero: "410",
    bairro: "Setor Marista",
    cidade: "Goiania",
    estado: "GO",
    cep: "74180200",
    location: { type: "Point", coordinates: [-49.2621, -16.6978] },
  },
  oeste: {
    logradouro: "Rua 22",
    numero: "144",
    bairro: "Setor Oeste",
    cidade: "Goiania",
    estado: "GO",
    cep: "74120130",
    location: { type: "Point", coordinates: [-49.2732, -16.6821] },
  },
};

function roleFromTipo(tipo) {
  return {
    administrador: "admin",
    cliente: "cliente",
    entregador: "entregador",
    dono_farmacia: "dono_farmacia",
    farmaceutico: "farmaceutico",
  }[tipo] || "cliente";
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function pointFromAddress(address) {
  return address.location;
}

function coordsToLatLng(location) {
  const coords = location?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  return { latitude: coords[1], longitude: coords[0] };
}

function midpoint(a, b, ratio = 0.5) {
  const ca = a?.coordinates;
  const cb = b?.coordinates;
  if (!Array.isArray(ca) || !Array.isArray(cb)) return null;
  return {
    latitude: ca[1] + (cb[1] - ca[1]) * ratio,
    longitude: ca[0] + (cb[0] - ca[0]) * ratio,
  };
}

function pharmacyAddress(pharmacy) {
  const address = {
    logradouro: pharmacy.logradouro,
    numero: pharmacy.numero,
    complemento: pharmacy.complemento,
    bairro: pharmacy.bairro,
    cidade: pharmacy.cidade,
    estado: pharmacy.estado,
    cep: pharmacy.cep,
  };

  if (pharmacy.location?.coordinates?.length === 2) {
    address.location = {
      type: "Point",
      coordinates: pharmacy.location.coordinates,
    };
  }

  return address;
}

function itemFromProduct(product, quantidade = 1) {
  const preco = roundMoney(product.preco_promocional || product.preco);
  return {
    id_produto: product._id,
    nome_produto: product.nome,
    preco_unitario: preco,
    quantidade,
    subtotal: roundMoney(preco * quantidade),
    controlado: product.controlado,
    receita_obrigatoria: product.receita_obrigatoria,
    classificacao_receita: product.classificacao_receita,
    registro_anvisa: product.registro_anvisa,
  };
}

function orderHistory(statuses, start) {
  return statuses.map((status, index) => ({
    status,
    alterado_em: addMinutes(start, index * 14),
    observacao: {
      aguardando_pagamento: "Pedido criado e aguardando pagamento.",
      em_processamento: "Pagamento aprovado; farmacia separando itens.",
      confirmado: "Pedido conferido e liberado para entrega.",
      a_caminho: "Entregador saiu para entrega.",
      aguardando_confirmacao_receita_farmacia:
        "Receita fisica aguardando conferencia na farmacia.",
      entregue: "Pedido entregue ao cliente.",
      cancelado: "Pedido cancelado.",
      rejeitado: "Receita recusada; reembolso do produto iniciado.",
    }[status] || "Status atualizado.",
  }));
}

function deliveryHistory(statuses, start, pickupLocation, destinationLocation) {
  const midway = midpoint(pickupLocation, destinationLocation, 0.58);
  const almostThere = midpoint(pickupLocation, destinationLocation, 0.82);
  const pickup = coordsToLatLng(pickupLocation);
  const destination = coordsToLatLng(destinationLocation);

  const locations = {
    disponivel: pickup,
    aceita: midpoint(pickupLocation, destinationLocation, 0.18),
    coletando: pickup,
    coletada: pickup,
    em_transito: almostThere || midway,
    entregue: destination,
    cancelada: midway,
  };

  return statuses.map((status, index) => ({
    status,
    alterado_em: addMinutes(start, index * 12),
    observacao: {
      disponivel: "Entrega criada e disponivel para aceite.",
      aceita: "Entregador aceitou a rota.",
      coletando: "Entregador chegou na farmacia.",
      coletada: "Pedido coletado no balcao.",
      em_transito: "Entrega em deslocamento.",
      entregue: "Entrega confirmada pelo cliente.",
      cancelada: "Entrega cancelada.",
    }[status] || "Status atualizado.",
    localizacao: locations[status] || undefined,
  }));
}

async function setCreatedDates(doc, date, extra = {}) {
  await doc.constructor.updateOne(
    { _id: doc._id },
    {
      $set: {
        createdAt: date,
        updatedAt: extra.updatedAt || date,
        ...extra,
      },
    },
  );
}

async function cleanupDemoData() {
  const demoOrders = await Order.find({
    observacoes_conformidade: { $regex: `^${MARKER}` },
  }).select("_id");
  const orderIds = demoOrders.map((order) => order._id);

  if (orderIds.length) {
    await Delivery.deleteMany({ id_pedido: { $in: orderIds } });
    await Payment.deleteMany({ id_pedido: { $in: orderIds } });
    await Order.deleteMany({ _id: { $in: orderIds } });
  }

  await Prescription.deleteMany({ observacoes: { $regex: `^${MARKER}` } });
  await SupportMessage.deleteMany({ assunto: { $regex: "^DEMO:" } });
}

async function findRequiredDocs() {
  const [cliente, entregador, admin, farmaceuticoUser] = await Promise.all([
    User.findOne({ email: "teste@teste.com" }),
    User.findOne({ email: "entregador@saudenamao.com" }),
    User.findOne({ email: "admin@saudenamao.com" }),
    User.findOne({ email: "farm.jardim@gyn.local" }),
  ]);

  const pharmacies = await Pharmacy.find({ ativa: true }).sort({ nome: 1 });
  const products = await Product.find({ ativo: true }).sort({ nome: 1 });
  const pharmacist = await Pharmacist.findOne({
    email: "farm.jardim@gyn.local",
  });

  const missing = [];
  if (!cliente) missing.push("teste@teste.com");
  if (!entregador) missing.push("entregador@saudenamao.com");
  if (!admin) missing.push("admin@saudenamao.com");
  if (!farmaceuticoUser) missing.push("farm.jardim@gyn.local");
  if (!pharmacist) missing.push("Pharmacist farm.jardim@gyn.local");
  if (pharmacies.length < 3) missing.push("farmacias demo");
  if (products.length < 6) missing.push("produtos demo");
  if (missing.length) {
    throw new Error(`Dados base ausentes: ${missing.join(", ")}`);
  }

  return { cliente, entregador, admin, farmaceuticoUser, pharmacist, pharmacies, products };
}

function productBy(pharmacy, products, predicate) {
  const pid = String(pharmacy._id);
  return products.find(
    (product) => String(product.id_farmacia) === pid && predicate(product),
  );
}

async function createPayment(order, status, date, valueOverride = null) {
  const value = roundMoney(valueOverride ?? order.total);
  const payment = await Payment.create({
    id_pedido: order._id,
    id_usuario: order.id_usuario,
    gateway: "teste",
    gateway_payment_id: `demo-${String(order._id).slice(-8)}`,
    gateway_status: status,
    forma_pagamento: "pix",
    valor: value,
    valor_farmacia: roundMoney(value * 0.88),
    valor_plataforma: roundMoney(value * 0.08),
    valor_entregador: roundMoney(order.taxa_entrega || 0),
    status,
    pago_em: status === "aprovado" ? date : undefined,
    estornado_em: status === "estornado" ? addMinutes(date, 42) : undefined,
    motivo_falha: status === "falhou" ? "Pagamento recusado no ambiente teste." : undefined,
    split: [
      { destinatario: "farmacia", valor: roundMoney(value * 0.88), percentual: 88 },
      { destinatario: "plataforma", valor: roundMoney(value * 0.08), percentual: 8 },
      { destinatario: "entregador", valor: roundMoney(order.taxa_entrega || 0), percentual: 0 },
    ],
  });
  await setCreatedDates(payment, date, { updatedAt: addMinutes(date, 2) });
  return payment;
}

async function createOrder({
  tag,
  cliente,
  pharmacy,
  products,
  deliveryFee,
  destination,
  status,
  paymentStatus,
  createdAt,
  history,
  delivery,
  pharmacistUser,
  motivo,
}) {
  const itens = products.map(({ product, quantidade }) =>
    itemFromProduct(product, quantidade),
  );
  const subtotal = roundMoney(itens.reduce((sum, item) => sum + item.subtotal, 0));
  const total = roundMoney(subtotal + deliveryFee);

  const order = await Order.create({
    id_usuario: cliente._id,
    id_farmacia: pharmacy._id,
    itens,
    tipo_entrega: "moto",
    endereco_entrega: {
      logradouro: destination.logradouro,
      numero: destination.numero,
      bairro: destination.bairro,
      cidade: destination.cidade,
      estado: destination.estado,
      cep: destination.cep,
    },
    subtotal,
    taxa_entrega: deliveryFee,
    total,
    metodo_pagamento: "pix",
    status,
    status_pagamento: paymentStatus,
    aprovado_farmaceutico: ["em_processamento", "confirmado", "a_caminho", "entregue"].includes(status),
    modo_demo: true,
    compliance_status: "demo_academico",
    observacoes_conformidade: `${MARKER}${tag}`,
    tempo_estimado_entrega: delivery?.tempo_estimado_min || 28,
    entregador: delivery?.driverName
      ? {
          nome: delivery.driverName,
          telefone: delivery.driverPhone,
          veiculo: delivery.vehicle,
          localizacao_atual: {
            ...coordsToLatLng(destination.location),
            atualizado_em: addMinutes(createdAt, 42),
          },
        }
      : {},
    entregue_em: status === "entregue" ? addMinutes(createdAt, 78) : undefined,
    cancelado_em: ["cancelado", "rejeitado"].includes(status)
      ? addMinutes(createdAt, 32)
      : undefined,
    motivo_cancelamento: motivo,
    historico_status: orderHistory(history, createdAt),
    farmaceutico_dispensador: pharmacistUser?._id || null,
    numero_nf: status === "entregue" ? `DEMO-${String(Date.now()).slice(-6)}-${tag}` : null,
  });

  await setCreatedDates(order, createdAt, { updatedAt: addMinutes(createdAt, 90) });
  await createPayment(order, paymentStatus, addMinutes(createdAt, 4));

  if (!delivery) return order;

  const pickup = pharmacyAddress(pharmacy);
  const pickupLocation = pointFromAddress(pickup);
  const deliveryDoc = await Delivery.create({
    id_pedido: order._id,
    id_entregador: delivery.driverId || null,
    id_farmacia: pharmacy._id,
    id_cliente: cliente._id,
    status: delivery.status,
    endereco_coleta: pickup,
    endereco_entrega: destination,
    distancia_km: delivery.distancia_km,
    tempo_estimado_min: delivery.tempo_estimado_min,
    valor_entrega: deliveryFee,
    codigo_confirmacao: delivery.codigo_confirmacao,
    aceita_em: delivery.driverId ? addMinutes(createdAt, 18) : undefined,
    coletada_em: ["coletada", "em_transito", "entregue"].includes(delivery.status)
      ? addMinutes(createdAt, 42)
      : undefined,
    entregue_em: delivery.status === "entregue" ? addMinutes(createdAt, 78) : undefined,
    avaliacao_cliente: delivery.status === "entregue"
      ? {
          nota: 5,
          comentario: "Entrega rapida e cuidadosa.",
          avaliado_em: addMinutes(createdAt, 95),
        }
      : undefined,
    avaliacao_entregador: delivery.status === "entregue"
      ? {
          nota: 5,
          comentario: "Cliente encontrado sem atraso.",
          avaliado_em: addMinutes(createdAt, 98),
        }
      : undefined,
    historico_status: deliveryHistory(
      delivery.history,
      createdAt,
      pickupLocation,
      destination.location,
    ),
  });

  await setCreatedDates(deliveryDoc, createdAt, {
    updatedAt:
      delivery.status === "entregue"
        ? addMinutes(createdAt, 95)
        : addMinutes(createdAt, 55),
  });

  order.id_entrega = deliveryDoc._id;
  await order.save();
  await setCreatedDates(order, createdAt, { updatedAt: addMinutes(createdAt, 96) });

  return order;
}

async function createPrescriptions({ cliente, pharmacist, farmaceuticoUser, pharmacy, orders, products }) {
  const now = new Date();
  const prescriptionProduct = products.find((p) => p.receita_obrigatoria) || products[0];
  const rows = [
    {
      status: "Aprovada",
      tag: "receita-aprovada",
      order: orders.entregue,
      observacao: "Receita legivel e compativel com o medicamento solicitado.",
      chat: [
        ["usuario", cliente, "Enviei a receita do antibiotico. Esta legivel?"],
        ["farmaceutico", farmaceuticoUser, "Sim, a receita esta legivel e dentro da validade."],
      ],
    },
    {
      status: "Rejeitada",
      tag: "receita-rejeitada",
      order: orders.rejeitado,
      observacao: "Receita ilegivel; necessario novo envio antes da dispensacao.",
      chat: [
        ["usuario", cliente, "Posso usar essa foto da receita?"],
        ["farmaceutico", farmaceuticoUser, "Nao foi possivel ler CRM e data. Envie uma nova imagem."],
      ],
    },
    {
      status: "Em Análise",
      tag: "receita-em-analise",
      order: orders.processando,
      observacao: "Aguardando conferencia manual do farmaceutico.",
      chat: [
        ["usuario", cliente, "Pedido para medicamento de uso continuo."],
        ["farmaceutico", farmaceuticoUser, "Recebido. Estou conferindo validade e dados do medico."],
      ],
    },
  ];

  const created = {};
  for (const [index, row] of rows.entries()) {
    const date = addMinutes(now, -720 + index * 60);
    const tipoReceita =
      prescriptionProduct.classificacao_receita === "antimicrobiano"
        ? "antimicrobiano"
        : "simples";
    const validadeDias = tipoReceita === "antimicrobiano" ? 9 : 27;
    const prescription = await Prescription.create({
      id_usuario: cliente._id,
      id_farmacia: pharmacy._id,
      id_farmaceutico_responsavel: pharmacist._id,
      tipo_receita: tipoReceita,
      consumida: row.status === "Aprovada",
      pedidos_vinculados: row.order
        ? [{ id_pedido: row.order._id, utilizada_em: date, status_pedido_no_uso: row.order.status }]
        : [],
      disponivel_para_novo_pedido: row.status !== "Aprovada",
      id_produto: prescriptionProduct._id,
      id_pedido_vinculado: row.order?._id || null,
      id_pedido_utilizado: row.status === "Aprovada" ? row.order?._id : null,
      farmaceutico_dispensador: farmaceuticoUser._id,
      url_arquivo: `/uploads/receitas/demo-${row.tag}.pdf`,
      nome_arquivo: `demo-${row.tag}.pdf`,
      hash_arquivo: `demo-${row.tag}-${String(row.order?._id || index)}`,
      tipo_arquivo: "application/pdf",
      tamanho_arquivo: 245760 + index * 2048,
      status: row.status,
      dados_ocr: {
        nome_medico: "Dra. Helena Martins",
        crm: "GO-18452",
        uf_crm: "GO",
        data_emissao: addMinutes(date, -1440),
        principio_ativo: prescriptionProduct.principio_ativo,
        raw_text: "Documento de demonstracao para validacao academica.",
      },
      validacao_crm: {
        crm_valido: row.status !== "Rejeitada",
        medico_encontrado: "Helena Martins",
        especialidade: "Clinica medica",
        verificado_em: date,
      },
      validade: addMinutes(date, validadeDias * 1440),
      observacoes: `${MARKER}${row.tag} - ${row.observacao}`,
      validado_por: row.status === "Em Análise" ? undefined : farmaceuticoUser._id,
      validado_em: row.status === "Em Análise" ? undefined : addMinutes(date, 8),
      historico_status: [
        {
          status: "Pendente",
          alterado_em: date,
          alterado_por: cliente._id,
          observacao: "Receita enviada pelo cliente.",
        },
        {
          status: row.status,
          alterado_em: addMinutes(date, 8),
          alterado_por: farmaceuticoUser._id,
          observacao: row.observacao,
        },
      ],
      modo_validacao: "chat_ao_vivo",
      chat_sessao_id: `demo-${row.tag}`,
      chat_encerrado: row.status !== "Em Análise",
      chat_encerrado_por: row.status !== "Em Análise" ? farmaceuticoUser._id : null,
      chat_encerrado_em: row.status !== "Em Análise" ? addMinutes(date, 12) : null,
      chat_mensagens: row.chat.map(([tipo, sender, texto], idx) => ({
        remetenteId: sender._id,
        nomeRemetente: sender.nome,
        tipoRemetente: tipo,
        texto,
        enviado_em: addMinutes(date, idx * 4),
      })),
    });

    await setCreatedDates(prescription, date, { updatedAt: addMinutes(date, 12) });
    created[row.tag] = prescription;
  }

  return created;
}

async function createSupportTickets({ cliente, admin, farmaceuticoUser, pharmacy }) {
  const now = new Date();
  const tickets = [
    {
      assunto: "DEMO: duvida sobre medicamento antes da compra",
      categoria: "duvida_medicamento",
      origem: "pagina_produto",
      status: "respondida",
      prioridade: "normal",
      id_atendente: farmaceuticoUser._id,
      id_farmacia: pharmacy._id,
      aberta_em: addMinutes(now, -540),
      primeira_resposta_em: addMinutes(now, -532),
      mensagens: [
        [cliente, "usuario", "Esse medicamento pode ser tomado apos alimentacao?"],
        [farmaceuticoUser, "farmaceutico", "Sim. Pela seguranca, siga a receita e confirme com seu medico em caso de duvida."],
        [cliente, "usuario", "Obrigado, vou anexar a receita no pedido."],
      ],
    },
    {
      assunto: "DEMO: atraso de entrega resolvido",
      categoria: "entrega",
      origem: "pedido",
      status: "encerrada",
      prioridade: "alta",
      id_atendente: admin._id,
      id_farmacia: null,
      aberta_em: addMinutes(now, -360),
      primeira_resposta_em: addMinutes(now, -354),
      encerrada_em: addMinutes(now, -320),
      avaliacao_atendimento: 5,
      comentario_avaliacao: "Atendimento claro.",
      mensagens: [
        [cliente, "usuario", "Minha entrega esta alguns minutos atrasada."],
        [admin, "admin", "Verifiquei a rota. O entregador esta a caminho e chega em poucos minutos."],
        [cliente, "usuario", "Recebido, obrigado."],
      ],
    },
    {
      assunto: "DEMO: orientacao sobre receita enviada",
      categoria: "receita",
      origem: "receita",
      status: "em_atendimento",
      prioridade: "alta",
      id_atendente: farmaceuticoUser._id,
      id_farmacia: pharmacy._id,
      aberta_em: addMinutes(now, -90),
      primeira_resposta_em: addMinutes(now, -82),
      mensagens: [
        [cliente, "usuario", "Enviei a receita, mas fiquei em duvida sobre a dosagem."],
        [farmaceuticoUser, "farmaceutico", "Recebi. Vou conferir os dados da receita e te respondo por aqui."],
      ],
    },
    {
      assunto: "DEMO: produto indisponivel substituido",
      categoria: "pedido",
      origem: "pedido",
      status: "encerrada",
      prioridade: "normal",
      id_atendente: farmaceuticoUser._id,
      id_farmacia: pharmacy._id,
      aberta_em: addMinutes(now, -720),
      primeira_resposta_em: addMinutes(now, -710),
      encerrada_em: addMinutes(now, -690),
      avaliacao_atendimento: 5,
      comentario_avaliacao: "Farmaceutico resolveu rapido.",
      mensagens: [
        [cliente, "usuario", "O produto do pedido aparece indisponivel. Tem alternativa?"],
        [farmaceuticoUser, "farmaceutico", "Temos uma opcao equivalente de venda livre. Atualizei a sugestao no pedido."],
        [cliente, "usuario", "Perfeito, pode seguir."],
      ],
    },
  ];

  for (const ticketData of tickets) {
    const ticket = await SupportMessage.create({
      id_usuario: cliente._id,
      id_atendente: ticketData.id_atendente,
      id_farmacia: ticketData.id_farmacia,
      origem: ticketData.origem,
      assunto: ticketData.assunto,
      categoria: ticketData.categoria,
      status: ticketData.status,
      prioridade: ticketData.prioridade,
      aberta_em: ticketData.aberta_em,
      primeira_resposta_em: ticketData.primeira_resposta_em,
      encerrada_em: ticketData.encerrada_em,
      avaliacao_atendimento: ticketData.avaliacao_atendimento,
      comentario_avaliacao: ticketData.comentario_avaliacao,
      mensagens: ticketData.mensagens.map(([sender, tipo, texto], index) => ({
        id_remetente: sender._id,
        tipo_remetente: tipo,
        texto,
        lida: true,
        enviado_em: addMinutes(ticketData.aberta_em, index * 5),
      })),
    });
    await setCreatedDates(ticket, ticketData.aberta_em, {
      updatedAt: ticketData.encerrada_em || addMinutes(ticketData.aberta_em, 20),
    });
  }
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("MongoDB conectado\n=== Seed fluxos demo ===\n");

  await cleanupDemoData();
  const docs = await findRequiredDocs();
  const { cliente, entregador, admin, farmaceuticoUser, pharmacist, pharmacies, products } = docs;

  cliente.role = roleFromTipo(cliente.tipo_usuario);
  entregador.role = roleFromTipo(entregador.tipo_usuario);
  admin.role = roleFromTipo(admin.tipo_usuario);
  farmaceuticoUser.role = roleFromTipo(farmaceuticoUser.tipo_usuario);
  await Promise.all([cliente.save(), entregador.save(), admin.save(), farmaceuticoUser.save()]);

  const rosario =
    pharmacies.find((p) => p.nome.includes("Rosario") || p.nome.includes("Rosário")) ||
    pharmacies[0];
  const pacheco = pharmacies.find((p) => p.nome.includes("Pacheco")) || pharmacies[1];
  const raia = pharmacies.find((p) => p.nome.includes("Raia")) || pharmacies[2];
  const oeste = pharmacies.find((p) => p.nome.includes("Oeste")) || pharmacies[3] || pharmacies[0];

  const otcRosario = productBy(rosario, products, (p) => !p.receita_obrigatoria) || products[0];
  const rxRosario = productBy(rosario, products, (p) => p.receita_obrigatoria) || otcRosario;
  const otcPacheco = productBy(pacheco, products, (p) => !p.receita_obrigatoria) || otcRosario;
  const otcRaia = productBy(raia, products, (p) => !p.receita_obrigatoria) || otcRosario;
  const rxRaia = productBy(raia, products, (p) => p.receita_obrigatoria) || rxRosario;
  const otcOeste = productBy(oeste, products, (p) => !p.receita_obrigatoria) || otcRosario;

  const now = new Date();
  const driverInfo = {
    driverId: entregador._id,
    driverName: entregador.nome,
    driverPhone: entregador.telefone || "62999990001",
    vehicle: "Moto Honda CG 160",
  };

  const orders = {};
  orders.entregue = await createOrder({
    tag: "pedido-entregue",
    cliente,
    pharmacy: rosario,
    products: [
      { product: otcRosario, quantidade: 2 },
      { product: rxRosario, quantidade: 1 },
    ],
    deliveryFee: 6.9,
    destination: DESTINATIONS.jardimGoias,
    status: "entregue",
    paymentStatus: "aprovado",
    createdAt: addMinutes(now, -900),
    history: ["aguardando_pagamento", "em_processamento", "confirmado", "a_caminho", "entregue"],
    delivery: {
      ...driverInfo,
      status: "entregue",
      distancia_km: 2.3,
      tempo_estimado_min: 18,
      codigo_confirmacao: "128934",
      history: ["disponivel", "aceita", "coletando", "coletada", "em_transito", "entregue"],
    },
    pharmacistUser: farmaceuticoUser,
  });

  orders.aCaminho = await createOrder({
    tag: "pedido-a-caminho",
    cliente,
    pharmacy: pacheco,
    products: [{ product: otcPacheco, quantidade: 1 }],
    deliveryFee: 7.5,
    destination: DESTINATIONS.bueno,
    status: "a_caminho",
    paymentStatus: "aprovado",
    createdAt: addMinutes(now, -140),
    history: ["aguardando_pagamento", "em_processamento", "confirmado", "a_caminho"],
    delivery: {
      ...driverInfo,
      status: "em_transito",
      distancia_km: 3.4,
      tempo_estimado_min: 24,
      codigo_confirmacao: "739412",
      history: ["disponivel", "aceita", "coletando", "coletada", "em_transito"],
    },
    pharmacistUser: farmaceuticoUser,
  });

  orders.entregueLonga = await createOrder({
    tag: "pedido-entregue-distante",
    cliente,
    pharmacy: raia,
    products: [{ product: otcRaia, quantidade: 2 }],
    deliveryFee: 8.2,
    destination: DESTINATIONS.oeste,
    status: "entregue",
    paymentStatus: "aprovado",
    createdAt: addMinutes(now, -700),
    history: ["aguardando_pagamento", "em_processamento", "confirmado", "a_caminho", "entregue"],
    delivery: {
      ...driverInfo,
      status: "entregue",
      distancia_km: 4.8,
      tempo_estimado_min: 34,
      codigo_confirmacao: "552908",
      history: ["disponivel", "aceita", "coletando", "coletada", "em_transito", "entregue"],
    },
    pharmacistUser: farmaceuticoUser,
  });

  orders.processando = await createOrder({
    tag: "pedido-em-processamento",
    cliente,
    pharmacy: raia,
    products: [{ product: rxRaia, quantidade: 1 }],
    deliveryFee: 8.2,
    destination: DESTINATIONS.marista,
    status: "em_processamento",
    paymentStatus: "aprovado",
    createdAt: addMinutes(now, -80),
    history: ["aguardando_pagamento", "em_processamento"],
    pharmacistUser: farmaceuticoUser,
  });

  orders.aguardandoPagamento = await createOrder({
    tag: "pedido-aguardando-pagamento",
    cliente,
    pharmacy: oeste,
    products: [{ product: otcOeste, quantidade: 3 }],
    deliveryFee: 6.5,
    destination: DESTINATIONS.oeste,
    status: "aguardando_pagamento",
    paymentStatus: "pendente",
    createdAt: addMinutes(now, -45),
    history: ["aguardando_pagamento"],
    pharmacistUser: farmaceuticoUser,
  });

  orders.rejeitado = await createOrder({
    tag: "pedido-rejeitado",
    cliente,
    pharmacy: rosario,
    products: [{ product: rxRosario, quantidade: 1 }],
    deliveryFee: 0,
    destination: DESTINATIONS.jardimGoias,
    status: "rejeitado",
    paymentStatus: "estornado",
    createdAt: addMinutes(now, -300),
    history: ["aguardando_pagamento", "em_processamento", "rejeitado"],
    pharmacistUser: farmaceuticoUser,
    motivo: "Receita ilegivel ou incompativel com o medicamento solicitado.",
  });

  orders.disponivel = await createOrder({
    tag: "pedido-disponivel-entregador",
    cliente,
    pharmacy: oeste,
    products: [{ product: otcOeste, quantidade: 1 }],
    deliveryFee: 8.0,
    destination: DESTINATIONS.marista,
    status: "confirmado",
    paymentStatus: "aprovado",
    createdAt: addMinutes(now, -28),
    history: ["aguardando_pagamento", "em_processamento", "confirmado"],
    delivery: {
      status: "disponivel",
      distancia_km: 4.7,
      tempo_estimado_min: 34,
      codigo_confirmacao: "845220",
      history: ["disponivel"],
    },
    pharmacistUser: farmaceuticoUser,
  });

  const prescriptions = await createPrescriptions({
    cliente,
    pharmacist,
    farmaceuticoUser,
    pharmacy: rosario,
    orders,
    products: [rxRosario, rxRaia, otcRosario],
  });

  if (prescriptions["receita-aprovada"]) {
    await Order.updateOne(
      { _id: orders.entregue._id, "itens.receita_obrigatoria": true },
      { $set: { "itens.$.id_receita": prescriptions["receita-aprovada"]._id } },
    );
  }
  if (prescriptions["receita-rejeitada"]) {
    await Order.updateOne(
      { _id: orders.rejeitado._id, "itens.receita_obrigatoria": true },
      { $set: { "itens.$.id_receita": prescriptions["receita-rejeitada"]._id } },
    );
  }
  if (prescriptions["receita-em-analise"]) {
    await Order.updateOne(
      { _id: orders.processando._id, "itens.receita_obrigatoria": true },
      { $set: { "itens.$.id_receita": prescriptions["receita-em-analise"]._id } },
    );
  }

  await createSupportTickets({ cliente, admin, farmaceuticoUser, pharmacy: rosario });

  const deliveredCount = await Delivery.countDocuments({
    id_entregador: entregador._id,
    status: "entregue",
  });
  await User.updateOne(
    { _id: entregador._id },
    {
      $set: {
        telefone: entregador.telefone || "62999990001",
        "dados_entregador.tipo_veiculo": "moto",
        "dados_entregador.placa": "QTN2A45",
        "dados_entregador.cnh": "12345678901",
        "dados_entregador.disponivel": true,
        "dados_entregador.localizacao_atual": {
          type: "Point",
          coordinates: DESTINATIONS.bueno.location.coordinates,
        },
        "dados_entregador.entregas_realizadas": deliveredCount,
        "dados_entregador.avaliacao": 4.9,
        "dados_entregador.total_avaliacoes": Math.max(deliveredCount, 1),
      },
    },
  );

  console.log("Criado:");
  console.log(`- ${Object.keys(orders).length} pedidos demo`);
  console.log("- entregas com rota, historico e valores entre R$ 6,50 e R$ 8,20");
  console.log("- 3 receitas: aprovada, rejeitada e em analise");
  console.log("- 4 chats de suporte visiveis no cliente/farmaceutico");

  await mongoose.disconnect();
  console.log("\nConcluido.");
}

module.exports = { run };

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error(err);
      try {
        await mongoose.disconnect();
      } catch (_) {}
      process.exit(1);
    });
}
