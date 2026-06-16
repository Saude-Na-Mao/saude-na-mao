const mongoose = require("mongoose");
const Prescription = require("../models/Prescription");
const Order = require("../models/Order");
const Product = require("../models/Product");
const {
  hasAvailableBatchForQuantity,
  isControlledProduct,
  isSngpcProduct,
} = require("../utils/batchAvailability");
const User = require("../models/User");
const Pharmacist = require("../models/Pharmacist");
const ReceitaDigital = require("../models/ReceitaDigital");
const ocrService = require("./ocrService");
const notificationService = require("./notificationService");
const compliance = require("../config/compliance");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { isR2Enabled, uploadFileToR2 } = require("../config/r2");

let getIO = null;
try {
  ({ getIO } = require("../config/socket"));
} catch {
  getIO = null;
}

function safeEmit(room, event, payload) {
  try {
    if (typeof getIO !== "function") return;
    const io = getIO();
    if (io) io.to(room).emit(event, payload);
  } catch {
    // io ainda não inicializado
  }
}

// Em dev usamos URL relativa para passar pelo proxy do Vite (frontend → backend)
// e evitar bloqueio de cross-origin (helmet/CORP). Se PUBLIC_BASE_URL estiver
// definido, prefixa essa base (ex.: produção com CDN/nginx).
const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL ||
  process.env.BASE_URL ||
  ""
).replace(/\/$/, "");

function buildPublicImageUrl(urlArquivo) {
  if (!urlArquivo) return null;

  // 1) Normaliza barras (Windows usa '\') e remove barras iniciais duplicadas
  let pathPart = String(urlArquivo)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  // 2) Já é uma URL absoluta? Devolve como está
  if (
    pathPart.startsWith("http://") ||
    pathPart.startsWith("https://")
  ) {
    return pathPart;
  }

  // 3) Garante prefixo '/' e concatena com a base (vazia em dev → relativa)
  return `${PUBLIC_BASE_URL}/${pathPart}`;
}

function decoratePrescription(prescription) {
  if (!prescription) return prescription;
  const obj =
    typeof prescription.toObject === "function"
      ? prescription.toObject()
      : { ...prescription };
  obj.url_imagem_publica = buildPublicImageUrl(obj.url_arquivo);
  obj.disponivel_para_novo_pedido = prescriptionEffectiveDisponivel(obj);
  return obj;
}

const PRESCRIPTION_ORDER_POPULATE = [
  {
    path: "id_produto",
    select:
      "nome controlado receita_obrigatoria classificacao_receita registro_anvisa batches",
  },
  {
    path: "id_usuario",
    select: "nome email telefone cpf rg lgpd_consentimento",
  },
  {
    path: "id_farmacia",
    select: "nome cidade",
  },
  {
    path: "id_pedido_vinculado",
    select:
      "id_usuario id_farmacia itens status status_pagamento sngpcData total tipo_entrega historico_status createdAt",
    populate: [
      {
        path: "id_usuario",
        select: "nome email telefone cpf rg lgpd_consentimento",
      },
      {
        path: "itens.id_produto",
        select:
          "nome controlado receita_obrigatoria classificacao_receita registro_anvisa batches",
      },
    ],
  },
  {
    path: "id_pedido_utilizado",
    select:
      "id_usuario id_farmacia itens status status_pagamento sngpcData total tipo_entrega historico_status createdAt",
    populate: [
      {
        path: "id_usuario",
        select: "nome email telefone cpf rg lgpd_consentimento",
      },
      {
        path: "itens.id_produto",
        select:
          "nome controlado receita_obrigatoria classificacao_receita registro_anvisa batches",
      },
    ],
  },
];

/** Valor persistido no BD interpretado junto com legado `consumida`. */
function prescriptionEffectiveDisponivel(raw) {
  if (!raw) return false;
  if (raw.disponivel_para_novo_pedido === false) return false;
  if (raw.disponivel_para_novo_pedido === true) return true;
  if (raw.consumida === true) return false;
  const pedidoLink = raw.id_pedido_utilizado || raw.id_pedido_vinculado;
  if (pedidoLink) return false;
  return true;
}

/**
 * Avalia se a receita pode ser usada em novo carrinho/pedido (inclui vínculo com pedido).
 * Não lança erro — uso em API e validações.
 */
async function getPrescriptionAvailabilityPayload(userId, prescriptionId) {
  const emptyValidade = null;
  if (!mongoose.Types.ObjectId.isValid(String(prescriptionId))) {
    return {
      disponivel: false,
      motivo: "Receita não encontrada.",
      status: "",
      validade: emptyValidade,
      httpStatus: 404,
    };
  }

  let receita = await Prescription.findOne({
    _id: prescriptionId,
    id_usuario: userId,
  }).lean();

  if (!receita) {
    return {
      disponivel: false,
      motivo: "Receita não encontrada.",
      status: "",
      validade: emptyValidade,
      httpStatus: 404,
    };
  }

  const status = receita.status || "";
  const validade = receita.validade || emptyValidade;

  if (status !== "Aprovada") {
    const motivo =
      status === "Pendente" || status === "Em Análise"
        ? "A receita ainda não foi aprovada pelo farmacêutico."
        : `Receita com status "${status}".`;
    return {
      disponivel: false,
      motivo,
      status,
      validade,
      httpStatus: 400,
    };
  }

  if (receita.validade && new Date() > new Date(receita.validade)) {
    await Prescription.findByIdAndUpdate(prescriptionId, {
      status: "Expirada",
    });
    return {
      disponivel: false,
      motivo:
        "Esta receita está expirada. Solicite uma nova ao seu médico.",
      status: "Expirada",
      validade,
      httpStatus: 400,
    };
  }

  const pedidoLinkIds = [
    receita.id_pedido_utilizado,
    receita.id_pedido_vinculado,
    ...(Array.isArray(receita.pedidos_vinculados)
      ? receita.pedidos_vinculados.map((p) => p?.id_pedido).filter(Boolean)
      : []),
  ]
    .filter(Boolean)
    .map((id) => String(id));

  const pedidoLinkIdsUnicos = [...new Set(pedidoLinkIds)];

  // Compatibilidade com dados legados: se houver sinais de consumo sem vínculo explícito,
  // tratamos como indisponível para evitar reutilização indevida.
  if (pedidoLinkIdsUnicos.length === 0 && !prescriptionEffectiveDisponivel(receita)) {
    return {
      disponivel: false,
      motivo:
        "Esta receita já foi utilizada em um pedido anterior. Solicite uma nova receita ao seu médico para realizar uma nova compra deste medicamento.",
      status,
      validade,
      httpStatus: 400,
    };
  }

  if (pedidoLinkIdsUnicos.length > 0) {
    const pedidosVinculados = await Order.find({
      _id: { $in: pedidoLinkIdsUnicos },
    })
      .select("_id status")
      .lean();

    const possuiPedidoAtivo = pedidosVinculados.some(
      (pedido) => pedido && !["cancelado", "rejeitado"].includes(pedido.status),
    );

    if (possuiPedidoAtivo) {
      return {
        disponivel: false,
        motivo:
          "Esta receita já foi utilizada em um pedido anterior. Solicite uma nova receita ao seu médico para realizar uma nova compra deste medicamento.",
        status,
        validade,
        httpStatus: 400,
      };
    }

    await Prescription.findByIdAndUpdate(prescriptionId, {
      id_pedido_utilizado: null,
      id_pedido_vinculado: null,
      disponivel_para_novo_pedido: true,
      consumida: false,
    });

    receita = await Prescription.findOne({
      _id: prescriptionId,
      id_usuario: userId,
    }).lean();
  }

  return {
    disponivel: true,
    motivo: null,
    status: receita?.status || status,
    validade: receita?.validade || validade,
    httpStatus: 200,
  };
}

