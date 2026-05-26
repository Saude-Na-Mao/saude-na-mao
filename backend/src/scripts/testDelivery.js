/**
 * Testes de integração: Delivery + Drug Interactions
 */
const http = require("http");

const BASE = "http://localhost:5000";
let passed = 0;
let failed = 0;
let token = null;
let tokenEntregador = null;
let tokenDono = null;
let pharmacyId = null;
let orderId = null;
let deliveryId = null;
const ts = Date.now();
// CPFs únicos por execução
const cpf1 = String(ts).slice(-11).padStart(11, "1");
const cpf2 = String(ts + 1).slice(-11).padStart(11, "2");
const cnpj = String(ts).slice(-14).padStart(14, "9");
const cpf3 = String(ts + 2).slice(-11).padStart(11, "3");

function request(method, path, body, authToken) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (authToken) headers["Authorization"] = "Bearer " + authToken;
    if (data) headers["Content-Length"] = Buffer.byteLength(data);

    const url = new URL(path, BASE);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
          catch (_) { resolve({ status: res.statusCode, body: b }); }
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(label, condition, debugData) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
    if (debugData) console.log(`     DEBUG:`, typeof debugData === "object" ? JSON.stringify(debugData).slice(0, 200) : debugData);
  }
}

async function main() {
  console.log("=== TESTE: Sistema de Entregas + Interações ===\n");

  // 1. Registrar cliente
  console.log("--- 1. Setup: Registrar usuários ---");
  const r1 = await request("POST", "/api/v1/auth/register", {
    nome: "Cliente Delivery", email: `delcli_${ts}@test.com`,
    telefone: "11999990010", cpf: cpf1, senha: "Teste@123",
    tipo_usuario: "cliente", lgpd_consentimento: true,
  });
  assert("Register cliente", r1.status === 201 && r1.body.success, r1.body);
  token = r1.body.data?.accessToken;

  // 2. Registrar entregador
  const r2 = await request("POST", "/api/v1/auth/register", {
    nome: "Entregador Teste", email: `delent_${ts}@test.com`,
    telefone: "11999990011", cpf: cpf2, senha: "Teste@123",
    tipo_usuario: "entregador",
    dados_entregador: { tipo_veiculo: "moto", cnh: "99988877766" },
    lgpd_consentimento: true,
  });
  assert("Register entregador", r2.status === 201 && r2.body.success, r2.body);
  tokenEntregador = r2.body.data?.accessToken;

  // 3. Registrar dono_farmacia
  const r3 = await request("POST", "/api/v1/auth/register", {
    nome: "Dono Delivery", email: `deldono_${ts}@test.com`,
    telefone: "11999990012", cpf: cpf3, senha: "Teste@123",
    tipo_usuario: "dono_farmacia",
    dados_farmacia: {
      cnpj: cnpj, nome: "Farmácia Delivery Test",
      logradouro: "Av Paulista", numero: "1000", bairro: "Bela Vista",
      cidade: "São Paulo", estado: "SP", cep: "01310100",
    },
    lgpd_consentimento: true,
  });
  assert("Register dono_farmacia", r3.status === 201 && r3.body.success, r3.body);
  tokenDono = r3.body.data?.accessToken;
  pharmacyId = r3.body.data?.user?.dados_dono_farmacia?.id_farmacia;
  assert("Pharmacy ID obtido", !!pharmacyId);

  // 4. Criar um pedido (como cliente)
  console.log("\n--- 2. Criar pedido ---");
  const r4 = await request("POST", "/api/v1/orders", {
    itens: [{ nome_produto: "Paracetamol 500mg", preco_unitario: 12.50, quantidade: 2, subtotal: 25 }],
    id_farmacia: pharmacyId,
    tipo_entrega: "moto",
    endereco_entrega: { logradouro: "Rua Teste", numero: "100", bairro: "Centro", cidade: "São Paulo", estado: "SP", cep: "01001000" },
    subtotal: 25,
    taxa_entrega: 8,
    total: 33,
    metodo_pagamento: "pix",
  }, token);
  assert("Criar pedido", r4.status === 201 && r4.body.success, r4.body);
  orderId = r4.body.data?.pedido?._id;
  assert("Order ID obtido", !!orderId);

  const r4a = await request(
    "POST",
    `/api/v1/orders/${orderId}/pharmacist-approve`,
    { pharmacyId, observacao: "Aprovado para teste" },
    tokenDono,
  );
  assert("Aprovar pedido (farmácia)", r4a.status === 200 && r4a.body.success, r4a.body);

  const r4pay = await request(
    "POST",
    `/api/v1/pagamentos/order/${orderId}/test-confirm`,
    {},
    token,
  );
  assert("Pagamento teste (cliente)", r4pay.status === 200 && r4pay.body.success, r4pay.body);
  assert(
    "Pedido em_processamento (pronto para criar entrega)",
    r4pay.body.data?.pedido?.status === "em_processamento",
    r4pay.body,
  );

  // 5. Criar entrega (como dono_farmacia)
  console.log("\n--- 3. Sistema de Entregas ---");
  const r5 = await request("POST", "/api/v1/deliveries", {
    orderId,
    pharmacyId,
  }, tokenDono);
  assert("Criar entrega", r5.status === 201 && r5.body.success, r5.body);
  deliveryId = r5.body.data?.entrega?._id;
  assert("Delivery ID obtido", !!deliveryId);

  // 6. Listar entregas disponíveis (como entregador)
  const r6 = await request("GET", "/api/v1/deliveries/available", null, tokenEntregador);
  assert("Listar disponíveis", r6.status === 200 && r6.body.success);
  assert("Tem entregas disponíveis", r6.body.data?.entregas?.length > 0);

  // 7. Aceitar entrega (como entregador)
  const r7 = await request("POST", `/api/v1/deliveries/${deliveryId}/accept`, {}, tokenEntregador);
  assert("Aceitar entrega", r7.status === 200 && r7.body.success);
  assert("Status aceita", r7.body.data?.entrega?.status === "aceita");

  const r7b = await request("GET", `/api/v1/orders/${orderId}`, null, token);
  assert(
    "Pedido confirmado após aceite do entregador",
    r7b.status === 200 && r7b.body.data?.pedido?.status === "confirmado",
    r7b.body,
  );

  // 8. Tentar aceitar de novo (deve falhar)
  const r8 = await request("POST", `/api/v1/deliveries/${deliveryId}/accept`, {}, tokenEntregador);
  assert("Rejeita dupla aceitação", r8.status === 400);

  // 9. Atualizar status para coletando
  const r9 = await request("PATCH", `/api/v1/deliveries/${deliveryId}/status`, {
    novoStatus: "coletando", observacao: "Indo para a farmácia",
  }, tokenEntregador);
  assert("Status coletando", r9.status === 200 && r9.body.data?.entrega?.status === "coletando");

  // 10. Atualizar localização
  const r10 = await request("PATCH", `/api/v1/deliveries/${deliveryId}/location`, {
    latitude: -23.5505, longitude: -46.6333,
  }, tokenEntregador);
  assert("Atualizar localização", r10.status === 200 && r10.body.success);

  // 11. Status coletada → em_transito
  const r11a = await request("PATCH", `/api/v1/deliveries/${deliveryId}/status`, {
    novoStatus: "coletada", observacao: "Retirou na farmácia",
  }, tokenEntregador);
  assert("Status coletada", r11a.status === 200 && r11a.body.data?.entrega?.status === "coletada");

  const r11b = await request("PATCH", `/api/v1/deliveries/${deliveryId}/status`, {
    novoStatus: "em_transito", observacao: "A caminho do cliente",
  }, tokenEntregador);
  assert("Status em_transito", r11b.status === 200 && r11b.body.data?.entrega?.status === "em_transito");

  // 12. Confirmar com código errado
  const r12a = await request("POST", `/api/v1/deliveries/${deliveryId}/confirm`, {
    codigo: "000000",
  }, tokenEntregador);
  assert("Código errado rejeitado", r12a.status === 400);

  // 13. Ver detalhes da entrega (como cliente)
  const r13 = await request("GET", `/api/v1/deliveries/${deliveryId}`, null, token);
  assert("Cliente vê entrega", r13.status === 200 && r13.body.success);
  const codigoCorreto = r13.body.data?.entrega?.codigo_confirmacao;

  // 14. Confirmar com código correto (OTC: pedido sem receita → entrega entregue direto)
  if (codigoCorreto) {
    const r14 = await request("POST", `/api/v1/deliveries/${deliveryId}/confirm`, {
      codigo: codigoCorreto,
    }, tokenEntregador);
    assert(
      "Confirmar entrega (sem receita no pedido)",
      r14.status === 200 &&
        r14.body.data?.entrega?.status === "entregue" &&
        r14.body.data?.aguardando_confirmacao_farmacia === false,
    );
  } else {
    // Fallback: avançar status diretamente
    const r14 = await request("PATCH", `/api/v1/deliveries/${deliveryId}/status`, {
      novoStatus: "entregue",
    }, tokenEntregador);
    assert("Confirmar entrega (fallback)", r14.status === 200);
  }

  // 15. Avaliar entrega (cliente)
  const r15 = await request("POST", `/api/v1/deliveries/${deliveryId}/rate/client`, {
    nota: 5, comentario: "Entrega rápida!",
  }, token);
  assert("Avaliação cliente", r15.status === 200 && r15.body.success);

  // 16. Avaliar entrega (entregador)
  const r16 = await request("POST", `/api/v1/deliveries/${deliveryId}/rate/driver`, {
    nota: 4, comentario: "Local fácil de achar",
  }, tokenEntregador);
  assert("Avaliação entregador", r16.status === 200 && r16.body.success);

  // 17. Transição inválida (já entregue)
  const r17 = await request("PATCH", `/api/v1/deliveries/${deliveryId}/status`, {
    novoStatus: "em_transito",
  }, tokenEntregador);
  assert("Rejeita transição inválida", r17.status === 400);

  // === Interações Medicamentosas ===
  console.log("\n--- 4. Interações Medicamentosas ---");

  // 18. Verificar interações com princípios ativos
  const r18 = await request("POST", "/api/v1/products/check-interactions", {
    principios_ativos: ["ibuprofeno", "aspirina", "paracetamol"],
  });
  assert("Check interações", r18.status === 200 && r18.body.success);
  assert("Encontrou interações", r18.body.data?.total > 0);
  assert("Tem interação grave", r18.body.data?.tem_grave === true);

  // 19. Verificar sem interações
  const r19 = await request("POST", "/api/v1/products/check-interactions", {
    principios_ativos: ["paracetamol", "amoxicilina"],
  });
  assert("Sem interações graves", r19.status === 200 && r19.body.data?.tem_grave === false);

  // 20. Menos de 2 princípios
  const r20 = await request("POST", "/api/v1/products/check-interactions", {
    principios_ativos: ["ibuprofeno"],
  });
  assert("Mínimo 2 princípios", r20.status === 200 && r20.body.data?.interacoes?.length === 0);

  // === Minhas entregas ===
  console.log("\n--- 5. Minhas Entregas ---");
  const r21 = await request("GET", "/api/v1/deliveries/my", null, tokenEntregador);
  assert("Minhas entregas", r21.status === 200 && r21.body.data?.entregas?.length > 0);

  // === Resumo ===
  console.log(`\n========================================`);
  console.log(`  TOTAL: ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
  console.log(`========================================`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
