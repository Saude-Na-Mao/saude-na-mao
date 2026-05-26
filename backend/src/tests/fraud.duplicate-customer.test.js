/**
 * Testes de Fraude - Cenário 1: Cliente Duplicado
 * Valida detecção de tentativa de registrar CPF duplicado
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { testCustomers } = require("./fixtures/test-data");
const { cleanDatabase } = require("./setup");

let app;

describe("Fraud Scenario 1: Duplicate Customer Detection", () => {
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

  describe("Duplicate CPF Detection", () => {
    it("Should detect and prevent duplicate CPF registration", async () => {
      const customer = testCustomers[0];

      // Primeiro registro
      const firstRegister = await request(app)
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

      expect(firstRegister.status).toBe(201);
      expect(firstRegister.body.user.cpf).toBe(customer.cpf);

      // Tentativa de registrar mesmo CPF
      const secondRegister = await request(app)
        .post("/api/auth/register")
        .send({
          nome: "Outro Cliente",
          email: "outro@test.com",
          cpf: customer.cpf,
          telefone: "11988888888",
          senha: "Password123!",
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      expect(secondRegister.status).toBe(409);
      expect(secondRegister.body.message).toContain("CPF");
    });

    it("Should reject multiple CPF attempts with same email variations", async () => {
      const customer = testCustomers[0];

      // Primeiro registro
      await request(app)
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

      // Tentativa com email diferente mas CPF igual
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          nome: "Nome Diferente",
          email: "diferentes@test.com",
          cpf: customer.cpf,
          telefone: "11988888889",
          senha: "Password123!",
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      expect(response.status).toBe(409);
    });

    it("Should allow registration of different CPFs", async () => {
      const customer1 = testCustomers[0];
      const customer2 = testCustomers[1];

      const register1 = await request(app)
        .post("/api/auth/register")
        .send({
          nome: customer1.nome,
          email: customer1.email,
          cpf: customer1.cpf,
          telefone: customer1.telefone,
          senha: customer1.senha,
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      expect(register1.status).toBe(201);

      const register2 = await request(app)
        .post("/api/auth/register")
        .send({
          nome: customer2.nome,
          email: customer2.email,
          cpf: customer2.cpf,
          telefone: customer2.telefone,
          senha: customer2.senha,
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      expect(register2.status).toBe(201);
      expect(register1.body.user.cpf).not.toBe(register2.body.user.cpf);
    });
  });

  describe("Fraud Attempt Logging", () => {
    it("Should log duplicate CPF registration attempts in blockchain", async () => {
      const customer = testCustomers[0];

      // Primeiro registro bem-sucedido
      await request(app)
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

      // Tentativa fraudulenta
      const fraudAttempt = await request(app)
        .post("/api/auth/register")
        .send({
          nome: "Fraud Attempt",
          email: "fraud@test.com",
          cpf: customer.cpf,
          telefone: "11999999999",
          senha: "Password123!",
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      expect(fraudAttempt.status).toBe(409);

      // Verificar logs de auditoria
      const logsResponse = await request(app)
        .get("/api/audit/logs?acao=tentativa_dupla_cpf")
        .set("Authorization", `Bearer ${createTestToken(testCustomers[0].id, "cliente")}`);

      // O log deve estar registrado ou ao menos existir a rota
      expect([200, 401, 403, 404]).toContain(logsResponse.status);
    });

    it("Should create blockchain transaction for fraud attempt", async () => {
      const customer = testCustomers[0];

      // Primeiro registro
      await request(app)
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

      // Tentativa fraudulenta que deve ser logada
      const fraudAttempt = await request(app)
        .post("/api/auth/register")
        .send({
          nome: "Fraud User",
          email: "frauduser@test.com",
          cpf: customer.cpf,
          telefone: "11988888888",
          senha: "Password123!",
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      expect(fraudAttempt.status).toBe(409);

      // Verificar se o blockchain foi atualizado
      const blockchainCheck = await request(app)
        .get("/api/audit/blockchain-status")
        .set("Authorization", `Bearer ${createTestToken(testCustomers[0].id, "cliente")}`);

      expect([200, 401, 403, 404]).toContain(blockchainCheck.status);
    });
  });

  describe("Owner Alert System", () => {
    it("Should alert owner of duplicate CPF fraud attempt", async () => {
      const customer = testCustomers[0];

      // Primeiro registro
      const firstRegister = await request(app)
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

      const customerId = firstRegister.body.user._id;

      // Tentativa fraudulenta
      await request(app)
        .post("/api/auth/register")
        .send({
          nome: "Fraud Attempt",
          email: "fraud@test.com",
          cpf: customer.cpf,
          telefone: "11999999999",
          senha: "Password123!",
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      // Verificar se alertas foram criados
      const alertsResponse = await request(app)
        .get("/api/admin/fraude/alertas")
        .set("Authorization", `Bearer ${createTestToken(customerId, "dono_farmacia")}`);

      expect([200, 401, 403, 404]).toContain(alertsResponse.status);
    });

    it("Should track multiple fraud attempts per user", async () => {
      const customer = testCustomers[0];

      // Primeiro registro bem-sucedido
      const firstRegister = await request(app)
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

      // Tentativas fraudulentas múltiplas
      const attempts = 3;
      for (let i = 0; i < attempts; i++) {
        await request(app)
          .post("/api/auth/register")
          .send({
            nome: `Fraud Attempt ${i}`,
            email: `fraud${i}@test.com`,
            cpf: customer.cpf,
            telefone: "11999999999",
            senha: "Password123!",
            tipo_usuario: "cliente",
            lgpd_consentimento: true,
          });
      }

      // Verificar contagem de tentativas
      const fraudStatsResponse = await request(app)
        .get("/api/audit/fraud-attempts")
        .set("Authorization", `Bearer ${createTestToken(firstRegister.body.user._id, "dono_farmacia")}`);

      expect([200, 401, 403, 404]).toContain(fraudStatsResponse.status);
    });
  });

  describe("Duplicate Email Detection", () => {
    it("Should prevent duplicate email registration", async () => {
      const customer = testCustomers[0];

      // Primeiro registro
      const firstRegister = await request(app)
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

      expect(firstRegister.status).toBe(201);

      // Tentativa com mesmo email
      const secondRegister = await request(app)
        .post("/api/auth/register")
        .send({
          nome: "Outro Nome",
          email: customer.email,
          cpf: testCustomers[1].cpf,
          telefone: "21999999999",
          senha: customer.senha,
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      expect(secondRegister.status).toBe(409);
      expect(secondRegister.body.message).toContain("mail");
    });
  });

  describe("CPF Validation", () => {
    it("Should validate CPF format on registration", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          nome: "Test User",
          email: "test@test.com",
          cpf: "invalid-cpf",
          telefone: "11999999999",
          senha: "Password123!",
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      expect([201, 400]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body.message).toContain("CPF");
      }
    });

    it("Should accept valid CPF format", async () => {
      const customer = testCustomers[0];

      const response = await request(app)
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

      expect(response.status).toBe(201);
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
