/**
 * Itens do carrinho que exigem receita (controlado ou tarja/receita obrigatória).
 */
export function itemExigeReceita(item) {
  return Boolean(
    item?.controlado ||
      item?.receita_obrigatoria ||
      item?.necessitaReceita,
  )
}

/**
 * Receita deve estar explicitamente vinculada ao produto da linha do carrinho.
 * Receitas legadas sem id_produto NÃO podem validar um medicamento específico.
 */
export function receitaVinculadaAoProduto(rx, productId) {
  if (productId == null || productId === undefined) return false
  const pr = rx?.id_produto?._id || rx?.id_produto
  if (!pr) return false
  return String(pr) === String(productId)
}
