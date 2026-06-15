import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../stores/store'
import { userService } from '../services/api'

/**
 * Gate de consentimento LGPD exibido logo após o cadastro/login do cliente,
 * antes de completar os dados. Registra data/IP no servidor.
 */
export default function LgpdConsentModal() {
  const { token, user, setUser } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState(null)

  const role = user?.role || user?.tipo_usuario
  const precisaConsentir =
    Boolean(token && user) &&
    (!role || role === 'cliente') &&
    user?.lgpd_consentimento?.aceito !== true

  if (!precisaConsentir) return null

  const aceitar = async () => {
    try {
      setSaving(true)
      setErro(null)
      await userService.recordLgpdConsent()
      setUser((u) => ({
        ...(u || {}),
        lgpd_consentimento: {
          ...(u?.lgpd_consentimento || {}),
          aceito: true,
          data_aceite: new Date().toISOString(),
        },
      }))
    } catch (e) {
      setErro(e?.response?.data?.message || 'Não foi possível registrar o consentimento. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl">
        <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-center mb-2">Privacidade e Proteção de Dados</h2>
        <p className="text-sm text-gray-600 text-center mb-4">
          Para usar o Saúde na Mão, precisamos do seu consentimento, conforme a
          <strong> LGPD (Lei 13.709/2018)</strong>. Tratamos seus dados (cadastro, endereço,
          pedidos e receitas) apenas para processar seus pedidos e a dispensação de
          medicamentos.
        </p>
        <ul className="text-xs text-gray-500 space-y-1 mb-4 list-disc pl-5">
          <li>Seus dados não são vendidos nem expostos a terceiros sem base legal.</li>
          <li>Dados sensíveis de saúde (receitas, medicamentos) são confidenciais e só visíveis a você e ao farmacêutico responsável.</li>
          <li>Você pode exportar ou excluir seus dados quando quiser, no seu Perfil.</li>
        </ul>
        <p className="text-xs text-gray-500 text-center mb-4">
          Leia os{' '}
          <Link to="/legal" target="_blank" className="text-primary underline">
            Termos de Uso e a Política de Privacidade
          </Link>
          .
        </p>
        {erro && <p className="text-sm text-red-600 text-center mb-3">{erro}</p>}
        <button
          onClick={aceitar}
          disabled={saving}
          className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-secondary transition disabled:opacity-50"
        >
          {saving ? 'Registrando...' : 'Li e concordo'}
        </button>
      </div>
    </div>
  )
}
