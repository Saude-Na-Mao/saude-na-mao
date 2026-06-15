# Saúde na Mão

PWA de delivery de medicamentos com conformidade ANVISA/LGPD. Projeto de TCC acadêmico com fluxo completo para medicamentos de venda livre e controlados (SNGPC simulado).

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Express 5, MongoDB + Mongoose, Socket.io 4 |
| Frontend | React 18 + Vite, Tailwind CSS, Zustand, React Router 6 (PWA) |
| Auth | JWT (access + refresh via cookie), Google OAuth 2.0, Firebase Admin |
| OCR | Tesseract.js + pdf-parse (leitura de receitas) |
| Mapas | Leaflet + React-Leaflet, Google Maps Services (backend) |
| Testes | Jest + Supertest + mongodb-memory-server (backend); Vitest + Testing Library (frontend) |

---

## Estrutura do Projeto

```
saude-na-mao/
├── backend/                        # API REST + WebSocket (porta 5000)
│   ├── src/
│   │   ├── app.js                  # Express app, rotas, middlewares
│   │   ├── server.js               # Ponto de entrada, Socket.io
│   │   ├── config/                 # database, cors, jwt, socket, envBootstrap
│   │   ├── controllers/            # Camada HTTP (thin, chama services)
│   │   ├── services/               # Lógica de negócio principal
│   │   ├── models/                 # Schemas Mongoose
│   │   ├── routes/                 # Definições de rotas
│   │   ├── middlewares/            # auth, auditLog, uploadPrescription, uploadProductImage, errorHandler
│   │   ├── sockets/                # chatSocket, orderSocket, prescriptionSocket, stockSocket
│   │   └── utils/                  # batchAvailability, haversine, drugInteractions, emailTemplates
│   ├── uploads/
│   │   ├── receitas/               # PDFs/imagens de receitas enviadas pelos clientes
│   │   └── comprovantes/           # Comprovantes de pagamento
│   └── scripts/                    # seedDemoFlows.js, seedMedicines.js, etc.
└── frontend/                       # PWA React (porta 3000)
    ├── src/
    │   ├── pages/                  # Uma página por rota (ver seção Páginas)
    │   ├── components/             # Componentes reutilizáveis
    │   ├── services/api.js         # Axios instance + todos os endpoints
    │   ├── stores/                 # Zustand stores (auth, cart, etc.)
    │   └── hooks/                  # useSupportChatRealtime, useSupportTicketRoom
    └── public/imagens/             # Fotos de produtos (estáticas)
```

---

## Setup

### Pré-requisitos
- Node.js 18+ 
- MongoDB Atlas ou local (`docker compose up -d` na pasta `backend`)

### Backend

```bash
cd backend
npm install
cp .env.example .env      # preencher MONGO_URI e JWT_SECRET
npm run seed:demo-flows   # popula dados de demonstração (inclui lotes de controlados)
npm run dev               # nodemon → http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env      # preencher VITE_API_URL=http://localhost:5000
npm run dev               # Vite → http://localhost:3000
```

---

## Variáveis de Ambiente Críticas (backend/.env)

```env
MONGO_URI=mongodb://...
PORT=5000
JWT_SECRET=...
JWT_REFRESH_SECRET=...
FRONTEND_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...

# Modo TCC — nunca alterar para produção real
TCC_DEMO_MODE=true
ALLOW_CONTROLLED_REMOTE_SALE=false
REQUIRE_PHARMACY_COMPLIANCE_DOCS=false
```

---

## Perfis (Roles)

| Role | Rota principal no frontend |
|---|---|
| `cliente` | `/`, `/produtos`, `/carrinho`, `/pedidos`, `/receitas` |
| `dono_farmacia` | `/dono-farmacia` |
| `farmaceutico` | `/farmaceutico` |
| `entregador` | `/entregas` |
| `admin` | `/admin` |

---

## API — Rotas Principais

Base: `http://localhost:5000/api/v1/`

Todos os aliases PT/EN são funcionais (ex: `/farmacias` = `/pharmacies`).

