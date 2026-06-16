import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, CheckCircle, Shield, FileText, HelpCircle } from 'lucide-react'

const VALID_TABS = ['termos', 'privacidade', 'faq']

const TABS = [
  { id: 'termos', label: 'Termos de Uso', icon: FileText },
  { id: 'privacidade', label: 'Política de Privacidade', icon: Shield },
  { id: 'faq', label: 'FAQ', icon: HelpCircle },
]

const FAQS = [
  {
    id: 1,
    pergunta: 'Como funciona a compra de medicamentos?',
    resposta:
      'A plataforma conecta clientes a farmácias cadastradas, com pedido, pagamento, validação farmacêutica quando necessário e acompanhamento da entrega.',
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
      'Sim. O atendimento farmacêutico fica disponível para dúvidas sobre receita, produtos e acompanhamento do pedido.',
  },
  {
    id: 4,
    pergunta: 'Como faço para usar uma receita digital?',
    resposta:
      'Anexe uma imagem ou PDF da receita no fluxo de compra. A farmácia avalia o documento antes da liberação dos itens que exigem validação.',
  },
  {
    id: 5,
    pergunta: 'O pagamento é real?',
    resposta:
      'O pagamento é confirmado no fluxo do pedido e registrado no comprovante exibido ao cliente.',
  },
  {
    id: 6,
    pergunta: 'Como meus dados devem ser tratados?',
    resposta:
      'O projeto deve coletar apenas o necessário, informar a finalidade, proteger arquivos enviados e permitir correção/exclusão de dados conforme a LGPD.',
  },
  {
    id: 7,
    pergunta: 'Como funciona o frete?',
    resposta:
      'Cada farmácia define a sua própria taxa de entrega, exibida antes de confirmar o pedido. Você pode comparar farmácias pelo menor frete e pelo menor preço total (produto + entrega).',
  },
  {
    id: 8,
    pergunta: 'Quais formas de pagamento são aceitas?',
    resposta:
      'Pix, cartão de crédito, cartão de débito e dinheiro na entrega, conforme as opções oferecidas por cada farmácia. O pagamento é confirmado no carrinho, na etapa final da compra.',
  },
  {
    id: 9,
    pergunta: 'Como acompanho a entrega do meu pedido?',
    resposta:
      'Após a confirmação, acompanhe o status em tempo real em "Meus Pedidos". Você verá quando o pedido é separado, sai para entrega e chega, e confirma o recebimento com um código.',
  },
  {
    id: 10,
    pergunta: 'Preciso estar logado para comprar?',
    resposta:
      'Sim. Para adicionar produtos ao carrinho, enviar receitas e finalizar a compra é necessário ter uma conta e estar logado, garantindo a segurança dos seus dados.',
  },
]

const TERMOS_CONTENT = `
# Termos de Uso - Saúde na Mão

**Última atualização: 10 de Junho de 2026**

## 1. Aceitação dos Termos
Ao acessar a plataforma, você concorda com estes Termos de Uso e com as regras aplicáveis aos pedidos realizados.

## 2. Descrição do Serviço
Saúde na Mão conecta clientes a farmácias cadastradas, permitindo busca de produtos, envio de receita, pagamento, acompanhamento de pedidos e suporte.

## 3. Conta e Pedidos
O usuário deve informar dados corretos de cadastro, endereço e contato. A confirmação do pedido depende de disponibilidade, pagamento e validação farmacêutica quando aplicável.

## 4. Medicamentos e Receitas
- Medicamentos com receita exigem validação farmacêutica antes da liberação.
- Medicamentos controlados exigem atendimento direto da farmácia e regras específicas.
- A plataforma não substitui consulta médica, prescrição ou orientação individualizada.
- A farmácia é responsável pela dispensação conforme normas sanitárias aplicáveis.

## 5. Responsabilidades do Usuário
- Usar a plataforma de forma adequada.
- Não inserir dados de terceiros sem autorização.
- Não tentar burlar autenticação, regras de receita ou validações de segurança.

## 6. Pagamentos
- O pagamento é processado no momento da finalização do pedido, pelos meios oferecidos pela farmácia (Pix, cartão ou dinheiro na entrega).
- Para medicamentos com retenção de receita, a cobrança só é liberada após a validação do farmacêutico.
- O valor total exibido inclui os produtos, o frete da farmácia escolhida e eventuais descontos de cupom.

## 7. Frete e Entrega
- O valor do frete é definido por cada farmácia e exibido antes da confirmação do pedido.
- O prazo de entrega é estimado e pode variar conforme a distância, o trânsito e a disponibilidade de entregadores.
- A entrega é confirmada por código, garantindo que o pedido foi recebido pelo cliente correto.

## 8. Cancelamento e Devolução
- Pedidos podem ser cancelados antes da separação/coleta sem custo.
- Medicamentos só são devolvidos conforme as regras sanitárias aplicáveis e a política da farmácia.
- Receitas rejeitadas permitem ao cliente cancelar o pedido ou reenviar o documento.

## 9. Limitação de Responsabilidade
A plataforma organiza o fluxo do pedido. Decisões clínicas, prescrição, substituição terapêutica e dispensação dependem de profissionais habilitados e farmácias autorizadas.

## 10. Alterações
Estes termos podem ser alterados conforme evolução do serviço, exigências legais ou melhorias operacionais.

## 11. Lei Aplicável
Estes Termos de Uso são regidos pelas leis da República Federativa do Brasil.
`.trim()

