import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../stores/store'
import { userService } from '../services/api'

/**
 * Chave de sessão definida no cadastro (Registro.jsx). O contrato LGPD é
 * apresentado UMA única vez, logo após a criação da conta — nunca a cada login.
 */
export const LGPD_CONTRACT_FLAG = 'snm_show_lgpd_contract'

/**
 * Contrato de consentimento (LGPD + confiabilidade + base constitucional)
 * exibido logo após o cadastro do cliente para indicar como os dados são usados.
 */
export default function LgpdConsentModal() {
  const { token, user, setUser } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState(null)
  const [show, setShow] = useState(false)

  const role = user?.role || user?.tipo_usuario

  useEffect(() => {
    if (typeof window === 'undefined') return
    const flag = window.sessionStorage?.getItem(LGPD_CONTRACT_FLAG) === '1'
    const ehCliente = !role || role === 'cliente'
    setShow(Boolean(token && user) && ehCliente && flag)
  }, [token, user, role])

  if (!show) return null

  const fechar = () => {
    try {
      window.sessionStorage?.removeItem(LGPD_CONTRACT_FLAG)
    } catch {
      /* ignore */
    }
    setShow(false)
  }

  const aceitar = async () => {
    try {
      setSaving(true)
      setErro(null)
      // Idempotente: registra/atualiza a data e o IP do consentimento no servidor.
      await userService.recordLgpdConsent()
      setUser((u) => ({
        ...(u || {}),
        lgpd_consentimento: {
          ...(u?.lgpd_consentimento || {}),
          aceito: true,
          data_aceite: new Date().toISOString(),
          versao_termo: '2.0',
        },
      }))
      fechar()
    } catch (e) {
      setErro(
        e?.response?.data?.message ||
          'Não foi possível registrar o consentimento. Tente novamente.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-xl flex flex-col max-h-[90vh]">
        <div className="p-6 pb-4 border-b border-gray-100">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-center">
            Contrato de Consentimento e Proteção de Dados
          </h2>
          <p className="text-xs text-gray-500 text-center mt-1">
            Conta criada com sucesso. Leia como tratamos seus dados antes de continuar.
          </p>
        </div>

        <div className="px-6 py-4 overflow-y-auto text-sm text-gray-700 space-y-4 leading-relaxed">
          <p>
            Este contrato rege o tratamento dos seus dados pessoais pela plataforma
            <strong> Saúde na Mão</strong>, em conformidade com a{' '}
            <strong>Lei Geral de Proteção de Dados Pessoais — LGPD (Lei nº 13.709/2018)</strong>,
            com o <strong>Código de Defesa do Consumidor (Lei nº 8.078/1990)</strong> e com os
            direitos fundamentais à <strong>privacidade, intimidade e dignidade da pessoa humana</strong>{' '}
            assegurados pelo <strong>art. 5º, incisos X e XII, da Constituição Federal de 1988</strong>.
          </p>

          <div>
            <h3 className="font-bold text-gray-900 mb-1">1. Dados tratados</h3>
            <p>
              Coletamos e tratamos: dados de cadastro (nome, CPF, RG, e-mail, telefone),
              endereços de entrega, histórico de pedidos e dados sensíveis de saúde
              (receitas médicas, medicamentos adquiridos, dados do prescritor). O RG e o
              CPF são utilizados, entre outras finalidades legais, para o registro de
              dispensação de medicamentos controlados no SNGPC/ANVISA.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-gray-900 mb-1">2. Finalidade e base legal</h3>
            <p>
              Os dados são tratados exclusivamente para: processar e entregar seus pedidos;
              cumprir obrigações regulatórias sanitárias (ANVISA, Portaria 344/98); permitir
              a validação farmacêutica de receitas; e atender obrigações legais e
              contratuais. O tratamento se baseia no <strong>seu consentimento</strong> (art. 7º, I),
              na <strong>execução do contrato</strong> (art. 7º, V) e no{' '}
              <strong>cumprimento de obrigação legal/regulatória</strong> (art. 7º, II; art. 11, II, “a”).
            </p>
          </div>

          <div>
            <h3 className="font-bold text-gray-900 mb-1">3. Confiabilidade e segurança</h3>
            <p>
              Adotamos medidas técnicas e organizacionais para proteger seus dados contra
              acessos não autorizados, perda ou divulgação indevida. Dados sensíveis de
              saúde são confidenciais e visíveis apenas a você e ao farmacêutico responsável
              pela dispensação. <strong>Seus dados não são vendidos</strong> nem compartilhados
              com terceiros sem base legal.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-gray-900 mb-1">4. Seus direitos (art. 18 da LGPD)</h3>
            <p>
              A qualquer momento você pode confirmar a existência de tratamento, acessar,
              corrigir, exportar (portabilidade) ou solicitar a exclusão/anonimização dos
              seus dados, bem como revogar este consentimento, diretamente na área{' '}
              <strong>Perfil → Privacidade e Dados (LGPD)</strong>. A revogação não afeta a
              legalidade do tratamento realizado antes dela nem as obrigações de retenção
              exigidas por lei.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-gray-900 mb-1">5. Retenção</h3>
            <p>
              Registros de dispensação de medicamentos e documentos fiscais são mantidos
              pelo prazo exigido pela legislação sanitária e tributária, mesmo após eventual
              pedido de exclusão da conta, hipótese em que os demais dados pessoais são
              anonimizados.
            </p>
          </div>

          <p className="text-xs text-gray-500">
            Consulte também os{' '}
            <Link to="/legal" target="_blank" className="text-primary underline">
              Termos de Uso e a Política de Privacidade
            </Link>
            . Este consentimento é registrado com data e hora.
          </p>
        </div>

        {erro && <p className="text-sm text-red-600 text-center px-6">{erro}</p>}

        <div className="p-6 pt-4 border-t border-gray-100">
          <button
            onClick={aceitar}
            disabled={saving}
            className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-secondary transition disabled:opacity-50"
          >
            {saving ? 'Registrando...' : 'Li e concordo com o tratamento dos meus dados'}
          </button>
        </div>
      </div>
    </div>
  )
}
