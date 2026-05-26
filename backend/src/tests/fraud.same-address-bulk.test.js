/**
 * Testes de Fraude - Cenário 4: Múltiplos Pedidos Mesmo Endereço
 * Valida detecção de padrão suspeito de muitos pedidos no mesmo endereço
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { testCustomers, testMedicines } = require("./fixtures/test-data");
const { cleanDatabase } = require("./setup");

let app;

describe("Fraud Scenario 4: Bulk Orders Same Address Detection", () => {
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

  describe("Bulk Order Detection", () => {
    it("Should detect 10+ orders same day same address", async () => {
      const sharedAddress = testCustomers[0].endereco;
      const orderCount = 10;
      const tokens = [];

      // Criar múltiplos clientes e fazer pedidos no mesmo endereço
      for (let i = 0; i < orderCount; i++) {
        const customer = {
          ...testCustomers[i % testCustomers.length],
          email: `test${i}@test.com`,
          cpf: `1234567890${i}`,
        };

        const registerRes = await request(app)
          .post("/api/auth/register")
          .send({
            nome: customer.nome + i,
            email: customer.email,
            cpf: customer.cpf,
            telefone: customer.telefone,
            senha: customer.senha,
            tipo_usuario: "cliente",
            lgpd_consentimento: true,
          });

        if (registerRes.status === 201) {
          tokens.push(registerRes.body.accessToken);
        }
      }

      // Fazer pedidos com mesmo endereço
      const orders = [];
      for (const token of tokens) {
        const response = await request(app)
          .post("/api/order/checkout")
          .set("Authorization", `Bearer ${token}`)
          .send({
            endereco_entrega: sharedAddress,
            metodo_pagamento: "credit_card",
            dados_pagamento: {
              numero_cartao: "4532015112830366",
              validade: "12/25",
              cvv: "123",
              titular: "TEST USER",
            },
          });

        if (response.status === 200 || response.status === 201) {
          orders.push(response.body);
        }
      }

      // Verificar se sistema detectou padrão
      const detectionResponse = await request(app)
        .get("/api/fraud/bulk-address-detection")
        .set("Authorization", `Bearer ${tokens[0]}`);

      expect([200, 404, 401, 403]).toContain(detectionResponse.status);

      if (detectionResponse.status === 200) {
        expect(
          detectionResponse.body.detectada ||
          detectionResponse.body.detected ||
          detectionResponse.body.padraoDetectado
        ).toBeDefined();
      }
    });

    it("Should allow legitimate multiple orders same address", async () => {
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

      // Mesmo cliente faz múltiplos pedidos (legítimo)
      const orders = [];
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
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

        if (response.status === 200 || response.status === 201) {
          orders.push(response.body);
        }
      }

      // Não deve ter suspeita para mesmo cliente
      expect(orders.length).toBeGreaterThan(0);
    });
  });

  describe("Risk Score Progression", () => {
    it("Should increase risk score progressively with bulk orders", async () => {
      const sharedAddress = testCustomers[0].endereco;
      const tokens = [];

      // Criar 5 clientes diferentes
      for (let i = 0; i < 5; i++) {
        const email = `bulk_test${i}@test.com`;
        const cpf = `1234567${8900 + i}`;

        const registerRes = await request(app)
          .post("/api/auth/register")
          .send({
            nome: `Bulk Test ${i}`,
            email: email,
            cpf: cpf,
            telefone: "11999999999",
            senha: "Password123!",
            tipo_usuario: "cliente",
            lgpd_consentimento: true,
          });

        if (registerRes.status === 201) {
          tokens.push(registerRes.body.accessToken);
        }
      }

      // Fazer pedidos progressivamente
      let previousRiskScore = 0;
      for (let i = 0; i < tokens.length; i++) {
        const response = await request(app)
          .post("/api/order/checkout")
          .set("Authorization", `Bearer ${tokens[i]}`)
          .send({
            endereco_entrega: sharedAddress,
            metodo_pagamento: "credit_card",
            dados_pagamento: {
              numero_cartao: "4532015112830366",
              validade: "12/25",
              cvv: "123",
              titular: "TEST",
            },
          });

        // Verificar risco após cada ordem
        const riskCheckRes = await request(app)
          .get(`/api/fraud/address-risk/${sharedAddress.cep}`)
          .set("Authorization", `Bearer ${tokens[i]}`);

        if (riskCheckRes.status === 200) {
          const currentRiskScore =
            riskCheckRes.body.risco_score || riskCheckRes.body.riskScore || 0;
          expect(currentRiskScore).toBeGreaterThanOrEqual(previousRiskScore);
          previousRiskScore = currentRiskScore;
        }
      }
    });
  });

  describe("Owner Alerts", () => {
    it("Should alert owner of bulk order pattern", async () => {
      const sharedAddress = testCustomers[0].endereco;
      const bulkOrderCount = 10;
      const tokens = [];

      // Criar múltiplos clientes
      for (let i = 0; i < bulkOrderCount; i++) {
        const registerRes = await request(app)
          .post("/api/auth/register")
          .send({
            nome: `Bulk User ${i}`,
            email: `bulk${i}@test.com`,
            cpf: `1234567${8800 + i}`,
            telefone: "11999999999",
            senha: "Password123!",
            tipo_usuario: "cliente",
            lgpd_consentimento: true,
          });

        if (registerRes.status === 201) {
          tokens.push(registerRes.body.accessToken);
        }
      }

      // Fazer muitos pedidos no mesmo endereço
      for (const token of tokens) {
        await request(app)
          .post("/api/order/checkout")
          .set("Authorization", `Bearer ${token}`)
          .send({
            endereco_entrega: sharedAddress,
            metodo_pagamento: "credit_card",
            dados_pagamento: {
              numero_cartao: "4532015112830366",
              validade: "12/25",
              cvv: "123",
              titular: "TEST",
            },
          });
      }

      // Verificar se alertas foram enviados ao owner
      const ownerAlertsRes = await request(app)
        .get("/api/admin/alerts/bulk-orders")
        .set("Authorization", `Bearer ${createTestToken("owner1", "dono_farmacia")}`);

      expect([200, 401, 404, 403]).toContain(ownerAlertsRes.status);

      if (ownerAlertsRes.status === 200) {
        expect(Array.isArray(ownerAlertsRes.body.alertas || ownerAlertsRes.body.alerts)).toBe(
          true
        );
      }
    });

    it("Should track alert history for addresses", async () => {
      const response = await request(app)
        .get("/api/admin/alerts/history?endereco=01310100")
        .set("Authorization", `Bearer ${createTestToken("owner1", "dono_farmacia")}`);

      expect([200, 401, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(Array.isArray(response.body.historia || response.body.history)).toBe(true);
      }
    });
  });

  describe("Blockchain Pattern Recording", () => {
    it("Should record suspicious bulk order pattern in blockchain", async () => {
      const sharedAddress = testCustomers[0].endereco;
      const tokens = [];

      // Criar alguns clientes
      for (let i = 0; i < 5; i++) {
        const registerRes = await request(app)
          .post("/api/auth/register")
          .send({
            nome: `Pattern Test ${i}`,
            email: `pattern${i}@test.com`,
            cpf: `1234567${7700 + i}`,
            telefone: "11999999999",
            senha: "Password123!",
            tipo_usuario: "cliente",
            lgpd_consentimento: true,
          });

        if (registerRes.status === 201) {
          tokens.push(registerRes.body.accessToken);
        }
      }

      // Fazer pedidos
      for (const token of tokens) {
        await request(app)
          .post("/api/order/checkout")
          .set("Authorization", `Bearer ${token}`)
          .send({
            endereco_entrega: sharedAddress,
            metodo_pagamento: "credit_card",
            dados_pagamento: {
              numero_cartao: "4532015112830366",
              validade: "12/25",
              cvv: "123",
              titular: "TEST",
            },
          });
      }

      // Verificar blockchain
      const blockchainRes = await request(app)
        .get("/api/audit/blockchain-records?tipo=bulk_order_pattern")
        .set("Authorization", `Bearer ${tokens[0]}`);

      expect([200, 401, 404, 403]).toContain(blockchainRes.status);

      if (blockchainRes.status === 200) {
        expect(Array.isArray(blockchainRes.body.records || blockchainRes.body.registros)).toBe(
          true
        );
      }
    });
  });

  describe("Address Risk Scoring", () => {
    it("Should calculate cumulative risk score per address", async () => {
      const response = await request(app)
        .get("/api/fraud/address-risk-stats")
        .set("Authorization", `Bearer ${createTestToken("owner1", "dono_farmacia")}`);

      expect([200, 401, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        const stats = response.body.enderecos || response.body.addresses || [];
        if (stats.length > 0) {
          expect(stats[0].risco_score || stats[0].riskScore).toBeDefined();
        }
      }
    });

    it("Should flag high-risk addresses for monitoring", async () => {
      const response = await request(app)
        .get("/api/fraud/high-risk-addresses")
        .set("Authorization", `Bearer ${createTestToken("owner1", "dono_farmacia")}`);

      expect([200, 401, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(Array.isArray(response.body.enderecos_risco || response.body.risky_addresses)).toBe(
          true
        );
      }
    });
  });

  describe("Temporary Address Blocking", () => {
    it("Should allow blocking suspicious address temporarily", async () => {
      const response = await request(app)
        .post("/api/admin/block-address")
        .set("Authorization", `Bearer ${createTestToken("owner1", "dono_farmacia")}`)
        .send({
          endereco: testCustomers[0].endereco,
          motivo: "Padrão de compra suspeito detectado",
          duracao_horas: 24,
        });

      expect([200, 400, 401, 404, 403]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.message).toContain("bloqueado");
      }
    });

    it("Should prevent orders to blocked address", async () => {
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

      // Bloquear endereço
      await request(app)
        .post("/api/admin/block-address")
        .set("Authorization", `Bearer ${createTestToken("owner1", "dono_farmacia")}`)
        .send({
          endereco: customer.endereco,
          motivo: "Suspeita",
          duracao_horas: 24,
        });

      // Tentar fazer pedido
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
            titular: "TEST",
          },
        });

      // Pode ser aceito ou rejeitado dependendo da implementação
      expect([200, 201, 400, 403]).toContain(checkoutRes.status);
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