async function assertPrescriptionValidForOrderItem(
  userId,
  productId,
  receitaId,
  pharmacyId,
) {
  if (!mongoose.Types.ObjectId.isValid(receitaId)) {
    throw createError("Receita inválida", 400);
  }

  const avail = await getPrescriptionAvailabilityPayload(userId, receitaId);
  if (!avail.disponivel) {
    throw createError(
      avail.motivo || "Receita indisponível para novo pedido.",
      avail.httpStatus || 400,
    );
  }

  const receita = await Prescription.findOne({
    _id: receitaId,
    id_usuario: userId,
  });

  if (!receita) {
    throw createError(
      "Receita não encontrada ou não pertence a este usuário.",
      404,
    );
  }

  if (
    receita.id_farmacia &&
    pharmacyId &&
    String(receita.id_farmacia) !== String(pharmacyId)
  ) {
    throw createError(
      "Esta receita foi validada para outra farmácia.",
      400,
    );
  }

  if (
    receita.id_produto &&
    String(receita.id_produto) !== String(productId)
  ) {
    throw createError(
      "Esta receita foi emitida para outro medicamento.",
      400,
    );
  }

  return receita;
}

async function assertPrescriptionLinkableForOrderItem(
  userId,
  productId,
  receitaId,
  pharmacyId,
  { allowPending = false } = {},
) {
  if (!allowPending) {
    return assertPrescriptionValidForOrderItem(
      userId,
      productId,
      receitaId,
      pharmacyId,
    );
  }

  if (!mongoose.Types.ObjectId.isValid(receitaId)) {
    throw createError("Receita inválida", 400);
  }

  const receita = await Prescription.findOne({
    _id: receitaId,
    id_usuario: userId,
  });

  if (!receita) {
    throw createError(
      "Receita não encontrada ou não pertence a este usuário.",
      404,
    );
  }

  const statusAtual = receita.status || "Pendente";
  if (["Rejeitada", "Expirada", "Cancelada"].includes(statusAtual)) {
    throw createError(`Receita com status "${statusAtual}".`, 400);
  }

  const pedidoLink = receita.id_pedido_utilizado || receita.id_pedido_vinculado;
  if (pedidoLink) {
    const pedido = await Order.findById(pedidoLink).select("status").lean();
    if (pedido && !["cancelado", "rejeitado"].includes(pedido.status)) {
      throw createError(
        "Esta receita já está vinculada a outro pedido ativo.",
        400,
      );
    }
  }

  if (
    receita.id_farmacia &&
    pharmacyId &&
    String(receita.id_farmacia) !== String(pharmacyId)
  ) {
    throw createError("Esta receita foi enviada para outra farmácia.", 400);
  }

  if (
    receita.id_produto &&
    String(receita.id_produto) !== String(productId)
  ) {
    throw createError(
      "Esta receita foi enviada para outro medicamento.",
      400,
    );
  }

  return receita;
}

function assertPrescriptionClassCompatible(product, receita) {
  const classification = product.classificacao_receita || "sem_receita";
  const prescriptionType = receita.tipo_receita || "simples";

  if (classification === "antimicrobiano" && prescriptionType !== "antimicrobiano") {
    throw createError(
      `Medicamento "${product.nome}" exige receita de antimicrobiano.`,
      400,
    );
  }

}

async function validateOrderItemsPrescriptions(
  userId,
  idFarmacia,
  itens,
  { allowPending = false } = {},
) {
  const Product = require("../models/Product");
  const linkedPrescriptions = [];

  for (const item of itens) {
    const pid = item.id_produto;
    if (!pid) continue;

    const product = await Product.findById(pid).select(
      "controlado receita_obrigatoria classificacao_receita nome",
    );
    if (!product) {
      throw createError(`Produto não encontrado`, 404);
    }


    const precisaReceita = compliance.requiresPrescription(product);
    if (!precisaReceita) continue;

    const rid = item.id_receita;
    if (!rid) {
      throw createError(
        `Medicamento "${product.nome}" exige receita vinculada ao pedido.`,
        400,
      );
    }

    const receita = await assertPrescriptionLinkableForOrderItem(
      userId,
      pid,
      rid,
      idFarmacia,
      { allowPending },
    );
    assertPrescriptionClassCompatible(product, receita);
    linkedPrescriptions.push(receita);
  }

  return linkedPrescriptions;
}

