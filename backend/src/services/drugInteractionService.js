const DrugInteraction = require("../models/DrugInteraction");
const DrugContraindication = require("../models/DrugContraindication");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const logger = require("../utils/logger");

class DrugInteractionService {
  /**
   * Verifica interações entre medicamentos
   * @param {Array} medicamentos - Array de IDs ou objetos de medicamentos
   * @param {String} usuarioId - ID do usuário
   * @returns {Object} Resultado da verificação
   */
  async verificarInteracoes(medicamentos, usuarioId) {
    try {
      const usuario = await User.findById(usuarioId);
      if (!usuario) {
        throw new Error("Usuário não encontrado");
      }

      const alertas = [];
      let severidadeMaxima = "LEVE";

      // 1. Buscar medicamentos do banco
      const meds = await Promise.all(
        medicamentos.map(async (med) => {
          if (typeof med === "string") {
            return await Product.findById(med);
          }
          return med;
        })
      );

      // 2. Verificar interações entre pares de medicamentos
      for (let i = 0; i < meds.length; i++) {
        for (let j = i + 1; j < meds.length; j++) {
          const interacao = await this._buscarInteracao(
            meds[i],
            meds[j]
          );

          if (interacao) {
            alertas.push({
              tipo: "INTERACAO_MEDICAMENTOS",
              medicamento1: meds[i].nome,
              medicamento2: meds[j].nome,
              severidade: interacao.severidade,
              efeitos: interacao.efeitos,
              recomendacao: interacao.recomendacao,
              alternativas: interacao.alternativas,
              fonte: interacao.fonte,
            });

            // Atualizar severidade máxima
            severidadeMaxima = this._maiorSeveridade(
              severidadeMaxima,
              interacao.severidade
            );
          }
        }
      }

      // 3. Verificar contra histórico do usuário
      const medicamentosAtivos = await this._getMedicamentosAtivos(usuarioId);
      for (const med of meds) {
        for (const medAtivo of medicamentosAtivos) {
          const interacao = await this._buscarInteracao(med, medAtivo);
          if (interacao) {
            alertas.push({
              tipo: "INTERACAO_COM_MEDICAMENTO_ATIVO",
              medicamentoNovo: med.nome,
              medicamentoAtivo: medAtivo.nome,
              severidade: interacao.severidade,
              motivo: `Você está tomando ${medAtivo.nome} e quer comprar ${med.nome}`,
              recomendacao: interacao.recomendacao,
              alternativas: interacao.alternativas,
            });

            severidadeMaxima = this._maiorSeveridade(
              severidadeMaxima,
              interacao.severidade
            );
          }
        }
      }

      // 4. Verificar contraindicações
      const contraIndicacoes = await this._verificarContraIndicacoes(
        meds,
        usuario
      );
      alertas.push(...contraIndicacoes);

      if (contraIndicacoes.length > 0) {
        severidadeMaxima = "GRAVE";
      }

      // 5. Calcular score de segurança
      const scoreSeguranca = this._calcularScore(alertas);

      return {
        status: this._definirStatus(scoreSeguranca, severidadeMaxima),
        scoreSeguranca: scoreSeguranca,
        severidadeMaxima: severidadeMaxima,
        alertas: alertas,
        recomendacaoFinal: this._gerarRecomendacao(
          alertas,
          scoreSeguranca
        ),
        requerFarmaceutico: scoreSeguranca > 50 || severidadeMaxima === "GRAVE",
      };
    } catch (error) {
      logger.error("Erro ao verificar interações:", error);
      throw error;
    }
  }

  /**
   * Busca interação entre dois medicamentos
   */
  async _buscarInteracao(med1, med2) {
    if (!med1 || !med2) return null;

    const principioAtivo1 = med1.principio_ativo?.toLowerCase() || med1.nome?.toLowerCase();
    const principioAtivo2 = med2.principio_ativo?.toLowerCase() || med2.nome?.toLowerCase();

    return await DrugInteraction.findOne({
      $or: [
        {
          "medicamento1.principioAtivo": { $regex: principioAtivo1, $options: "i" },
          "medicamento2.principioAtivo": { $regex: principioAtivo2, $options: "i" },
        },
        {
          "medicamento1.principioAtivo": { $regex: principioAtivo2, $options: "i" },
          "medicamento2.principioAtivo": { $regex: principioAtivo1, $options: "i" },
        },
      ],
    });
  }

