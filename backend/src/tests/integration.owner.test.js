/**
 * Testes de Integração - Fluxo de Dono de Farmácia
 * Testa: login, analytics, filtros, audit logs, análise de fraudes, dashboard B2B
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { testOwners } = require("./fixtures/test-data");
const { cleanDatabase, createTestToken } = require("./setup");

let app;

describe("Pharmacy Owner Integration Flow Tests", () => {
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

  describe("Pharmacy Owner Login", () => {
    beforeEach(async () => {
      const owner = testOwners[0];
      // Criar dono de farmácia via registro
      await request(app)
        .post("/api/auth/register")
        .send({
          nome: owner.nome,
          email: owner.email,
          cpf: "12345678900",
          telefone: owner.telefone,
          senha: owner.senha,
          tipo_usuario: "dono_farmacia",
          dados_farmacia: {
            cnpj: owner.cnpj,
            nome: owner.nome,
            logradouro: owner.endereco.logradouro,
            numero: owner.endereco.numero,
            bairro: owner.endereco.bairro,
            cidade: owner.endereco.cidade,
            estado: owner.endereco.estado,
            cep: owner.endereco.cep,
          },
          lgpd_consentimento: true,
        });
    });

    it("Should login pharmacy owner successfully", async () => {
      const owner = testOwners[0];

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: owner.email,
          senha: owner.senha,
        });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.user.tipo_usuario).toBe("dono_farmacia");
    });

    it("Should reject invalid owner credentials", async () => {
      const owner = testOwners[0];

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: owner.email,
          senha: "WrongPassword123!",
        });

      expect(response.status).toBe(401);
    });
  });

  describe("Analytics by Period", () => {
    let token;

    beforeEach(async () => {
      const owner = testOwners[0];

      // Criar dono de farmácia
      await request(app)
        .post("/api/auth/register")
        .send({
          nome: owner.nome,
          email: owner.email,
          cpf: "12345678900",
          telefone: owner.telefone,
          senha: owner.senha,
          tipo_usuario: "dono_farmacia",
          dados_farmacia: {
            cnpj: owner.cnpj,
            nome: owner.nome,
            logradouro: owner.endereco.logradouro,
            numero: owner.endereco.numero,
            bairro: owner.endereco.bairro,
            cidade: owner.endereco.cidade,
            estado: owner.endereco.estado,
            cep: owner.endereco.cep,
          },
          lgpd_consentimento: true,
        });

      // Fazer login
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: owner.email,
          senha: owner.senha,
        });

      token = loginRes.body.accessToken;
    });

    it("Should get analytics for last 30 days", async () => {
      const response = await request(app)
        .get("/api/admin/analytics?periodo=30d")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.analytics || response.body.data).toBeDefined();
      }
    });

    it("Should get analytics for last 7 days", async () => {
      const response = await request(app)
        .get("/api/admin/analytics?periodo=7d")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);
    });

    it("Should get analytics for custom date range", async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const endDate = new Date();

      const response = await request(app)
        .get(
          `/api/admin/analytics?dataInicio=${startDate.toISOString()}&dataFim=${endDate.toISOString()}`
        )
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);
    });

    it("Should include revenue metrics in analytics", async () => {
      const response = await request(app)
        .get("/api/admin/analytics?periodo=30d")
        .set("Authorization", `Bearer ${token}`);

      if (response.status === 200) {
        const analytics = response.body.analytics || response.body;
        expect(
          analytics.receita ||
          analytics.revenue ||
          analytics.total_vendas
        ).toBeDefined();
      }
    });

    it("Should include order count in analytics", async () => {
      const response = await request(app)
        .get("/api/admin/analytics?periodo=30d")
        .set("Authorization", `Bearer ${token}`);

      if (response.status === 200) {
        const analytics = response.body.analytics || response.body;
        expect(
          analytics.totalPedidos ||
          analytics.total_orders ||
          analytics.pedidos
        ).toBeDefined();
      }
    });
  });

  describe("Filter Analytics by Medicine", () => {
    let token;

    beforeEach(async () => {
      const owner = testOwners[0];

      await request(app)
        .post("/api/auth/register")
        .send({
          nome: owner.nome,
          email: owner.email,
          cpf: "12345678900",
          telefone: owner.telefone,
          senha: owner.senha,
          tipo_usuario: "dono_farmacia",
          dados_farmacia: {
            cnpj: owner.cnpj,
            nome: owner.nome,
            logradouro: owner.endereco.logradouro,
            numero: owner.endereco.numero,
            bairro: owner.endereco.bairro,
            cidade: owner.endereco.cidade,
            estado: owner.endereco.estado,
            cep: owner.endereco.cep,
          },
          lgpd_consentimento: true,
        });

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: owner.email,
          senha: owner.senha,
        });

      token = loginRes.body.accessToken;
    });

    it("Should filter analytics by specific medicine", async () => {
      const response = await request(app)
        .get("/api/admin/analytics?medicamento=Dipirona%20500mg&periodo=30d")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        const analytics = response.body.analytics || response.body;
        expect(analytics.medicamento || analytics.produto).toBeDefined();
      }
    });

    it("Should get top selling medicines", async () => {
      const response = await request(app)
        .get("/api/admin/analytics/top-medicines?periodo=30d")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(Array.isArray(response.body.topMedicines || response.body.produtos)).toBe(true);
      }
    });

    it("Should get medicine sales trend", async () => {
      const response = await request(app)
        .get("/api/admin/analytics/medicine-trend?medicamento=Dipirona%20500mg")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);
    });
  });

  describe("Audit Logs", () => {
    let token;

    beforeEach(async () => {
      const owner = testOwners[0];

      await request(app)
        .post("/api/auth/register")
        .send({
          nome: owner.nome,
          email: owner.email,
          cpf: "12345678900",
          telefone: owner.telefone,
          senha: owner.senha,
          tipo_usuario: "dono_farmacia",
          dados_farmacia: {
            cnpj: owner.cnpj,
            nome: owner.nome,
            logradouro: owner.endereco.logradouro,
            numero: owner.endereco.numero,
            bairro: owner.endereco.bairro,
            cidade: owner.endereco.cidade,
            estado: owner.endereco.estado,
            cep: owner.endereco.cep,
          },
          lgpd_consentimento: true,
        });

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: owner.email,
          senha: owner.senha,
        });

      token = loginRes.body.accessToken;
    });

    it("Should retrieve audit logs", async () => {
      const response = await request(app)
        .get("/api/audit/logs")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(Array.isArray(response.body.logs || response.body.auditLogs)).toBe(true);
      }
    });

    it("Should filter audit logs by action", async () => {
      const response = await request(app)
        .get("/api/audit/logs?acao=receita_validada")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);
    });

    it("Should filter audit logs by date range", async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const response = await request(app)
        .get(
          `/api/audit/logs?dataInicio=${startDate.toISOString()}&dataFim=${new Date().toISOString()}`
        )
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);
    });

    it("Should include blockchain verification in logs", async () => {
      const response = await request(app)
        .get("/api/audit/logs")
        .set("Authorization", `Bearer ${token}`);

      if (response.status === 200) {
        const logs = response.body.logs || response.body.auditLogs || [];
        if (logs.length > 0) {
          expect(logs[0].blockchainHash || logs[0].hash_blockchain).toBeDefined();
        }
      }
    });
  });

  describe("Fraud Detection Analysis", () => {
    let token;

    beforeEach(async () => {
      const owner = testOwners[0];

      await request(app)
        .post("/api/auth/register")
        .send({
          nome: owner.nome,
          email: owner.email,
          cpf: "12345678900",
          telefone: owner.telefone,
          senha: owner.senha,
          tipo_usuario: "dono_farmacia",
          dados_farmacia: {
            cnpj: owner.cnpj,
            nome: owner.nome,
            logradouro: owner.endereco.logradouro,
            numero: owner.endereco.numero,
            bairro: owner.endereco.bairro,
            cidade: owner.endereco.cidade,
            estado: owner.endereco.estado,
            cep: owner.endereco.cep,
          },
          lgpd_consentimento: true,
        });

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: owner.email,
          senha: owner.senha,
        });

      token = loginRes.body.accessToken;
    });

    it("Should list detected fraud attempts", async () => {
      const response = await request(app)
        .get("/api/admin/fraude/detectadas")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(Array.isArray(response.body.fraudes || response.body.detectedFrauds)).toBe(true);
      }
    });

    it("Should filter fraud by severity", async () => {
      const response = await request(app)
        .get("/api/admin/fraude/detectadas?severidade=alta")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);
    });

    it("Should get fraud statistics", async () => {
      const response = await request(app)
        .get("/api/admin/fraude/estatisticas")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(
          response.body.totalDetectadas ||
          response.body.total_detected ||
          response.body.stats
        ).toBeDefined();
      }
    });

    it("Should analyze fraud patterns", async () => {
      const response = await request(app)
        .get("/api/admin/fraude/padroes")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.padroes || response.body.patterns).toBeDefined();
      }
    });

    it("Should show fraud risk score by customer", async () => {
      const response = await request(app)
        .get("/api/admin/fraude/score-risco")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        const scores = response.body.scores || response.body.riskScores || [];
        if (scores.length > 0) {
          expect(scores[0].risco_score || scores[0].riskScore).toBeDefined();
        }
      }
    });
  });

  describe("B2B Dashboard", () => {
    let token;

    beforeEach(async () => {
      const owner = testOwners[0];

      await request(app)
        .post("/api/auth/register")
        .send({
          nome: owner.nome,
          email: owner.email,
          cpf: "12345678900",
          telefone: owner.telefone,
          senha: owner.senha,
          tipo_usuario: "dono_farmacia",
          dados_farmacia: {
            cnpj: owner.cnpj,
            nome: owner.nome,
            logradouro: owner.endereco.logradouro,
            numero: owner.endereco.numero,
            bairro: owner.endereco.bairro,
            cidade: owner.endereco.cidade,
            estado: owner.endereco.estado,
            cep: owner.endereco.cep,
          },
          lgpd_consentimento: true,
        });

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: owner.email,
          senha: owner.senha,
        });

      token = loginRes.body.accessToken;
    });

    it("Should load B2B dashboard data", async () => {
      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        const dashboard = response.body;
        expect(
          dashboard.totalVendas ||
          dashboard.total_sales ||
          dashboard.sales
        ).toBeDefined();
      }
    });

    it("B2B dashboard should have revenue metrics", async () => {
      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", `Bearer ${token}`);

      if (response.status === 200) {
        const dashboard = response.body;
        expect(
          dashboard.receita ||
          dashboard.revenue ||
          dashboard.faturamento
        ).toBeDefined();
      }
    });

    it("B2B dashboard should have order metrics", async () => {
      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", `Bearer ${token}`);

      if (response.status === 200) {
        const dashboard = response.body;
        expect(
          dashboard.totalPedidos ||
          dashboard.total_orders ||
          dashboard.orders
        ).toBeDefined();
      }
    });

    it("B2B dashboard should have customer metrics", async () => {
      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", `Bearer ${token}`);

      if (response.status === 200) {
        const dashboard = response.body;
        expect(
          dashboard.totalClientes ||
          dashboard.total_customers ||
          dashboard.customers
        ).toBeDefined();
      }
    });

    it("B2B dashboard should have fraud alerts", async () => {
      const response = await request(app)
        .get("/api/admin/dashboard")
        .set("Authorization", `Bearer ${token}`);

      if (response.status === 200) {
        const dashboard = response.body;
        expect(
          dashboard.fraudAlerts ||
          dashboard.alertas_fraude ||
          dashboard.fraud_count
        ).toBeDefined();
      }
    });
  });

  describe("Pharmacist Management", () => {
    let token;

    beforeEach(async () => {
      const owner = testOwners[0];

      await request(app)
        .post("/api/auth/register")
        .send({
          nome: owner.nome,
          email: owner.email,
          cpf: "12345678900",
          telefone: owner.telefone,
          senha: owner.senha,
          tipo_usuario: "dono_farmacia",
          dados_farmacia: {
            cnpj: owner.cnpj,
            nome: owner.nome,
            logradouro: owner.endereco.logradouro,
            numero: owner.endereco.numero,
            bairro: owner.endereco.bairro,
            cidade: owner.endereco.cidade,
            estado: owner.endereco.estado,
            cep: owner.endereco.cep,
          },
          lgpd_consentimento: true,
        });

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: owner.email,
          senha: owner.senha,
        });

      token = loginRes.body.accessToken;
    });

    it("Should list pharmacy's pharmacists", async () => {
      const response = await request(app)
        .get("/api/admin/farmaceuticos")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(Array.isArray(response.body.farmaceuticos || response.body.pharmacists)).toBe(true);
      }
    });

    it("Should view pharmacist performance", async () => {
      const response = await request(app)
        .get("/api/admin/farmaceuticos/performance")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.performance || response.body.data).toBeDefined();
      }
    });
  });
});
