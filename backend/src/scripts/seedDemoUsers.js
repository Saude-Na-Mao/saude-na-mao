/**
 * Cria 3 clientes e 3 entregadores demo.
 */
const mongoose = require("mongoose");
const connectDB = require("../config/database");
const User = require("../models/User");

const CLIENTES = [
  { nome: "Cliente Ana Souza", email: "cliente.ana@saudenamao.com", cpf: "11111111111", rg: "1234567", telefone: "62990000001", foto: "/imagens/pessoas/cliente-ana.png" },
  { nome: "Cliente Bruno Lima", email: "cliente.bruno@saudenamao.com", cpf: "22222222222", rg: "2345678", telefone: "62990000002", foto: "/imagens/pessoas/cliente-bruno.png" },
  { nome: "Cliente Carla Dias", email: "cliente.carla@saudenamao.com", cpf: "33333333333", rg: "3456789", telefone: "62990000003", foto: "/imagens/pessoas/cliente-carla.png" },
];
const SENHA_CLIENTE = "Cliente@123";

const ENTREGADORES = [
  { nome: "Entregador Diego Alves", email: "entregador.diego@saudenamao.com", cpf: "44444444444", telefone: "62990000011", veiculo: "moto", placa: "ABC1D23", foto: "/imagens/pessoas/entregador-diego.png" },
  { nome: "Entregador Eduardo Reis", email: "entregador.eduardo@saudenamao.com", cpf: "55555555555", telefone: "62990000012", veiculo: "moto", placa: "EFG4H56", foto: "/imagens/pessoas/entregador-eduardo.png" },
  { nome: "Entregador Felipe Nunes", email: "entregador.felipe@saudenamao.com", cpf: "66666666666", telefone: "62990000013", veiculo: "carro", placa: "IJK7L89", foto: "/imagens/pessoas/entregador-felipe.png" },
];
const SENHA_ENTREGADOR = "Entrega@123";

async function upsert({ email, nome, cpf, rg, telefone, tipo, senha, dados, foto }) {
  let user = await User.findOne({ email });
  if (!user) user = new User({ email });
  user.nome = nome;
  user.cpf = cpf;
  if (rg) user.rg = rg;
  user.telefone = telefone;
  user.tipo_usuario = tipo;
  user.role = tipo === "entregador" ? "entregador" : "cliente";
  user.senha = senha; // re-hash via pre-save
  user.ativo = true;
  if (foto) user.foto_perfil = foto;
  user.lgpd_consentimento = {
    aceito: true,
    data_aceite: new Date(),
    versao_termo: "1.0",
  };
  if (dados) {
    if (!user.dados_entregador) user.dados_entregador = {};
    user.dados_entregador.tipo_veiculo = dados.tipo_veiculo;
    user.dados_entregador.placa = dados.placa;
    user.dados_entregador.disponivel = dados.disponivel;
    user.markModified("dados_entregador");
  }
  await user.save();
  return user;
}

(async () => {
  await connectDB();

  console.log("=== CLIENTES (senha " + SENHA_CLIENTE + ") ===");
  for (const c of CLIENTES) {
    await upsert({ ...c, tipo: "cliente", senha: SENHA_CLIENTE, foto: c.foto });
    console.log(`✓ ${c.email}`);
  }

  console.log("\n=== ENTREGADORES (senha " + SENHA_ENTREGADOR + ") ===");
  for (const e of ENTREGADORES) {
    await upsert({
      email: e.email,
      nome: e.nome,
      cpf: e.cpf,
      telefone: e.telefone,
      tipo: "entregador",
      senha: SENHA_ENTREGADOR,
      foto: e.foto,
      dados: {
        tipo_veiculo: e.veiculo,
        placa: e.placa,
        disponivel: true,
      },
    });
    console.log(`✓ ${e.email}`);
  }

  console.log("\nConcluído.");
  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
