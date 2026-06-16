import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuthStore } from '../stores/store'
import { authService } from '../services/api'
import { useForm } from '../hooks'
import ValidationService from '../utils/validation'
import Alert from '../components/Alert'
import Logger from '../utils/logger'
import { getApiErrorMessage } from '../utils/apiErrorMessage'
import { getGoogleClientId } from '../config/env'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Heart, KeyRound } from 'lucide-react'
import './Login.css'

const logger = new Logger('Login')

const loginSchema = {
  email: (value) => {
    const validation = ValidationService.validateEmail(value)
    return validation.valid ? null : validation.error
  },
  senha: (value) => {
    if (!value) return 'Senha é obrigatória'
    return null
  },
}

const defaultDestByRole = {
  admin: '/admin',
  administrador: '/admin',
  farmaceutico: '/farmaceutico',
  dono_farmacia: '/dono-farmacia',
  entregador: '/entregas',
  cliente: '/perfil',
}

const fromAllowedByRole = {
  entregador: (path) => path === '/entregas' || path.startsWith('/entregas/'),
  farmaceutico: (path) => path === '/farmaceutico' || path.startsWith('/farmaceutico/'),
  dono_farmacia: (path) => path === '/dono-farmacia' || path.startsWith('/dono-farmacia/'),
  administrador: (path) => path === '/admin' || path.startsWith('/admin/'),
  admin: (path) => path === '/admin' || path.startsWith('/admin/'),
  cliente: () => true,
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setUser, setToken } = useAuthStore()
  const [apiError, setApiError] = useState(null)
  const [infoMessage, setInfoMessage] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [loginMode, setLoginMode] = useState('password')
  const [otpEmail, setOtpEmail] = useState('')
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const [otpSent, setOtpSent] = useState(false)
  const [emailCodeLoading, setEmailCodeLoading] = useState(false)
  const [emailCodeVerifying, setEmailCodeVerifying] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const googleButtonRef = useRef(null)
  const otpInputsRef = useRef([])
  const googleClientId = getGoogleClientId()

  const completeLogin = useCallback(
    (response) => {
      const { accessToken, user } = response.data.data

      if (!accessToken || !user) {
        throw new Error('Resposta inválida do servidor')
      }

      setToken(accessToken)
      setUser(user)
      logger.info('Login successful', { userId: user.id })

      const role =
        user?.tipo_usuario ||
        user?.role ||
        (user?.dados_entregador ? 'entregador' : null)
      const from = location.state?.from
      const defaultDest = defaultDestByRole[role] || '/perfil'
      const canUseFrom = Boolean(from && fromAllowedByRole[role]?.(from))
      const dest = canUseFrom ? from : defaultDest
      setTimeout(() => navigate(dest, { replace: true }), 500)
    },
    [location.state?.from, navigate, setToken, setUser]
  )

  const { values, errors, touched, isSubmitting, handleChange, handleBlur, handleSubmit } = useForm(
    { email: '', senha: '' },
    async (formData) => {
      try {
        setApiError(null)
        setInfoMessage(null)
        logger.info('Attempting login', { email: formData.email })

        const response = await authService.login(formData.email, formData.senha)
        completeLogin(response)
      } catch (error) {
        logger.error('Login error:', error)
        setApiError(getApiErrorMessage(error, 'Erro ao fazer login'))
      }
    },
    (field, value) => loginSchema[field]?.(value)
  )

  const handleGoogleCredential = useCallback(
    async (googleResponse) => {
      try {
        setApiError(null)
        setInfoMessage(null)
        setGoogleLoading(true)

        if (!googleResponse?.credential) {
          throw new Error('Token do Google não recebido')
        }

        const response = await authService.google(googleResponse.credential)
        completeLogin(response)
      } catch (error) {
        logger.error('Google login error:', error)
        setApiError(getApiErrorMessage(error, 'Erro ao entrar com Google'))
      } finally {
        setGoogleLoading(false)
      }
    },
    [completeLogin]
  )

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return undefined

    let cancelled = false
    let script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')

    const renderGoogleButton = () => {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) return

      googleButtonRef.current.innerHTML = ''
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential,
      })
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'center',
        width: Math.min(400, googleButtonRef.current.offsetWidth || 360),
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
  }, [googleClientId, handleGoogleCredential])

  const changeMode = (mode) => {
    setLoginMode(mode)
    setApiError(null)
    setInfoMessage(null)
  }

  const requestEmailCode = async (event) => {
    event.preventDefault()
    const validation = ValidationService.validateEmail(otpEmail)
    if (!validation.valid) {
      setApiError(validation.error)
      return
    }

    try {
      setApiError(null)
      setInfoMessage(null)
      setEmailCodeLoading(true)
      await authService.requestEmailCode(otpEmail)
      setOtpSent(true)
      setOtpDigits(['', '', '', '', '', ''])
      setInfoMessage('Código enviado. Verifique sua caixa de entrada.')
      setTimeout(() => otpInputsRef.current[0]?.focus(), 100)
    } catch (error) {
      logger.error('Email code request error:', error)
      setApiError(getApiErrorMessage(error, 'Erro ao enviar código'))
    } finally {
      setEmailCodeLoading(false)
    }
  }

  const verifyEmailCode = async (event) => {
    event.preventDefault()
    const code = otpDigits.join('')
    if (code.length !== 6) {
      setApiError('Informe o código de 6 dígitos')
      return
    }

    try {
      setApiError(null)
      setInfoMessage(null)
      setEmailCodeVerifying(true)
      const response = await authService.verifyEmailCode(otpEmail, code)
      completeLogin(response)
    } catch (error) {
      logger.error('Email code verification error:', error)
      setApiError(getApiErrorMessage(error, 'Código inválido ou expirado'))
    } finally {
      setEmailCodeVerifying(false)
    }
  }

  const updateOtpDigit = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    setOtpDigits((current) => {
      const next = [...current]
      next[index] = digit
      return next
    })

    if (digit && index < 5) {
      otpInputsRef.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (event) => {
    event.preventDefault()
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('')
    if (!digits.length) return

    setOtpDigits((current) => {
      const next = [...current]
      digits.forEach((digit, index) => {
        next[index] = digit
      })
      return next
    })
    otpInputsRef.current[Math.min(digits.length, 6) - 1]?.focus()
  }

  return (
    <div className="min-h-[calc(100svh-4rem)] flex flex-col lg:flex-row">
      <div className="hidden lg:flex lg:w-[48%] bg-gradient-to-br from-emerald-700 via-teal-700 to-slate-900 relative">
        <div className="lg:sticky lg:top-16 flex h-[calc(100svh-4rem)] flex-col justify-center px-12 xl:px-20 text-white">
          <div className="w-14 h-14 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center mb-8">
            <Heart className="w-7 h-7" />
          </div>
          <h2 className="text-4xl xl:text-5xl font-bold mb-4 leading-tight">
            Sua saúde na<br />palma da mão
          </h2>
          <p className="text-lg text-white/80 mb-8 max-w-md">
            Compre medicamentos com segurança e receba em casa com rapidez e praticidade.
          </p>
          <div className="space-y-3 max-w-md">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 px-4 py-3">
              <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center text-sm">✓</div>
              <span className="text-white/90">Entrega em até 4 horas</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 px-4 py-3">
              <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center text-sm">✓</div>
              <span className="text-white/90">Preços competitivos e transparentes</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 px-4 py-3">
              <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center text-sm">✓</div>
              <span className="text-white/90">Pagamento seguro e protegido</span>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-[52%] flex items-start justify-center px-4 sm:px-8 py-8 sm:py-10 lg:py-12 bg-gray-50">
        <div className="w-full max-w-md">
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
              <h1 className="text-2xl font-bold text-gray-900">Bem-vindo de volta</h1>
              <p className="text-gray-500 text-sm mt-1.5">
                Acesse sua conta com senha, Google ou código por e-mail.
              </p>
            </div>

            {apiError && (
              <div className="mb-5">
                <Alert type="error" message={apiError} onClose={() => setApiError(null)} />
              </div>
            )}

            {infoMessage && (
              <div className="mb-5">
                <Alert type="success" message={infoMessage} onClose={() => setInfoMessage(null)} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 mb-6">
              <button
                type="button"
                onClick={() => changeMode('password')}
                className={`h-10 rounded-lg text-sm font-semibold transition ${
                  loginMode === 'password'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Senha
              </button>
              <button
                type="button"
                onClick={() => changeMode('code')}
                className={`h-10 rounded-lg text-sm font-semibold transition ${
                  loginMode === 'code'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Código
              </button>
            </div>

            {loginMode === 'password' ? (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
                    <input
                      id="email"
                      type="email"
                      name="email"
                      value={values.email}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="seu@email.com"
                      className={`input-field pl-11 ${
                        touched.email && errors.email ? 'border-red-400 focus:ring-red-200 focus:border-red-400' : ''
                      }`}
                      disabled={isSubmitting}
                      aria-invalid={touched.email && !!errors.email}
                      aria-describedby={touched.email && errors.email ? 'email-error' : undefined}
                    />
                  </div>
                  {touched.email && errors.email && (
                    <p id="email-error" className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                      <span className="w-1 h-1 bg-red-500 rounded-full" />
                      {errors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="senha" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
                    <input
                      id="senha"
                      type={showPassword ? 'text' : 'password'}
                      name="senha"
                      value={values.senha}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="••••••••"
                      className={`input-field pl-11 pr-11 ${
                        touched.senha && errors.senha ? 'border-red-400 focus:ring-red-200 focus:border-red-400' : ''
                      }`}
                      disabled={isSubmitting}
                      aria-invalid={touched.senha && !!errors.senha}
                      aria-describedby={touched.senha && errors.senha ? 'senha-error' : undefined}
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
                  {touched.senha && errors.senha && (
                    <p id="senha-error" className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                      <span className="w-1 h-1 bg-red-500 rounded-full" />
                      {errors.senha}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30" />
                    <span className="text-sm text-gray-600">Lembrar-me</span>
                  </label>
                  <Link to="/legal" className="text-sm text-primary hover:text-secondary font-medium transition">
                    Esqueci a senha
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full btn-primary flex items-center justify-center gap-2 py-3"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    <>
                      Entrar
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={otpSent ? verifyEmailCode : requestEmailCode} className="space-y-5" noValidate>
                <div>
                  <label htmlFor="otp-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
                    <input
                      id="otp-email"
                      type="email"
                      value={otpEmail}
                      onChange={(event) => setOtpEmail(event.target.value)}
                      placeholder="seu@email.com"
                      className="input-field pl-11"
                      disabled={emailCodeLoading || emailCodeVerifying || otpSent}
                    />
                  </div>
                </div>

                {otpSent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Código de acesso
                    </label>
                    <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
                      {otpDigits.map((digit, index) => (
                        <input
                          key={index}
                          ref={(element) => {
                            otpInputsRef.current[index] = element
                          }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(event) => updateOtpDigit(index, event.target.value)}
                          onKeyDown={(event) => handleOtpKeyDown(index, event)}
                          onPaste={handleOtpPaste}
                          className="h-11 sm:h-12 rounded-xl border border-gray-200 text-center text-lg font-bold text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                          aria-label={`Dígito ${index + 1}`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpSent(false)
                        setOtpDigits(['', '', '', '', '', ''])
                        setInfoMessage(null)
                      }}
                      className="mt-3 text-sm font-medium text-primary hover:text-secondary transition"
                    >
                      Alterar e-mail
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={emailCodeLoading || emailCodeVerifying}
                  className="w-full btn-primary flex items-center justify-center gap-2 py-3"
                >
                  {emailCodeLoading || emailCodeVerifying ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {emailCodeVerifying ? 'Validando...' : 'Enviando...'}
                    </>
                  ) : otpSent ? (
                    <>
                      Validar código
                      <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      Receber código
                      <KeyRound className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            <div className="my-6 flex items-center gap-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">ou</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {googleClientId ? (
              <div className={`google-login-slot ${googleLoading ? 'opacity-60 pointer-events-none' : ''}`}>
                <div ref={googleButtonRef} className="flex justify-center" />
              </div>
            ) : (
              <button
                type="button"
                disabled
                className="w-full h-11 rounded-xl border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-400"
              >
                Google não configurado
              </button>
            )}

            <p className="text-center text-gray-500 text-sm mt-8">
              Ainda não tem conta?{' '}
              <Link to="/registro" className="text-primary font-semibold hover:text-secondary transition">
                Cadastre-se gratuitamente
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
