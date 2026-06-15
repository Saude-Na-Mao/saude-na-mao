// Máscaras/sanitização de inputs (endereço, documentos).
export const onlyDigits = (v) => String(v || '').replace(/\D/g, '')

/** CEP no formato 00000-000 (só dígitos). */
export const maskCep = (v) => {
  const d = onlyDigits(v).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/** Apenas letras/espaços/acentos e hífen (cidade, bairro, logradouro). */
export const onlyLetters = (v) =>
  String(v || '').replace(/[^A-Za-zÀ-ÿ\s.'-]/g, '')

/** UF: 2 letras maiúsculas. */
export const maskUf = (v) =>
  String(v || '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 2)
