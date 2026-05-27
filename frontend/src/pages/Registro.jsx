import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../stores/store'
import { authService } from '../services/api'
import { useForm } from '../hooks'
import ValidationService from '../utils/validation'
import Alert from '../components/Alert'
import Logger from '../utils/logger'
import { getApiErrorMessage } from '../utils/apiErrorMessage'
import { getGoogleClientId } from '../config/env'
import { SELF_REGISTER_TYPES } from '../constants'
import {
  User,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  ArrowRight,
  Shield,
  Truck,
  Store,
  ShoppingBag,
  FileText,
  MapPin,
} from 'lucide-react'
import './Login.css'

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
  telefone: (value) => (!value ? 'Telefone é obrigatório' : null),
  cpf: (value) => {
    const validation = ValidationService.validateCPF(value)
    return validation.valid ? null : validation.error
  },
  senha: (value) => {
    const validation = ValidationService.validatePassword(value)
    return !validation.valid ? validation.error : null
  },
}

const requiredByAccountType = {
  entregador: {
    tipo_veiculo: 'Tipo de veículo é obrigatório',
    cnh: 'CNH é obrigatória',
  },
  dono_farmacia: {
    nome_farmacia: 'Nome da farmácia é obrigatório',
    cnpj: 'CNPJ é obrigatório',
    logradouro: 'Endereço é obrigatório',
    numero: 'Número é obrigatório',
    bairro: 'Bairro é obrigatório',
    cidade: 'Cidade é obrigatória',
    estado: 'Estado é obrigatório',
    cep: 'CEP é obrigatório',
  },
}

const redirectByRole = {
  admin: '/admin',
  administrador: '/admin',
  farmaceutico: '/farmaceutico',
  dono_farmacia: '/dono-farmacia',
  entregador: '/entregas',
  cliente: '/perfil',
}

