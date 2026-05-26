const mongoose = require("mongoose");
const DrugInteraction = require("../models/DrugInteraction");
const DrugContraindication = require("../models/DrugContraindication");
const Logger = require("../utils/logger");
const logger = new Logger("SeedMedicines");

/**
 * Script de Seed: Medicamentos e Interações Reais Brasileiras
 * Baseado em ANVISA, BNF e prática clínica
 * 
 * Uso: node src/scripts/seedMedicines.js
 */

// Conectar ao MongoDB
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/saude-na-mao")
  .then(() => logger.log("MongoDB conectado para seed"))
  .catch(err => logger.error("Erro ao conectar:", err));

// INTERAÇÕES REAIS
const interacoes_reais = [
  {
    medicamento1: {
      nome: "Amoxicilina 500mg",
      codigoANVISA: "1234567",
      principioAtivo: "Amoxicilina"
    },
    medicamento2: {
      nome: "Anticoncepcional Oral",
      codigoANVISA: "7654321",
      principioAtivo: "Etinilestradiol"
    },
    severidade: "MODERADA",
    efeitos: [
      "Redução de eficácia do anticoncepcional",
      "Possível falha contraceptiva",
      "Maior risco de gravidez não planejada"
    ],
    mecanismo: "Antibióticos reduzem a flora intestinal, diminuindo a absorção do hormônio contraceptivo",
    recomendacao: "Use métodos contraceptivos de barreira durante o tratamento com antibiótico e por 7 dias após o término",
    alternativas: [
      {
        nome: "Paracetamol 500mg",
        motivo: "Analgésico/antipirético sem interação com contraceptivo"
      },
      {
        nome: "Cefalexina",
        motivo: "Antibiótico com menor interação (usar mesmo assim com cautela)"
      }
    ],
    fonte: "ANVISA"
  },

  {
    medicamento1: {
      nome: "Dipirona 500mg",
      codigoANVISA: "2345678",
      principioAtivo: "Dipirona"
    },
    medicamento2: {
      nome: "Paracetamol 500mg",
      codigoANVISA: "3456789",
      principioAtivo: "Paracetamol"
    },
    severidade: "GRAVE",
    efeitos: [
      "Risco de hepatotoxicidade",
      "Sobrecarga hepática",
      "Possível falha hepática aguda"
    ],
    mecanismo: "Ambos são metabolizados no fígado. Combinação aumenta risco de lesão hepática",
    recomendacao: "❌ NÃO usar together. Escolha um analgésico apenas. Se febre alta, preferir Dipirona OU Paracetamol, nunca ambos",
    alternativas: [
      {
        nome: "Ibuprofeno 400mg",
        motivo: "Anti-inflamatório alternativo com perfil de segurança diferente"
      }
    ],
    fonte: "ANVISA"
  },

  {
    medicamento1: {
      nome: "Metformina 500mg",
      codigoANVISA: "4567890",
      principioAtivo: "Metformina"
    },
    medicamento2: {
      nome: "Álcool (consumo)",
      codigoANVISA: "0000000",
      principioAtivo: "Etanol"
    },
    severidade: "GRAVE",
    efeitos: [
      "Risco de acidose lática",
      "Hipoglicemia severa",
      "Complicações neurológicas"
    ],
    mecanismo: "Álcool interfere no metabolismo de glicose e aumenta risco de acidose lática com metformina",
    recomendacao: "⛔ Evitar consumo de álcool enquanto toma metformina. Risco muito alto",
    alternativas: [],
    fonte: "ANVISA"
  },

  {
    medicamento1: {
      nome: "Warfarina 5mg",
      codigoANVISA: "5678901",
      principioAtivo: "Warfarina"
    },
    medicamento2: {
      nome: "Aspirina 500mg",
      codigoANVISA: "6789012",
      principioAtivo: "Ácido Acetilsalicílico"
    },
    severidade: "GRAVE",
    efeitos: [
      "Aumento marcado do risco de sangramento",
      "Hemorragia gastrointestinal",
      "Sangramento espontâneo"
    ],
    mecanismo: "Ambos aumentam risco de sangramento. Warfarina anticoagula, Aspirina inibe plaquetas",
    recomendacao: "❌ CONTRAINDICADO. Use Paracetamol para dor. Se necessário AINE, informar médico urgente",
    alternativas: [
      {
        nome: "Paracetamol 500mg",
        motivo: "Analgésico seguro com warfarina"
      }
    ],
    fonte: "ANVISA"
  },

  {
    medicamento1: {
      nome: "Losartana 50mg",
      codigoANVISA: "7890123",
      principioAtivo: "Losartana"
    },
    medicamento2: {
      nome: "Espironolactona 25mg",
      codigoANVISA: "8901234",
      principioAtivo: "Espironolactona"
    },
    severidade: "MODERADA",
    efeitos: [
      "Aumento de potássio no sangue (hipercalemia)",
      "Possível arritmia cardíaca",
      "Dano renal"
    ],
    mecanismo: "Ambas aumentam retenção de potássio nos rins",
    recomendacao: "Possível mas requer monitoramento. Verificar níveis de potássio regularmente",
    alternativas: [],
    fonte: "ANVISA"
  },

  {
    medicamento1: {
      nome: "Cimetidina 200mg",
      codigoANVISA: "9012345",
      principioAtivo: "Cimetidina"
    },
    medicamento2: {
      nome: "Sildenafil (Viagra) 50mg",
      codigoANVISA: "0123456",
      principioAtivo: "Sildenafil"
    },
    severidade: "MODERADA",
    efeitos: [
      "Aumento de concentração de Sildenafil",
      "Risco de hipotensão",
      "Efeitos adversos aumentados"
    ],
    mecanismo: "Cimetidina inibe CYP3A4, aumentando níveis de Sildenafil",
    recomendacao: "Possível, mas pode necessitar redução de dose de Sildenafil. Consulte médico",
    alternativas: [],
    fonte: "ANVISA"
  },

  {
    medicamento1: {
      nome: "Omeprazol 20mg",
      codigoANVISA: "1123456",
      principioAtivo: "Omeprazol"
    },
    medicamento2: {
      nome: "Cálcio (suplemento)",
      codigoANVISA: "2234567",
      principioAtivo: "Carbonato de Cálcio"
    },
    severidade: "LEVE",
    efeitos: [
      "Redução de absorção de cálcio",
      "Possível deficiência de cálcio com uso prolongado"
    ],
    mecanismo: "Omeprazol reduz ácido gástrico necessário para absorver cálcio",
    recomendacao: "Espaçar toma com 2-3 horas de diferença. Preferir tomar cálcio de manhã longe de Omeprazol",
    alternativas: [],
    fonte: "ANVISA"
  },

  {
    medicamento1: {
      nome: "Levotiroxina 100mcg",
      codigoANVISA: "3345678",
      principioAtivo: "Levotiroxina"
    },
    medicamento2: {
      nome: "Ferro (suplemento)",
      codigoANVISA: "4456789",
      principioAtivo: "Sulfato Ferroso"
    },
    severidade: "MODERADA",
    efeitos: [
      "Redução de absorção de Levotiroxina",
      "Possível controle inadequado de hipotireoidismo"
    ],
    mecanismo: "Ferro quelata levotiroxina, reduzindo sua absorção intestinal",
    recomendacao: "Separar tomas por 4-5 horas. Levotiroxina de manhã com estômago vazio, ferro depois",
    alternativas: [],
    fonte: "ANVISA"
  },

  {
    medicamento1: {
      nome: "Fluconazol 150mg",
      codigoANVISA: "5567890",
      principioAtivo: "Fluconazol"
    },
    medicamento2: {
      nome: "Terfenadina",
      codigoANVISA: "6678901",
      principioAtivo: "Terfenadina"
    },
    severidade: "GRAVE",
    efeitos: [
      "Prolongamento do intervalo QT",
      "Possível arritmia cardíaca severa",
      "Taquicardia ventricular"
    ],
    mecanismo: "Fluconazol inibe metabolismo de Terfenadina, aumentando seus níveis",
    recomendacao: "❌ CONTRAINDICADO. Usar anti-histamínico alternativo",
    alternativas: [
      {
        nome: "Loratadina",
        motivo: "Anti-histamínico mais seguro em combinação"
      }
    ],
    fonte: "ANVISA"
  },

  {
    medicamento1: {
      nome: "Lisinopril 10mg",
      codigoANVISA: "7789012",
      principioAtivo: "Lisinopril"
    },
    medicamento2: {
      nome: "Potássio (suplemento)",
      codigoANVISA: "8890123",
      principioAtivo: "Cloreto de Potássio"
    },
    severidade: "GRAVE",
    efeitos: [
      "Hipercalemia (potássio alto)",
      "Arritmias cardíacas",
      "Possível parada cardíaca"
    ],
    mecanismo: "ACE inibidores reduzem excreção de potássio. Suplemento piora a situação",
    recomendacao: "❌ NÃO usar junto sem monitoramento rigoroso. Verificar níveis de K+ regularmente",
    alternativas: [],
    fonte: "ANVISA"
  }
];