async function consumePrescriptionsLinkedToOrder(order) {
  const ids = [
    ...new Set(
      (order.itens || [])
        .map((i) => i.id_receita)
        .filter(Boolean)
        .map((id) => String(id)),
    ),
  ];

  for (const sid of ids) {
    await Prescription.findByIdAndUpdate(sid, {
      $set: {
        consumida: true,
        disponivel_para_novo_pedido: false,
        id_pedido_vinculado: order._id,
        id_pedido_utilizado: order._id,
      },
      $push: {
        pedidos_vinculados: {
          id_pedido: order._id,
          utilizada_em: new Date(),
          status_pedido_no_uso: order.status || "desconhecido",
        },
      },
    });
  }
}

async function linkPrescriptionsToPendingOrder(order) {
  const ids = [
    ...new Set(
      (order.itens || [])
        .map((i) => i.id_receita)
        .filter(Boolean)
        .map((id) => String(id)),
    ),
  ];

  for (const sid of ids) {
    await Prescription.findByIdAndUpdate(sid, {
      $set: {
        consumida: false,
        disponivel_para_novo_pedido: false,
        id_pedido_vinculado: order._id,
        id_pedido_utilizado: null,
      },
      $push: {
        pedidos_vinculados: {
          id_pedido: order._id,
          utilizada_em: new Date(),
          status_pedido_no_uso: order.status || "desconhecido",
        },
      },
    });
  }
}

async function releasePrescriptionsLinkedToOrder(order) {
  const ids = [
    ...new Set(
      (order.itens || [])
        .map((i) => i.id_receita)
        .filter(Boolean)
        .map((id) => String(id)),
    ),
  ];

  for (const sid of ids) {
    const rx = await Prescription.findById(sid);
    if (!rx) continue;
    const match =
      String(rx.id_pedido_vinculado) === String(order._id) ||
      String(rx.id_pedido_utilizado) === String(order._id);
    if (!match) continue;

    rx.consumida = false;
    rx.disponivel_para_novo_pedido = true;
    rx.id_pedido_vinculado = null;
    rx.id_pedido_utilizado = null;
    await rx.save();
  }
}

async function syncLinkedOrderAfterPrescriptionValidation(orderId) {
  if (!orderId) return null;

  const order = await Order.findById(orderId);
  if (!order || ["entregue", "cancelado", "rejeitado"].includes(order.status)) {
    return order;
  }

  const prescriptionIds = [
    ...new Set(
      (order.itens || [])
        .filter((item) => item.id_receita)
        .map((item) => String(item.id_receita)),
    ),
  ];

  if (!prescriptionIds.length) return order;

  const receitas = await Prescription.find({
    _id: { $in: prescriptionIds },
  }).select("status observacoes nome_arquivo");

  const invalid = receitas.find((receita) => receita.status === "Rejeitada");
  if (invalid) {
    const motivo =
      invalid.observacoes ||
      `Receita ${invalid.nome_arquivo || ""} não foi validada pelo farmacêutico.`;

    order.motivo_cancelamento = motivo;
    order.adicionarHistoricoStatus(
      "cancelado",
      `Pedido cancelado automaticamente: ${motivo}`,
    );
    order.cancelado_em = new Date();

    if (order.estoque_baixado === true) {
      for (const item of order.itens || []) {
        if (!item.id_produto || !item.quantidade) continue;
        const quantity = Number(item.quantidade) || 0;
        const batchNumber = item.lote_consumido?.batchNumber;
        if (batchNumber) {
          await Product.updateOne(
            {
              _id: item.id_produto,
              "batches.batchNumber": batchNumber,
            },
            {
              $inc: {
                estoque: quantity,
                "batches.$.quantity": quantity,
              },
            },
          );
          item.lote_consumido = undefined;
        } else {
          await Product.findByIdAndUpdate(item.id_produto, {
            $inc: { estoque: quantity },
          });
        }
      }
      order.estoque_baixado = false;
      order.markModified("itens");
    }

    await releasePrescriptionsLinkedToOrder(order);
    await order.save();

    const usuario = await getUserForNotification(order.id_usuario);
    if (usuario) {
      await notificationService.sendOrderStatusNotification(
        usuario,
        order,
        "Cancelado",
      );
    }

    return order;
  }

  const allApproved =
    receitas.length === prescriptionIds.length &&
    receitas.every((receita) => receita.status === "Aprovada");

  if (
    allApproved &&
    order.status === "aguardando_confirmacao_receita_farmacia"
  ) {
    order.adicionarHistoricoStatus(
      "aguardando_pagamento",
      "Todas as receitas digitais foram validadas. Pagamento liberado para o cliente.",
    );
    await order.save();

    const usuario = await getUserForNotification(order.id_usuario);
    if (usuario) {
      await notificationService.sendOrderStatusNotification(
        usuario,
        order,
        "Receitas aprovadas",
      );
    }
  }

  return order;
}

