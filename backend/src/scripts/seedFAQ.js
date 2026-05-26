require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/database");
const FAQ = require("../models/FAQ");

const faqsIniciais = [
  {
    pergunta: "Como fazer o upload da minha receita médica?",
    resposta:
      "Acesse seu perfil, vá em 'Minhas Receitas' e toque em 'Enviar Receita'. Aceitamos fotos em JPG, PNG ou arquivos PDF de até 15MB.",
    categoria: "receitas",
    tags: ["upload", "receita", "foto", "pdf"],
    ordem: 1,
  },
  {
    pergunta: "Quanto tempo leva para minha receita ser aprovada?",
    resposta:
      "O prazo máximo é de 2 horas úteis. Você receberá uma notificação assim que o farmacêutico analisar sua receita.",
    categoria: "receitas",
    tags: ["prazo", "aprovação", "tempo", "análise"],
    ordem: 2,
  },
  {
    pergunta: "Minha receita foi rejeitada. O que fazer?",
    resposta:
      "Verifique o motivo na notificação recebida. Os motivos mais comuns são foto ilegível, receita vencida ou CRM do médico inválido. Tire uma nova foto bem iluminada e reenvie.",
    categoria: "receitas",
    tags: ["rejeitada", "motivo", "reenviar"],
    ordem: 3,
  },
  {
    pergunta: "Por quanto tempo uma receita aprovada é válida?",
    resposta:
      "Receitas aprovadas são válidas por até 6 meses da data de emissão. Após esse prazo, você precisará de uma nova receita do seu médico.",
    categoria: "receitas",
    tags: ["validade", "prazo", "6 meses"],
    ordem: 4,
  },
  {
    pergunta: "O que são medicamentos controlados?",
    resposta:
      "São medicamentos que exigem receita médica especial para serem dispensados, conforme a Portaria 344/98 da ANVISA. Exemplos: ansiolíticos, antidepressivos, alguns analgésicos fortes.",
    categoria: "medicamentos",
    tags: ["controlado", "anvisa", "receita", "portaria"],
    ordem: 5,
  },
  {
    pergunta: "Existe limite de quantidade para medicamentos controlados?",
    resposta:
      "Sim. Por segurança e conformidade com a ANVISA, limitamos a compra de medicamentos controlados a 5 caixas por CPF por mês.",
    categoria: "medicamentos",
    tags: ["limite", "quantidade", "controlado", "cpf"],
    ordem: 6,
  },
  {
    pergunta: "Como buscar um medicamento pelo princípio ativo?",
    resposta:
      "Na tela de busca, digite o nome do princípio ativo (ex: 'paracetamol', 'ibuprofeno'). Nosso sistema busca automaticamente por nome comercial e princípio ativo.",
    categoria: "medicamentos",
    tags: ["busca", "princípio ativo", "nome genérico"],
    ordem: 7,
  },
  {
    pergunta: "Posso cancelar meu pedido?",
    resposta:
      "Sim, você pode cancelar o pedido enquanto ele ainda não saiu para entrega. Após o status mudar para 'A caminho', o cancelamento não é mais possível.",
    categoria: "pedidos",
    tags: ["cancelar", "pedido", "prazo"],
    ordem: 8,
  },
  {
    pergunta: "Como acompanhar meu pedido em tempo real?",
    resposta:
      "Na tela 'Meus Pedidos', selecione o pedido ativo. Você verá o status atualizado em tempo real e, quando o entregador sair, poderá acompanhar a localização no mapa.",
    categoria: "pedidos",
    tags: ["rastreamento", "tempo real", "mapa", "localização"],
    ordem: 9,
  },
  {
    pergunta: "O que acontece se a farmácia rejeitar meu pedido?",
    resposta:
      "Você será notificado com o motivo da rejeição e o pagamento será estornado automaticamente em até 5 dias úteis para o mesmo método de pagamento.",
    categoria: "pedidos",
    tags: ["rejeição", "farmácia", "estorno", "reembolso"],
    ordem: 10,
  },
  {
    pergunta: "Quais formas de pagamento são aceitas?",
    resposta:
      "Aceitamos cartão de crédito, cartão de débito, PIX e boleto bancário. O PIX é processado instantaneamente. O boleto pode levar até 3 dias úteis para compensar.",
    categoria: "pagamento",
    tags: ["pagamento", "pix", "boleto", "cartão", "crédito", "débito"],
    ordem: 11,
  },
  {
    pergunta: "O PIX expira?",
    resposta:
      "Sim. O QR Code PIX gerado tem validade de 30 minutos. Se expirar, você pode iniciar um novo pagamento para o mesmo pedido.",
    categoria: "pagamento",
    tags: ["pix", "expirar", "qr code", "30 minutos"],
    ordem: 12,
  },
  {
    pergunta: "Como solicitar estorno?",
    resposta:
      "Acesse o pedido em 'Meus Pedidos' e toque em 'Solicitar Estorno'. O estorno é processado em até 5 dias úteis para cartão e instantaneamente para PIX.",
    categoria: "pagamento",
    tags: ["estorno", "reembolso", "devolução", "cancelamento"],
    ordem: 13,
  },
  {
    pergunta: "Quais são os tipos de entrega disponíveis?",
    resposta:
      "Oferecemos: Moto (até 2 horas), Drone (até 30 minutos em cidades-piloto), Retirada na farmácia e Drive-thru. A disponibilidade depende da sua região.",
    categoria: "entrega",
    tags: ["entrega", "moto", "drone", "retirada", "drive-thru"],
    ordem: 14,
  },
  {
    pergunta: "Tem frete grátis?",
    resposta:
      "Sim! Pedidos acima de R$150 têm frete grátis por moto. Retirada na farmácia e drive-thru são sempre gratuitos.",
    categoria: "entrega",
    tags: ["frete grátis", "grátis", "frete", "150"],
    ordem: 15,
  },
];

async function seedFAQ() {
  try {
    await connectDB();

    await FAQ.deleteMany({});
    const faqsCriadas = await FAQ.insertMany(faqsIniciais);

    console.log(`${faqsCriadas.length} FAQs criadas com sucesso.`);
    return faqsCriadas;
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { seedFAQ, faqsIniciais };

if (require.main === module) {
  seedFAQ()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Erro ao popular FAQs:", error);
      process.exit(1);
    });
}