  /**
   * Verifica contraindicações para o usuário
   */
  async _verificarContraIndicacoes(medicamentos, usuario) {
    const alertas = [];

    for (const med of medicamentos) {
      const contraIndicacao = await DrugContraindication.findOne({
        "medicamento.principioAtivo": {
          $regex: med.principio_ativo || med.nome,
          $options: "i",
        },
      });

      if (!contraIndicacao) continue;

      // Verificar condições do usuário
      const condicoesUsuario = usuario.condicoes || [];
      for (const restricao of contraIndicacao.condicoes) {
        if (
          condicoesUsuario.some((c) =>
            c.toLowerCase().includes(restricao.nome.toLowerCase())
          )
        ) {
          alertas.push({
            tipo: "CONTRAINDICACAO_PESSOAL",
            medicamento: med.nome,
            condicao: restricao.nome,
            severidade: restricao.risco,
            motivo: restricao.motivo,
            recomendacao: "Consulte um farmacêutico",
          });
        }
      }

      // Verificar restrições populacionais
      if (usuario.gestante && contraIndicacao.restricoes_populacao) {
        const restricaoGestacao = contraIndicacao.restricoes_populacao.find(
          (r) => r.categoria === "GESTANTES"
        );
        if (restricaoGestacao) {
          alertas.push({
            tipo: "CONTRAINDICACAO_GRAVIDEZ",
            medicamento: med.nome,
            severidade: "GRAVE",
            motivo: restricaoGestacao.restricao,
            alternativa: restricaoGestacao.alternativa,
            recomendacao: "❌ BLOQUEADO - Medicamento contraindicado em gestação",
          });
        }
      }

      // Verificar alergias
      const alergias = usuario.alergias || [];
      for (const alergia of contraIndicacao.alergias_cruzadas) {
        if (alergias.some((a) => a.toLowerCase().includes(alergia.principioAtivo.toLowerCase()))) {
          alertas.push({
            tipo: "ALERGIA_CONHECIDA",
            medicamento: med.nome,
            severidade: "GRAVE",
            motivo: `Você é alérgico a ${alergia.principioAtivo}`,
            recomendacao: "❌ BLOQUEADO - Risco de reação alérgica grave",
          });
        }
      }

      // Verificar idade
      if (contraIndicacao.recomendacoes_dosagem?.maiorIdade) {
        if (!usuario.maiorIdade) {
          alertas.push({
            tipo: "RESTRICAO_IDADE",
            medicamento: med.nome,
            severidade: "MODERADA",
            motivo: `Medicamento restrito para maiores de ${contraIndicacao.recomendacoes_dosagem.idadeMinima} anos`,
            recomendacao:
              "Requer supervião de responsável e validação farmacêutico",
          });
        }
      }
    }

    return alertas;
  }