async function controlledPrescriptionHasAvailableBatch(pedido, prescriptionId) {
  const controlledItems = (pedido?.itens || []).filter(
    (item) =>
      isSngpcProduct(item) &&
      String(item?.id_receita || "") === String(prescriptionId),
  );

  if (!controlledItems.length) return false;

  const products = await Product.find({
    _id: { $in: controlledItems.map((item) => item.id_produto).filter(Boolean) },
  }).select("batches controlado classificacao_receita");
  const productsById = new Map(
    products.map((product) => [String(product._id), product]),
  );

  return controlledItems.some((item) => {
    const product = productsById.get(String(item.id_produto || ""));
    return product && hasAvailableBatchForQuantity(product, item.quantidade || 1);
  });
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function calculateValidity(baseDate) {
  const validade = new Date(baseDate || new Date());
  validade.setMonth(validade.getMonth() + 6);
  return validade;
}

async function getUserForNotification(userId) {
  return User.findById(userId).select("+fcmToken nome email telefone");
}

function buildPagination(page, limit, total) {
  return {
    pagina: page,
    totalPaginas: total > 0 ? Math.ceil(total / limit) : 0,
  };
}

async function processPrescriptionOCR(prescriptionId, filePath, mimeType) {
  let prescription = null;

  try {
    prescription = await Prescription.findById(prescriptionId);
    if (!prescription) {
      return;
    }

    prescription.adicionarHistorico(
      "Em Análise",
      null,
      "Processamento OCR iniciado automaticamente",
    );
    await prescription.save();

    const rawText = await ocrService.extractText(filePath, mimeType);
    const dadosOcr = ocrService.parseReceiptData(rawText);
    const validacaoCrm = await ocrService.validateCRM(
      dadosOcr.crm,
      dadosOcr.uf_crm,
    );

    prescription.dados_ocr = dadosOcr;
    prescription.validacao_crm = validacaoCrm;
    prescription.validade = calculateValidity(
      dadosOcr.data_emissao || new Date(),
    );

    await prescription.save();

    const usuario = await getUserForNotification(prescription.id_usuario);
    if (usuario) {
      await notificationService.sendPrescriptionStatusNotification(
        usuario,
        prescription,
        "Em Análise",
      );
    }
  } catch (error) {
    console.error(
      `Erro ao processar OCR da receita ${prescriptionId}:`,
      error.message,
    );

    if (prescription) {
      try {
        prescription.adicionarHistorico(
          "Pendente",
          null,
          "Falha no processamento OCR. Aguardando revisão manual",
        );
        await prescription.save();
      } catch (saveError) {
        console.error(
          `Erro ao restaurar status da receita ${prescriptionId}:`,
          saveError.message,
        );
      }
    }
  }
}

async function uploadPrescription(
  userId,
  file,
  pharmacyId = null,
  modoValidacao = "assincrono",
  productId = null,
  { paraTerceiro = false, paciente = null } = {},
) {
  const filePath = path.normalize(file.path);
  const urlPath = filePath.split(path.sep).join("/");
  const fileHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");

  const receitaMesmoArquivo = await Prescription.findOne({
    id_usuario: userId,
    hash_arquivo: fileHash,
  })
    .sort({ createdAt: -1 })
    .select("id_pedido_utilizado id_pedido_vinculado");

  if (receitaMesmoArquivo) {
    const pedidoId =
      receitaMesmoArquivo.id_pedido_utilizado ||
      receitaMesmoArquivo.id_pedido_vinculado;
    if (pedidoId) {
      const pedido = await Order.findById(pedidoId).select("status").lean();
      const pedidoAtivo =
        pedido &&
        pedido.status !== "cancelado" &&
        pedido.status !== "rejeitado";
      if (pedidoAtivo) {
        throw createError(
          "Esta receita já foi utilizada em um pedido anterior. Solicite uma nova receita ao seu médico para realizar uma nova compra deste medicamento.",
          400,
        );
      }
    }
  }

  // Persiste o arquivo no R2 (disco do Render é efêmero). Em dev sem R2 cai no disco local.
  let urlArquivo = urlPath;
  if (isR2Enabled()) {
    try {
      const r2Key = `receitas/${path.basename(filePath)}`;
      urlArquivo = await uploadFileToR2(filePath, r2Key, file.mimetype);
    } catch (err) {
      console.error("Falha ao enviar receita ao R2; mantendo disco local:", err.message);
    }
  }

  const dadosCriacao = {
    id_usuario: userId,
    url_arquivo: urlArquivo,
    nome_arquivo: file.originalname,
    hash_arquivo: fileHash,
    tipo_arquivo: file.mimetype,
    tamanho_arquivo: file.size,
    modo_validacao:
      modoValidacao === "chat_ao_vivo" ? "chat_ao_vivo" : "assincrono",
    disponivel_para_novo_pedido: true,
    consumida: false,
    receita_de_terceiro: Boolean(paraTerceiro),
  };

  if (paraTerceiro && paciente) {
    dadosCriacao.paciente = {
      nome: String(paciente.nome || "").trim(),
      cpf: String(paciente.cpf || "").replace(/\D/g, ""),
      rg: String(paciente.rg || "").trim(),
    };
  }

  if (pharmacyId) {
    dadosCriacao.id_farmacia = pharmacyId;
  }

  if (productId && mongoose.Types.ObjectId.isValid(String(productId))) {
    dadosCriacao.id_produto = productId;
    // Deriva o tipo de receita da classificação do produto, para compatibilidade
    // SNGPC (antimicrobiano exige receita de antimicrobiano na validação do pedido).
    try {
      const Product = require("../models/Product");
      const prod = await Product.findById(productId).select(
        "classificacao_receita",
      );
      const tipoPorClasse = {
        antimicrobiano: "antimicrobiano",
        tarja_preta: "especial_b",
        controlado_a: "especial_c1",
      };
      const tipo = tipoPorClasse[prod?.classificacao_receita];
      if (tipo) dadosCriacao.tipo_receita = tipo;
    } catch {
      /* mantém o default do schema */
    }
  }

  // Modo chat_ao_vivo gera um identificador de sessão único
  if (dadosCriacao.modo_validacao === "chat_ao_vivo") {
    dadosCriacao.chat_sessao_id = crypto.randomUUID();
  }

  const prescription = await Prescription.create(dadosCriacao);

  // Roteamento: tenta encontrar farmacêutico disponível da farmácia
  let routedToPharmacy = false;
  let usuarioInfo = null;
  try {
    const u = await User.findById(userId).select("nome email");
    if (u) usuarioInfo = { nome: u.nome, email: u.email };
  } catch {
    /* ignore */
  }

  const urlImagemPublica = buildPublicImageUrl(urlPath);

  if (pharmacyId) {
    try {
      const farmaceutico = await Pharmacist.findOne({
        id_farmacia: pharmacyId,
        ativo: true,
        disponivel_chat: true,
        bloqueado: { $ne: true },
      }).select("_id id_usuario nome");

      if (farmaceutico) {
        prescription.id_farmaceutico_responsavel = farmaceutico._id;
        await prescription.save();

        safeEmit(`pharmacy:${pharmacyId}:prescriptions`, "prescription:new", {
          prescriptionId: prescription._id.toString(),
          assunto: file.originalname,
          id_farmacia: pharmacyId.toString(),
          id_usuario: String(userId),
          createdAt: prescription.createdAt,
          modo_validacao: prescription.modo_validacao,
        });

        // Se for chat ao vivo: notifica para abrir o chat imediatamente
        if (prescription.modo_validacao === "chat_ao_vivo") {
          safeEmit(
            `pharmacy:${pharmacyId}:prescriptions`,
            "prescription:chat_request",
            {
              prescriptionId: prescription._id.toString(),
              chat_sessao_id: prescription.chat_sessao_id,
              usuario: usuarioInfo,
              url_imagem_publica: urlImagemPublica,
              mensagem: "Usuário solicita validação por chat ao vivo",
              id_farmacia: pharmacyId.toString(),
              createdAt: prescription.createdAt,
            },
          );
        }
        routedToPharmacy = true;
      }
    } catch (err) {
      console.error("Falha ao rotear receita para farmacêutico:", err.message);
    }
  }

  if (!routedToPharmacy) {
    safeEmit("admin:prescriptions", "prescription:new", {
      prescriptionId: prescription._id.toString(),
      assunto: file.originalname,
      id_farmacia: pharmacyId ? pharmacyId.toString() : null,
      id_usuario: String(userId),
      createdAt: prescription.createdAt,
      modo_validacao: prescription.modo_validacao,
    });

    if (prescription.modo_validacao === "chat_ao_vivo") {
      safeEmit("admin:prescriptions", "prescription:chat_request", {
        prescriptionId: prescription._id.toString(),
        chat_sessao_id: prescription.chat_sessao_id,
        usuario: usuarioInfo,
        url_imagem_publica: urlImagemPublica,
        mensagem: "Usuário solicita validação por chat ao vivo",
        id_farmacia: pharmacyId ? pharmacyId.toString() : null,
        createdAt: prescription.createdAt,
      });
    }
  }

  processPrescriptionOCR(prescription._id, filePath, file.mimetype);

  const usuario = await getUserForNotification(userId);
  if (usuario) {
    await notificationService.sendPrescriptionStatusNotification(
      usuario,
      prescription,
      "Pendente",
    );
  }

  return prescription;
}

async function getUserPrescriptions(
  userId,
  {
    page = 1,
    limit = 10,
    status,
    productId,
    apenas_disponiveis,
  } = {},
) {
  const pagina = Number(page) || 1;
  const limite = Number(limit) || 10;
  const filtro = { id_usuario: userId };

  if (status) {
    filtro.status = status;
  }

  const andParts = [];

  if (productId && mongoose.Types.ObjectId.isValid(String(productId))) {
    andParts.push({
      $or: [
        { id_produto: productId },
        { id_produto: null },
        { id_produto: { $exists: false } },
      ],
    });
  }

  const disponivelOuLegado = {
    $or: [
      { disponivel_para_novo_pedido: true },
      {
        disponivel_para_novo_pedido: { $exists: false },
        consumida: { $ne: true },
      },
    ],
  };

  if (
    apenas_disponiveis === true ||
    apenas_disponiveis === "true" ||
    apenas_disponiveis === "1"
  ) {
    if (!filtro.status) {
      filtro.status = "Aprovada";
    }
    andParts.push(disponivelOuLegado);
  }

  if (andParts.length) {
    filtro.$and = andParts;
  }

  const [receitas, total] = await Promise.all([
    Prescription.find(filtro)
      .sort({ createdAt: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite),
    Prescription.countDocuments(filtro),
  ]);

  return {
    receitas: receitas.map(decoratePrescription),
    total,
    ...buildPagination(pagina, limite, total),
  };
}

async function getPrescriptionById(prescriptionId, userId) {
  const prescription = await Prescription.findById(prescriptionId);

  if (!prescription || String(prescription.id_usuario) !== String(userId)) {
    throw createError("Receita não encontrada", 404);
  }

  return decoratePrescription(prescription);
}

async function validatePrescription(
  prescriptionId,
  farmaceuticoId,
  { aprovado, observacoes, validade },
) {
  const prescription = await Prescription.findById(prescriptionId);

  if (!prescription) {
    throw createError("Receita não encontrada", 404);
  }

  // Permite alterar status mesmo se já validada, desde que o pedido vinculado
  // ainda não tenha terminado (entregue, cancelado ou rejeitado).
  const TERMINAL_ORDER_STATUSES = ["entregue", "cancelado", "rejeitado"];

  if (prescription.status === "Cancelada" || prescription.status === "Expirada") {
    throw createError(
      `Receita ${prescription.status.toLowerCase()} não pode ser alterada`,
      400,
    );
  }

  if (prescription.id_pedido_vinculado || prescription.id_pedido_utilizado) {
    try {
      const Order = require("../models/Order");
      const pedidoRef =
        prescription.id_pedido_utilizado || prescription.id_pedido_vinculado;
      const pedido = await Order.findById(pedidoRef).select(
        "status itens sngpcData",
      );
      if (pedido && TERMINAL_ORDER_STATUSES.includes(pedido.status)) {
        throw createError(
          `Não é possível alterar receita de pedido já ${pedido.status}`,
          400,
        );
      }
      const hasControlledItemForPrescription = (pedido?.itens || []).some(
        (item) =>
          isSngpcProduct(item) &&
          String(item?.id_receita || "") === String(prescription._id),
      );
      if (hasControlledItemForPrescription && !pedido?.sngpcData?.validatedAt) {
        const hasAvailableBatch = await controlledPrescriptionHasAvailableBatch(
          pedido,
          prescription._id,
        );
        if (aprovado || hasAvailableBatch) {
          throw createError(
            "Registre a dispensação ANVISA/SNGPC antes de aprovar ou rejeitar esta receita.",
            400,
          );
        }
      }
    } catch (err) {
      // Se for o erro que acabamos de criar, propaga; senão, segue
      if (err && err.statusCode) throw err;
    }
  }

  // Rejeição exige motivo (observações) para o usuário entender e poder corrigir
  if (!aprovado && (!observacoes || !String(observacoes).trim())) {
    throw createError(
      "Informe o motivo da rejeição para o usuário.",
      400,
    );
  }

  const novoStatus = aprovado ? "Aprovada" : "Rejeitada";
  prescription.adicionarHistorico(novoStatus, farmaceuticoId, observacoes);
  prescription.validado_por = farmaceuticoId;
  prescription.validado_em = new Date();
  prescription.observacoes = observacoes ? String(observacoes).trim() : null;

  if (aprovado) {
    prescription.disponivel_para_novo_pedido = true;
    prescription.consumida = false;
  }

  if (aprovado) {
    // Validade legal: máx. emissão + 10 dias (antimicrobiano) ou + 30 dias (demais).
    // RDC ANVISA — a contagem parte da data de emissão da receita (dados_ocr).
    const base = prescription.dados_ocr?.data_emissao
      ? new Date(prescription.dados_ocr.data_emissao)
      : new Date();
    const diasLegais = prescription.tipo_receita === "antimicrobiano" ? 10 : 30;
    const limiteLegal = new Date(base);
    limiteLegal.setDate(limiteLegal.getDate() + diasLegais);
    // Usa a validade informada, mas nunca além do limite legal.
    const informada = validade ? new Date(validade) : null;
    prescription.validade =
      informada && informada < limiteLegal ? informada : limiteLegal;
  }

  await prescription.save();

  const pedidoVinculado =
    prescription.id_pedido_utilizado || prescription.id_pedido_vinculado;
  if (pedidoVinculado) {
    await syncLinkedOrderAfterPrescriptionValidation(pedidoVinculado);
  }

  // Quando a receita for aprovada, o pedido vinculado sai de "em_processamento"
  // para "aguardando_pagamento" (exibido no frontend como "Aguardando").
  if (aprovado && (prescription.id_pedido_vinculado || prescription.id_pedido_utilizado)) {
    try {
      const pedidoRef =
        prescription.id_pedido_utilizado || prescription.id_pedido_vinculado;
      const pedido = await Order.findById(pedidoRef);
      if (
        pedido &&
        pedido.status === "em_processamento" &&
        pedido.status_pagamento !== "aprovado"
      ) {
        pedido.adicionarHistoricoStatus(
          "aguardando_pagamento",
          "Receita aprovada pelo farmacêutico",
        );
      }

      let shouldEnsureDispatch = false;
      if (pedido && pedido.aprovado_farmaceutico !== true) {
        pedido.aprovado_farmaceutico = true;
      }
      if (
        pedido &&
        pedido.status === "aguardando_pagamento" &&
        pedido.status_pagamento === "aprovado"
      ) {
        pedido.adicionarHistoricoStatus(
          "em_processamento",
          "Receita aprovada e pagamento confirmado — pedido liberado para despacho",
        );
        shouldEnsureDispatch = true;
      }
      if (
        pedido &&
        pedido.status === "em_processamento" &&
        pedido.status_pagamento === "aprovado"
      ) {
        pedido.adicionarHistoricoStatus(
          "em_processamento",
          "Receita aprovada e pagamento confirmado — pedido aguardando entregador",
        );
        shouldEnsureDispatch = true;
      }
      if (pedido) {
        await pedido.save();
      }
      if (shouldEnsureDispatch) {
        const { emitOrderStatus, notifyOrderStatus, notifyAvailableDriversIfEligible } = require("./orderService");
        const deliveryService = require("./deliveryService");
        await emitOrderStatus(String(pedido._id), "em_processamento", "Pedido pronto para despacho");
        await notifyOrderStatus(pedido, "em_processamento");
        await notifyAvailableDriversIfEligible(pedido, "prescription_and_payment_confirmed");
        await deliveryService.ensureDispatchDeliveryForOrder(pedido._id);
      }
    } catch (err) {
      console.error(
        "Falha ao atualizar status do pedido após aprovação de receita:",
        err.message,
      );
    }
  }

  const usuario = await getUserForNotification(prescription.id_usuario);
  if (usuario) {
    await notificationService.sendPrescriptionStatusNotification(
      usuario,
      prescription,
      novoStatus,
    );
  }

  // Emite evento ao usuário em tempo real
  safeEmit(`user:${prescription.id_usuario.toString()}`, "prescription:status", {
    prescriptionId: prescription._id.toString(),
    novoStatus,
    observacoes: prescription.observacoes || "",
    validade: prescription.validade || null,
    disponivel_para_novo_pedido: prescription.disponivel_para_novo_pedido !== false,
    produtoNome: prescription.nome_arquivo || "",
    id_produto: prescription.id_produto ? prescription.id_produto.toString() : null,
    id_farmacia: prescription.id_farmacia
      ? prescription.id_farmacia.toString()
      : null,
  });

  return prescription;
}

async function cancelPrescription(prescriptionId, userId) {
  const prescription = await Prescription.findOne({
    _id: prescriptionId,
    id_usuario: userId,
  });

  if (!prescription) {
    throw createError("Receita não encontrada", 404);
  }

  if (prescription.status === "Aprovada") {
    throw createError("Receita aprovada não pode ser cancelada", 400);
  }

  prescription.adicionarHistorico(
    "Cancelada",
    userId,
    "Cancelada pelo usuário",
  );
  await prescription.save();

  return prescription;
}

async function expirePrescriptions() {
  const now = new Date();
  const prescriptions = await Prescription.find({
    status: "Aprovada",
    validade: { $lt: now },
  });

  for (const prescription of prescriptions) {
    prescription.disponivel_para_novo_pedido = false;
    prescription.adicionarHistorico(
      "Expirada",
      null,
      "Expirada automaticamente",
    );
    await prescription.save();

    const usuario = await getUserForNotification(prescription.id_usuario);
    if (usuario) {
      await notificationService.sendPrescriptionStatusNotification(
        usuario,
        prescription,
        "Expirada",
      );
    }
  }

  console.log(`${prescriptions.length} receitas expiradas automaticamente`);
  return prescriptions.length;
}

async function getPendingPrescriptions({
  page = 1,
  limit = 20,
  pharmacyId,
} = {}) {
  const pagina = Number(page) || 1;
  const limite = Number(limit) || 20;
  const filtro = { status: { $in: ["Pendente", "Em Análise"] } };

  if (pharmacyId) {
    filtro.id_farmacia = pharmacyId;
  }

  const [receitas, total] = await Promise.all([
    Prescription.find(filtro)
      .populate(PRESCRIPTION_ORDER_POPULATE)
      .sort({ createdAt: 1 })
      .skip((pagina - 1) * limite)
      .limit(limite),
    Prescription.countDocuments(filtro),
  ]);

  // Anexa URL pública absoluta da imagem para o frontend
  const receitasDecoradas = receitas.map(decoratePrescription);

  return {
    receitas: receitasDecoradas,
    total,
    ...buildPagination(pagina, limite, total),
  };
}

async function getAllPrescriptionsForPharmacist({
  page = 1,
  limit = 20,
  status,
  pharmacyId,
} = {}) {
  const pagina = Number(page) || 1;
  const limite = Number(limit) || 20;
  const filtro = {};

  if (pharmacyId) {
    filtro.id_farmacia = pharmacyId;
  }

  // Suporta CSV (ex.: 'Pendente,Aprovada') e literal 'todos'
  if (status && status !== "todos") {
    const lista = String(status)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (lista.length === 1) filtro.status = lista[0];
    else if (lista.length > 1) filtro.status = { $in: lista };
  }

  const [receitas, total] = await Promise.all([
    Prescription.find(filtro)
      .populate(PRESCRIPTION_ORDER_POPULATE)
      .sort({ createdAt: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite),
    Prescription.countDocuments(filtro),
  ]);

  return {
    receitas: receitas.map(decoratePrescription),
    total,
    ...buildPagination(pagina, limite, total),
  };
}

async function getReceitaDigital(prescriptionId, userId) {
  const prescription = await Prescription.findById(prescriptionId)
    .populate("id_usuario", "nome email cpf")
    .populate("farmaceutico_dispensador", "nome crm");

  if (!prescription) {
    throw createError("Prescrição não encontrada", 404);
  }

  if (
    prescription.id_usuario._id.toString() !== userId &&
    prescription.farmaceutico_dispensador._id.toString() !== userId
  ) {
    throw createError("Acesso negado", 403);
  }

  let receita = await ReceitaDigital.findOne({ prescriptionId });

  if (!receita) {
    const farmacia = await User.findById(prescription.farmaceutico_dispensador).populate("farmacia_id", "nome");

    const signatureData = crypto
      .createHash("sha256")
      .update(
        prescription._id.toString() +
        prescription.id_usuario._id.toString() +
        new Date().toISOString(),
      )
      .digest("hex");

    receita = new ReceitaDigital({
      prescriptionId,
      paciente: {
        id: prescription.id_usuario._id,
        nome: prescription.id_usuario.nome,
        cpf: prescription.id_usuario.cpf,
        dataNascimento: prescription.id_usuario.dataNascimento,
      },
      farmaceutico: {
        id: prescription.farmaceutico_dispensador._id,
        nome: prescription.farmaceutico_dispensador.nome,
        crm: prescription.farmaceutico_dispensador.crm,
        farmacia: farmacia?.farmacia_id?.nome || "N/A",
      },
      medicamentos: [],
      assinatura: signatureData,
      assinaturaMd5: crypto
        .createHash("md5")
        .update(signatureData)
        .digest("hex"),
    });

    await receita.save();
  }

  return {
    id: receita._id,
    data: receita.createdAt,
    paciente: receita.paciente,
    farmaceutico: receita.farmaceutico,
    medicamentos: receita.medicamentos,
    observacoes: receita.observacoes,
    assinatura: receita.assinatura,
    hash: receita.hash,
  };
}

async function isPharmacistOfPharmacy(userId, pharmacyId) {
  if (!userId || !pharmacyId) return false;
  try {
    const reg = await Pharmacist.findOne({ id_usuario: userId }).select(
      "id_farmacia ativo bloqueado",
    );
    if (!reg) return false;
    if (reg.bloqueado === true) return false;
    return String(reg.id_farmacia) === String(pharmacyId);
  } catch {
    return false;
  }
}

async function authorizePrescriptionParticipant(prescription, user) {
  if (!prescription || !user) return false;

  const userId = String(user._id || user.id);
  const tipo = user.tipo_usuario || user.role;

  if (String(prescription.id_usuario) === userId) return true;
  if (tipo === "administrador" || tipo === "admin") return true;

  if (tipo === "farmaceutico" && prescription.id_farmacia) {
    const pharmacyId = prescription.id_farmacia?._id || prescription.id_farmacia;
    return isPharmacistOfPharmacy(userId, pharmacyId);
  }

  return false;
}

async function sendChatMessage(prescriptionId, user, texto) {
  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) {
    throw createError("Receita não encontrada", 404);
  }
  if (prescription.modo_validacao !== "chat_ao_vivo") {
    throw createError("Esta receita não está em modo de chat ao vivo", 400);
  }
  if (prescription.chat_encerrado) {
    throw createError("Este chat já foi encerrado", 400);
  }

  const autorizado = await authorizePrescriptionParticipant(prescription, user);
  if (!autorizado) {
    throw createError("Sem permissão para enviar mensagens neste chat", 403);
  }

  const conteudo = texto ? String(texto).trim() : "";
  if (!conteudo) {
    throw createError("A mensagem não pode estar vazia", 400);
  }

  const tipoRemetente = user.tipo_usuario || user.role || "usuario";
  const payload = {
    prescriptionId: prescription._id.toString(),
    chat_sessao_id: prescription.chat_sessao_id,
    remetenteId: String(user._id || user.id),
    nomeRemetente: user.nome || null,
    tipoRemetente,
    texto: conteudo,
    enviado_em: new Date(),
  };

  prescription.chat_mensagens = Array.isArray(prescription.chat_mensagens)
    ? prescription.chat_mensagens
    : [];
  prescription.chat_mensagens.push(payload);
  await prescription.save();

  if (prescription.chat_sessao_id) {
    safeEmit(
      `prescription-chat:${prescription.chat_sessao_id}`,
      "chat:message",
      payload,
    );
    if (tipoRemetente !== "usuario") {
      safeEmit(
        `user:${prescription.id_usuario.toString()}`,
        "prescription:chat_message",
        {
          prescriptionId: prescription._id.toString(),
          texto: conteudo,
          tipoRemetente,
        },
      );
    }
  }

  return payload;
}

async function reuploadChatImage(prescriptionId, user, file) {
  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) {
    throw createError("Receita não encontrada", 404);
  }
  if (prescription.modo_validacao !== "chat_ao_vivo") {
    throw createError("Esta receita não está em modo de chat ao vivo", 400);
  }
  if (prescription.chat_encerrado) {
    throw createError("Este chat já foi encerrado", 400);
  }

  const autorizado = await authorizePrescriptionParticipant(prescription, user);
  if (!autorizado) {
    throw createError("Sem permissão para atualizar a imagem deste chat", 403);
  }

  const filePath = path.normalize(file.path);
  const urlPath = filePath.split(path.sep).join("/");
  const fileHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");

  let urlArquivo = urlPath;
  if (isR2Enabled()) {
    try {
      const r2Key = `receitas/${path.basename(filePath)}`;
      urlArquivo = await uploadFileToR2(filePath, r2Key, file.mimetype);
    } catch (err) {
      console.error("Falha ao enviar receita ao R2; mantendo disco local:", err.message);
    }
  }

  prescription.url_arquivo = urlArquivo;
  prescription.nome_arquivo = file.originalname;
  prescription.hash_arquivo = fileHash;
  prescription.tipo_arquivo = file.mimetype;
  prescription.tamanho_arquivo = file.size;

  const tipo = user.tipo_usuario || user.role || "usuario";
  const textoSistema = `Receita atualizada por ${
    tipo === "farmaceutico" ? "farmacêutico" : "usuário"
  }.`;
  const mensagemSistema = {
    remetenteId: null,
    nomeRemetente: "Sistema",
    tipoRemetente: "sistema",
    texto: textoSistema,
    enviado_em: new Date(),
  };
  prescription.chat_mensagens = Array.isArray(prescription.chat_mensagens)
    ? prescription.chat_mensagens
    : [];
  prescription.chat_mensagens.push(mensagemSistema);

  await prescription.save();

  const urlImagemPublica = buildPublicImageUrl(urlArquivo);
  if (prescription.chat_sessao_id) {
    safeEmit(
      `prescription-chat:${prescription.chat_sessao_id}`,
      "chat:prescription_image_updated",
      {
        prescriptionId: prescription._id.toString(),
        chat_sessao_id: prescription.chat_sessao_id,
        url_imagem_publica: urlImagemPublica,
        nome_arquivo: prescription.nome_arquivo,
        tipo_arquivo: prescription.tipo_arquivo,
        tamanho_arquivo: prescription.tamanho_arquivo,
      },
    );
    safeEmit(
      `prescription-chat:${prescription.chat_sessao_id}`,
      "chat:message",
      mensagemSistema,
    );
  }

  return decoratePrescription(prescription);
}

async function closeChat(prescriptionId, user, opcoes = {}) {
  const {
    motivo_encerramento: motivo,
    aprovado,
    observacoes,
    validade,
  } = opcoes;

  const prescription = await Prescription.findById(prescriptionId);
  if (!prescription) {
    throw createError("Receita não encontrada", 404);
  }
  if (prescription.modo_validacao !== "chat_ao_vivo") {
    throw createError("Esta receita não está em modo de chat ao vivo", 400);
  }
  if (prescription.chat_encerrado) {
    throw createError("Este chat já foi encerrado", 400);
  }

  const autorizado = await authorizePrescriptionParticipant(prescription, user);
  if (!autorizado) {
    throw createError("Sem permissão para encerrar este chat", 403);
  }

  const userId = String(user._id || user.id);
  const tipo = user.tipo_usuario || user.role;

  // Se quem encerra é farmacêutico/admin e mandou aprovado: também valida
  let prescriptionAtualizada = prescription;
  let novoStatusReceita = null;
  if (
    typeof aprovado === "boolean" &&
    (tipo === "farmaceutico" || tipo === "administrador" || tipo === "admin")
  ) {
    prescriptionAtualizada = await validatePrescription(prescriptionId, userId, {
      aprovado,
      observacoes,
      validade,
    });
    novoStatusReceita = prescriptionAtualizada.status;
  }

  prescriptionAtualizada.chat_encerrado = true;
  prescriptionAtualizada.chat_encerrado_por = userId;
  prescriptionAtualizada.chat_encerrado_em = new Date();
  if (motivo) {
    const histObs = `Chat encerrado: ${String(motivo).slice(0, 200)}`;
    prescriptionAtualizada.historico_status.push({
      status: prescriptionAtualizada.status,
      alterado_por: userId,
      observacao: histObs,
    });
  }
  await prescriptionAtualizada.save();

  if (prescriptionAtualizada.chat_sessao_id) {
    safeEmit(
      `prescription-chat:${prescriptionAtualizada.chat_sessao_id}`,
      "chat:closed",
      {
        prescriptionId: prescriptionAtualizada._id.toString(),
        chat_sessao_id: prescriptionAtualizada.chat_sessao_id,
        encerradoPor: tipo,
        encerradoPorId: userId,
        motivo: motivo || null,
        novoStatusReceita,
        encerradoEm: prescriptionAtualizada.chat_encerrado_em,
      },
    );
  }

  return prescriptionAtualizada;
}

async function getPrescriptionForChat(prescriptionId, user) {
  const prescription = await Prescription.findById(prescriptionId)
    .populate("id_usuario", "nome email telefone")
    .populate("id_farmacia", "nome cidade");

  if (!prescription) {
    throw createError("Receita não encontrada", 404);
  }

  const autorizado = await authorizePrescriptionParticipant(prescription, user);
  if (!autorizado) {
    throw createError("Sem permissão para acessar este chat", 403);
  }

  return decoratePrescription(prescription);
}

module.exports = {
  uploadPrescription,
  getUserPrescriptions,
  getPrescriptionById,
  validatePrescription,
  cancelPrescription,
  expirePrescriptions,
  getPendingPrescriptions,
  getAllPrescriptionsForPharmacist,
  getReceitaDigital,
  sendChatMessage,
  reuploadChatImage,
  closeChat,
  getPrescriptionForChat,
  buildPublicImageUrl,
  decoratePrescription,
  prescriptionEffectiveDisponivel,
  getPrescriptionAvailabilityPayload,
  validateOrderItemsPrescriptions,
  consumePrescriptionsLinkedToOrder,
  linkPrescriptionsToPendingOrder,
  releasePrescriptionsLinkedToOrder,
};
