import { describe, it, expect } from 'vitest'
import {
  formatarMoeda,
  formatarData,
  formatarCPF,
  validarEmail,
  validarSenha,
  truncarTexto,
  calcularDesconto,
  calcularValorComDesconto,
  calcularDistancia,
} from './helpers'

describe('formatarMoeda', () => {
  it('formata valor em reais', () => {
    expect(formatarMoeda(29.9)).toContain('29,90')
  })

  it('formata zero', () => {
    expect(formatarMoeda(0)).toContain('0,00')
  })

  it('formata valores grandes', () => {
    expect(formatarMoeda(1500.5)).toContain('1.500,50')
  })
})

describe('formatarData', () => {
  it('formata data ISO para pt-BR', () => {
    const result = formatarData('2026-04-18T12:00:00Z')
    expect(result).toMatch(/18/)
    expect(result).toMatch(/04|4/)
    expect(result).toMatch(/2026/)
  })
})

describe('formatarCPF', () => {
  it('formata CPF com pontos e traço', () => {
    expect(formatarCPF('12345678901')).toBe('123.456.789-01')
  })

  it('formata CPF parcial', () => {
    expect(formatarCPF('1234')).toBe('123.4')
  })

  it('remove caracteres não-numéricos', () => {
    expect(formatarCPF('123.456.789-01')).toBe('123.456.789-01')
  })
})

describe('validarEmail', () => {
  it('aceita email válido', () => {
    expect(validarEmail('user@example.com')).toBe(true)
  })

  it('rejeita email sem @', () => {
    expect(validarEmail('userexample.com')).toBe(false)
  })

  it('rejeita email vazio', () => {
    expect(validarEmail('')).toBe(false)
  })
})

describe('validarSenha', () => {
  it('valida senha forte', () => {
    const result = validarSenha('Teste@123')
    expect(result.valida).toBe(true)
    expect(result.temMaiuscula).toBe(true)
    expect(result.temMinuscula).toBe(true)
    expect(result.temNumero).toBe(true)
    expect(result.temSimbolo).toBe(true)
    expect(result.temComprimento).toBe(true)
  })

  it('rejeita senha sem maiúscula', () => {
    const result = validarSenha('teste@123')
    expect(result.valida).toBe(false)
    expect(result.temMaiuscula).toBe(false)
  })

  it('rejeita senha curta', () => {
    const result = validarSenha('Ab@1')
    expect(result.valida).toBe(false)
    expect(result.temComprimento).toBe(false)
  })
})

describe('truncarTexto', () => {
  it('trunca texto longo', () => {
    const texto = 'a'.repeat(60)
    expect(truncarTexto(texto, 50)).toBe('a'.repeat(50) + '...')
  })

  it('retorna texto curto sem truncar', () => {
    expect(truncarTexto('hello', 50)).toBe('hello')
  })
})

describe('calcularDesconto / calcularValorComDesconto', () => {
  it('calcula desconto corretamente', () => {
    expect(calcularDesconto(100, 15)).toBe(15)
    expect(calcularDesconto(200, 10)).toBe(20)
  })

  it('calcula valor com desconto', () => {
    expect(calcularValorComDesconto(100, 15)).toBe(85)
    expect(calcularValorComDesconto(200, 50)).toBe(100)
  })
})

describe('calcularDistancia', () => {
  it('calcula distância entre dois pontos', () => {
    // Goiânia centro ~> Campinas-GO (~10km)
    const dist = calcularDistancia(-16.6869, -49.2648, -16.7194, -49.2322)
    expect(dist).toBeGreaterThan(3)
    expect(dist).toBeLessThan(15)
  })

  it('retorna 0 para mesmo ponto', () => {
    expect(calcularDistancia(0, 0, 0, 0)).toBe(0)
  })
})
