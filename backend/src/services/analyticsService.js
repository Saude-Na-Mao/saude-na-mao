const Order = require("../models/Order");
const Pharmacist = require("../models/Pharmacist");
const drugInteractionService = require("./drugInteractionService");
const Logger = require("../utils/logger");

const logger = new Logger("AnalyticsService");

async function getAnalyticsByPeriod(pharmacyId, period = "mes") {
  try {
    const { startDate, endDate } = getPeriodDates(period);

    const [
      vendas,
      topMedicamentos,
      distribuicaoCategoria,
      performanceHorario,
      padraoFraude,
      insights,
      recomendacoes,
    ] = await Promise.all([
      getVendasPorPeriodo(pharmacyId, startDate, endDate),
      getTopMedicamentos(pharmacyId, startDate, endDate),
      getDistribuicaoCategoria(pharmacyId, startDate, endDate),
      getPerformanceHorario(pharmacyId, startDate, endDate),
      getPadraoFraude(pharmacyId, startDate, endDate),
      generateInsights(pharmacyId, startDate, endDate),
      generateRecomendacoes(pharmacyId),
    ]);

    return {
      vendaFormatted: vendas,
      topMedicamentos,
      distribuicaoCategoria,
      performanceHorario,
      padraoFraude,
      insights,
      recomendacoes,
    };
  } catch (error) {
    logger.error("Erro ao gerar analytics:", error);
    throw error;
  }
}

function getPeriodDates(period) {
  const endDate = new Date();
  const startDate = new Date();

  switch (period) {
    case "dia":
      startDate.setDate(endDate.getDate() - 1);
      break;
    case "semana":
      startDate.setDate(endDate.getDate() - 7);
      break;
    case "mes":
      startDate.setMonth(endDate.getMonth() - 1);
      break;
    case "ano":
      startDate.setFullYear(endDate.getFullYear() - 1);
      break;
    default:
      startDate.setMonth(endDate.getMonth() - 1);
  }

  return { startDate, endDate };
}

async function getVendasPorPeriodo(pharmacyId, startDate, endDate) {
  const orders = await Order.find({
    farmacia_id: pharmacyId,
    createdAt: { $gte: startDate, $lte: endDate },
    status_pagamento: "pago",
  });

  const grouped = {};

  orders.forEach((order) => {
    const date = new Date(order.createdAt).toLocaleDateString("pt-BR");
    if (!grouped[date]) {
      grouped[date] = { data: date, vendas: 0, receita: 0 };
    }
    grouped[date].vendas += 1;
    grouped[date].receita += order.total || 0;
  });

  return Object.values(grouped).sort((a, b) =>
    new Date(a.data) - new Date(b.data),
  );
}

async function getTopMedicamentos(pharmacyId, startDate, endDate) {
  const orders = await Order.find({
    farmacia_id: pharmacyId,
    createdAt: { $gte: startDate, $lte: endDate },
  }).populate("medicamentos");

  const medicamentos = {};

  orders.forEach((order) => {
    if (order.medicamentos) {
      order.medicamentos.forEach((med) => {
        const nome = med.nome || "Desconhecido";
        if (!medicamentos[nome]) {
          medicamentos[nome] = {
            nome,
            vendas: 0,
            receita: 0,
            risco_interacao: 0,
          };
        }
        medicamentos[nome].vendas += 1;
        medicamentos[nome].receita += med.preco || 0;
      });
    }
  });

  return Object.values(medicamentos)
    .sort((a, b) => b.vendas - a.vendas)
    .slice(0, 10);
}

async function getDistribuicaoCategoria(pharmacyId, startDate, endDate) {
  const orders = await Order.find({
    farmacia_id: pharmacyId,
    createdAt: { $gte: startDate, $lte: endDate },
  }).populate("medicamentos");

  const categorias = {};

  orders.forEach((order) => {
    if (order.medicamentos) {
      order.medicamentos.forEach((med) => {
        const categoria = med.categoria || "Geral";
        if (!categorias[categoria]) {
          categorias[categoria] = { nome: categoria, vendas: 0 };
        }
        categorias[categoria].vendas += 1;
      });
    }
  });

  return Object.values(categorias);
}

