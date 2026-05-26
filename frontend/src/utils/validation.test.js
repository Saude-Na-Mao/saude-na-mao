import { describe, it, expect } from 'vitest'
import ValidationService from './validation'

describe('ValidationService.validateEmail', () => {
  it('aceita email válido', () => {
    expect(ValidationService.validateEmail('user@test.com')).toEqual({ valid: true })
  })

  it('rejeita email vazio', () => {
    const result = ValidationService.validateEmail('')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('rejeita email sem domínio', () => {
    expect(ValidationService.validateEmail('user@').valid).toBe(false)
  })

  it('rejeita email sem @', () => {
    expect(ValidationService.validateEmail('usertest.com').valid).toBe(false)
  })
})

describe('ValidationService.validateCPF', () => {
  it('aceita CPF válido (sem formatação)', () => {
    expect(ValidationService.validateCPF('52998224725').valid).toBe(true)
  })

  it('rejeita CPF com dígitos repetidos', () => {
    expect(ValidationService.validateCPF('11111111111').valid).toBe(false)
  })

  it('rejeita CPF curto', () => {
    const result = ValidationService.validateCPF('1234')
    expect(result.valid).toBe(false)
  })

  it('rejeita CPF vazio', () => {
    expect(ValidationService.validateCPF('').valid).toBe(false)
  })

  it('rejeita CPF com dígito verificador errado', () => {
    expect(ValidationService.validateCPF('52998224720').valid).toBe(false)
  })
})

describe('ValidationService.validatePassword', () => {
  it('valida senha forte', () => {
    const result = ValidationService.validatePassword('Teste@123')
    expect(result.valid).toBe(true)
    expect(result.requirements.minLength).toBe(true)
    expect(result.requirements.hasUppercase).toBe(true)
    expect(result.requirements.hasLowercase).toBe(true)
    expect(result.requirements.hasNumber).toBe(true)
    expect(result.requirements.hasSpecial).toBe(true)
  })

  it('rejeita senha sem caractere especial', () => {
    const result = ValidationService.validatePassword('Teste1234')
    expect(result.valid).toBe(false)
    expect(result.requirements.hasSpecial).toBe(false)
  })

  it('rejeita senha vazia', () => {
    const result = ValidationService.validatePassword('')
    expect(result.valid).toBe(false)
  })

  it('rejeita senha curta', () => {
    const result = ValidationService.validatePassword('Ab@1')
    expect(result.valid).toBe(false)
    expect(result.requirements.minLength).toBe(false)
  })
})

describe('ValidationService.validatePhone', () => {
  it('aceita telefone com DDD e 9 dígitos', () => {
    expect(ValidationService.validatePhone('(11) 99999-9999').valid).toBe(true)
  })

  it('aceita telefone sem formatação', () => {
    expect(ValidationService.validatePhone('11999999999').valid).toBe(true)
  })

  it('rejeita telefone vazio', () => {
    expect(ValidationService.validatePhone('').valid).toBe(false)
  })
})

describe('ValidationService.validateName', () => {
  it('aceita nome válido', () => {
    expect(ValidationService.validateName('João Silva').valid).toBe(true)
  })

  it('rejeita nome curto', () => {
    expect(ValidationService.validateName('Jo').valid).toBe(false)
  })

  it('rejeita nome vazio', () => {
    expect(ValidationService.validateName('').valid).toBe(false)
  })
})
