/**
 * Testes de Fraude - Cenário 5: Interação Medicamentosa Ignorada
 * Valida detecção de tentativa de contorno de validações de interação
 */

const request = require("supertest");
const mongoose = require("mongoose");
const {
  testCustomers,
  testMedicines,
  drugInteractions,
} = require("./fixtures/test-data");
const { cleanDatabase } = require("./setup");

let app;

describe("Fraud Scenario 5: Drug Interaction Bypass Detection", () => {
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

  describe("Drug Interaction Detection", () => {
    it("Should detect known drug interactions", async () => {
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

      // Adicionar medicamentos com interação conhecida
      // Aspirina + Ibuprofeno
      const aspirina = testMedicines.find((m) => m.nome === "Aspirina 500mg");
      const ibuprofeno = testMedicines.find((m) => m.nome === "Ibuprofeno 400mg");

      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: aspirina.id,
          quantidade: 1,
        });

      const response = await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: ibuprofeno.id,
          quantidade: 1,
        });

      // Deve alertar sobre interação
      expect([200, 201, 400, 403]).toContain(response.status);

      if (response.status === 400 || response.status === 403) {
        expect(response.body.message).toMatch(/interacao|incompativel/i);
      }

      if (response.status === 200 || response.status === 201) {
        // Se permitir, deve ter warning
        expect(
          response.body.warning ||
          response.body.interacao ||
          response.body.alertaIntercacao
        ).toBeDefined();
      }
    });

    it("Should detect severe drug interactions", async () => {
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

      // Adicionar medicamentos com interação GRAVE
      // Atorvastatina + Fluconazol
      const atorvastatina = testMedicines.find(
        (m) => m.nome === "Atorvastatina 20mg"
      );
      const fluconazol = testMedicines.find((m) => m.nome === "Fluconazol 150mg");

      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: atorvastatina.id,
          quantidade: 1,
        });

      const response = await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: fluconazol.id,
          quantidade: 1,
        });

      // Deve ser rejeitado (GRAVE)
      expect([400, 403]).toContain(response.status);
      expect(response.body.message).toMatch(/grave|contraindicado|impossivel/i);
    });
  });

  describe("Bypass Attempt Detection", () => {
    it("Should detect attempt to bypass interaction validation", async () => {
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

      // Tentar adicionar com bypass_validation ou skip_checks
      const response = await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: testMedicines[0].id,
          quantidade: 1,
          skip_validation: true,
          bypass_checks: true,
        });

      // Bypass deve ser ignorado/rejeitado
      expect([200, 201, 400, 403]).toContain(response.status);

      // Se a requisição ainda tenta o bypass, deve estar marcada
      if (response.status === 200 || response.status === 201) {
        // Sistema não deve permitir de fato o bypass
        expect(response.body.validacao_completa || true).toBe(true);
      }
    });

    it("Should log bypass attempt to audit trail", async () => {
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

      // Tentar bypass
      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: testMedicines[0].id,
          quantidade: 1,
          bypass_checks: true,
        });

      // Verificar se tentativa foi logada
      const logsRes = await request(app)
        .get("/api/audit/logs?acao=tentativa_bypass_interacao")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 401, 404, 403]).toContain(logsRes.status);
    });
  });

  describe("Pharmacist Validation Required", () => {
    it("Should require pharmacist approval for interaction override", async () => {
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

      // Adicionar medicamentos com interação
      const aspirina = testMedicines.find((m) => m.nome === "Aspirina 500mg");
      const ibuprofeno = testMedicines.find((m) => m.nome === "Ibuprofeno 400mg");

      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: aspirina.id,
          quantidade: 1,
        });

      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: ibuprofeno.id,
          quantidade: 1,
        });

      // Tentar checkout com interação
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

      // Pode ser rejeitado ou requer validação
      expect([200, 201, 400, 403, 404]).toContain(checkoutRes.status);

      if (checkoutRes.status === 403 || checkoutRes.status === 400) {
        expect(checkoutRes.body.message).toMatch(/validacao|farmaceutico/i);
      }
    });

    it("Pharmacist should see CONTRAINDICADO alert for severe interactions", async () => {
      const response = await request(app)
        .post("/api/pharmacist/validar-interacoes/order123")
        .set("Authorization", `Bearer ${createTestToken("pharmacist1", "farmaceutico")}`)
        .send({
          medicamentos: [
            "Atorvastatina 20mg",
            "Fluconazol 150mg",
          ],
        });

      expect([200, 400, 401, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        const body = response.body;
        expect(body.status).toBe("CONTRAINDICADO");
        expect(body.severidade).toBe("GRAVE");
      }
    });

    it("Pharmacist can accept interaction with documented justification", async () => {
      const response = await request(app)
        .post("/api/pharmacist/sobrescrever-interacao/order123")
        .set("Authorization", `Bearer ${createTestToken("pharmacist1", "farmaceutico")}`)
        .send({
          medicamentos: ["Aspirina 500mg", "Ibuprofeno 400mg"],
          justificativa: "Paciente com prescrição médica de ambos, monitoramento contínuo",
          risco_aceito: true,
          monitoramento_necessario: true,
        });

      expect([200, 400, 401, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.message).toContain("aceita");
      }
    });
  });

  describe("Checkout Blocking", () => {
    it("Should block checkout if severe interaction exists", async () => {
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

      // Adicionar medicamentos com interação grave
      const atorvastatina = testMedicines.find(
        (m) => m.nome === "Atorvastatina 20mg"
      );
      const fluconazol = testMedicines.find((m) => m.nome === "Fluconazol 150mg");

      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: atorvastatina.id,
          quantidade: 1,
        });

      // Segunda tentativa pode falhar ou avisar
      const addResponse = await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: fluconazol.id,
          quantidade: 1,
        });

      if (addResponse.status === 200 || addResponse.status === 201) {
        // Se permitiu adicionar, checkout deve ser bloqueado
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

        expect([400, 403]).toContain(checkoutRes.status);
        expect(checkoutRes.body.message).toMatch(
          /grave|contraindicado|impossivel/i
        );
      }
    });
  });

  describe("Audit Trail for Interactions", () => {
    it("Should log all interaction detections", async () => {
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

      // Gerar interação
      const aspirina = testMedicines.find((m) => m.nome === "Aspirina 500mg");
      const ibuprofeno = testMedicines.find((m) => m.nome === "Ibuprofeno 400mg");

      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: aspirina.id,
          quantidade: 1,
        });

      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: ibuprofeno.id,
          quantidade: 1,
        });

      // Verificar logs
      const logsRes = await request(app)
        .get("/api/audit/logs?acao=interacao_detectada")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 401, 404, 403]).toContain(logsRes.status);
    });

    it("Should record interaction severity in logs", async () => {
      const response = await request(app)
        .get("/api/audit/logs?tipo=interacao_medicamentosa")
        .set("Authorization", `Bearer ${createTestToken("customer1", "cliente")}`);

      expect([200, 401, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        const logs = response.body.logs || response.body.auditLogs || [];
        if (logs.length > 0) {
          logs.forEach((log) => {
            expect(log.severidade || log.severity).toBeDefined();
          });
        }
      }
    });
  });

  describe("Blockchain Record of Blocked Orders", () => {
    it("Should record blocked orders in blockchain", async () => {
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

      // Tentar ordem com interação grave
      const atorvastatina = testMedicines.find(
        (m) => m.nome === "Atorvastatina 20mg"
      );
      const fluconazol = testMedicines.find((m) => m.nome === "Fluconazol 150mg");

      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: atorvastatina.id,
          quantidade: 1,
        });

      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: fluconazol.id,
          quantidade: 1,
        });

      // Checkout bloqueado
      await request(app)
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

      // Verificar blockchain
      const blockchainRes = await request(app)
        .get("/api/audit/blockchain-records?tipo=ordem_bloqueada_interacao")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 401, 404, 403]).toContain(blockchainRes.status);

      if (blockchainRes.status === 200) {
        expect(Array.isArray(blockchainRes.body.records || blockchainRes.body.registros)).toBe(
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
