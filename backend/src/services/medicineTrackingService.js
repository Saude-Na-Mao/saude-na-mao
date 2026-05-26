const MedicineTracking = require("../models/MedicineTracking");
const Product = require("../models/Product");
const User = require("../models/User");
const blockchainAuditService = require("./blockchainAuditService");
const lgpdEncryptionService = require("./lgpdEncryptionService");
const QRCode = require("qrcode");
const crypto = require("crypto");
const Logger = require("../utils/logger");

const logger = new Logger("MedicineTrackingService");

class MedicineTrackingService {
  async criarRastreamento(medicamento_id, lote, farmacia_id, cliente_id) {
    try {
      const medicamento = await Product.findById(medicamento_id);
      if (!medicamento) {
        throw new Error("Medicamento não encontrado");
      }

      const rastreamento = new MedicineTracking({
        medicamento_id,
        lote,
        farmacia_origem: farmacia_id,
        cliente_destino: cliente_id,
        status: "pendente",
      });

      // Gerar hash único do blockchain
      const hashData = {
        medicamento_id,
        lote,
        farmacia_id,
        cliente_id,
        timestamp: Date.now(),
      };

      rastreamento.blockchain_hash = crypto
        .createHash("sha256")
        .update(JSON.stringify(hashData))
        .digest("hex");

      // Registrar no blockchain
      const blockchainRecord = blockchainAuditService.createTransaction({
        tipo: "CRIACAO_RASTREAMENTO",
        medicamento_id,
        lote,
        farmacia_id,
        cliente_id,
        blockchain_hash: rastreamento.blockchain_hash,
      });

      // Gerar QR code data
      const qrData = {
        tracking_id: rastreamento._id,
        blockchain_hash: rastreamento.blockchain_hash,
        lote,
        medicamento_id,
      };

      rastreamento.qr_code_data = JSON.stringify(qrData);

      await rastreamento.save();

      logger.info(
        `Rastreamento criado: ${rastreamento._id} para lote ${lote}`
      );

      return rastreamento;
    } catch (error) {
      logger.error("Erro ao criar rastreamento:", error);
      throw error;
    }
  }

  async adicionarEtapa(
    rastreamento_id,
    tipo,
    localizacao,
    foto,
    validador_id,
    observacoes
  ) {
    try {
      const rastreamento = await MedicineTracking.findById(rastreamento_id);
      if (!rastreamento) {
        throw new Error("Rastreamento não encontrado");
      }

      // Validar transição de etapas
      const etapasValidas = {
        pendente: ["SAIDA_FARMACIA"],
        SAIDA_FARMACIA: ["EM_TRANSITO"],
        EM_TRANSITO: ["ENTREGA"],
        ENTREGA: ["ENTREGUE"],
        ENTREGUE: [],
      };

      const etapaAtual = rastreamento.status;
      if (!etapasValidas[etapaAtual] || !etapasValidas[etapaAtual].includes(tipo)) {
        throw new Error(
          `Transição inválida: ${etapaAtual} -> ${tipo}`
        );
      }

      // Criar assinatura blockchain para esta etapa
      const etapaData = {
        tipo,
        timestamp: Date.now(),
        localizacao,
        validador_id,
        rastreamento_id,
      };

      const etapaAssinatura = crypto
        .createHash("sha256")
        .update(JSON.stringify(etapaData))
        .digest("hex");

      const etapa = {
        tipo,
        timestamp: new Date(),
        localizacao,
        assinatura_blockchain: etapaAssinatura,
        validado_por: validador_id,
        foto_prova: foto,
        observacoes,
      };

      rastreamento.etapas.push(etapa);

      // Atualizar status
      const statusMap = {
        SAIDA_FARMACIA: "em_transito",
        EM_TRANSITO: "em_transito",
        ENTREGA: "em_transito",
        ENTREGUE: "entregue",
      };

      rastreamento.status = statusMap[tipo];

      // Registrar no blockchain
      blockchainAuditService.createTransaction({
        tipo: "ETAPA_RASTREAMENTO",
        rastreamento_id,
        etapa: tipo,
        timestamp: Date.now(),
        assinatura: etapaAssinatura,
      });

      await rastreamento.save();

      logger.info(
        `Etapa ${tipo} adicionada ao rastreamento ${rastreamento_id}`
      );

      return rastreamento;
    } catch (error) {
      logger.error("Erro ao adicionar etapa:", error);
      throw error;
    }
  }