async function getPerformanceHorario(pharmacyId, startDate, endDate) {
  const orders = await Order.find({
    farmacia_id: pharmacyId,
    createdAt: { $gte: startDate, $lte: endDate },
  });

  const horas = {};

  for (let i = 0; i < 24; i++) {
    horas[i] = { hora: `${i}:00`, vendas: 0 };
  }

  orders.forEach((order) => {
    const hora = new Date(order.createdAt).getHours();
    horas[hora].vendas += 1;
  });

  return Object.values(horas);
}

async function getPadraoFraude(pharmacyId, startDate, endDate) {
  const orders = await Order.find({
    farmacia_id: pharmacyId,
    createdAt: { $gte: startDate, $lte: endDate },
  });

  const risco = {};

  orders.forEach((order) => {
    const date = new Date(order.createdAt).toLocaleDateString("pt-BR");
    if (!risco[date]) {
      risco[date] = { data: date, risco: 0, count: 0 };
    }
    risco[date].risco += order.risco_compra || 0;
    risco[date].count += 1;
  });

  return Object.values(risco)
    .map((r) => ({
      ...r,
      risco: Math.round(r.risco / r.count),
    }))
    .sort((a, b) => new Date(a.data) - new Date(b.data));
}

async function generateInsights(pharmacyId, startDate, endDate) {
  const insights = [];

  const orders = await Order.find({
    farmacia_id: pharmacyId,
    createdAt: { $gte: startDate, $lte: endDate },
  });

  const totalVendas = orders.length;
  const totalReceita = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const mediaVendas = totalVendas / ((endDate - startDate) / (1000 * 60 * 60 * 24));

  if (mediaVendas > 50) {
    insights.push({
      titulo: "📈 Alto volume de vendas",
      descricao: `Você está vendendo uma média de ${Math.round(mediaVendas)} medicamentos por dia`,
      tipo: "positivo",
      confianca: 95,
    });
  }

  const altosRiscos = orders.filter((o) => o.risco_compra > 70);
  if (altosRiscos.length > 0) {
    insights.push({
      titulo: "⚠️ Alto risco de fraude",
      descricao: `${altosRiscos.length} pedidos tiveram risco elevado (>70%)`,
      tipo: "negativo",
      confianca: 88,
    });
  }

  const taxaConversao = (totalVendas / (totalVendas * 1.5)) * 100;
  if (taxaConversao > 70) {
    insights.push({
      titulo: "✨ Taxa de conversão excelente",
      descricao: `Você tem uma taxa de conversão de ${taxaConversao.toFixed(1)}%`,
      tipo: "positivo",
      confianca: 92,
    });
  }

  return insights;
}

async function generateRecomendacoes(pharmacyId) {
  const recomendacoes = [
    "✅ Mantenha o estoque atualizado dos medicamentos mais vendidos",
    "📱 Implemente notificações de prescrições pendentes de validação",
    "🛡️ Reforce a validação de identidade para pedidos de alto risco",
    "📊 Analise semanalmente os padrões de fraude e ajuste thresholds",
    "🔐 Implemente autenticação em dois fatores para farmacêuticos",
    "📋 Gere relatórios de conformidade LGPD mensalmente",
    "🚀 Optimize o tempo de resposta de validação de prescrições",
    "💡 Considere parcerias com farmacêuticos para 24/7",
  ];

  return recomendacoes;
}

module.exports = {
  getAnalyticsByPeriod,
  getVendasPorPeriodo,
  getTopMedicamentos,
  getDistribuicaoCategoria,
  getPerformanceHorario,
  getPadraoFraude,
  generateInsights,
  generateRecomendacoes,
};
