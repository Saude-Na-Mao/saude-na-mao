/** Opções alinhadas ao enum `classificacao_receita` do modelo Product (backend). */
export const CLASSIFICACAO_RECEITA_OPTIONS = [
  { value: 'sem_receita', label: 'Sem receita (MIP / OTC)' },
  { value: 'tarja_vermelha', label: 'Tarja Vermelha' },
  { value: 'tarja_preta', label: 'Tarja Preta' },
  { value: 'antimicrobiano', label: 'Antimicrobiano' },
  { value: 'controlado_a', label: 'Lista A / controle especial' },
]

/** Categorias terapêuticas para exibição nos cards (select). */
export const CATEGORIAS_MEDICAMENTO = [
  'Ansiolítico',
  'Antibiótico',
  'Anti-hipertensivo',
  'Analgésico',
  'Anti-inflamatório',
  'Antialérgico',
  'Antidepressivo',
  'Antidiabético',
  'Antiviral',
  'Antifúngico',
  'Hormonal',
  'Outro',
]

export const FORMAS_FARMACEUTICAS = [
  'Comprimido',
  'Cápsula',
  'Drágea',
  'Xarope',
  'Gotas',
  'Solução injetável',
  'Pomada',
  'Gel',
  'Spray',
  'Outro',
]

export const CATEGORIAS_OUTROS_ITENS = [
  'Higiene pessoal',
  'Cosmético',
  'Fralda / infantil',
  'Suplemento',
  'Vitaminas (venda livre)',
  'Equipamento',
  'Primeiros socorros',
  'Outro',
]

const PRESCRIPTION_CLASSIFICATIONS = new Set([
  'tarja_vermelha',
  'tarja_preta',
  'antimicrobiano',
  'controlado_a',
])

export function isPrescriptionClassification(classificacao) {
  return PRESCRIPTION_CLASSIFICATIONS.has(classificacao)
}

export function productTipoLabel(tipo) {
  switch (tipo) {
    case 'medicamento_catalogo':
      return 'Catálogo'
    case 'medicamento_otc':
      return 'OTC'
    case 'outro':
      return 'Outro'
    default:
      return '—'
  }
}

export function defaultsFromClassificacao(classificacao) {
  switch (classificacao) {
    case 'tarja_vermelha':
    case 'antimicrobiano':
      return { receita_obrigatoria: true, controlado: false }
    case 'tarja_preta':
    case 'controlado_a':
      return { receita_obrigatoria: true, controlado: true }
    default:
      return { receita_obrigatoria: false, controlado: false }
  }
}
