import { useState } from 'react'
import { ChevronDown, CheckCircle, Shield, FileText, HelpCircle } from 'lucide-react'

const TABS = [
  { id: 'termos', label: 'Termos de Uso', icon: FileText },
  { id: 'privacidade', label: 'Política de Privacidade', icon: Shield },
  { id: 'faq', label: 'FAQ', icon: HelpCircle },
]

const FAQS = [
  {
    id: 1,
    pergunta: 'Este sistema vende medicamentos de verdade?',
    resposta:
      'Este ambiente demonstra o fluxo da plataforma. A operação real depende de farmácias licenciadas, responsáveis técnicos e integrações regulatórias.',
  },
  {
    id: 2,
    pergunta: 'Medicamentos controlados podem ser comprados?',
    resposta:
      'Medicamentos controlados exigem atendimento direto da farmácia e regras específicas antes de qualquer compra online.',
  },
  {
    id: 3,
    pergunta: 'Posso conversar com um farmacêutico?',
    resposta:
      'O chat é parte da simulação acadêmica. Para uso real, o atendimento farmacêutico deve ser prestado por profissional habilitado e vinculado a farmácia regularizada.',
  },
  {
    id: 4,
    pergunta: 'Como faço para usar uma receita digital?',
    resposta:
      'Você pode anexar uma imagem ou PDF para demonstrar o fluxo de validação. Use dados fictícios sempre que possível, pois receitas são dados pessoais sensíveis.',
  },
  {
    id: 5,
    pergunta: 'O pagamento é real?',
    resposta:
      'Não. Os métodos de pagamento são ilustrativos para demonstrar experiência de checkout. Nenhum cartão ou Pix real deve ser processado neste protótipo.',
  },
  {
    id: 6,
    pergunta: 'Como meus dados devem ser tratados?',
    resposta:
      'O projeto deve coletar apenas o necessário, informar a finalidade, proteger arquivos enviados e permitir correção/exclusão de dados conforme a LGPD.',
  },
]

const TERMOS_CONTENT = `
# Termos de Uso - Saúde na Mão

**Última atualização: 26 de Maio de 2026**

## 1. Aceitação dos Termos
Ao acessar esta plataforma, você reconhece que o ambiente atual apresenta fluxos de demonstração técnica.

## 2. Descrição do Serviço
Saúde na Mão apresenta uma plataforma de farmácias, produtos, upload de receita, pedido e acompanhamento de entrega.
O sistema não realiza venda real, pagamento real, prescrição, diagnóstico ou dispensação efetiva de medicamentos.

## 3. Uso de Demonstração
Os dados de farmácias, produtos, receitas, pagamentos e entregas podem ser fictícios. Para testes, não envie receitas reais nem documentos com dados pessoais sensíveis.

## 4. Medicamentos e Receitas
- Medicamentos com receita exigem validação farmacêutica simulada antes do checkout.
- Medicamentos controlados exigem atendimento direto da farmácia e regras específicas.
- O protótipo não substitui orientação médica ou farmacêutica.
- Qualquer operação real exigiria farmácia regularizada, responsável técnico, documentação sanitária e cumprimento das normas aplicáveis.

## 5. Responsabilidades do Usuário
- Usar o sistema apenas para demonstração acadêmica.
- Não inserir dados de terceiros sem autorização.
- Não tentar burlar autenticação, regras de receita ou bloqueios regulatórios.

## 6. Limitação de Responsabilidade
As informações exibidas são demonstrativas. Decisões reais sobre medicamentos devem ser feitas com médico, farmacêutico e farmácia autorizada.

## 7. Alterações
Estes termos podem ser alterados conforme o projeto evoluir ou novas exigências acadêmicas e regulatórias forem identificadas.

## 8. Lei Aplicável
Estes Termos de Uso são regidos pelas leis da República Federativa do Brasil.
`.trim()

const PRIVACIDADE_CONTENT = `
# Política de Privacidade - Saúde na Mão

**Última atualização: 26 de Maio de 2026**

## 1. Finalidade
Esta política descreve como a plataforma trata dados pessoais durante cadastro, login, carrinho, receita, pedido e suporte.

## 2. Dados Coletados
- **Cadastro**: nome, email, telefone e endereço informado.
- **Pedido**: itens do carrinho, farmácia escolhida, status e endereço de entrega simulado.
- **Receita**: arquivo enviado e metadados de validação, quando o fluxo for usado.
- **Segurança**: logs técnicos necessários para autenticação, auditoria e prevenção de abuso.

## 3. Dados Sensíveis
Receitas médicas podem conter dados pessoais sensíveis. Em ambientes de teste, recomenda-se usar arquivos fictícios ou anonimizados.

## 4. Uso dos Dados
Os dados são usados para demonstrar funcionalidades do sistema, autenticar usuários, validar regras do carrinho e registrar histórico acadêmico de pedidos.

## 5. Compartilhamento
Em ambiente acadêmico, dados não devem ser enviados a farmácias, entregadores ou processadores de pagamento reais. Qualquer integração real exigiria contrato, base legal, medidas de segurança e informação clara ao titular.

## 6. Direitos do Titular
Você tem direito a:
- Confirmar tratamento e acessar dados.
- Corrigir informações.
- Solicitar anonimização, bloqueio ou exclusão quando aplicável.
- Revogar consentimento quando ele for a base legal utilizada.

Para exercer esses direitos, contate o responsável pela plataforma.

## 7. Retenção
Dados de teste devem ser mantidos pelo menor tempo necessário para avaliação acadêmica. Arquivos de receita devem ser removidos ou anonimizados após a demonstração.

## 8. Segurança
O projeto usa autenticação, controle de acesso e validações de backend. Mesmo assim, não deve receber documentos reais sem necessidade acadêmica e autorização adequada.

## 9. Alterações
Esta política pode ser atualizada conforme o protótipo evoluir.
`.trim()

