/**
 * Setup para testes de integração e fraude
 * Configura ambiente de teste e fornece helpers comuns
 */

const mongoose = require("mongoose");

// Configuração de timeout para testes
jest.setTimeout(30000);

// Mock das variáveis de ambiente
process.env.JWT_SECRET = "test_jwt_secret_key_for_testing";
process.env.JWT_REFRESH_SECRET = "test_refresh_secret_key_for_testing";
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || "mongodb://localhost:27017/ssm-test";
process.env.NODE_ENV = "test";

// Limpar console de warnings não essenciais em testes
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === "string" &&
      (args[0].includes("DeprecationWarning") ||
        args[0].includes("ExperimentalWarning"))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Helper para limpar base de dados
async function cleanDatabase() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
}

// Helper para criar token JWT para teste
function createTestToken(userId, tipoUsuario = "cliente") {
  const jwt = require("jsonwebtoken");
  return jwt.sign(
    { id: userId, tipo: tipoUsuario },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// Helper para simular delay
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exports para uso nos testes
module.exports = {
  cleanDatabase,
  createTestToken,
  delay,
};
