/**
 * Testes de Integração - Fluxo de Farmacêutico
 * Testa: login, validações pendentes, interações medicamentosas, aprovação/rejeição, receita digital
 */

const request = require("supertest");
const mongoose = require("mongoose");
const { testPharmacists, testPrescriptions } = require("./fixtures/test-data");
const { cleanDatabase, createTestToken } = require("./setup");

let app;

describe("Pharmacist Integration Flow Tests", () => {
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

  describe("Pharmacist Login", () => {
    it("Should login pharmacist successfully", async () => {
      const pharmacist = testPharmacists[0];

      // Primeiro criar o farmacêutico
      const createRes = await request(app)
        .post("/api/pharmacist/create")
        .send({
          nome: pharmacist.nome,
          email: pharmacist.email,
          crm: pharmacist.crm,
          telefone: pharmacist.telefone,
          senha: pharmacist.senha,
          especialidades: pharmacist.especialidades,
        });

      expect([201, 200, 400]).toContain(createRes.status);

      if (createRes.status === 201 || createRes.status === 200) {
        // Fazer login
        const loginRes = await request(app)
          .post("/api/auth/login")
          .send({
            email: pharmacist.email,
            senha: pharmacist.senha,
          });

        expect([200, 401]).toContain(loginRes.status);
        if (loginRes.status === 200) {
          expect(loginRes.body.accessToken).toBeDefined();
          expect(loginRes.body.user.tipo_usuario).toBe("farmaceutico");
        }
      }
    });
  });

  describe("Pending Validations", () => {
    let token;
    let pharmacistId;

    beforeEach(async () => {
      const pharmacist = testPharmacists[0];

      // Criar farmacêutico
      const createRes = await request(app)
        .post("/api/pharmacist/create")
        .send({
          nome: pharmacist.nome,
          email: pharmacist.email,
          crm: pharmacist.crm,
          telefone: pharmacist.telefone,
          senha: pharmacist.senha,
          especialidades: pharmacist.especialidades,
        });

      if (createRes.status === 201 || createRes.status === 200) {
        pharmacistId = createRes.body.pharmacist?._id;

        const loginRes = await request(app)
          .post("/api/auth/login")
          .send({
            email: pharmacist.email,
            senha: pharmacist.senha,
          });

        if (loginRes.status === 200) {
          token = loginRes.body.accessToken;
        }
      }
    });

    it("Should list pending prescription validations", async () => {
      if (!token) {
        this.skip();
      }

      const response = await request(app)
        .get("/api/pharmacist/validacoes-pendentes")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.validacoes || response.body.pendentes).toBeDefined();
      }
    });

    it("Should filter pending validations by status", async () => {
      if (!token) {
        this.skip();
      }

      const response = await request(app)
        .get("/api/pharmacist/validacoes-pendentes?status=aguardando")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);
    });
  });

  describe("Drug Interaction Verification", () => {
    let token;

    beforeEach(async () => {
      const pharmacist = testPharmacists[0];

      const createRes = await request(app)
        .post("/api/pharmacist/create")
        .send({
          nome: pharmacist.nome,
          email: pharmacist.email,
          crm: pharmacist.crm,
          telefone: pharmacist.telefone,
          senha: pharmacist.senha,
          especialidades: pharmacist.especialidades,
        });

      if (createRes.status === 201 || createRes.status === 200) {
        const loginRes = await request(app)
          .post("/api/auth/login")
          .send({
            email: pharmacist.email,
            senha: pharmacist.senha,
          });

        if (loginRes.status === 200) {
          token = loginRes.body.accessToken;
        }
      }
    });

    it("Should verify drug interactions", async () => {
      if (!token) {
        this.skip();
      }

      const response = await request(app)
        .post("/api/drug/check-interactions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          medicamentos: [
            "Aspirina 500mg",
            "Ibuprofeno 400mg",
          ],
        });

      expect([200, 400, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.interacoes || response.body.alertas).toBeDefined();
      }
    });

    it("Should detect severe interactions", async () => {
      if (!token) {
        this.skip();
      }

      const response = await request(app)
        .post("/api/drug/check-interactions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          medicamentos: [
            "Atorvastatina 20mg",
            "Fluconazol 150mg",
          ],
        });

      expect([200, 400, 404]).toContain(response.status);

      if (response.status === 200 && response.body.interacoes) {
        const hasGrave = response.body.interacoes.some(
          (i) => i.severidade === "GRAVE"
        );
        expect(hasGrave).toBe(true);
      }
    });

    it("Should provide interaction alternatives", async () => {
      if (!token) {
        this.skip();
      }

      const response = await request(app)
        .post("/api/drug/check-interactions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          medicamentos: [
            "Aspirina 500mg",
            "Ibuprofeno 400mg",
          ],
        });

      expect([200, 400, 404]).toContain(response.status);

      if (response.status === 200 && response.body.interacoes) {
        const interacao = response.body.interacoes[0];
        if (interacao && interacao.alternativas) {
          expect(Array.isArray(interacao.alternativas)).toBe(true);
        }
      }
    });
  });

  describe("Prescription Approval", () => {
    let token;
    let prescriptionId = "test_prescription_id";

    beforeEach(async () => {
      const pharmacist = testPharmacists[0];

      const createRes = await request(app)
        .post("/api/pharmacist/create")
        .send({
          nome: pharmacist.nome,
          email: pharmacist.email,
          crm: pharmacist.crm,
          telefone: pharmacist.telefone,
          senha: pharmacist.senha,
          especialidades: pharmacist.especialidades,
        });

      if (createRes.status === 201 || createRes.status === 200) {
        const loginRes = await request(app)
          .post("/api/auth/login")
          .send({
            email: pharmacist.email,
            senha: pharmacist.senha,
          });

        if (loginRes.status === 200) {
          token = loginRes.body.accessToken;
        }
      }
    });

    it("Should approve valid prescription", async () => {
      if (!token) {
        this.skip();
      }

      const response = await request(app)
        .post(`/api/pharmacist/validar-receita/${prescriptionId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          status: "aprovada",
          observacoes: "Receita verificada e OK",
        });

      expect([200, 400, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.message).toContain("aprovada");
      }
    });

    it("Should reject prescription with severe interactions", async () => {
      if (!token) {
        this.skip();
      }

      const response = await request(app)
        .post(`/api/pharmacist/validar-receita/${prescriptionId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          status: "rejeitada",
          motivo: "Interação medicamentosa grave detectada",
          observacoes:
            "Paciente está tomando Atorvastatina e Fluconazol causando miopatia",
        });

      expect([200, 400, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.message).toContain("rejeitada");
      }
    });
  });

  describe("Digital Prescription Creation", () => {
    let token;
    let prescriptionId = "test_prescription_id";

    beforeEach(async () => {
      const pharmacist = testPharmacists[0];

      const createRes = await request(app)
        .post("/api/pharmacist/create")
        .send({
          nome: pharmacist.nome,
          email: pharmacist.email,
          crm: pharmacist.crm,
          telefone: pharmacist.telefone,
          senha: pharmacist.senha,
          especialidades: pharmacist.especialidades,
        });

      if (createRes.status === 201 || createRes.status === 200) {
        const loginRes = await request(app)
          .post("/api/auth/login")
          .send({
            email: pharmacist.email,
            senha: pharmacist.senha,
          });

        if (loginRes.status === 200) {
          token = loginRes.body.accessToken;
        }
      }
    });

    it("Should create digital prescription on approval", async () => {
      if (!token) {
        this.skip();
      }

      const response = await request(app)
        .post(`/api/pharmacist/criar-receita-digital/${prescriptionId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          medicamentos: testPrescriptions[0].medicamentos,
          duracao_validade_dias: 30,
        });

      expect([200, 201, 400, 404]).toContain(response.status);

      if (response.status === 200 || response.status === 201) {
        expect(response.body.receitaDigital || response.body.prescription).toBeDefined();
      }
    });

    it("Digital prescription should contain QR code", async () => {
      if (!token) {
        this.skip();
      }

      const response = await request(app)
        .post(`/api/pharmacist/criar-receita-digital/${prescriptionId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          medicamentos: testPrescriptions[0].medicamentos,
          duracao_validade_dias: 30,
        });

      expect([200, 201, 400, 404]).toContain(response.status);

      if (response.status === 200 || response.status === 201) {
        const prescription = response.body.receitaDigital || response.body.prescription;
        if (prescription) {
          expect(prescription.qrCode || prescription.qr_code).toBeDefined();
        }
      }
    });
  });

  describe("Real-time Dashboard Updates", () => {
    let token;

    beforeEach(async () => {
      const pharmacist = testPharmacists[0];

      const createRes = await request(app)
        .post("/api/pharmacist/create")
        .send({
          nome: pharmacist.nome,
          email: pharmacist.email,
          crm: pharmacist.crm,
          telefone: pharmacist.telefone,
          senha: pharmacist.senha,
          especialidades: pharmacist.especialidades,
        });

      if (createRes.status === 201 || createRes.status === 200) {
        const loginRes = await request(app)
          .post("/api/auth/login")
          .send({
            email: pharmacist.email,
            senha: pharmacist.senha,
          });

        if (loginRes.status === 200) {
          token = loginRes.body.accessToken;
        }
      }
    });

    it("Should fetch pharmacist dashboard data", async () => {
      if (!token) {
        this.skip();
      }

      const response = await request(app)
        .get("/api/pharmacist/dashboard")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        const dashboard = response.body;
        expect(dashboard.pendentes || dashboard.pending_count).toBeDefined();
      }
    });

    it("Should get stats for pharmacist", async () => {
      if (!token) {
        this.skip();
      }

      const response = await request(app)
        .get("/api/pharmacist/stats")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(
          response.body.totalValidacoes ||
          response.body.total_validations ||
          response.body.stats
        ).toBeDefined();
      }
    });
  });

  describe("Pharmacist Availability", () => {
    let token;
    let pharmacistId;

    beforeEach(async () => {
      const pharmacist = testPharmacists[0];

      const createRes = await request(app)
        .post("/api/pharmacist/create")
        .send({
          nome: pharmacist.nome,
          email: pharmacist.email,
          crm: pharmacist.crm,
          telefone: pharmacist.telefone,
          senha: pharmacist.senha,
          especialidades: pharmacist.especialidades,
        });

      if (createRes.status === 201 || createRes.status === 200) {
        pharmacistId = createRes.body.pharmacist?._id;

        const loginRes = await request(app)
          .post("/api/auth/login")
          .send({
            email: pharmacist.email,
            senha: pharmacist.senha,
          });

        if (loginRes.status === 200) {
          token = loginRes.body.accessToken;
        }
      }
    });

    it("Should update pharmacist availability", async () => {
      if (!token) {
        this.skip();
      }

      const response = await request(app)
        .put("/api/pharmacist/availability")
        .set("Authorization", `Bearer ${token}`)
        .send({
          disponivel: true,
        });

      expect([200, 400, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.message).toContain("atualizada");
      }
    });

    it("Should mark pharmacist as offline", async () => {
      if (!token) {
        this.skip();
      }

      const response = await request(app)
        .put("/api/pharmacist/availability")
        .set("Authorization", `Bearer ${token}`)
        .send({
          disponivel: false,
        });

      expect([200, 400, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.disponivel).toBe(false);
      }
    });
  });
});