  /**
   * Calcula risco de compra (anti-fraude)
   */
  async calcularRiscoCompra(usuarioId, medicamentos, farmaciaId) {
    try {
      let risco = 0;
      const motivos = [];

      const usuario = await User.findById(usuarioId);
      const meds = await Promise.all(
        medicamentos.map(async (med) => {
          if (typeof med === "string") return await Product.findById(med);
          return med;
        })
      );

      // 1. Medicamento controlado sem receita
      const temMedicamentoControlado = meds.some(
        (m) => m.tarja && m.tarja !== "BRANCA"
      );
      if (temMedicamentoControlado) {
        risco += 100;
        motivos.push("Medicamento controlado (TARJA) detectado");
      }

      // 2. Múltiplas compras do mesmo antibiótico (semana)
      const antibioticosAntigos = await Order.countDocuments({
        usuario_id: usuarioId,
        produtos: {
          $elemMatch: {
            nome: { $in: meds.filter((m) => m.tipo === "antibiotico").map((m) => m.nome) },
          },
        },
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      });

      if (antibioticosAntigos > 2) {
        risco += 50;
        motivos.push(`${antibioticosAntigos} compras de antibióticos esta semana`);
      }

      // 3. Novo usuário
      const diasCadastro = (Date.now() - usuario.createdAt) / (1000 * 60 * 60 * 24);
      if (diasCadastro < 7) {
        risco += 20;
        motivos.push("Usuário novo (cadastro < 7 dias)");
      }

      // 4. Padrão de compra anormal
      const comprasMes = await Order.countDocuments({
        usuario_id: usuarioId,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      });

      if (comprasMes > 10) {
        risco += 30;
        motivos.push(`Padrão anormal: ${comprasMes} compras este mês`);
      }

      // 5. IP anormal (se integrar com geoIP)
      // Por agora, apenas estrutura
      // if (detectarVPN() || mudouPais()) { risco += 30 }

      return {
        risco: Math.min(risco, 100),
        motivos: motivos,
        bloqueado: risco >= 80,
        requerValidacao: risco > 50,
        acao: risco >= 80 ? "BLOQUEADO" : risco > 50 ? "VALIDACAO_FARMACEUTICO" : "PERMITIDO",
      };
    } catch (error) {
      logger.error("Erro ao calcular risco:", error);
      return {
        risco: 0,
        motivos: [],
        bloqueado: false,
        requerValidacao: false,
        acao: "PERMITIDO",
      };
    }
  }

  /**
   * Retorna medicamentos que o usuário está tomando
   */
  async _getMedicamentosAtivos(usuarioId) {
    // Buscar últimas prescrições validadas (últimos 30 dias)
    const pedidosAtivos = await Order.find({
      usuario_id: usuarioId,
      status: { $in: ["entregue", "ativo"] },
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    })
      .populate("produtos")
      .limit(20);

    const medicamentos = [];
    for (const pedido of pedidosAtivos) {
      if (pedido.produtos) {
        medicamentos.push(...pedido.produtos);
      }
    }

    return medicamentos.filter((m, i, arr) => arr.findIndex((x) => x._id === m._id) === i); // Remove duplicatas
  }

  /**
   * Define status baseado em score
   */
  _definirStatus(score, severidade) {
    if (severidade === "CONTRAINDICADA" || score >= 80) return "PERIGO";
    if (severidade === "GRAVE" || score >= 60) return "CUIDADO";
    if (score >= 40) return "AVISO";
    return "SEGURO";
  }

  /**
   * Calcula score (0-100)
   */
  _calcularScore(alertas) {
    let score = 0;

    for (const alerta of alertas) {
      switch (alerta.severidade) {
        case "CONTRAINDICADA":
          score += 100;
          break;
        case "GRAVE":
          score += 80;
          break;
        case "MODERADA":
          score += 50;
          break;
        case "LEVE":
          score += 20;
          break;
      }
    }

    return Math.min(score, 100);
  }

  /**
   * Compara severidades
   */
  _maiorSeveridade(sev1, sev2) {
    const ordem = ["LEVE", "MODERADA", "GRAVE", "CONTRAINDICADA"];
    return ordem.indexOf(sev1) > ordem.indexOf(sev2) ? sev1 : sev2;
  }

  /**
   * Gera recomendação final
   */
  _gerarRecomendacao(alertas, score) {
    if (score >= 80) {
      return "⛔ COMPRA BLOQUEADA - Risco muito alto. Consulte um farmacêutico.";
    }

    if (score >= 60) {
      return "⚠️ ALERTA IMPORTANTE - Risco moderado a alto. Um farmacêutico precisa validar antes da compra.";
    }

    if (score >= 40) {
      return "ℹ️ INFORMATIVO - Alguns alertas detectados. Recomendamos consultar com farmacêutico.";
    }

    if (alertas.length > 0) {
      return "✅ SEGURO, mas com algumas observações. Veja os alertas abaixo.";
    }

    return "✅ SEGURO - Nenhuma interação medicamentosa detectada.";
  }
}

module.exports = new DrugInteractionService();
