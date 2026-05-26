/**
 * Banco de interações medicamentosas comuns.
 * Fonte: Bulário ANVISA / Micromedex simplificado.
 *
 * Cada entrada: { par: [A, B], severidade, descricao }
 * Severidade: "leve" | "moderada" | "grave"
 */
const DRUG_INTERACTIONS = [
  {
    par: ["ibuprofeno", "aspirina"],
    severidade: "grave",
    descricao: "Risco aumentado de sangramento gastrointestinal. Evitar uso conjunto.",
  },
  {
    par: ["ibuprofeno", "varfarina"],
    severidade: "grave",
    descricao: "Aumento significativo do risco de hemorragia.",
  },
  {
    par: ["paracetamol", "varfarina"],
    severidade: "moderada",
    descricao: "Uso prolongado de paracetamol pode potencializar o efeito anticoagulante.",
  },
  {
    par: ["metformina", "contraste iodado"],
    severidade: "grave",
    descricao: "Risco de acidose lática. Suspender metformina 48h antes de exame com contraste.",
  },
  {
    par: ["omeprazol", "clopidogrel"],
    severidade: "grave",
    descricao: "Omeprazol reduz a eficácia do clopidogrel. Risco cardiovascular aumentado.",
  },
  {
    par: ["fluoxetina", "tramadol"],
    severidade: "grave",
    descricao: "Risco de síndrome serotoninérgica. Evitar combinação.",
  },
  {
    par: ["amoxicilina", "metotrexato"],
    severidade: "grave",
    descricao: "Amoxicilina pode aumentar a toxicidade do metotrexato.",
  },
  {
    par: ["losartana", "espironolactona"],
    severidade: "moderada",
    descricao: "Risco de hipercalemia (potássio elevado). Monitorar níveis séricos.",
  },
  {
    par: ["sinvastatina", "amiodarona"],
    severidade: "grave",
    descricao: "Risco elevado de rabdomiólise. Limitar dose de sinvastatina a 20mg.",
  },
  {
    par: ["ciprofloxacino", "tizanidina"],
    severidade: "grave",
    descricao: "Aumento drástico dos níveis de tizanidina. Contraindicado.",
  },
  {
    par: ["enalapril", "espironolactona"],
    severidade: "moderada",
    descricao: "Risco de hipercalemia. Monitorar potássio.",
  },
  {
    par: ["diclofenaco", "lítio"],
    severidade: "moderada",
    descricao: "AINEs podem aumentar os níveis séricos de lítio.",
  },
  {
    par: ["captopril", "ibuprofeno"],
    severidade: "moderada",
    descricao: "Ibuprofeno pode reduzir o efeito anti-hipertensivo do captopril.",
  },
  {
    par: ["dipirona", "metotrexato"],
    severidade: "moderada",
    descricao: "Dipirona pode aumentar os efeitos tóxicos do metotrexato.",
  },
  {
    par: ["fluconazol", "sinvastatina"],
    severidade: "grave",
    descricao: "Fluconazol aumenta níveis de sinvastatina. Risco de rabdomiólise.",
  },
  {
    par: ["cetoconazol", "sinvastatina"],
    severidade: "grave",
    descricao: "Contraindicado. Risco severo de rabdomiólise.",
  },
  {
    par: ["metronidazol", "álcool"],
    severidade: "grave",
    descricao: "Reação tipo dissulfiram (náusea, vômito, taquicardia). Evitar álcool.",
  },
  {
    par: ["amoxicilina", "anticoncepcional oral"],
    severidade: "leve",
    descricao: "Possível redução da eficácia contraceptiva. Usar método adicional.",
  },
  {
    par: ["levotiroxina", "omeprazol"],
    severidade: "moderada",
    descricao: "Omeprazol pode reduzir absorção de levotiroxina.",
  },
  {
    par: ["prednisona", "ibuprofeno"],
    severidade: "moderada",
    descricao: "Risco aumentado de úlcera gástrica e sangramento GI.",
  },
  {
    par: ["clonazepam", "álcool"],
    severidade: "grave",
    descricao: "Depressão do SNC potencializada. Risco de depressão respiratória.",
  },
  {
    par: ["sertralina", "tramadol"],
    severidade: "grave",
    descricao: "Risco de síndrome serotoninérgica. Monitorar ou evitar.",
  },
  {
    par: ["atenolol", "verapamil"],
    severidade: "grave",
    descricao: "Risco de bradicardia severa e bloqueio cardíaco.",
  },
  {
    par: ["digoxina", "amiodarona"],
    severidade: "grave",
    descricao: "Amiodarona aumenta níveis de digoxina. Reduzir dose de digoxina 50%.",
  },
  {
    par: ["insulina", "propranolol"],
    severidade: "moderada",
    descricao: "Propranolol pode mascarar sintomas de hipoglicemia.",
  },
];

/**
 * Verifica interações entre uma lista de princípios ativos.
 * @param {string[]} principiosAtivos - Array de princípios ativos no carrinho
 * @returns {Array} - Lista de interações encontradas
 */
function verificarInteracoes(principiosAtivos) {
  if (!principiosAtivos || principiosAtivos.length < 2) return [];

  const normalizados = principiosAtivos.map((p) => p.toLowerCase().trim());
  const interacoesEncontradas = [];

  for (const interacao of DRUG_INTERACTIONS) {
    const [a, b] = interacao.par.map((p) => p.toLowerCase());
    if (normalizados.includes(a) && normalizados.includes(b)) {
      interacoesEncontradas.push({
        medicamentos: interacao.par,
        severidade: interacao.severidade,
        descricao: interacao.descricao,
      });
    }
  }

  return interacoesEncontradas;
}

module.exports = { DRUG_INTERACTIONS, verificarInteracoes };
