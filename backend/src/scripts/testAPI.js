const http = require("http");

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: "localhost",
        port: 5000,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(b) });
          } catch {
            resolve({ status: res.statusCode, body: b });
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const req = http.request(
      { hostname: "localhost", port: 5000, path, method: "GET", headers },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(b) });
          } catch {
            resolve({ status: res.statusCode, body: b });
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const ts = Date.now();
const cpf1 = String(ts).slice(-9) + "01";
const cpf2 = String(ts).slice(-9) + "02";
const cpf3 = String(ts).slice(-9) + "03";
const cpf4 = String(ts).slice(-9) + "04";
const cpf5 = String(ts).slice(-9) + "05";
let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name} — ${detail || ""}`);
    failed++;
  }
}

async function main() {
  // ===== TEST 1: Register cliente =====
  console.log("\n=== TEST 1: Register cliente ===");
  const r1 = await post("/api/v1/auth/register", {
    nome: "Test Cliente",
    email: `testcli_${ts}@test.com`,
    telefone: "11999990001",
    cpf: cpf1,
    senha: "Teste@123",
    tipo_usuario: "cliente",
    lgpd_consentimento: true,
  });
  check("Status 201", r1.status === 201, `Got ${r1.status}: ${r1.body.message || ""}`);
  check("Success true", r1.body.success === true, JSON.stringify(r1.body));
  check("Role = cliente", r1.body.data?.user?.role === "cliente", `Got role: ${r1.body.data?.user?.role}`);
  check("Has accessToken", !!r1.body.data?.accessToken, "No token");
  const clienteToken = r1.body.data?.accessToken;
  const clienteEmail = `testcli_${ts}@test.com`;

  // ===== TEST 2: Register entregador =====
  console.log("\n=== TEST 2: Register entregador ===");
  const r2 = await post("/api/v1/auth/register", {
    nome: "Test Entregador",
    email: `testent_${ts}@test.com`,
    telefone: "11999990002",
    cpf: cpf2,
    senha: "Teste@123",
    tipo_usuario: "entregador",
    dados_entregador: { tipo_veiculo: "moto", cnh: "12345678900" },
    lgpd_consentimento: true,
  });
  check("Status 201", r2.status === 201, `Got ${r2.status}: ${r2.body.message || ""}`);
  check("Role = entregador", r2.body.data?.user?.role === "entregador", `Got role: ${r2.body.data?.user?.role}`);
  check("Has dados_entregador", !!r2.body.data?.user?.dados_entregador, "Missing");
  check("tipo_veiculo = moto", r2.body.data?.user?.dados_entregador?.tipo_veiculo === "moto", `Got: ${r2.body.data?.user?.dados_entregador?.tipo_veiculo}`);

  // ===== TEST 3: Register dono_farmacia =====
  console.log("\n=== TEST 3: Register dono_farmacia ===");
  const r3 = await post("/api/v1/auth/register", {
    nome: "Test Dono",
    email: `testdono_${ts}@test.com`,
    telefone: "11999990003",
    cpf: cpf3,
    senha: "Teste@123",
    tipo_usuario: "dono_farmacia",
    dados_farmacia: {
      cnpj: "12345678000199",
      nome: "Farmacia Teste",
      logradouro: "Rua Teste",
      numero: "123",
      bairro: "Centro",
      cidade: "São Paulo",
      estado: "SP",
      cep: "01001000",
    },
    lgpd_consentimento: true,
  });
  check("Status 201", r3.status === 201, `Got ${r3.status}: ${r3.body.message || JSON.stringify(r3.body).slice(0, 200)}`);
  check("Role = dono_farmacia", r3.body.data?.user?.role === "dono_farmacia", `Got role: ${r3.body.data?.user?.role}`);
  check("Has dados_dono_farmacia", !!r3.body.data?.user?.dados_dono_farmacia, `Body: ${JSON.stringify(r3.body).slice(0, 200)}`);
  check("Has id_farmacia", !!r3.body.data?.user?.dados_dono_farmacia?.id_farmacia, "Missing");

  // ===== TEST 4: Reject farmaceutico self-register =====
  console.log("\n=== TEST 4: Reject farmaceutico self-register ===");
  const r4 = await post("/api/v1/auth/register", {
    nome: "Test Farm",
    email: `testfarm_${ts}@test.com`,
    telefone: "11999990004",
    cpf: cpf4,
    senha: "Teste@123",
    tipo_usuario: "farmaceutico",
  });
  check("Status 400", r4.status === 400, `Got ${r4.status}: ${r4.body.message || ""}`);
  check("Rejected", r4.body.success === false);

  // ===== TEST 5: Reject administrador self-register =====
  console.log("\n=== TEST 5: Reject administrador self-register ===");
  const r5 = await post("/api/v1/auth/register", {
    nome: "Test Admin",
    email: `testadm_${ts}@test.com`,
    telefone: "11999990005",
    cpf: cpf5,
    senha: "Teste@123",
    tipo_usuario: "administrador",
  });
  check("Status 400", r5.status === 400, `Got ${r5.status}: ${r5.body.message || ""}`);
  check("Rejected", r5.body.success === false);

  // ===== TEST 6: Login =====
  console.log("\n=== TEST 6: Login with cliente ===");
  const r6 = await post("/api/v1/auth/login", {
    email: clienteEmail,
    senha: "Teste@123",
  });
  check("Status 200", r6.status === 200, `Got ${r6.status}: ${r6.body.message || ""}`);
  check("Success", r6.body.success === true);
  check("Role = cliente", r6.body.data?.user?.role === "cliente", `Got role: ${r6.body.data?.user?.role}`);
  check("Has foto_perfil field", r6.body.data?.user?.hasOwnProperty("foto_perfil"), "Missing");

  // ===== TEST 7: Protected route without token =====
  console.log("\n=== TEST 7: Protected route without token ===");
  const r7 = await get("/api/v1/orders");
  check("Status 401", r7.status === 401, `Got ${r7.status}`);

  // ===== TEST 8: Protected route with token =====
  console.log("\n=== TEST 8: Protected route with token ===");
  const r8 = await get("/api/v1/orders", clienteToken);
  check("Status 200", r8.status === 200, `Got ${r8.status}: ${r8.body.message || ""}`);

  // ===== SUMMARY =====
  console.log(`\n${"=".repeat(40)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