  async gerarQRCode(rastreamento_id) {
    try {
      const rastreamento = await MedicineTracking.findById(rastreamento_id);
      if (!rastreamento) {
        throw new Error("Rastreamento não encontrado");
      }

      const qrData = rastreamento.qr_code_data;
      if (!qrData) {
        throw new Error("Dados QR não disponíveis");
      }

      const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: "H",
        type: "image/png",
        width: 300,
      });

      logger.info(`QR Code gerado para rastreamento ${rastreamento_id}`);

      return {
        qrCode: qrCodeDataUrl,
        data: JSON.parse(qrData),
      };
    } catch (error) {
      logger.error("Erro ao gerar QR code:", error);
      throw error;
    }
  }

  async verificarAutenticidade(rastreamento_id, farmaceutico_id) {
    try {
      const rastreamento = await MedicineTracking.findById(rastreamento_id);
      if (!rastreamento) {
        throw new Error("Rastreamento não encontrado");
      }

      // Validar integridade da blockchain
      const integridade = blockchainAuditService.verificarIntegridade(
        rastreamento_id
      );

      if (!integridade.valido) {
        rastreamento.autenticidade_verificada = false;
        await rastreamento.save();
        return {
          autenticidade: false,
          motivo: "Integridade do blockchain comprometida",
        };
      }

      // Verificar se todas as etapas têm assinaturas válidas
      const todasAssinadas = rastreamento.etapas.every(
        (etapa) => etapa.assinatura_blockchain
      );

      if (!todasAssinadas) {
        return {
          autenticidade: false,
          motivo: "Nem todas as etapas estão devidamente assinadas",
        };
      }

      // Verificar se há validador farmacêutico
      const temValidadorFarmaceutico = rastreamento.etapas.some(
        (etapa) =>
          etapa.validado_por &&
          etapa.validado_por.toString() === farmaceutico_id
      );

      rastreamento.autenticidade_verificada = true;
      rastreamento.farmaceutico_validador = farmaceutico_id;

      // Gerar assinatura PKI do farmacêutico
      const dataParaAssinar = {
        rastreamento_id,
        medicamento_id: rastreamento.medicamento_id,
        lote: rastreamento.lote,
        timestamp: Date.now(),
      };

      // Simular assinatura (em produção, usar chave privada real)
      rastreamento.assinatura_farmaceutico = crypto
        .createHash("sha256")
        .update(JSON.stringify(dataParaAssinar))
        .digest("hex");

      await rastreamento.save();

      logger.info(
        `Autenticidade verificada para rastreamento ${rastreamento_id}`
      );

      return {
        autenticidade: true,
        verificado_por: farmaceutico_id,
        etapas_validadas: rastreamento.etapas.length,
      };
    } catch (error) {
      logger.error("Erro ao verificar autenticidade:", error);
      throw error;
    }
  }

  async obterRastreamento(rastreamento_id) {
    try {
      const rastreamento = await MedicineTracking.findById(rastreamento_id)
        .populate("medicamento_id", "nome principio_ativo dosagem")
        .populate("farmacia_origem", "nome endereco")
        .populate("cliente_destino", "nome email telefone")
        .populate("farmaceutico_validador", "nome")
        .populate("etapas.validado_por", "nome tipo_usuario");

      if (!rastreamento) {
        throw new Error("Rastreamento não encontrado");
      }

      logger.info(`Rastreamento recuperado: ${rastreamento_id}`);

      return rastreamento;
    } catch (error) {
      logger.error("Erro ao obter rastreamento:", error);
      throw error;
    }
  }

  async obterHistorico(medicamento_id, lote = null) {
    try {
      const query = {
        medicamento_id,
      };

      if (lote) {
        query.lote = lote;
      }

      const rastreamentos = await MedicineTracking.find(query)
        .populate("medicamento_id", "nome principio_ativo")
        .populate("farmacia_origem", "nome")
        .populate("cliente_destino", "nome")
        .sort({ criado_em: -1 });

      logger.info(
        `Histórico recuperado para medicamento ${medicamento_id}: ${rastreamentos.length} registros`
      );

      return rastreamentos;
    } catch (error) {
      logger.error("Erro ao obter histórico:", error);
      throw error;
    }
  }

  async obterRastreamentosPorCliente(cliente_id, pagination = {}) {
    try {
      const { page = 1, limit = 10 } = pagination;

      const rastreamentos = await MedicineTracking.paginate(
        { cliente_destino: cliente_id },
        {
          page,
          limit,
          populate: [
            { path: "medicamento_id", select: "nome principio_ativo dosagem" },
            { path: "farmacia_origem", select: "nome" },
          ],
          sort: { criado_em: -1 },
        }
      );

      logger.info(
        `Rastreamentos recuperados para cliente ${cliente_id}: ${rastreamentos.totalDocs} total`
      );

      return rastreamentos;
    } catch (error) {
      logger.error("Erro ao obter rastreamentos por cliente:", error);
      throw error;
    }
  }

  async obterRastreamentosPorFarmacia(farmacia_id, pagination = {}) {
    try {
      const { page = 1, limit = 10 } = pagination;

      const rastreamentos = await MedicineTracking.paginate(
        { farmacia_origem: farmacia_id },
        {
          page,
          limit,
          populate: [
            { path: "medicamento_id", select: "nome principio_ativo" },
            {
              path: "cliente_destino",
              select: "nome email telefone",
            },
          ],
          sort: { criado_em: -1 },
        }
      );

      logger.info(
        `Rastreamentos recuperados para farmácia ${farmacia_id}: ${rastreamentos.totalDocs} total`
      );

      return rastreamentos;
    } catch (error) {
      logger.error("Erro ao obter rastreamentos por farmácia:", error);
      throw error;
    }
  }

  async obterEstatisticas(farmacia_id = null) {
    try {
      const query = {};
      if (farmacia_id) {
        query.farmacia_origem = farmacia_id;
      }

      const total = await MedicineTracking.countDocuments(query);
      const entregues = await MedicineTracking.countDocuments({
        ...query,
        status: "entregue",
      });
      const emTransito = await MedicineTracking.countDocuments({
        ...query,
        status: "em_transito",
      });
      const pendentes = await MedicineTracking.countDocuments({
        ...query,
        status: "pendente",
      });

      const autenticidadeVerificada = await MedicineTracking.countDocuments({
        ...query,
        autenticidade_verificada: true,
      });

      logger.info(`Estatísticas calculadas`);

      return {
        total,
        entregues,
        emTransito,
        pendentes,
        autenticidadeVerificada,
        taxaEntrega: total > 0 ? (entregues / total * 100).toFixed(2) : 0,
      };
    } catch (error) {
      logger.error("Erro ao obter estatísticas:", error);
      throw error;
    }
  }

  async cancelarRastreamento(rastreamento_id, motivo) {
    try {
      const rastreamento = await MedicineTracking.findById(rastreamento_id);
      if (!rastreamento) {
        throw new Error("Rastreamento não encontrado");
      }

      if (rastreamento.status === "entregue") {
        throw new Error("Não é possível cancelar um rastreamento entregue");
      }

      rastreamento.status = "cancelado";
      rastreamento.etapas.push({
        tipo: "CANCELADO",
        timestamp: new Date(),
        observacoes: motivo,
      });

      blockchainAuditService.createTransaction({
        tipo: "CANCELAMENTO_RASTREAMENTO",
        rastreamento_id,
        motivo,
        timestamp: Date.now(),
      });

      await rastreamento.save();

      logger.info(
        `Rastreamento ${rastreamento_id} cancelado. Motivo: ${motivo}`
      );

      return rastreamento;
    } catch (error) {
      logger.error("Erro ao cancelar rastreamento:", error);
      throw error;
    }
  }
}

module.exports = new MedicineTrackingService();