export default function Legal() {
  const [activeTab, setActiveTab] = useState('termos')
  const [expandedFAQ, setExpandedFAQ] = useState(null)

  const renderInline = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
      }
      return part
    })
  }

  const renderMarkdown = (content) => {
    const lines = content.split('\n')
    const elements = []
    let listItems = []

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`ul-${elements.length}`} className="list-disc pl-5 space-y-1 text-sm leading-relaxed">
            {listItems.map((item, i) => (
              <li key={i}>{renderInline(item)}</li>
            ))}
          </ul>
        )
        listItems = []
      }
    }

    lines.forEach((line, index) => {
      if (line.startsWith('#')) {
        flushList()
        const level = line.match(/^#+/)[0].length
        const text = line.replace(/^#+\s/, '')
        elements.push(
          level === 1 ? (
            <h1 key={index} className="text-3xl font-bold text-gray-900 mt-6 mb-4">{renderInline(text)}</h1>
          ) : (
            <h2 key={index} className="text-xl font-bold text-gray-800 mt-4 mb-2">{renderInline(text)}</h2>
          )
        )
      } else if (line.trimStart().startsWith('- ')) {
        listItems.push(line.replace(/^\s*-\s/, ''))
      } else if (line.trim()) {
        flushList()
        elements.push(
          <p key={index} className="text-sm leading-relaxed">{renderInline(line)}</p>
        )
      } else {
        flushList()
      }
    })
    flushList()
    return elements
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'termos':
        return (
          <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
            {renderMarkdown(TERMOS_CONTENT)}
          </div>
        )

      case 'privacidade':
        return (
          <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
            {renderMarkdown(PRIVACIDADE_CONTENT)}
          </div>
        )

      case 'faq':
        return (
          <div className="space-y-3">
            {FAQS.map((faq) => (
              <div key={faq.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedFAQ(expandedFAQ === faq.id ? null : faq.id)}
                  className="w-full px-4 py-3 flex justify-between items-center hover:bg-gray-50 transition text-left"
                >
                  <h3 className="font-semibold text-gray-800 text-sm">{faq.pergunta}</h3>
                  <ChevronDown
                    size={20}
                    className={`text-gray-500 transition ${
                      expandedFAQ === faq.id ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expandedFAQ === faq.id && (
                  <div className="px-4 py-3 bg-blue-50 border-t border-gray-200">
                    <p className="text-sm text-gray-700 leading-relaxed">{faq.resposta}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Documentos Legais</h1>
          <p className="text-gray-600">
            Conheça nossos Termos de Uso, Política de Privacidade e respostas frequentes
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="flex border-b border-gray-200 flex-wrap sm:flex-nowrap">
            {TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 px-4 py-4 flex items-center justify-center gap-2 font-medium text-sm transition border-b-2 ${
                    activeTab === tab.id
                      ? 'border-green-500 text-green-600 bg-green-50'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={18} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              )
            })}
          </div>

          <div className="p-6 max-h-[70vh] overflow-y-auto">{renderTabContent()}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <div className="bg-white rounded-lg p-4 shadow text-center">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1">Ambiente de Demonstração</h3>
            <p className="text-sm text-gray-600">
              Fluxos preparados para apresentação e validação
            </p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow text-center">
            <Shield className="w-8 h-8 text-blue-500 mx-auto mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1">Cuidados LGPD</h3>
            <p className="text-sm text-gray-600">
              Coleta mínima e atenção a dados sensíveis
            </p>
          </div>

          <div className="bg-white rounded-lg p-4 shadow text-center">
            <HelpCircle className="w-8 h-8 text-purple-500 mx-auto mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1">Dúvidas?</h3>
            <p className="text-sm text-gray-600">
              Entre em contato conosco através do suporte
            </p>
          </div>
        </div>

        <div className="bg-blue-50 rounded-lg p-6 mt-8 text-center border border-blue-200">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Precisa de Ajuda?</h2>
          <p className="text-gray-700 mb-4">
            Se tiver dúvidas sobre nossos termos ou política de privacidade, entre em contato:
          </p>
          <div className="space-y-2">
            <p className="text-sm">
              Email:{' '}
              <a href="mailto:legal@saudenamaao.com" className="text-blue-600 hover:underline">
                legal@saudenamaao.com
              </a>
            </p>
            <p className="text-sm">
              Telefone:{' '}
              <a href="tel:+551130000000" className="text-blue-600 hover:underline">
                (11) 3000-0000
              </a>
            </p>
            <p className="text-sm">
              Chat de Suporte: use o ícone de chat na página
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
