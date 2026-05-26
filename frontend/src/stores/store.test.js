import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore, useCartStore } from './store'

const product1 = { id: 'p1', nome: 'Paracetamol', preco: 12.5, id_farmacia: 'f1', nome_farmacia: 'Farmácia A' }
const product2 = { id: 'p2', nome: 'Ibuprofeno', preco: 18.9, id_farmacia: 'f1', nome_farmacia: 'Farmácia A' }
const productOtherPharmacy = { id: 'p3', nome: 'Dipirona', preco: 8.0, id_farmacia: 'f2', nome_farmacia: 'Farmácia B' }

describe('useCartStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({
      user: { id: 'u1', role: 'cliente' },
      token: 'test-token',
      tokenExpiration: Date.now() + 60 * 60 * 1000,
      error: null,
      isLoading: false,
    })
    useCartStore.setState({ items: [] })
  })

  it('inicia com carrinho vazio', () => {
    expect(useCartStore.getState().items).toEqual([])
  })

  it('adiciona item ao carrinho', () => {
    const result = useCartStore.getState().addItem(product1)
    expect(result.pharmacyConflict).toBe(false)
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(useCartStore.getState().items[0].nome).toBe('Paracetamol')
    expect(useCartStore.getState().items[0].quantity).toBe(1)
  })

  it('incrementa quantidade ao adicionar mesmo item', () => {
    useCartStore.getState().addItem(product1)
    useCartStore.getState().addItem(product1)
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(useCartStore.getState().items[0].quantity).toBe(2)
  })

  it('adiciona múltiplos itens da mesma farmácia', () => {
    useCartStore.getState().addItem(product1)
    useCartStore.getState().addItem(product2)
    expect(useCartStore.getState().items).toHaveLength(2)
  })

  it('detecta conflito de farmácia', () => {
    useCartStore.getState().addItem(product1)
    const result = useCartStore.getState().addItem(productOtherPharmacy)
    expect(result.pharmacyConflict).toBe(true)
    expect(result.currentPharmacyName).toBe('Farmácia A')
    expect(useCartStore.getState().items).toHaveLength(1)
  })

  it('substitui carrinho com replaceCartWithItem', () => {
    useCartStore.getState().addItem(product1)
    useCartStore.getState().addItem(product2)
    useCartStore.getState().replaceCartWithItem(productOtherPharmacy)
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(useCartStore.getState().items[0].nome).toBe('Dipirona')
  })

  it('remove item do carrinho', () => {
    useCartStore.getState().addItem(product1)
    useCartStore.getState().addItem(product2)
    useCartStore.getState().removeItem('p1')
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(useCartStore.getState().items[0].id).toBe('p2')
  })

  it('atualiza quantidade', () => {
    useCartStore.getState().addItem(product1)
    useCartStore.getState().updateQuantity('p1', 5)
    expect(useCartStore.getState().items[0].quantity).toBe(5)
  })

  it('remove item quando quantidade <= 0', () => {
    useCartStore.getState().addItem(product1)
    useCartStore.getState().updateQuantity('p1', 0)
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('limpa carrinho', () => {
    useCartStore.getState().addItem(product1)
    useCartStore.getState().addItem(product2)
    useCartStore.getState().clearCart()
    expect(useCartStore.getState().items).toEqual([])
  })

  it('calcula total corretamente', () => {
    useCartStore.getState().addItem({ ...product1, quantity: 2 })
    useCartStore.getState().addItem(product2)
    // product1: 12.5 * 2 = 25, product2: 18.9 * 1 = 18.9
    expect(useCartStore.getState().getTotal()).toBeCloseTo(43.9)
  })

  it('calcula contagem de itens', () => {
    useCartStore.getState().addItem({ ...product1, quantity: 3 })
    useCartStore.getState().addItem(product2)
    expect(useCartStore.getState().getItemCount()).toBe(4)
  })
})