const PRIVACIDADE_CONTENT = `
# Política de Privacidade - Saúde na Mão

**Última atualização: 10 de Junho de 2026**

## 1. Finalidade
Esta política descreve como a plataforma trata dados pessoais durante cadastro, login, carrinho, receita, pedido e suporte.

## 2. Dados Coletados
- **Cadastro**: nome, email, telefone e endereço informado.
- **Pedido**: itens do carrinho, farmácia escolhida, status, pagamento e endereço de entrega.
- **Receita**: arquivo enviado e metadados de validação, quando o fluxo for usado.
- **Segurança**: logs técnicos necessários para autenticação, auditoria e prevenção de abuso.

## 3. Dados Sensíveis e Confidencialidade da Saúde
Receitas, princípios ativos e medicamentos solicitados são **dados pessoais sensíveis** (art. 5º, II da LGPD) e recebem tratamento reforçado:
- O conteúdo da receita e a condição de saúde do paciente são **confidenciais**.
- Apenas **o próprio paciente** e o **farmacêutico responsável pela farmácia do pedido** têm acesso ao documento e aos dados clínicos.
- Entregadores e demais usuários **nunca** visualizam a condição de saúde, o diagnóstico ou o medicamento sensível — recebem apenas os dados necessários para a entrega.
- Exemplo: um cliente que compra um medicamento de uso contínuo ou de condição estigmatizante não tem essa informação exposta a terceiros.

## 4. Uso dos Dados
Os dados são usados para autenticar usuários, processar pedidos, validar regras do carrinho, registrar histórico, prestar suporte e proteger a plataforma.

## 5. Compartilhamento
Dados podem ser compartilhados com a farmácia do pedido e o entregador designado, **limitados ao mínimo necessário** para o processamento e a entrega, sempre conforme finalidade, base legal e medidas de segurança. Não vendemos dados pessoais.

## 6. Direitos do Titular
Você tem direito a:
- Confirmar tratamento e acessar dados (exportação disponível no Perfil).
- Corrigir informações.
- Solicitar anonimização, bloqueio ou exclusão quando aplicável (exclusão de conta no Perfil).
- Revogar consentimento quando ele for a base legal utilizada.

## 7. Retenção
Dados são mantidos pelo tempo necessário para execução do serviço, cumprimento legal, auditoria e segurança. Na exclusão de conta, os dados pessoais são anonimizados, preservando apenas registros exigidos por obrigação legal/fiscal.

## 8. Segurança e Controle de Acesso
Medidas técnicas adotadas pela plataforma:
- **Autenticação** por tokens JWT (acesso + atualização) e login com Google.
- **Controle de acesso por papel** (cliente, farmacêutico, dono de farmácia, entregador, admin): cada perfil só acessa os dados pertinentes à sua função.
- **Escopo por farmácia**: farmacêutico e dono enxergam apenas pedidos e receitas da própria farmácia.
- **Criptografia** de dados pessoais sensíveis (ex.: CPF e RG) em repouso.
- **Registro de auditoria imutável** das ações críticas (dispensação, validação de receita).
- Arquivos de receita armazenados com acesso controlado.

## 9. Conformidade Regulatória
- **LGPD (Lei 13.709/2018)**: consentimento informado, finalidade específica, minimização de dados e direitos do titular.
- **ANVISA RDC 344/98 e SNGPC**: retenção e validação de receita para controlados, débito de lote rastreável e prazo de validade da receita por tipo de medicamento.
- **SNCR (Sistema Nacional de Controle de Receituários)**: a plataforma foi desenvolvida em conformidade com o SNCR para a escrituração e o controle de receituários de medicamentos sujeitos a controle especial.

## 10. Tipos de medicamento atendidos
O Saúde na Mão contempla:
- Medicamentos de **venda livre** (MIP, sem receita);
- **Tarja vermelha comum** (receita simples, sem retenção);
- **Tarja vermelha antimicrobianos** (retenção da receita);
- **Tarja vermelha de controle especial — Lista C1** (receita de controle especial);
- **Notificação de Receita "A" (amarela)** — entorpecentes (A1/A2/A3);
- **Notificação de Receita "B/B2" (azul)** — psicotrópicos.

**Não contemplados:** medicamentos sujeitos à **Notificação de Receita Especial (retinoides sistêmicos e talidomida)**. Pelo alto risco de malformação fetal, esses medicamentos exigem termos de consentimento assinados e critérios extremamente rígidos, e por isso ficam fora do escopo da plataforma.

## 11. Alterações
Esta política pode ser atualizada conforme evolução do serviço.
`.trim()

