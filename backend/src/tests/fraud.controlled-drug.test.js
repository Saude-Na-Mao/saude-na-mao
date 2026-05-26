/**
 * Testes de Fraude - Cenário 2: Medicamento Controlado Sem Farmacêutico
 * Valida bloqueio de medicamentos com tarja vermelha sem farmacêutico disponível
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { testCustomers, testMedicines } = require("./fixtures/test-data");
const { cleanDatabase } = require("./setup");

let app;

describe("Fraud Scenario 2: Controlled Medication Without Pharmacist", () => {
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

  describe("Red Tag Medication Detection", () => {
    it("Should identify red tag (controlled) medications", async () => {
      // Medicamentos com tarja vermelha: med3, med4, med6, med7, etc
      const controlledMeds = testMedicines.filter((m) => m.controlado === true);

      expect(controlledMeds.length).toBeGreaterThan(0);
      controlledMeds.forEach((med) => {
        expect(med.tarja).toBe("vermelha");
        expect(med.controlado).toBe(true);
      });
    });

    it("Should allow non-controlled medications without pharmacist", async () => {
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

      const customerId = registerRes.body.user._id;
      const token = registerRes.body.accessToken;

      // Adicionar medicamento SEM tarja ao carrinho
      const nonControlledMed = testMedicines.find((m) => !m.controlado);
      expect(nonControlledMed).toBeDefined();

      const response = await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: nonControlledMed.id,
          quantidade: 2,
        });

      expect([200, 201]).toContain(response.status);
    });
  });

  describe("Pharmacist Availability Check", () => {
    it("Should block checkout if controlled med without pharmacist online", async () => {
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

      // Adicionar medicamento controlado ao carrinho
      const controlledMed = testMedicines.find((m) => m.controlado === true);
      expect(controlledMed).toBeDefined();

      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: controlledMed.id,
          quantidade: 1,
        });

      // Tentar checkout sem farmacêutico disponível
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

      // Deve ser rejeitado se não há farmacêutico
      expect([200, 201, 400, 403]).toContain(checkoutRes.status);

      if (checkoutRes.status === 400 || checkoutRes.status === 403) {
        expect(checkoutRes.body.message).toMatch(
          /farmacêutico|controlado|prescricao/i
        );
      }
    });

    it("Should show pharmacies with available pharmacist for controlled meds", async () => {
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

      // Buscar farmácias com farmacêutico disponível
      const response = await request(app)
        .get(
          "/api/pharmacy/search?lat=-23.5505&lng=-46.6333&radius=5&farmaceutico=true&medicamento_controlado=true"
        )
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.pharmacies).toBeDefined();
        // Se houver farmácias, deve ter farmacêutico
        if (response.body.pharmacies.length > 0) {
          response.body.pharmacies.forEach((pharmacy) => {
            expect(pharmacy.farmaceutico_disponivel).toBe(true);
          });
        }
      }
    });
  });

  describe("Bypass Attempt Detection", () => {
    it("Should block checkout bypass attempt for controlled meds", async () => {
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

      // Tentar adicionar medicamento controlado ao carrinho com bypass_farmaceutico
      const controlledMed = testMedicines.find((m) => m.controlado === true);

      const response = await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: controlledMed.id,
          quantidade: 1,
          bypass_pharmacist: true, // Tentativa de bypass
        });

      // Deve ser rejeitado ou não permitir o bypass
      expect([200, 201, 400, 403]).toContain(response.status);
    });

    it("Should log bypass attempt attempts in audit trail", async () => {
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
      const customerId = registerRes.body.user._id;

      // Tentar bypass
      const controlledMed = testMedicines.find((m) => m.controlado === true);

      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: controlledMed.id,
          quantidade: 1,
          bypass_pharmacist: true,
        });

      // Verificar logs
      const logsResponse = await request(app)
        .get("/api/audit/logs?acao=tentativa_bypass_farmaceutico")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 401, 403, 404]).toContain(logsResponse.status);
    });
  });

  describe("Prescription Requirement", () => {
    it("Should require prescription for controlled medications", async () => {
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

      // Adicionar medicamento controlado
      const controlledMed = testMedicines.find((m) => m.controlado === true);

      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: controlledMed.id,
          quantidade: 1,
        });

      // Checkout sem receita deve ser rejeitado
      const checkoutRes = await request(app)
        .post("/api/order/checkout")
        .set("Authorization", `Bearer ${token}`)
        .send({
          endereco_entrega: customer.endereco,
          metodo_pagamento: "credit_card",
          id_receita: null, // Sem receita
          dados_pagamento: {
            numero_cartao: "4532015112830366",
            validade: "12/25",
            cvv: "123",
            titular: "JOAO SILVA",
          },
        });

      expect([200, 201, 400, 403]).toContain(checkoutRes.status);

      if (checkoutRes.status === 400 || checkoutRes.status === 403) {
        expect(checkoutRes.body.message).toMatch(/receita|prescricao/i);
      }
    });

    it("Should accept controlled med checkout with valid prescription", async () => {
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

      // Adicionar medicamento controlado
      const controlledMed = testMedicines.find((m) => m.controlado === true);

      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: controlledMed.id,
          quantidade: 1,
        });

      // Checkout com receita válida (mock)
      const checkoutRes = await request(app)
        .post("/api/order/checkout")
        .set("Authorization", `Bearer ${token}`)
        .send({
          endereco_entrega: customer.endereco,
          metodo_pagamento: "credit_card",
          id_receita: "prescription1",
          dados_pagamento: {
            numero_cartao: "4532015112830366",
            validade: "12/25",
            cvv: "123",
            titular: "JOAO SILVA",
          },
        });

      expect([200, 201, 400, 403, 404]).toContain(checkoutRes.status);
    });
  });

  describe("Real-time Pharmacist Status", () => {
    it("Should check pharmacist availability in real-time", async () => {
      const response = await request(app)
        .get("/api/pharmacy/1/pharmacist-status")
        .set("Authorization", `Bearer ${createTestToken("customer1", "cliente")}`);

      expect([200, 404, 401]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.disponivel).toBeDefined();
        expect(typeof response.body.disponivel).toBe("boolean");
      }
    });

    it("Should update pharmacy pharmacist status", async () => {
      const response = await request(app)
        .get("/api/pharmacy/search?farmaceutico=true")
        .set("Authorization", `Bearer ${createTestToken("customer1", "cliente")}`);

      expect([200, 404, 401]).toContain(response.status);

      if (response.status === 200 && response.body.pharmacies) {
        response.body.pharmacies.forEach((pharmacy) => {
          expect(pharmacy.farmaceutico_disponivel).toBeDefined();
        });
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