export default function Registro() {
  const navigate = useNavigate()
  const { setUser, setToken } = useAuthStore()
  const [apiError, setApiError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [tipoUsuario, setTipoUsuario] = useState('cliente')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const googleBtnRef = useRef(null)
  const googleClientId = getGoogleClientId()

  const completeAuth = useCallback(
    (response) => {
      const { accessToken, user } = response.data.data
      setToken(accessToken)
      setUser(user)

      const role = user?.tipo_usuario || user?.role || 'cliente'
      navigate(redirectByRole[role] || '/perfil', { replace: true })
    },
    [navigate, setToken, setUser]
  )

  const handleGoogleRegister = useCallback(
    async (response) => {
      try {
        setApiError(null)
        setGoogleLoading(true)

        if (!response?.credential) {
          throw new Error('Token do Google não recebido')
        }

        const res = await authService.google(response.credential)
        completeAuth(res)
      } catch (err) {
        setApiError(getApiErrorMessage(err, 'Erro ao entrar com Google'))
      } finally {
        setGoogleLoading(false)
      }
    },
    [completeAuth]
  )

  useEffect(() => {
    if (!googleClientId || !googleBtnRef.current) return undefined

    let cancelled = false
    let script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')

    const renderGoogleButton = () => {
      if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return

      googleBtnRef.current.innerHTML = ''
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleRegister,
      })
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        width: Math.min(360, googleBtnRef.current.offsetWidth || 320),
        text: 'signup_with',
        shape: 'rectangular',
        locale: 'pt-BR',
      })
    }

    if (window.google?.accounts?.id) {
      renderGoogleButton()
      return () => {
        cancelled = true
      }
    }

    if (!script) {
      script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      document.body.appendChild(script)
    }

    script.addEventListener('load', renderGoogleButton)
    return () => {
      cancelled = true
      script?.removeEventListener('load', renderGoogleButton)
    }
  }, [googleClientId, handleGoogleRegister])

  const validateField = (field, value) => {
    if (field === 'confirmaSenha') {
      if (!value) return 'Confirmação de senha é obrigatória'
      if (value !== values.senha) return 'As senhas não coincidem'
      return null
    }

    const conditionalError = requiredByAccountType[tipoUsuario]?.[field]
    if (conditionalError && !value) return conditionalError

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
      tipo_veiculo: '',
      cnh: '',
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

        if (!termsAccepted) {
          setApiError('Aceite os termos de uso e a política de privacidade para continuar')
          return
        }

        logger.info('Attempting registration', { email: formData.email, tipo: tipoUsuario })

        const payload = {
          nome: formData.nome,
          email: formData.email,
          telefone: formData.telefone,
          cpf: formData.cpf,
          senha: formData.senha,
          tipo_usuario: tipoUsuario,
          lgpd_consentimento: {
            aceito: true,
            data_aceite: new Date().toISOString(),
            versao_termo: '1.0',
          },
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
        completeAuth(response)
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
    <div className="min-h-[calc(100svh-4rem)] flex flex-col lg:flex-row lg:items-start">
      <div className="hidden lg:flex lg:w-[42%] lg:sticky lg:top-16 lg:h-[calc(100svh-4rem)] bg-gradient-to-br from-slate-900 via-teal-800 to-emerald-700">
        <div className="flex h-full flex-col justify-center px-12 xl:px-16 text-white">
          <div className="w-14 h-14 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center mb-8">
            <Shield className="w-7 h-7" />
          </div>
          <h2 className="text-4xl xl:text-5xl font-bold mb-4 leading-tight">
            Cadastro simples,<br />seguro e verificado
          </h2>
          <p className="text-lg text-white/80 mb-8 max-w-md">
            Acesse farmácias, entregas e recursos profissionais com uma conta protegida.
          </p>
          <div className="space-y-3 max-w-md">
            {['Dados protegidos pela LGPD', 'Login com Google ou senha', 'Perfis para cliente, entrega e farmácia'].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 px-4 py-3">
                <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center text-sm">✓</div>
                <span className="text-white/90">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-[58%] flex items-start justify-center px-4 sm:px-8 py-8 sm:py-10 bg-gray-50">
        <div className="w-full max-w-2xl">
          <div className="lg:hidden text-center mb-6">
            <div className="inline-flex items-center gap-2.5 mb-2">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center shadow-sm">
                <span className="text-white text-xl font-bold">S</span>
              </div>
              <span className="font-bold text-xl text-gray-900">Saúde na Mão</span>
            </div>
          </div>

          <div className="bg-white rounded-xl sm:rounded-2xl shadow-card p-5 sm:p-8 lg:p-10">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Criar conta</h1>
              <p className="text-gray-500 text-sm mt-1.5">
                Escolha seu perfil e preencha os dados para começar.
              </p>
            </div>

            {apiError && (
              <div className="mb-5">
                <Alert type="error" message={apiError} onClose={() => setApiError(null)} />
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <section>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de conta</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {SELF_REGISTER_TYPES.map(({ value, label, description }) => {
                    const Icon = typeIcons[value]
                    const isSelected = tipoUsuario === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setTipoUsuario(value)
                          setApiError(null)
                        }}
                        className={`min-h-24 flex sm:flex-col items-center sm:items-start gap-3 p-4 rounded-xl border text-left transition ${
                          isSelected
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span>
                          <span className="block text-sm font-semibold">{label}</span>
                          <span className="block text-xs leading-snug opacity-75 mt-1">{description}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nome completo" id="nome" error={touched.nome && errors.nome}>
                  <IconInput
                    id="nome"
                    name="nome"
                    value={values.nome}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Seu nome"
                    icon={User}
                    disabled={isSubmitting}
                  />
                </Field>

                <Field label="Email" id="email" error={touched.email && errors.email}>
                  <IconInput
                    id="email"
                    type="email"
                    name="email"
                    value={values.email}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="seu@email.com"
                    icon={Mail}
                    disabled={isSubmitting}
                  />
                </Field>

                <Field label="Telefone" id="telefone" error={touched.telefone && errors.telefone}>
                  <IconInput
                    id="telefone"
                    type="tel"
                    name="telefone"
                    value={values.telefone}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="(62) 99999-9999"
                    icon={Phone}
                    disabled={isSubmitting}
                  />
                </Field>

                <Field label="CPF" id="cpf" error={touched.cpf && errors.cpf}>
                  <input
                    id="cpf"
                    type="text"
                    name="cpf"
                    value={values.cpf}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="000.000.000-00"
                    className={`input-field ${touched.cpf && errors.cpf ? 'border-red-400 focus:ring-red-200' : ''}`}
                    disabled={isSubmitting}
                  />
                </Field>
              </section>

              <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Field label="Senha" id="senha" error={touched.senha && errors.senha}>
                    <PasswordInput
                      id="senha"
                      name="senha"
                      value={values.senha}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      showPassword={showPassword}
                      setShowPassword={setShowPassword}
                      disabled={isSubmitting}
                    />
                  </Field>

                  {values.senha && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-y-1 text-xs">
                      <PasswordRule ok={passwordValidation.requirements.minLength} text="Mínimo 8 caracteres" />
                      <PasswordRule ok={passwordValidation.requirements.hasUppercase} text="Letra maiúscula" />
                      <PasswordRule ok={passwordValidation.requirements.hasLowercase} text="Letra minúscula" />
                      <PasswordRule ok={passwordValidation.requirements.hasNumber} text="Número" />
                      <PasswordRule ok={passwordValidation.requirements.hasSpecial} text="Caractere especial" />
                    </div>
                  )}
                </div>

                <Field label="Confirmar senha" id="confirmaSenha" error={touched.confirmaSenha && errors.confirmaSenha}>
                  <IconInput
                    id="confirmaSenha"
                    type={showPassword ? 'text' : 'password'}
                    name="confirmaSenha"
                    value={values.confirmaSenha}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="••••••••"
                    icon={Lock}
                    disabled={isSubmitting}
                  />
                </Field>
              </section>

              {tipoUsuario === 'entregador' && (
                <section className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-sm font-semibold text-blue-800 flex items-center gap-2 mb-4">
                    <Truck className="w-4 h-4" /> Dados do entregador
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Tipo de veículo" id="tipo_veiculo" error={touched.tipo_veiculo && errors.tipo_veiculo}>
                      <select
                        id="tipo_veiculo"
                        name="tipo_veiculo"
                        value={values.tipo_veiculo}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className="input-field"
                        disabled={isSubmitting}
                      >
                        <option value="">Selecione</option>
                        <option value="moto">Moto</option>
                        <option value="bicicleta">Bicicleta</option>
                        <option value="carro">Carro</option>
                      </select>
                    </Field>

                    <Field label="CNH" id="cnh" error={touched.cnh && errors.cnh}>
                      <IconInput
                        id="cnh"
                        name="cnh"
                        value={values.cnh}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder="Número da CNH"
                        icon={FileText}
                        disabled={isSubmitting}
                      />
                    </Field>
                  </div>
                </section>
              )}

              {tipoUsuario === 'dono_farmacia' && (
                <section className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-800 flex items-center gap-2 mb-4">
                    <Store className="w-4 h-4" /> Dados da farmácia
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Nome da farmácia" id="nome_farmacia" error={touched.nome_farmacia && errors.nome_farmacia}>
                      <input id="nome_farmacia" name="nome_farmacia" value={values.nome_farmacia} onChange={handleChange} onBlur={handleBlur} placeholder="Nome da farmácia" className="input-field" disabled={isSubmitting} />
                    </Field>
                    <Field label="CNPJ" id="cnpj" error={touched.cnpj && errors.cnpj}>
                      <input id="cnpj" name="cnpj" value={values.cnpj} onChange={handleChange} onBlur={handleBlur} placeholder="00.000.000/0000-00" className="input-field" disabled={isSubmitting} />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Endereço" id="logradouro" error={touched.logradouro && errors.logradouro}>
                        <IconInput id="logradouro" name="logradouro" value={values.logradouro} onChange={handleChange} onBlur={handleBlur} placeholder="Logradouro" icon={MapPin} disabled={isSubmitting} />
                      </Field>
                    </div>
                    <Field label="Número" id="numero" error={touched.numero && errors.numero}>
                      <input id="numero" name="numero" value={values.numero} onChange={handleChange} onBlur={handleBlur} placeholder="Nº" className="input-field" disabled={isSubmitting} />
                    </Field>
                    <Field label="Bairro" id="bairro" error={touched.bairro && errors.bairro}>
                      <input id="bairro" name="bairro" value={values.bairro} onChange={handleChange} onBlur={handleBlur} placeholder="Bairro" className="input-field" disabled={isSubmitting} />
                    </Field>
                    <Field label="Cidade" id="cidade" error={touched.cidade && errors.cidade}>
                      <input id="cidade" name="cidade" value={values.cidade} onChange={handleChange} onBlur={handleBlur} placeholder="Goiânia" className="input-field" disabled={isSubmitting} />
                    </Field>
                    <Field label="Estado" id="estado" error={touched.estado && errors.estado}>
                      <select id="estado" name="estado" value={values.estado} onChange={handleChange} onBlur={handleBlur} className="input-field" disabled={isSubmitting}>
                        <option value="">UF</option>
                        {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map((uf) => (
                          <option key={uf} value={uf}>{uf}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="CEP" id="cep" error={touched.cep && errors.cep}>
                      <input id="cep" name="cep" value={values.cep} onChange={handleChange} onBlur={handleBlur} placeholder="00000-000" className="input-field" disabled={isSubmitting} />
                    </Field>
                  </div>
                </section>
              )}

              <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                  disabled={isSubmitting}
                />
                <span className="text-xs text-gray-500 leading-relaxed">
                  Concordo com os{' '}
                  <Link to="/legal" className="text-primary font-medium hover:underline">
                    termos de uso
                  </Link>{' '}
                  e a{' '}
                  <Link to="/legal" className="text-primary font-medium hover:underline">
                    política de privacidade
                  </Link>
                  .
                </span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full btn-primary flex items-center justify-center gap-2 py-3"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Cadastrando...
                  </>
                ) : (
                  <>
                    Criar conta
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-7 pt-6 border-t border-gray-100">
              {googleClientId && (
                <div className={`mb-5 ${googleLoading ? 'opacity-60 pointer-events-none' : ''}`}>
                  <p className="text-center text-gray-400 text-xs mb-3">ou cadastre-se com</p>
                  <div ref={googleBtnRef} className="google-login-slot flex justify-center" />
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

function Field({ label, id, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}

function IconInput({ icon: Icon, className = '', ...props }) {
  return (
    <div className="relative">
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
      <input className={`input-field pl-11 ${className}`} {...props} />
    </div>
  )
}

function PasswordInput({ showPassword, setShowPassword, ...props }) {
  return (
    <div className="relative">
      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
      <input
        type={showPassword ? 'text' : 'password'}
        placeholder="••••••••"
        className="input-field pl-11 pr-11"
        {...props}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition p-0.5"
        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

function PasswordRule({ ok, text }) {
  return (
    <div className={`flex items-center gap-1.5 ${ok ? 'text-green-600' : 'text-gray-400'}`}>
      {ok ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
      {text}
    </div>
  )
}