export default function Legal() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = VALID_TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'termos'
  const [activeTab, setActiveTab] = useState(initialTab)
  const [expandedFAQ, setExpandedFAQ] = useState(null)

  // Sincroniza a aba ativa com o parâmetro ?tab= (links do rodapé apontam para cada documento)
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (VALID_TABS.includes(tab) && tab !== activeTab) {
      setActiveTab(tab)
    }
  }, [searchParams])

  const changeTab = (tab) => {
    setActiveTab(tab)
    setSearchParams({ tab }, { replace: true })
  }

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
          <ul key={`ul-${elements.length}`} className="list-disc pl-6 space-y-2 text-sm sm:text-[15px] leading-relaxed text-gray-700">
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
            <h1 key={index} className="text-2xl sm:text-3xl font-bold text-gray-900 mt-8 mb-5 first:mt-0">{renderInline(text)}</h1>
          ) : (
            <h2 key={index} className="text-lg sm:text-xl font-bold text-gray-800 mt-7 mb-3">{renderInline(text)}</h2>
          )
        )
      } else if (line.trimStart().startsWith('- ')) {
        listItems.push(line.replace(/^\s*-\s/, ''))
      } else if (line.trim()) {
        flushList()
        elements.push(
          <p key={index} className="text-sm sm:text-[15px] leading-relaxed text-gray-700">{renderInline(line)}</p>
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
          <div className="space-y-4">
            {FAQS.map((faq) => (
              <div key={faq.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedFAQ(expandedFAQ === faq.id ? null : faq.id)}
                  className="w-full px-5 py-4 flex justify-between items-center gap-3 hover:bg-gray-50 transition text-left"
                >
                  <h3 className="font-semibold text-gray-800 text-sm sm:text-[15px]">{faq.pergunta}</h3>
                  <ChevronDown
                    size={20}
                    className={`text-gray-500 transition ${
                      expandedFAQ === faq.id ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expandedFAQ === faq.id && (
                  <div className="px-5 py-4 bg-blue-50 border-t border-gray-200">
                    <p className="text-sm sm:text-[15px] text-gray-700 leading-relaxed">{faq.resposta}</p>
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
                  onClick={() => changeTab(tab.id)}
                  className={`flex-1 px-4 py-4 flex items-center justify-center gap-2 font-medium text-sm transition border-b-2 ${
                    activeTab === tab.id
                      ? 'border-green-500 text-green-600 bg-green-50'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="text-xs sm:text-sm">{tab.label}</span>
                </button>
              )
            })}
          </div>

          <div className="p-6 sm:p-8 lg:p-10 max-h-[72vh] overflow-y-auto">{renderTabContent()}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <div className="bg-white rounded-lg p-4 shadow text-center">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1">Operação Monitorada</h3>
            <p className="text-sm text-gray-600">
              Fluxos com autenticação, pedido e acompanhamento
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
              <a href="mailto:contato@saudenamao.com.br" className="text-blue-600 hover:underline">
                contato@saudenamao.com.br
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
