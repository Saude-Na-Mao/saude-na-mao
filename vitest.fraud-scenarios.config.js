/**
 * Configuração Vitest para testes de integração e fraude
 * Setup de ambiente de teste, BD separada, seed de dados, teardown automático
 */

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Globals para usar describe, it sem import
    globals: true,

    // Timeout para testes de integração (30 segundos)
    testTimeout: 30000,

    // Timeout para hooks (beforeAll, afterAll, etc)
    hookTimeout: 30000,

    // Environment Node.js
    environment: "node",

    // Setup files - executados antes de todos os testes
    setupFiles: ["./src/tests/setup.js"],

    // Coverage
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: [
        "src/services/**/*.js",
        "src/controllers/**/*.js",
        "src/models/**/*.js",
      ],
      exclude: [
        "src/tests/**",
        "src/scripts/**",
        "node_modules/**",
      ],
      // Mínimo de cobertura para passar
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
    },

    // Reporters para output dos testes
    reporters: ["default", "html", "json"],
    outputFile: {
      html: "./test-results/index.html",
      json: "./test-results/results.json",
    },

    // Pattern dos arquivos de teste
    include: [
      "src/tests/**/*.test.js",
      "tests/e2e/**/*.test.js",
    ],

    // Arquivos a ignorar
    exclude: [
      "node_modules",
      "dist",
      ".idea",
      ".git",
    ],

    // Threads para testes paralelos
    threads: true,
    maxThreads: 4,
    minThreads: 1,

    // Isolamento de testes (cada teste em processo separado)
    isolate: true,

    // Configuração de retry para testes flaky
    retry: 1,

    // Watch mode
    watch: false,

    // Bail - parar no primeiro erro
    bail: 0,

    // Dry run (apenas mostra quais testes rodariam)
    dry: false,

    // Verbose output
    reporter: "verbose",
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