| Prefixo | Controller/Service |
|---|---|
| `auth` | authController → authService |
| `users` | userController → userService |
| `farmacias` / `pharmacies` | pharmacyController → pharmacyService |
| `pharmacists` | pharmacistController |
| `produtos` / `products` | productController → productService |
| `prescriptions` / `receitas` | prescriptionController → prescriptionService |
| `cart` / `carrinho` | cartController → cartService |
| `payments` / `pagamentos` | paymentController → paymentService |
| `orders` / `pedidos` | orderController → orderService |
| `deliveries` / `entregas` | deliveryController → deliveryService |
| `tracking` / `rastreamento` | trackingController |
| `audit` / `auditoria` | auditRoutes |
| `drugs` / `medicamentos` | drugRoutes (interações, contraindicações) |
| `medicine-catalog` | medicineCatalogController |
| `support` / `suporte` | supportController (chat tickets) |
| `admin` | adminController |
| `geo` | geoController (cálculo de frete, distância) |

### Endpoints do Fluxo de Entrega

| Método e rota | Quem | Ação |
|---|---|---|
| `POST /orders/:id/mark-ready` | farmacêutico/dono | Marca pedido como separado / pronto para retirada |
| `POST /orders/:id/confirm-pickup-code` | farmacêutico/dono | Confere `codigo_coleta` do entregador e libera a coleta (pedido → a caminho) |
| `POST /deliveries/:id/accept` | entregador | Aceita a corrida (gera `codigo_coleta`) |
| `POST /deliveries/:id/arrived` | entregador | Registra "Cheguei" no endereço do cliente |
| `POST /deliveries/:id/confirm` | entregador | Conclui com o `codigo_confirmacao` (8 dígitos) do cliente |
| `POST /deliveries/:id/rate/client` | cliente | Avalia o entregador (1–5) |

---

## Modelos de Dados Críticos

### Product
```
nome, principio_ativo, categoria, preco, estoque (geral)
classificacao_receita: "sem_receita" | "tarja_vermelha" | "tarja_preta" | "antimicrobiano" | "controlado_a"
controlado: Boolean
receita_obrigatoria: Boolean
batches: [{ batchNumber, expirationDate, quantity, active }]  ← só em SNGPC products
interacoes: [{ principio_ativo, severidade, descricao }]
id_farmacia: ref Pharmacy
```

### Order
```
status: "aguardando_pagamento" | "confirmado" | "em_processamento" | "a_caminho"
      | "aguardando_confirmacao_receita_farmacia" | "entregue" | "cancelado" | "rejeitado"
status_pagamento: "pendente" | "processando" | "aprovado" | "falhou" | "estornado"
itens: [{ id_produto, nome_produto, preco_unitario, quantidade,
          controlado, receita_obrigatoria, classificacao_receita,
          id_receita: ref Prescription,
          lote_consumido: { batchNumber, expirationDate, quantity, debitedAt } }]
aprovado_farmaceutico: Boolean
sngpcData: { buyerName, buyerCpf, buyerRg, doctorName, doctorCrm, doctorUf,
             selectedBatchNumber, batchExpirationDate, quantity,
             pharmacistId, validatedAt, traceabilityCode }
historico_status: [{ status, alterado_em, observacao }]
estoque_baixado: Boolean
modo_demo: Boolean
compliance_status: "demo_academico" | "pendente_validacao" | "validado"
separado_em: Date          ← farmacêutico marcou separado / pronto para retirada
entregador: { nome, telefone, veiculo }
```

> Em pagamento aprovado de pedido **sem** item que exija farmacêutico (Fluxo 1),
> `aprovado_farmaceutico` vira `true` e `status` avança direto para `em_processamento`.

### Delivery
```
status: "disponivel" | "aceita" | "coletando" | "coletada" | "em_transito" | "entregue" | "cancelada"
pronto_para_retirada: Boolean   ← farmacêutico liberou; só então aparece para entregadores
separado_em: Date
codigo_coleta: String           ← 8 dígitos, entregador → farmacêutico (libera a coleta)
coleta_confirmada_em: Date
codigo_confirmacao: String      ← 8 dígitos, cliente → entregador (conclui a venda)
entregador_chegou_em: Date      ← entregador tocou "Cheguei" (simulação sem GPS)
rota_simulada: [String]         ← passos de texto da rota até o cliente
avaliacao_cliente: { nota, comentario }     ← cliente avalia o entregador (1–5)
avaliacao_entregador: { nota, comentario }
```

