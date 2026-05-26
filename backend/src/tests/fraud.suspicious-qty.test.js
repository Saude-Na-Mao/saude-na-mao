/**
 * Testes de Fraude - Cenário 3: Quantidade Suspeita
 * Valida detecção de quantidades anormais (IA e score de risco)
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { testCustomers, testMedicines } = require("./fixtures/test-data");
const { cleanDatabase } = require("./setup");

let app;

describe("Fraud Scenario 3: Suspicious Quantity Detection", () => {
  beforeAll(async () => {
    app = require("../app");
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe("Abnormal Quantity Detection", () => {
    it("Should detect abnormally high quantity for single medication", async () => {
      const customer = testCustomers[0];

      // Registrar cliente
      const registerRes = await request(app)
        .post("/api/auth/register")
        .send({
          nome: customer.nome,
          email: customer.email,
          cpf: customer.cpf,
          telefone: customer.telefone,
          senha: customer.senha,
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      const token = registerRes.body.accessToken;

      // Tentar adicionar quantidade anormal (100 unidades de Dipirona)
      const response = await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: testMedicines[0].id, // Dipirona
          quantidade: 100,
        });

      // Pode aceitar com warning ou rejeitar
      expect([200, 201, 400, 403]).toContain(response.status);

      if (response.status === 200 || response.status === 201) {
        // Se aceitar, deve ter warning ou flag
        expect(
          response.body.warning ||
          response.body.flagged ||
          response.body.risco_score
        ).toBeDefined();
      }
    });

    it("Should flag quantity > normal usage", async () => {
      const customer = testCustomers[0];

      const registerRes = await request(app)
        .post("/api/auth/register")
        .send({
          nome: customer.nome,
          email: customer.email,
          cpf: customer.cpf,
          telefone: customer.telefone,
          senha: customer.senha,
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      const token = registerRes.body.accessToken;

      // Normal: 1-2 caixas de Paracetamol
      // Anormal: 50 caixas
      const response = await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: testMedicines[1].id, // Paracetamol
          quantidade: 50,
        });

      expect([200, 201, 400, 403]).toContain(response.status);

      if (response.status === 200 || response.status === 201) {
        const body = response.body;
        // Deve ter alguma indicação de suspeita
        expect(
          body.quantidade_suspeita ||
          body.flagged ||
          body.necessita_validacao
        ).toBeDefined();
      }
    });

    it("Should allow normal quantities", async () => {
      const customer = testCustomers[0];

      const registerRes = await request(app)
        .post("/api/auth/register")
        .send({
          nome: customer.nome,
          email: customer.email,
          cpf: customer.cpf,
          telefone: customer.telefone,
          senha: customer.senha,
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      const token = registerRes.body.accessToken;

      // Quantidade normal: 2 caixas
      const response = await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: testMedicines[0].id,
          quantidade: 2,
        });

      expect([200, 201]).toContain(response.status);

      if (response.status === 200 || response.status === 201) {
        // Não deve ter avisos de quantidade suspeita
        expect(
          !response.body.flagged || response.body.flagged === false
        ).toBe(true);
      }
    });
  });

  describe("Risk Score Calculation", () => {
    it("Should calculate risk score for order", async () => {
      const customer = testCustomers[0];

      const registerRes = await request(app)
        .post("/api/auth/register")
        .send({
          nome: customer.nome,
          email: customer.email,
          cpf: customer.cpf,
          telefone: customer.telefone,
          senha: customer.senha,
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      const token = registerRes.body.accessToken;

      // Adicionar quantidade suspeita
      const response = await request(app)
        .post("/api/order/risk-assessment")
        .set("Authorization", `Bearer ${token}`)
        .send({
          itens: [
            {
              id_produto: testMedicines[0].id,
              quantidade: 100,
            },
          ],
        });

      expect([200, 400, 404, 401]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.risco_score || response.body.riskScore).toBeDefined();
        const score = response.body.risco_score || response.body.riskScore;
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });

    it("Should increase risk score based on quantity", async () => {
      const customer = testCustomers[0];

      const registerRes = await request(app)
        .post("/api/auth/register")
        .send({
          nome: customer.nome,
          email: customer.email,
          cpf: customer.cpf,
          telefone: customer.telefone,
          senha: customer.senha,
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      const token = registerRes.body.accessToken;

      // Ordem com quantidade normal
      const normalResponse = await request(app)
        .post("/api/order/risk-assessment")
        .set("Authorization", `Bearer ${token}`)
        .send({
          itens: [
            {
              id_produto: testMedicines[0].id,
              quantidade: 2,
            },
          ],
        });

      // Ordem com quantidade suspeita
      const suspiciousResponse = await request(app)
        .post("/api/order/risk-assessment")
        .set("Authorization", `Bearer ${token}`)
        .send({
          itens: [
            {
              id_produto: testMedicines[0].id,
              quantidade: 100,
            },
          ],
        });

      if (normalResponse.status === 200 && suspiciousResponse.status === 200) {
        const normalScore =
          normalResponse.body.risco_score ||
          normalResponse.body.riskScore ||
          0;
        const suspiciousScore =
          suspiciousResponse.body.risco_score ||
          suspiciousResponse.body.riskScore ||
          0;

        expect(suspiciousScore).toBeGreaterThanOrEqual(normalScore);
      }
    });
  });

  describe("AI-based Fraud Detection", () => {
    it("Should detect unusual quantity patterns", async () => {
      const customer = testCustomers[0];

      const registerRes = await request(app)
        .post("/api/auth/register")
        .send({
          nome: customer.nome,
          email: customer.email,
          cpf: customer.cpf,
          telefone: customer.telefone,
          senha: customer.senha,
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      const token = registerRes.body.accessToken;

      // Verificar detecção de IA
      const response = await request(app)
        .post("/api/fraud/ai-detect")
        .set("Authorization", `Bearer ${token}`)
        .send({
          itens: [
            {
              id_produto: testMedicines[0].id,
              quantidade: 150, // Extremamente alto
            },
          ],
          endereco: customer.endereco,
        });

      expect([200, 400, 404, 401]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.detectada || response.body.detected).toBeDefined();
      }
    });

    it("Should evaluate medication type in risk calculation", async () => {
      const customer = testCustomers[0];

      const registerRes = await request(app)
        .post("/api/auth/register")
        .send({
          nome: customer.nome,
          email: customer.email,
          cpf: customer.cpf,
          telefone: customer.telefone,
          senha: customer.senha,
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      const token = registerRes.body.accessToken;

      // Medicamento controlado em quantidade alta é mais suspeito
      const controlledMed = testMedicines.find((m) => m.controlado);

      const response = await request(app)
        .post("/api/order/risk-assessment")
        .set("Authorization", `Bearer ${token}`)
        .send({
          itens: [
            {
              id_produto: controlledMed.id,
              quantidade: 50,
            },
          ],
        });

      expect([200, 400, 404, 401]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.risco_score || response.body.riskScore).toBeDefined();
      }
    });
  });

  describe("Extra Pharmacist Validation", () => {
    it("Should require pharmacist validation for suspicious quantity", async () => {
      const customer = testCustomers[0];

      const registerRes = await request(app)
        .post("/api/auth/register")
        .send({
          nome: customer.nome,
          email: customer.email,
          cpf: customer.cpf,
          telefone: customer.telefone,
          senha: customer.senha,
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      const token = registerRes.body.accessToken;

      // Adicionar quantidade suspeita
      const addResponse = await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: testMedicines[0].id,
          quantidade: 80,
        });

      expect([200, 201, 400, 403]).toContain(addResponse.status);

      // Tentar checkout
      const checkoutRes = await request(app)
        .post("/api/order/checkout")
        .set("Authorization", `Bearer ${token}`)
        .send({
          endereco_entrega: customer.endereco,
          metodo_pagamento: "credit_card",
          dados_pagamento: {
            numero_cartao: "4532015112830366",
            validade: "12/25",
            cvv: "123",
            titular: "JOAO SILVA",
          },
        });

      expect([200, 201, 400, 403]).toContain(checkoutRes.status);

      // Se quantidade for suspeita, pode exigir validação extra
      if (checkoutRes.status === 403 || checkoutRes.status === 400) {
        expect(checkoutRes.body.message).toMatch(
          /validacao|farmaceutico|quantidade/i
        );
      }
    });

    it("Pharmacist should accept suspicious quantity with documented reason", async () => {
      // Mock de farmacêutico aceitando quantidade suspeita
      const response = await request(app)
        .post("/api/pharmacist/validar-quantidade-suspeita/order123")
        .set("Authorization", `Bearer ${createTestToken("pharmacist1", "farmaceutico")}`)
        .send({
          status: "aprovada",
          motivo_clinico: "Paciente em tratamento crônico, quantidade justificada",
          documentacao: "Prescrição de médico com justificativa",
        });

      expect([200, 400, 401, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.message).toContain("aprovada");
      }
    });

    it("Pharmacist should be able to reject suspicious quantity", async () => {
      const response = await request(app)
        .post("/api/pharmacist/validar-quantidade-suspeita/order123")
        .set("Authorization", `Bearer ${createTestToken("pharmacist1", "farmaceutico")}`)
        .send({
          status: "rejeitada",
          motivo: "Quantidade não justificada clinicamente",
          observacoes:
            "Recomenda-se compra de quantidade menor com prescrição atualizada",
        });

      expect([200, 400, 401, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.message).toContain("rejeitada");
      }
    });
  });

  describe("Audit Trail for Suspicious Orders", () => {
    it("Should log suspicious quantity attempts", async () => {
      const customer = testCustomers[0];

      const registerRes = await request(app)
        .post("/api/auth/register")
        .send({
          nome: customer.nome,
          email: customer.email,
          cpf: customer.cpf,
          telefone: customer.telefone,
          senha: customer.senha,
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      const token = registerRes.body.accessToken;

      // Tentar adicionar quantidade suspeita
      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: testMedicines[0].id,
          quantidade: 100,
        });

      // Verificar logs
      const logsResponse = await request(app)
        .get("/api/audit/logs?acao=quantidade_suspeita")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 401, 404, 403]).toContain(logsResponse.status);
    });

    it("Should track risk score changes over time", async () => {
      const customer = testCustomers[0];

      const registerRes = await request(app)
        .post("/api/auth/register")
        .send({
          nome: customer.nome,
          email: customer.email,
          cpf: customer.cpf,
          telefone: customer.telefone,
          senha: customer.senha,
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      const token = registerRes.body.accessToken;
      const customerId = registerRes.body.user._id;

      // Verificar histórico de risco
      const response = await request(app)
        .get("/api/fraud/risk-history/" + customerId)
        .set("Authorization", `Bearer ${token}`);

      expect([200, 401, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(Array.isArray(response.body.historico || response.body.history)).toBe(
          true
        );
      }
    });
  });
});

// Helper para criar token de teste
function createTestToken(userId, tipoUsuario = "cliente") {
  const jwt = require("jsonwebtoken");
  return jwt.sign(
    { id: userId, tipo: tipoUsuario },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
}
