import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../stores/store'
import { authService } from '../services/api'
import { useForm } from '../hooks'
import ValidationService from '../utils/validation'
import Alert from '../components/Alert'
import Logger from '../utils/logger'
import { getApiErrorMessage } from '../utils/apiErrorMessage'
import { SELF_REGISTER_TYPES } from '../constants'
import { User, Mail, Phone, Lock, Eye, EyeOff, CheckCircle, XCircle, ArrowRight, Shield, Truck, Store, ShoppingBag, FileText, MapPin } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

const logger = new Logger('Registro')

const registroSchema = {
  nome: (value) => {
    const validation = ValidationService.validateName(value)
    return validation.valid ? null : validation.error
  },
  email: (value) => {
    const validation = ValidationService.validateEmail(value)
    return validation.valid ? null : validation.error
  },
  telefone: (value) => {
    if (!value) return 'Telefone é obrigatório'
    return null
  },
  cpf: (value) => {
    const validation = ValidationService.validateCPF(value)
    return validation.valid ? null : validation.error
  },
  senha: (value) => {
    const validation = ValidationService.validatePassword(value)
    return !validation.valid ? validation.error : null
  },
  confirmaSenha: (value, allValues) => {
    if (!value) return 'Confirmação de senha é obrigatória'
    if (value !== allValues?.senha) return 'As senhas não coincidem'
    return null
  },
}