### Prescription
```
status: "Pendente" | "Em Análise" | "Aprovada" | "Rejeitada" | "Expirada" | "Cancelada"
tipo_receita: "simples" | "especial_c1" | "especial_b" | "antimicrobiano"
url_arquivo, nome_arquivo, tipo_arquivo (PDF/JPG/PNG aceitos; regra de negócio exige PDF para controlados)
dados_ocr: { nome_medico, crm, uf_crm, data_emissao, principio_ativo, raw_text }
validade: Date (máx 30 dias da emissão; 10 dias para antimicrobianos)
disponivel_para_novo_pedido: Boolean  ← false após dispensação; true se pedido cancelado antes da entrega
id_produto: ref Product  ← receita vinculada a um item específico
modo_validacao: "assincrono" | "chat_ao_vivo"
chat_mensagens: [{ remetenteId, tipoRemetente, texto, enviado_em }]
historico_status: [{ status, alterado_por, observacao }]
```

---

## Fluxos de Negócio (TCC)

### Pré-validação de Estoque (executa antes de exibir produto)

Implementado em `backend/src/utils/batchAvailability.js`.

- **Medicamentos comuns** (`sem_receita`, `tarja_vermelha`): se `estoque === 0` → botão "Adicionar ao Carrinho" desativado. Mensagem: *"Produto Indisponível nesta farmácia"*.
- **Medicamentos SNGPC** (`tarja_preta`, `controlado_a`, `antimicrobiano`): verifica `batches[]`. Se nenhum lote tiver `active: true`, `quantity > 0` e `expirationDate` futura → botão desativado. Mensagem: *"Produto Indisponível (Sem lotes válidos em estoque)"*.
- Funções: `isControlledProduct()`, `isSngpcProduct()`, `activeAvailableBatches()`, `hasAvailableBatchForQuantity()`.

---

### Fluxo 1 — Venda Livre / Tarja Vermelha (sem retenção)

```
Cliente adiciona ao carrinho
  → Checkout (dados do cadastro pré-preenchidos via LGPD consent)
  → Pagamento (auto-aprovado em TCC_DEMO_MODE)
  → Order.status = "em_processamento" (sem item que exija farmacêutico, aprovado_farmaceutico = true)
  → Comprovante mostra "Pagamento Confirmado"
  → Fluxo de Entrega comum (ver abaixo)
```

---

### Fluxo 2 — Medicamentos com Retenção de Receita (Tarja Preta, Controlado A, Antimicrobiano)

#### Parte A — Cliente (Checkout)
```
Cliente adiciona ao carrinho (lotes validados pelo batchAvailability)
  → Checkout abre campo de upload de receita (PDF obrigatório) por item controlado
  → Pedido criado SEM cobrança
  → Order.status = "aguardando_confirmacao_receita_farmacia"
  → Prescription.status = "Pendente"
  → Dados LGPD (Nome, CPF, RG) vinculados ao pedido
```

#### Parte B — Farmacêutico (/farmaceutico — Split Screen)
```
Painel esquerdo: visualização dos PDFs enviados
Painel direito: formulário SNGPC
  → Dados do comprador (do cadastro)
  → Dados do médico pré-preenchidos via OCR (ocrService.js + Tesseract.js)
  → Lote sugerido automaticamente por FEFO (vencimento mais próximo primeiro)
```

**Decisão do farmacêutico:**

| Ação | Efeito |
|---|---|
| **Aprovar** ("Confirmar Dispensação") | `Prescription.status = "Aprovada"`, `Order.sngpcData` preenchido, lote debitado (`lote_consumido`), `Order.estoque_baixado = true`, log XML SNGPC gerado, `Order.status = "aguardando_pagamento"` |
| **Rejeitar** ("Rejeitar Notificação") | `Prescription.status = "Rejeitada"`, motivo registrado, estoque intocado, `Order.status = "rejeitado"` |

#### Parte C — Pós-aprovação
```
Cliente notificado → botão de pagamento liberado
  → Pagamento confirmado → Order.status = "em_processamento"
  → Fluxo de Entrega comum (ver abaixo)
```