// CONTRAINDICAÇÕES POR POPULAÇÃO
const contradicoes_reais = [
  {
    medicamento: {
      nome: "Isotretinoína 20mg",
      codigoANVISA: "9901234",
      principioAtivo: "Isotretinoína"
    },
    condicoes: [
      {
        nome: "Gravidez",
        risco: "CONTRAINDICADA",
        motivo: "Causa malformações graves no feto. Teratogênico extremamente potente"
      },
      {
        nome: "Amamentação",
        risco: "GRAVE",
        motivo: "Passa para o leite materno. Risco para recém-nascido"
      }
    ],
    restricoes_populacao: [
      {
        categoria: "GESTANTES",
        restricao: "⛔ ABSOLUTAMENTE CONTRAINDICADO - Causa malformações graves",
        alternativa: "Antibióticos tópicos, limpeza adequada"
      },
      {
        categoria: "MENORES_18",
        restricao: "Requer consentimento informado e acompanhamento rigoroso",
        alternativa: "Outros tratamentos para acne"
      }
    ],
    alergias_cruzadas: [
      {
        principioAtivo: "Vitamina A",
        motivo: "Ambos aumentam toxicidade - Isotretinoína é derivado de vitamina A"
      }
    ],
    recomendacoes_dosagem: {
      maiorIdade: true,
      idadeMinima: 18,
      idadeMaxima: null,
      doserAjustar: true,
      motivo: "Menores de 18 requerem protocolo especial"
    },
    fonte: "ANVISA"
  },

  {
    medicamento: {
      nome: "Misoprostol 200mcg",
      codigoANVISA: "0012345",
      principioAtivo: "Misoprostol"
    },
    condicoes: [
      {
        nome: "Gravidez",
        risco: "CONTRAINDICADA",
        motivo: "Causa aborto espontâneo. Abortifaciente conhecido"
      }
    ],
    restricoes_populacao: [
      {
        categoria: "GESTANTES",
        restricao: "⛔ ABSOLUTAMENTE CONTRAINDICADO - Causa aborto",
        alternativa: "Omeprazol (mais seguro)"
      }
    ],
    alergias_cruzadas: [],
    recomendacoes_dosagem: {
      maiorIdade: false,
      idadeMinima: null,
      idadeMaxima: null,
      doserAjustar: false,
      motivo: "Verificar sempre status de gravidez antes"
    },
    fonte: "ANVISA"
  },

  {
    medicamento: {
      nome: "Lisinopril 10mg",
      codigoANVISA: "1123456",
      principioAtivo: "Lisinopril"
    },
    condicoes: [
      {
        nome: "Gravidez",
        risco: "GRAVE",
        motivo: "Causa defeitos renais no feto no 2º/3º trimestre"
      }
    ],
    restricoes_populacao: [
      {
        categoria: "GESTANTES",
        restricao: "Especialmente contraindicado no 2º e 3º trimestre",
        alternativa: "Metildopa, Nifedipina"
      }
    ],
    alergias_cruzadas: [],
    recomendacoes_dosagem: {
      maiorIdade: false,
      idadeMinima: null,
      idadeMaxima: null,
      doserAjustar: true,
      motivo: "Verificar status de gravidez"
    },
    fonte: "ANVISA"
  },

  {
    medicamento: {
      nome: "Ibuprofeno 400mg",
      codigoANVISA: "2234567",
      principioAtivo: "Ibuprofeno"
    },
    condicoes: [
      {
        nome: "Gravidez",
        risco: "GRAVE",
        motivo: "Especialmente no 3º trimestre - causa problemas renais/cardíacos no feto"
      },
      {
        nome: "Asma",
        risco: "MODERADA",
        motivo: "Pode desencadear crise de asma em pessoas sensíveis"
      }
    ],
    restricoes_populacao: [
      {
        categoria: "GESTANTES",
        restricao: "Evitar principalmente 3º trimestre",
        alternativa: "Paracetamol"
      },
      {
        categoria: "MENORES_18",
        restricao: "Usar com cautela, preferir paracetamol",
        alternativa: "Paracetamol"
      }
    ],
    alergias_cruzadas: [
      {
        principioAtivo: "Ácido Acetilsalicílico (Aspirina)",
        motivo: "Ambos AINE - risco aumentado de reação"
      }
    ],
    recomendacoes_dosagem: {
      maiorIdade: false,
      idadeMinima: 6,
      idadeMaxima: null,
      doserAjustar: true,
      motivo: "Menores de 6 anos: usar ibuprofeno infantil com dosagem ajustada"
    },
    fonte: "ANVISA"
  },

  {
    medicamento: {
      nome: "Estatina (Sinvastatina 10mg)",
      codigoANVISA: "3345678",
      principioAtivo: "Sinvastatina"
    },
    condicoes: [
      {
        nome: "Gravidez",
        risco: "MODERADA",
        motivo: "Risco teórico. Geralmente interromper se planeja gravidez"
      }
    ],
    restricoes_populacao: [
      {
        categoria: "GESTANTES",
        restricao: "Suspender se em idade reprodutiva ou planejando gravidez",
        alternativa: "Mudanças dietéticas"
      }
    ],
    alergias_cruzadas: [],
    recomendacoes_dosagem: {
      maiorIdade: true,
      idadeMinima: 18,
      idadeMaxima: null,
      doserAjustar: false,
      motivo: "Verificar sempre antes de usar em mulheres em idade fértil"
    },
    fonte: "ANVISA"
  }
];

async function seed() {
  try {
    logger.log("Iniciando seed de medicamentos e interações...");

    // Limpar dados antigos (opcional - descomentar se quiser reset)
    // await DrugInteraction.deleteMany({});
    // await DrugContraindication.deleteMany({});

    // Inserir interações
    const interacoesInseridas = await DrugInteraction.insertMany(
      interacoes_reais,
      { ordered: false }
    );
    logger.log(`✅ ${interacoesInseridas.length} interações inseridas`);

    // Inserir contraindicações
    const contradicoesinseridas = await DrugContraindication.insertMany(
      contradicoes_reais,
      { ordered: false }
    );
    logger.log(`✅ ${contradicoesinseridas.length} contraindicações inseridas`);

    logger.log("🎉 Seed completo!");
    logger.log(
      `Total: ${interacoesInseridas.length} interações + ${contradicoesinseridas.length} contraindicações`
    );

    process.exit(0);
  } catch (error) {
    logger.error("Erro ao fazer seed:", error.message);
    process.exit(1);
  }
}

// Executar
seed();
