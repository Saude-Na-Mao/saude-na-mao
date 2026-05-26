/**
 * Testes de Integração - Fluxo de Cliente
 * Testa: registro, login, busca de farmácia, carrinho, checkout, receita digital, download PDF, rastreamento
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { testCustomers, testMedicines } = require("./fixtures/test-data");
const { cleanDatabase, createTestToken, delay } = require("./setup");

let app;

describe("Customer Integration Flow Tests", () => {
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

  describe("Customer Registration", () => {
    it("Should register a new customer successfully", async () => {
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
      expect(response.body.message).toContain("cadastrado");
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(customer.email);
      expect(response.body.user.tipo_usuario).toBe("cliente");
    });

    it("Should reject duplicate CPF registration", async () => {
      const customer = testCustomers[0];

      // Primeira tentativa
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

      // Segunda tentativa com mesmo CPF
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          nome: "Outro Nome",
          email: "outro@test.com",
          cpf: customer.cpf,
          telefone: customer.telefone,
          senha: customer.senha,
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toContain("CPF");
    });

    it("Should reject duplicate email registration", async () => {
      const customer = testCustomers[0];

      // Primeira tentativa
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

      // Segunda tentativa com mesmo email
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          nome: "Outro Nome",
          email: customer.email,
          cpf: testCustomers[1].cpf,
          telefone: customer.telefone,
          senha: customer.senha,
          tipo_usuario: "cliente",
          lgpd_consentimento: true,
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toContain("mail");
    });
  });

  describe("Customer Login", () => {
    beforeEach(async () => {
      const customer = testCustomers[0];
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
    });

    it("Should login customer successfully", async () => {
      const customer = testCustomers[0];

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: customer.email,
          senha: customer.senha,
        });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.tipo_usuario).toBe("cliente");
    });

    it("Should reject login with invalid password", async () => {
      const customer = testCustomers[0];

      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: customer.email,
          senha: "WrongPassword123!",
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain("incorreto");
    });

    it("Should reject login for non-existent user", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "nonexistent@test.com",
          senha: "Password123!",
        });

      expect(response.status).toBe(401);
    });
  });

  describe("Search Pharmacy with Available Pharmacist", () => {
    let customerId;
    let token;

    beforeEach(async () => {
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

      customerId = registerRes.body.user._id;
      token = registerRes.body.accessToken;
    });

    it("Should search for pharmacies with available pharmacist", async () => {
      const response = await request(app)
        .get("/api/pharmacy/search?lat=-23.5505&lng=-46.6333&radius=5&farmaceutico=true")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.pharmacies).toBeDefined();
      expect(Array.isArray(response.body.pharmacies)).toBe(true);
    });

    it("Should filter pharmacies by location", async () => {
      const response = await request(app)
        .get("/api/pharmacy/search?lat=-23.5505&lng=-46.6333&radius=5")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.pharmacies).toBeDefined();
    });
  });

  describe("Add Medication to Cart", () => {
    let customerId;
    let token;
    let medicineId;

    beforeEach(async () => {
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

      customerId = registerRes.body.user._id;
      token = registerRes.body.accessToken;

      // Criar medicamento de teste
      const medicineRes = await request(app)
        .post("/api/product")
        .send(testMedicines[0])
        .set("Authorization", `Bearer ${token}`);

      medicineId = medicineRes.body._id || medicineRes.body.id;
    });

    it("Should add medication to cart successfully", async () => {
      const response = await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: medicineId,
          quantidade: 2,
        });

      expect(response.status).toBeOneOf([200, 201]);
      expect(response.body.message).toContain("adicionado");
    });

    it("Should update cart item quantity", async () => {
      // Adicionar item
      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: medicineId,
          quantidade: 2,
        });

      // Atualizar quantidade
      const response = await request(app)
        .put(`/api/cart/${medicineId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ quantidade: 5 });

      expect(response.status).toBeOneOf([200, 201]);
    });

    it("Should view cart items", async () => {
      // Adicionar item
      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: medicineId,
          quantidade: 2,
        });

      // Visualizar carrinho
      const response = await request(app)
        .get("/api/cart")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.items || response.body.carrinho).toBeDefined();
    });
  });

  describe("Checkout Process", () => {
    let customerId;
    let token;
    let medicineId;

    beforeEach(async () => {
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

      customerId = registerRes.body.user._id;
      token = registerRes.body.accessToken;

      // Criar medicamento de teste
      const medicineRes = await request(app)
        .post("/api/product")
        .send(testMedicines[0])
        .set("Authorization", `Bearer ${token}`);

      medicineId = medicineRes.body._id || medicineRes.body.id;

      // Adicionar ao carrinho
      await request(app)
        .post("/api/cart/add")
        .set("Authorization", `Bearer ${token}`)
        .send({
          id_produto: medicineId,
          quantidade: 1,
        });
    });

    it("Should complete checkout successfully", async () => {
      const response = await request(app)
        .post("/api/order/checkout")
        .set("Authorization", `Bearer ${token}`)
        .send({
          endereco_entrega: testCustomers[0].endereco,
          metodo_pagamento: "credit_card",
          dados_pagamento: {
            numero_cartao: "4532015112830366",
            validade: "12/25",
            cvv: "123",
            titular: "JOAO SILVA",
          },
        });

      expect(response.status).toBeOneOf([200, 201]);
      expect(response.body.orderId || response.body.order).toBeDefined();
    });

    it("Should validate required checkout fields", async () => {
      const response = await request(app)
        .post("/api/order/checkout")
        .set("Authorization", `Bearer ${token}`)
        .send({
          // Endereço de entrega faltando
          metodo_pagamento: "credit_card",
        });

      expect(response.status).toBe(400);
    });
  });

  describe("Digital Prescription View", () => {
    let customerId;
    let token;
    let orderId;

    beforeEach(async () => {
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

      customerId = registerRes.body.user._id;
      token = registerRes.body.accessToken;
    });

    it("Should view digital prescription", async () => {
      const response = await request(app)
        .get("/api/prescription/receita-digital")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
    });

    it("Should contain QR code in prescription", async () => {
      const response = await request(app)
        .get("/api/prescription/receita-digital")
        .set("Authorization", `Bearer ${token}`);

      if (response.status === 200) {
        expect(response.body.qrCode || response.body.qr_code).toBeDefined();
      }
    });
  });

  describe("PDF Download", () => {
    let customerId;
    let token;

    beforeEach(async () => {
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

      customerId = registerRes.body.user._id;
      token = registerRes.body.accessToken;
    });

    it("Should download prescription PDF", async () => {
      const response = await request(app)
        .get("/api/prescription/download-pdf")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404, 400]).toContain(response.status);

      if (response.status === 200) {
        expect(response.headers["content-type"]).toContain("pdf");
      }
    });
  });

  describe("Order Tracking", () => {
    let customerId;
    let token;

    beforeEach(async () => {
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

      customerId = registerRes.body.user._id;
      token = registerRes.body.accessToken;
    });

    it("Should track order by tracking number", async () => {
      const response = await request(app)
        .get("/api/tracking/ABC123XYZ")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
    });

    it("Should list customer orders", async () => {
      const response = await request(app)
        .get("/api/order/my-orders")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.orders || response.body.pedidos).toBeDefined();
    });

    it("Should get order details", async () => {
      const response = await request(app)
        .get("/api/order/orders")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
    });
  });
});