#### Parte D — Pós-rejeição (cliente decide)
```
Cliente recebe alerta com motivo da rejeição (texto do farmacêutico)
  → Opção 1: Cancelar Pedido → Order.status = "cancelado" (sem estorno, sem cobrança anterior)
  → Opção 2: Reenviar PDF → novo upload no campo específico do item rejeitado
              → Prescription novo documento criado
              → Order.status retorna a "aguardando_confirmacao_receita_farmacia"
              → Farmacêutico recebe alerta → reinicia Parte B
```

---

### Fluxo de Entrega (comum aos Fluxos 1 e 2, após `em_processamento`)

Simulação sem geolocalização: o trajeto é exibido como passos de texto (`rota_simulada`) e a
confirmação é feita por **dois códigos de 8 dígitos**.

```
1. Farmacêutico (/farmaceutico → Pedidos): "Marcar separado / pronto para retirada"
     → Delivery.pronto_para_retirada = true, Order.separado_em
     → só então a entrega aparece para os entregadores
     → Cliente vê "Pedido separado"

2. Entregador (/entregas) aceita a corrida
     → Delivery.status = "aceita", gera Delivery.codigo_coleta (8 dígitos)
     → Cliente vê "Entregador a caminho da farmácia"

3. Entregador informa o codigo_coleta ao farmacêutico, que digita em "Liberar coleta"
     → confirmPickupWithCode: Delivery.status = "em_transito", Delivery.rota_simulada gerada
     → Order.status = "a_caminho"
     → Cliente vê "Pedido a caminho"; entregador recebe a rota simulada

4. Entregador toca "Cheguei"
     → Delivery.entregador_chegou_em
     → Cliente vê "Entregador chegou"

5. Entregador digita o Delivery.codigo_confirmacao (8 dígitos) que o cliente mostra em Rastrear/Meus Pedidos
     → Delivery.status = "entregue", Order.status = "entregue"
     → corrida contabilizada (dados_entregador.entregas_realizadas), venda no dashboard do dono
     → Cliente avalia farmácia e entregador (1–5 estrelas)
```

**Dois códigos de 8 dígitos:**
- `Delivery.codigo_coleta` — entregador → farmacêutico (libera a coleta na farmácia).
- `Delivery.codigo_confirmacao` — cliente → entregador (conclui a venda na entrega).

---

## Componentes Frontend Chave

| Arquivo | Responsabilidade |
|---|---|
| `pages/Checkout.jsx` | Verifica receita aprovada por produto antes de liberar o pagamento; redireciona a `/receita` |
| `pages/Farmaceutico.jsx` | Split screen SNGPC — maior arquivo (139KB) |
| `pages/PharmacistDashboard.jsx` | Dashboard alternativo do farmacêutico (112KB) |
| `pages/Pedidos.jsx` | Histórico de pedidos do cliente + ação de reenviar receita |
| `pages/Receita.jsx` | Upload **uma receita por medicamento controlado** (um bloco/PDF por item); libera o pagamento só quando todas aprovadas |
| `pages/EntregadorDashboard.jsx` | Mostra `codigo_coleta`, rota simulada, botão "Cheguei" e confirmação com código do cliente |
| `pages/Comprovante.jsx` | Reflete "Pagamento Confirmado" quando o pagamento é aprovado |
| `pages/EntregadorDashboard.jsx` | Fila e aceite de corridas |
| `pages/Rastreamento.jsx` | Rastreamento em tempo real com mapa |
| `components/UploadReceitaModal.jsx` | Modal de upload de receita (reenvio pós-rejeição) |
| `components/ManageReceitasTab.jsx` | Aba de gestão de receitas no painel do farmacêutico |
| `components/PrescriptionChat.jsx` | Chat ao vivo entre cliente e farmacêutico |
| `components/DeliveryMap.jsx` | Mapa Leaflet de rastreamento |
| `components/DrugInteractionAlert.jsx` | Alerta de interações medicamentosas no carrinho |

---

## Sockets (Socket.io)