export default function Registro() {
  const navigate = useNavigate()
  const { setUser, setToken } = useAuthStore()
  const [apiError, setApiError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [tipoUsuario, setTipoUsuario] = useState('cliente')
  const googleBtnRef = useRef(null)

  const handleGoogleRegister = async (response) => {
    try {
      setApiError(null)
      const res = await authService.google(response.credential)
      const { accessToken, user } = res.data.data
      setToken(accessToken)
      setUser(user)
      navigate('/perfil')
    } catch (err) {
      setApiError(err.response?.data?.message || 'Erro ao registrar com Google')
    }
  }

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) return
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      window.google?.accounts?.id?.initialize({
        client_id: clientId,
        callback: handleGoogleRegister,
      })
      if (googleBtnRef.current) {
        window.google?.accounts?.id?.renderButton(googleBtnRef.current, {
          theme: 'outline', size: 'large', width: '100%', text: 'signup_with',
        })
      }
    }
    document.body.appendChild(script)
    return () => { try { document.body.removeChild(script) } catch {} }
  }, [])

  const validateField = (field, value) => {
    if (field === 'confirmaSenha') {
      return registroSchema[field]?.(value, values)
    }
    return registroSchema[field]?.(value)
  }

  const { values, errors, touched, isSubmitting, handleChange, handleBlur, handleSubmit } = useForm(
    {
      nome: '',
      email: '',
      telefone: '',
      cpf: '',
      senha: '',
      confirmaSenha: '',
      // Entregador
      tipo_veiculo: '',
      cnh: '',
      // Dono farmácia
      cnpj: '',
      nome_farmacia: '',
      logradouro: '',
      numero: '',
      bairro: '',
      cidade: '',
      estado: '',
      cep: '',
    },
    async (formData) => {
      try {
        setApiError(null)
        logger.info('Attempting registration', { email: formData.email, tipo: tipoUsuario })

        const payload = {
          nome: formData.nome,
          email: formData.email,
          telefone: formData.telefone,
          cpf: formData.cpf,
          senha: formData.senha,
          tipo_usuario: tipoUsuario,
          lgpd_consentimento: true,
        }

        if (tipoUsuario === 'entregador') {
          payload.dados_entregador = {
            tipo_veiculo: formData.tipo_veiculo,
            cnh: formData.cnh,
          }
        }

        if (tipoUsuario === 'dono_farmacia') {
          payload.dados_farmacia = {
            cnpj: formData.cnpj,
            nome: formData.nome_farmacia,
            logradouro: formData.logradouro,
            numero: formData.numero,
            bairro: formData.bairro,
            cidade: formData.cidade,
            estado: formData.estado,
            cep: formData.cep,
          }
        }

        const response = await authService.register(payload)

        const { accessToken, user } = response.data.data
        setToken(accessToken)
        setUser(user)
        logger.info('Registration successful', { userId: user.id, role: user.role })

        const redirectMap = {
          cliente: '/perfil',
          entregador: '/perfil',
          dono_farmacia: '/farmaceutico',
        }
        setTimeout(() => navigate(redirectMap[tipoUsuario] || '/perfil'), 1000)
      } catch (error) {
        setApiError(getApiErrorMessage(error, 'Erro ao registrar'))
        logger.error('Registration failed', error)
      }
    },
    validateField
  )

  const passwordValidation = ValidationService.validatePassword(values.senha)

  const typeIcons = { cliente: ShoppingBag, entregador: Truck, dono_farmacia: Store }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-secondary via-primary-700 to-primary relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20 text-white">
          <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mb-8">
            <Shield className="w-7 h-7" />
          </div>
          <h2 className="text-4xl xl:text-5xl font-bold mb-4 leading-tight">
            Crie sua conta<br />em segundos
          </h2>
          <p className="text-lg text-white/80 mb-8 max-w-md">
            Junte-se a milhares de pessoas que já cuidam da saúde com praticidade.
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-sm">✓</div>
              <span className="text-white/90">Cadastro rápido e seguro</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-sm">✓</div>
              <span className="text-white/90">R$ 10 de desconto na primeira compra</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-sm">✓</div>
              <span className="text-white/90">Seus dados protegidos pela LGPD</span>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center px-4 sm:px-8 py-10 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-6">
            <div className="inline-flex items-center gap-2.5 mb-2">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center shadow-sm">
                <span className="text-white text-xl font-bold">S</span>
              </div>
              <span className="font-bold text-xl text-gray-900">Saúde na Mão</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-card p-8 sm:p-10">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Criar Conta</h1>
              <p className="text-gray-500 text-sm mt-1.5">
                Preencha os dados abaixo para se cadastrar
              </p>
            </div>

            {apiError && (
              <div className="mb-5">
                <Alert type="error" message={apiError} onClose={() => setApiError(null)} />
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Seletor de tipo de conta */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Conta</label>
              <div className="grid grid-cols-3 gap-2">
                {SELF_REGISTER_TYPES.map(({ value, label, description }) => {
                  const Icon = typeIcons[value]
                  const isSelected = tipoUsuario === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTipoUsuario(value)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
                        isSelected
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-semibold">{label}</span>
                      <span className="text-[10px] leading-tight opacity-70">{description}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label htmlFor="nome" className="block text-sm font-medium text-gray-700 mb-1">
                Nome Completo
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                  id="nome"
                  type="text"
                  name="nome"
                  value={values.nome}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="Seu nome"
                  className={`input-field pl-11 ${
                    touched.nome && errors.nome ? 'border-red-400 focus:ring-red-200' : ''
                  }`}
                  disabled={isSubmitting}
                  aria-invalid={touched.nome && !!errors.nome}
                />
              </div>
              {touched.nome && errors.nome && (
                <p className="text-red-500 text-xs mt-1">{errors.nome}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  name="email"
                  value={values.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="seu@email.com"
                  className={`input-field pl-11 ${
                    touched.email && errors.email ? 'border-red-400 focus:ring-red-200' : ''
                  }`}
                  disabled={isSubmitting}
                  aria-invalid={touched.email && !!errors.email}
                />
              </div>
              {touched.email && errors.email && (
                <p className="text-red-500 text-xs mt-1">{errors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="telefone" className="block text-sm font-medium text-gray-700 mb-1">
                Telefone
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                  id="telefone"
                  type="tel"
                  name="telefone"
                  value={values.telefone}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="(11) 99999-9999"
                  className={`input-field pl-11 ${
                    touched.telefone && errors.telefone ? 'border-red-400 focus:ring-red-200' : ''
                  }`}
                  disabled={isSubmitting}
                  aria-invalid={touched.telefone && !!errors.telefone}
                />
              </div>
              {touched.telefone && errors.telefone && (
                <p className="text-red-500 text-xs mt-1">{errors.telefone}</p>
              )}
            </div>

            <div>
              <label htmlFor="cpf" className="block text-sm font-medium text-gray-700 mb-1">
                CPF
              </label>
              <input
                id="cpf"
                type="text"
                name="cpf"
                value={values.cpf}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="000.000.000-00"
                className={`input-field ${
                  touched.cpf && errors.cpf ? 'border-red-400 focus:ring-red-200' : ''
                }`}
                disabled={isSubmitting}
                aria-invalid={touched.cpf && !!errors.cpf}
              />
              {touched.cpf && errors.cpf && (
                <p className="text-red-500 text-xs mt-1">{errors.cpf}</p>
              )}
            </div>

            <div>
              <label htmlFor="senha" className="block text-sm font-medium text-gray-700 mb-1">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                  id="senha"
                  type={showPassword ? 'text' : 'password'}
                  name="senha"
                  value={values.senha}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="••••••••"
                  className={`input-field pl-11 pr-11 ${
                    touched.senha && errors.senha ? 'border-red-400 focus:ring-red-200' : ''
                  }`}
                  disabled={isSubmitting}
                  aria-invalid={touched.senha && !!errors.senha}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-400"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {values.senha && (
                <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className={`flex items-center gap-1.5 ${passwordValidation.requirements.minLength ? 'text-green-600' : 'text-gray-400'}`}>
                    {passwordValidation.requirements.minLength ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    Mínimo 8 caracteres
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordValidation.requirements.hasUppercase ? 'text-green-600' : 'text-gray-400'}`}>
                    {passwordValidation.requirements.hasUppercase ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    Letra maiúscula
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordValidation.requirements.hasLowercase ? 'text-green-600' : 'text-gray-400'}`}>
                    {passwordValidation.requirements.hasLowercase ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    Letra minúscula
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordValidation.requirements.hasNumber ? 'text-green-600' : 'text-gray-400'}`}>
                    {passwordValidation.requirements.hasNumber ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    Número
                  </div>
                  <div className={`flex items-center gap-1.5 ${passwordValidation.requirements.hasSpecial ? 'text-green-600' : 'text-gray-400'}`}>
                    {passwordValidation.requirements.hasSpecial ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    Caractere especial
                  </div>
                </div>
              )}

              {touched.senha && errors.senha && (
                <p className="text-red-500 text-xs mt-1">{errors.senha}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmaSenha" className="block text-sm font-medium text-gray-700 mb-1">
                Confirmar Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                  id="confirmaSenha"
                  type={showPassword ? 'text' : 'password'}
                  name="confirmaSenha"
                  value={values.confirmaSenha}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="••••••••"
                  className={`input-field pl-11 ${
                    touched.confirmaSenha && errors.confirmaSenha ? 'border-red-400 focus:ring-red-200' : ''
                  }`}
                  disabled={isSubmitting}
                  aria-invalid={touched.confirmaSenha && !!errors.confirmaSenha}
                />
              </div>
              {touched.confirmaSenha && errors.confirmaSenha && (
                <p className="text-red-500 text-xs mt-1">{errors.confirmaSenha}</p>
              )}
            </div>

            {/* Campos condicionais: Entregador */}
            {tipoUsuario === 'entregador' && (
              <div className="space-y-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                  <Truck className="w-4 h-4" /> Dados do Entregador
                </p>
                <div>
                  <label htmlFor="tipo_veiculo" className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Veículo
                  </label>
                  <select
                    id="tipo_veiculo"
                    name="tipo_veiculo"
                    value={values.tipo_veiculo}
                    onChange={handleChange}
                    className="input-field"
                    disabled={isSubmitting}
                  >
                    <option value="">Selecione...</option>
                    <option value="moto">Moto</option>
                    <option value="bicicleta">Bicicleta</option>
                    <option value="carro">Carro</option>
                    <option value="a_pe">A pé</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="cnh" className="block text-sm font-medium text-gray-700 mb-1">
                    CNH
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-3 w-5 h-5 text-gray-400 pointer-events-none" />
                    <input
                      id="cnh"
                      type="text"
                      name="cnh"
                      value={values.cnh}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="Número da CNH"
                      className="input-field pl-11"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Campos condicionais: Dono de Farmácia */}
            {tipoUsuario === 'dono_farmacia' && (
              <div className="space-y-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <p className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                  <Store className="w-4 h-4" /> Dados da Farmácia
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label htmlFor="nome_farmacia" className="block text-sm font-medium text-gray-700 mb-1">
                      Nome da Farmácia
                    </label>
                    <input
                      id="nome_farmacia"
                      type="text"
                      name="nome_farmacia"
                      value={values.nome_farmacia}
                      onChange={handleChange}
                      placeholder="Nome da farmácia"
                      className="input-field"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="cnpj" className="block text-sm font-medium text-gray-700 mb-1">
                      CNPJ
                    </label>
                    <input
                      id="cnpj"
                      type="text"
                      name="cnpj"
                      value={values.cnpj}
                      onChange={handleChange}
                      placeholder="00.000.000/0000-00"
                      className="input-field"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="logradouro" className="block text-sm font-medium text-gray-700 mb-1">
                      Endereço
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400 pointer-events-none" />
                      <input
                        id="logradouro"
                        type="text"
                        name="logradouro"
                        value={values.logradouro}
                        onChange={handleChange}
                        placeholder="Logradouro"
                        className="input-field pl-11"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="numero" className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                    <input id="numero" type="text" name="numero" value={values.numero} onChange={handleChange} placeholder="Nº" className="input-field" disabled={isSubmitting} />
                  </div>
                  <div>
                    <label htmlFor="bairro" className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                    <input id="bairro" type="text" name="bairro" value={values.bairro} onChange={handleChange} placeholder="Bairro" className="input-field" disabled={isSubmitting} />
                  </div>
                  <div>
                    <label htmlFor="cidade" className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                    <input id="cidade" type="text" name="cidade" value={values.cidade} onChange={handleChange} placeholder="Cidade" className="input-field" disabled={isSubmitting} />
                  </div>
                  <div>
                    <label htmlFor="estado" className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                    <select id="estado" name="estado" value={values.estado} onChange={handleChange} className="input-field" disabled={isSubmitting}>
                      <option value="">UF</option>
                      {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="cep" className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                    <input id="cep" type="text" name="cep" value={values.cep} onChange={handleChange} placeholder="00000-000" className="input-field" disabled={isSubmitting} />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2.5 mt-2">
              <input
                type="checkbox"
                id="terms"
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                disabled={isSubmitting}
              />
              <label htmlFor="terms" className="text-xs text-gray-500 leading-relaxed">
                Concordo com os{' '}
                <Link to="/legal" className="text-primary font-medium hover:underline">
                  termos de uso
                </Link>{' '}
                e a{' '}
                <Link to="/legal" className="text-primary font-medium hover:underline">
                  política de privacidade
                </Link>
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full btn-primary flex items-center justify-center gap-2 py-3 mt-4"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Cadastrando...
                </>
              ) : (
                <>
                  Criar Conta
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100">
            {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
              <div className="mb-4">
                <p className="text-center text-gray-400 text-xs mb-3">ou registre-se com</p>
                <div ref={googleBtnRef} className="flex justify-center" />
              </div>
            )}
            <p className="text-center text-gray-500 text-sm">
              Já tem conta?{' '}
              <Link to="/login" className="text-primary font-semibold hover:text-secondary transition">
                Faça login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
  )
}
