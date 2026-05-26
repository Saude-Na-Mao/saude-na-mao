const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../app");
const medicineTrackingService = require("../services/medicineTrackingService");
const MedicineTracking = require("../models/MedicineTracking");
const Product = require("../models/Product");
const User = require("../models/User");
const Pharmacy = require("../models/Pharmacy");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("Medicine Tracking Service", () => {
  let usuario;
  let farmacia;
  let produto;
  let rastreamento;

  beforeEach(async () => {
    // Limpar dados
    await MedicineTracking.deleteMany({});
    await Product.deleteMany({});
    await User.deleteMany({});
    await Pharmacy.deleteMany({});

    // Criar dados de teste
    usuario = await User.create({
      nome: "João Silva",
      email: "joao@test.com",
      senha: "senha123",
      cpf: "12345678901",
      tipo_usuario: "cliente",
    });

    farmacia = await Pharmacy.create({
      nome: "Farmácia Teste",
      endereco: "Rua Teste, 123",
      latitude: -23.5505,
      longitude: -46.6333,
      telefone: "1133334444",
      horario_funcionamento: {
        segunda: { abre: "08:00", fecha: "20:00" },
      },
    });

    produto = await Product.create({
      nome: "Dipirona 500mg",
      principio_ativo: "Dipirona",
      categoria: "Analgésicos",
      dosagem: "500mg",
      preco: 5.99,
      estoque: 100,
      id_farmacia: farmacia._id,
    });
  });

  describe("criarRastreamento", () => {
    it("deve criar um rastreamento com sucesso", async () => {
      rastreamento = await medicineTrackingService.criarRastreamento(
        produto._id,
        "LOTE123",
        farmacia._id,
        usuario._id
      );

      expect(rastreamento).toBeDefined();
      expect(rastreamento.lote).toBe("LOTE123");
      expect(rastreamento.medicamento_id).toEqual(produto._id);
      expect(rastreamento.blockchain_hash).toBeDefined();
      expect(rastreamento.qr_code_data).toBeDefined();
    });

    it("deve falhar se medicamento não existir", async () => {
      const idInvalido = new mongoose.Types.ObjectId();

      await expect(
        medicineTrackingService.criarRastreamento(
          idInvalido,
          "LOTE123",
          farmacia._id,
          usuario._id
        )
      ).rejects.toThrow();
    });
  });

  describe("adicionarEtapa", () => {
    beforeEach(async () => {
      rastreamento = await medicineTrackingService.criarRastreamento(
        produto._id,
        "LOTE123",
        farmacia._id,
        usuario._id
      );
    });

    it("deve adicionar etapa válida SAIDA_FARMACIA", async () => {
      const resultado = await medicineTrackingService.adicionarEtapa(
        rastreamento._id,
        "SAIDA_FARMACIA",
        { lat: -23.5505, lng: -46.6333 },
        null,
        usuario._id,
        "Medicamento saiu da farmácia"
      );

      expect(resultado.etapas).toHaveLength(1);
      expect(resultado.etapas[0].tipo).toBe("SAIDA_FARMACIA");
      expect(resultado.status).toBe("em_transito");
    });

    it("deve rejeitar transição inválida de etapa", async () => {
      // Tentar adicionar EM_TRANSITO direto (sem SAIDA_FARMACIA)
      await expect(
        medicineTrackingService.adicionarEtapa(
          rastreamento._id,
          "EM_TRANSITO",
          { lat: -23.5505, lng: -46.6333 },
          null,
          usuario._id,
          "Em trânsito"
        )
      ).rejects.toThrow();
    });

    it("deve permitir sequência correta de etapas", async () => {
      // SAIDA_FARMACIA
      let resultado = await medicineTrackingService.adicionarEtapa(
        rastreamento._id,
        "SAIDA_FARMACIA",
        { lat: -23.5505, lng: -46.6333 },
        null,
        usuario._id,
        "Saída"
      );
      expect(resultado.etapas).toHaveLength(1);

      // EM_TRANSITO
      resultado = await medicineTrackingService.adicionarEtapa(
        rastreamento._id,
        "EM_TRANSITO",
        { lat: -23.5400, lng: -46.6200 },
        null,
        usuario._id,
        "Em trânsito"
      );
      expect(resultado.etapas).toHaveLength(2);

      // ENTREGA
      resultado = await medicineTrackingService.adicionarEtapa(
        rastreamento._id,
        "ENTREGA",
        { lat: -23.5300, lng: -46.6100 },
        null,
        usuario._id,
        "Na entrega"
      );
      expect(resultado.etapas).toHaveLength(3);

      // ENTREGUE
      resultado = await medicineTrackingService.adicionarEtapa(
        rastreamento._id,
        "ENTREGUE",
        { lat: -23.5300, lng: -46.6100 },
        null,
        usuario._id,
        "Entregue"
      );
      expect(resultado.etapas).toHaveLength(4);
      expect(resultado.status).toBe("entregue");
    });
  });

  describe("gerarQRCode", () => {
    beforeEach(async () => {
      rastreamento = await medicineTrackingService.criarRastreamento(
        produto._id,
        "LOTE123",
        farmacia._id,
        usuario._id
      );
    });

    it("deve gerar QR code com sucesso", async () => {
      const resultado = await medicineTrackingService.gerarQRCode(
        rastreamento._id
      );

      expect(resultado).toBeDefined();
      expect(resultado.qrCode).toBeDefined();
      expect(resultado.qrCode).toContain("data:image/png");
      expect(resultado.data).toBeDefined();
      expect(resultado.data.blockchain_hash).toBe(rastreamento.blockchain_hash);
    });

    it("deve falhar se rastreamento não existir", async () => {
      const idInvalido = new mongoose.Types.ObjectId();

      await expect(
        medicineTrackingService.gerarQRCode(idInvalido)
      ).rejects.toThrow();
    });
  });

  describe("verificarAutenticidade", () => {
    beforeEach(async () => {
      rastreamento = await medicineTrackingService.criarRastreamento(
        produto._id,
        "LOTE123",
        farmacia._id,
        usuario._id
      );
    });

    it("deve verificar autenticidade com sucesso", async () => {
      // Adicionar algumas etapas
      await medicineTrackingService.adicionarEtapa(
        rastreamento._id,
        "SAIDA_FARMACIA",
        { lat: -23.5505, lng: -46.6333 },
        null,
        usuario._id,
        "Saída"
      );

      const resultado = await medicineTrackingService.verificarAutenticidade(
        rastreamento._id,
        usuario._id
      );

      expect(resultado).toBeDefined();
      expect(resultado.autenticidade).toBe(true);
      expect(resultado.verificado_por).toEqual(usuario._id);
    });
  });

  describe("obterRastreamento", () => {
    beforeEach(async () => {
      rastreamento = await medicineTrackingService.criarRastreamento(
        produto._id,
        "LOTE123",
        farmacia._id,
        usuario._id
      );
    });

    it("deve obter rastreamento com informações populadas", async () => {
      const resultado = await medicineTrackingService.obterRastreamento(
        rastreamento._id
      );

      expect(resultado).toBeDefined();
      expect(resultado._id).toEqual(rastreamento._id);
      expect(resultado.medicamento_id.nome).toBe("Dipirona 500mg");
      expect(resultado.farmacia_origem.nome).toBe("Farmácia Teste");
    });
  });

  describe("obterHistorico", () => {
    beforeEach(async () => {
      rastreamento = await medicineTrackingService.criarRastreamento(
        produto._id,
        "LOTE123",
        farmacia._id,
        usuario._id
      );
    });

    it("deve obter histórico de rastreamentos por medicamento", async () => {
      const resultado = await medicineTrackingService.obterHistorico(
        produto._id
      );

      expect(resultado).toHaveLength(1);
      expect(resultado[0]._id).toEqual(rastreamento._id);
    });

    it("deve obter histórico filtrado por lote", async () => {
      const resultado = await medicineTrackingService.obterHistorico(
        produto._id,
        "LOTE123"
      );

      expect(resultado).toHaveLength(1);
      expect(resultado[0].lote).toBe("LOTE123");
    });
  });

  describe("cancelarRastreamento", () => {
    beforeEach(async () => {
      rastreamento = await medicineTrackingService.criarRastreamento(
        produto._id,
        "LOTE123",
        farmacia._id,
        usuario._id
      );
    });

    it("deve cancelar rastreamento pendente", async () => {
      const resultado = await medicineTrackingService.cancelarRastreamento(
        rastreamento._id,
        "Solicitação do cliente"
      );

      expect(resultado.status).toBe("cancelado");
      expect(resultado.etapas[0].tipo).toBe("CANCELADO");
    });

    it("deve falhar ao cancelar rastreamento entregue", async () => {
      // Completar todo o fluxo
      await medicineTrackingService.adicionarEtapa(
        rastreamento._id,
        "SAIDA_FARMACIA",
        { lat: -23.5505, lng: -46.6333 },
        null,
        usuario._id
      );
      await medicineTrackingService.adicionarEtapa(
        rastreamento._id,
        "EM_TRANSITO",
        { lat: -23.5400, lng: -46.6200 },
        null,
        usuario._id
      );
      await medicineTrackingService.adicionarEtapa(
        rastreamento._id,
        "ENTREGA",
        { lat: -23.5300, lng: -46.6100 },
        null,
        usuario._id
      );
      await medicineTrackingService.adicionarEtapa(
        rastreamento._id,
        "ENTREGUE",
        { lat: -23.5300, lng: -46.6100 },
        null,
        usuario._id
      );

      await expect(
        medicineTrackingService.cancelarRastreamento(
          rastreamento._id,
          "Cancelamento tardio"
        )
      ).rejects.toThrow();
    });
  });
});
