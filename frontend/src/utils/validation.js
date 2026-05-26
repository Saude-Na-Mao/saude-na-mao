import { VALIDATION_RULES, PASSWORD_REQUIREMENTS } from '../constants'

class ValidationService {
  static validateEmail(email) {
    if (!email) return { valid: false, error: 'Email é obrigatório' }
    if (!VALIDATION_RULES.EMAIL.test(email)) {
      return { valid: false, error: 'Email inválido' }
    }
    return { valid: true }
  }

  static validateCPF(cpf) {
    if (!cpf) return { valid: false, error: 'CPF é obrigatório' }
    
    const cleanCPF = cpf.replace(/\D/g, '')
    if (cleanCPF.length !== 11) {
      return { valid: false, error: 'CPF deve ter 11 dígitos' }
    }

    if (/^(\d)\1{10}$/.test(cleanCPF)) {
      return { valid: false, error: 'CPF inválido' }
    }

    let sum = 0
    for (let i = 1; i <= 9; i++) {
      sum += parseInt(cleanCPF.substring(i - 1, i)) * (11 - i)
    }
    let remainder = (sum * 10) % 11
    if (remainder === 10 || remainder === 11) remainder = 0
    if (remainder !== parseInt(cleanCPF.substring(9, 10))) {
      return { valid: false, error: 'CPF inválido' }
    }

    sum = 0
    for (let i = 1; i <= 10; i++) {
      sum += parseInt(cleanCPF.substring(i - 1, i)) * (12 - i)
    }
    remainder = (sum * 10) % 11
    if (remainder === 10 || remainder === 11) remainder = 0
    if (remainder !== parseInt(cleanCPF.substring(10, 11))) {
      return { valid: false, error: 'CPF inválido' }
    }

    return { valid: true }
  }

  static validatePassword(password) {
    const errors = []

    if (!password) {
      return { valid: false, error: 'Senha é obrigatória', requirements: {} }
    }

    const requirements = {
      minLength: password.length >= PASSWORD_REQUIREMENTS.MIN_LENGTH,
      hasUppercase: PASSWORD_REQUIREMENTS.HAS_UPPERCASE.test(password),
      hasLowercase: PASSWORD_REQUIREMENTS.HAS_LOWERCASE.test(password),
      hasNumber: PASSWORD_REQUIREMENTS.HAS_NUMBER.test(password),
      hasSpecial: PASSWORD_REQUIREMENTS.HAS_SPECIAL.test(password),
    }

    if (!requirements.minLength) errors.push('Mínimo 8 caracteres')
    if (!requirements.hasUppercase) errors.push('Pelo menos uma letra maiúscula')
    if (!requirements.hasLowercase) errors.push('Pelo menos uma letra minúscula')
    if (!requirements.hasNumber) errors.push('Pelo menos um número')
    if (!requirements.hasSpecial) errors.push('Pelo menos um caractere especial')

    return {
      valid: Object.values(requirements).every(v => v),
      error: errors.length > 0 ? errors.join(', ') : null,
      requirements,
    }
  }

  static validatePhone(phone) {
    if (!phone) return { valid: false, error: 'Telefone é obrigatório' }
    if (!VALIDATION_RULES.PHONE.test(phone)) {
      return { valid: false, error: 'Telefone inválido' }
    }
    return { valid: true }
  }

  static validateName(name) {
    if (!name) return { valid: false, error: 'Nome é obrigatório' }
    if (name.length < VALIDATION_RULES.NAME_MIN_LENGTH) {
      return { valid: false, error: 'Nome muito curto' }
    }
    if (name.length > VALIDATION_RULES.NAME_MAX_LENGTH) {
      return { valid: false, error: 'Nome muito longo' }
    }
    return { valid: true }
  }

  static validateForm(data, schema) {
    const errors = {}

    Object.keys(schema).forEach(field => {
      const validator = schema[field]
      const result = validator(data[field])

      if (!result.valid) {
        errors[field] = result.error
      }
    })

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    }
  }
}

export default ValidationService