| Arquivo | Canal / Eventos |
|---|---|
| `orderSocket.js` | Atualizações de status do pedido em tempo real |
| `prescriptionSocket.js` | Notificação de aprovação/rejeição de receita |
| `chatSocket.js` | Chat cliente ↔ farmacêutico / suporte |
| `stockSocket.js` | Alertas de estoque baixo para o painel do dono |

---

## Testes

```bash
# Backend
cd backend
npm test                        # todos os testes
npm run test:integration        # integration.customer/owner/pharmacist
npm run test:fraud              # 5 cenários de fraude

# Frontend
cd frontend
npm test                        # Vitest
```

### Suites de teste backend

| Arquivo | Cobertura |
|---|---|
| `integration.customer.test.js` | Jornada completa do cliente (cadastro → pedido → entrega) |
| `integration.owner.test.js` | Painel do dono (produtos, estoque, pedidos) |
| `integration.pharmacist.test.js` | Validação de receita, aprovação, rejeição SNGPC |
| `fraud.controlled-drug.test.js` | Tentativa de compra de controlado sem receita |
| `fraud.drug-interaction-bypass.test.js` | Bypass de interação medicamentosa |
| `fraud.duplicate-customer.test.js` | Cadastro duplicado |
| `fraud.same-address-bulk.test.js` | Compra em massa no mesmo endereço |
| `fraud.suspicious-qty.test.js` | Quantidade suspeita de controlado |
| `tracking.test.js` | Rastreamento de medicamento (MedicineTracking model) |

---

## Scripts de Seed

```bash
npm run seed:demo-flows   # Fluxo 1 e Fluxo 2 completos com dados pré-configurados (recomendado para apresentação TCC)
npm run seed              # Seed básico (produtos, farmácias, usuários)
npm run seed:all          # Seed completo
npm run seed:gyn          # Farmácias de Goiânia
npm run seed:reviews      # Avaliações de exemplo
```

Scripts auxiliares (executar com `node src/scripts/<arquivo>.js` na pasta `backend`):

```bash
node src/scripts/seedControlledBatches.js  # Gera lotes (quantidade/validade aleatórias) p/ todos os controlados
node src/scripts/seedPharmacyStaff.js      # Cria 1 dono + 1 farmacêutico por farmácia (escopo restrito)
node src/scripts/seedDemoUsers.js          # Cria 3 clientes + 3 entregadores demo
```

> Cada `dono_farmacia`/`farmaceutico` é vinculado a uma farmácia via
> `dados_dono_farmacia.id_farmacia` / `dados_farmaceutico.id_farmacia` e só enxerga os
> pedidos/receitas da própria farmácia (filtro por `id_farmacia` no service). Credenciais
> demo em `usuarios.txt`.

---

## Serviços Backend Relevantes

| Arquivo | Função |
|---|---|
| `prescriptionService.js` (46KB) | Toda a lógica de receita: OCR, validação CRM, aprovação/rejeição, log SNGPC |
| `orderService.js` (49KB) | Ciclo de vida do pedido, débito de lote, FEFO, fraude |
| `deliveryService.js` (34KB) | Lógica de entrega, aceite de corrida, rastreamento |
| `cartService.js` (18KB) | Validação de estoque/lote no carrinho |
| `ocrService.js` | Extração de dados da receita via Tesseract.js |
| `lgpdEncryptionService.js` | Criptografia de dados pessoais sensíveis |
| `blockchainAuditService.js` | Log imutável simulado para auditoria regulatória |
| `medicineTrackingService.js` | Rastreabilidade de medicamento (MedicineTracking model) |
| `drugInteractionService.js` | Verificação de interações medicamentosas |

---

## Conformidade Regulatória (Escopo TCC)

- **ANVISA RDC 344/98 / Portaria 344**: retenção de receita obrigatória para tarja preta e controlados A; prazo de validade de receita (30 dias / 10 dias antimicrobianos) validado no model `Prescription`.
- **SNGPC simulado**: preenchimento do formulário pelo farmacêutico, débito de lote por FEFO, geração de log XML de dispensação em `prescriptionService.js`.
- **LGPD**: consentimento capturado nos Termos de Uso no cadastro; dados sensíveis (CPF, RG) criptografados via `lgpdEncryptionService`; vinculação ao pedido apenas com base no consentimento existente.
