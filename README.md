# Saude na Mao

Sistema web para compra e entrega de medicamentos em farmacias locais, com fluxo de pedido, pagamento, validacao de receita, painel da farmacia, entregador, suporte e auditoria. O projeto esta em apresentacao de TCC e o fluxo principal que precisa funcionar bem e: cliente compra medicamento -> pagamento -> farmacia valida/prepara -> entregador aceita -> cliente acompanha e recebe.

## Links principais

- Site em producao: https://saude-na-mao-web.vercel.app
- Repositorio: https://github.com/Saude-Na-Mao/saude-na-mao
- Branch de deploy: `main`
- Deploy: o frontend esta na Vercel e publica automaticamente quando ha commit/push na `main`.

## Contexto do projeto

- Projeto de TCC de Joao Pedro e Matheus Matias.
- Professor acompanhando: Generoso.
- O app deve parecer funcional e direto para apresentacao. Evitar mensagens visiveis como "prototipo", "demo", "teste", "simulado" ou textos que criem barreiras desnecessarias para o usuario.
- O fluxo de venda de medicamento deve ser priorizado sobre features secundarias.
- Recomendacoes do professor para evolucao: migrar de MongoDB para PostgreSQL para metricas mais fortes, vendas por minuto, acessos por tempo, calculo de demanda, capacidade, modulo de auditoria, benchmark/dashboard e conceitos SNGPC.
- Estado atual do codigo: backend ainda usa MongoDB/Mongoose. Nao migrar para PostgreSQL sem planejar modelos, seeds, services e queries.

## Stack

Frontend:

- React 18 + Vite
- Tailwind CSS
- Zustand para estado global
- Axios para API
- Socket.io client para tempo real
- Lucide React para icones
- PWA via `vite-plugin-pwa`

Backend:

- Node.js + Express
- MongoDB + Mongoose
- JWT auth
- Socket.io
- Multer para uploads
- Tesseract/pdf-parse para OCR/receitas
- Mercado Pago service preparado
- Nodemailer
- Jest para testes

## Estrutura

```text
backend/
  src/
    app.js                 # Express app e rotas /api/v1
    server.js              # inicializacao HTTP + Socket.io
    config/                # env, CORS, database, socket
    controllers/           # controllers REST
    models/                # Mongoose models
    routes/                # rotas Express
    services/              # regras de negocio
    middlewares/           # auth, audit, upload, errors
    scripts/               # seeds e scripts operacionais
    tests/                 # testes de integracao/fraude
  seed.js                  # usuarios base
  seed-all.js              # seed completo

frontend/
  src/
    App.jsx                # rotas React
    pages/                 # telas principais
    components/            # componentes reutilizaveis
    services/api.js        # cliente Axios e services
    stores/store.js        # Zustand
    utils/                 # helpers, status, compliance
    config/env.js          # env frontend
```

## Papeis de usuario

- `cliente`: compra medicamentos, envia receita, acompanha pedidos, avalia farmacia/entrega, usa suporte.
- `dono_farmacia`: acessa `/dono-farmacia`, gerencia dashboard, pedidos, produtos, endereco, farmaceuticos, receitas, chats e avaliacoes.
- `farmaceutico`: acessa `/farmaceutico`, valida receitas, atende chats e aprova/rejeita pedidos.
- `entregador`: acessa `/entregas`, aceita entregas, atualiza rota e confirma entrega.
- `administrador`: acessa `/admin`, acompanha usuarios, farmacias, produtos, catalogo e auditoria.

## Fluxo principal de venda

1. Cliente entra na Home.
2. Busca produto em `/produtos` ou escolhe farmacia em `/farmacias`.
3. Adiciona produto ao carrinho.
4. Se exigir receita, envia em `/receita`.
5. Finaliza compra em `/checkout`.
6. Pedido e pagamento sao criados/confirmados.
7. Farmacia ve pedido em `/dono-farmacia` ou painel farmaceutico.
8. Farmacia valida/prepara pedido.
9. Entregador aceita em `/entregas`.
10. Cliente acompanha em `/pedidos` e `/rastreamento/:id`.
11. Cliente acessa comprovante em `/pedido/:id/comprovante` e avalia.

## Telas e rotas importantes

Publicas:

- `/` Home compacta, com busca, CTAs e primeira tela otimizada.
- `/farmacias` lista farmacias.
- `/farmacia/:id` detalhes da farmacia.
- `/produtos` catalogo e filtros.
- `/login` login compacto, sem footer/chat.
- `/registro` cadastro.
- `/legal` termos, privacidade e FAQ.

Cliente:

- `/carrinho`
- `/checkout`
- `/receita`
- `/pedidos`
- `/rastreamento/:id`
- `/pedido/:id/comprovante`
- `/favoritos`
- `/chats`
- `/minhas-receitas`
- `/perfil`

Farmacia:

- `/dono-farmacia`: dashboard da farmacia. Inclui "Historico de Pedidos" e aba "Analise de Vendas".
- `/farmaceutico`: painel do farmaceutico.

Entregador:

- `/entregas`
- `/entregador`

Admin:

- `/admin`
- `/dashboard/seguranca`
- `/dashboard/analytics`

## Dashboard da farmacia

Arquivo principal: `frontend/src/pages/Farmaceutico.jsx`.

O dono de farmacia usa `/dono-farmacia`. A tela tem:

- Dashboard geral da loja.
- Historico de pedidos.
- Aba "Analise de Vendas" no historico.
- Filtros de periodo: hoje, ultimos 7 dias, ultimos 30 dias e intervalo.
- Resumo: total de pedidos, entregues, rejeitados/cancelados, aguardando pagamento, ticket medio e receita.
- Ranking de produtos por pedidos, quantidade e receita.
- Tabela ordenavel de produtos.
- Grafico simples top 5 por receita.
- Exportacao CSV.

## Backend API

Base: `/api/v1`.

Rotas principais registradas em `backend/src/app.js`:

- `/auth`
- `/users`
- `/farmacias` e `/pharmacies`
- `/produtos` e `/products`
- `/receitas` e `/prescriptions`
- `/carrinho` e `/cart`
- `/pagamentos` e `/payments`
- `/pedidos` e `/orders`
- `/entregas` e `/deliveries`
- `/suporte` e `/support`
- `/avaliacoes` e `/reviews`
- `/admin`
- `/audit` e `/auditoria`
- `/tracking` e `/rastreamento`
- `/medicine-catalog` e `/catalogo-medicamentos`

Health check:

- `GET /api/v1/health`

## Contas de seed

Seed principal: `backend/seed.js`.

Contas mais usadas:

```text
Cliente:
  email: teste@teste.com
  senha: Teste@123

Dono de farmacia:
  email: dono@farmacia.com
  senha: Dono@123

Farmaceutico:
  email: farmaceutico@saudenamao.com
  senha: Farm@123

Entregador:
  email: entregador@saudenamao.com
  senha: Entrega@123

Administrador:
  email: admin@saudenamao.com
  senha: Admin@123
```

Outras contas de farmacia Goiânia usam senha `SeedGyn@2026`, por exemplo:

```text
dono.jardim.demo@gyn.local
dono.bueno.demo@gyn.local
dono.marista.demo@gyn.local
farm.jardim@gyn.local
farm.bueno@gyn.local
entregadora.demo@gyn.local
```

## Rodar local

Backend:

```bash
cd backend
npm install
copy .env.example .env
npm run seed:all
npm start
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

URLs locais padrao:

- Frontend: `http://localhost:5173` ou porta informada pelo Vite.
- Backend: `http://localhost:5000/api/v1`.

## Variaveis de ambiente

Backend usa `backend/.env`:

- `PORT=5000`
- `MONGO_URI` ou `MONGODB_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `FRONTEND_URL` ou `FRONTEND_URLS`
- `GOOGLE_CLIENT_ID`
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`
- `PUBLIC_BASE_URL`
- `ALLOW_CONTROLLED_REMOTE_SALE`
- `REQUIRE_PHARMACY_COMPLIANCE_DOCS`

Frontend usa `frontend/.env`:

- `VITE_API_BASE_URL`
- `VITE_API_URL`
- `VITE_SOCKET_URL`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_APP_NAME`
- `VITE_ALLOW_CONTROLLED_REMOTE_SALE`

Em producao, o frontend pode usar `/api` via `frontend/vercel.json`.

## Comandos uteis

Frontend:

```bash
cd frontend
npm run build
npm run test
```

Backend:

```bash
cd backend
npm test
npm run test:integration
npm run test:fraud
npm run seed:all
npm run seed:demo-flows
```

## Regras de UI do projeto

- Interface direta, profissional e pouco textual.
- Home deve funcionar bem em 1366x768, 1920x1080 e mobile.
- Login deve caber na primeira tela sem exigir scroll desnecessario.
- Evitar mensagens visiveis de prototipo/teste/demo.
- Usar icones Lucide quando houver.
- Evitar cards dentro de cards.
- Acessibilidade: manter menu de contraste e tamanho de fonte; o professor gostou do tamanho com A+.
- Priorizar fluxo real do usuario: buscar, comprar, pagar, acompanhar.

## Regras de manutencao

- Antes de commitar frontend, rodar `npm run build` em `frontend`.
- Nao commitar `node_modules`, `dist`, `.env`, logs ou arquivos temporarios.
- Commits em `main` disparam deploy na Vercel.
- Se mexer em fluxo de pedido, testar pelo menos: cliente compra, farmacia ve pedido, entregador aceita, cliente acompanha.
- Se mexer em status de pedido, conferir `frontend/src/utils/orderStatusDisplay.js`.
- Se mexer em permissao, conferir `PrivateRoute`, `ProtectedRoute` e middlewares de auth no backend.

## Pontos tecnicos importantes

- O backend ainda usa MongoDB/Mongoose. A migracao para PostgreSQL e futura e impacta models, services, seeds, consultas de dashboard e deploy.
- Pagamento tem service de Mercado Pago, mas o fluxo atual do checkout confirma pagamento automaticamente para manter a apresentacao fluida.
- Upload de receita e validacao farmacêutica existem; itens controlados e com receita tem regras especificas.
- Socket.io e usado para atualizacao de pedidos/chat/entregas.
- Auditoria existe em middleware e rotas, mas ainda pode evoluir para modulo mais completo.

## Arquivos mais importantes para futuras alteracoes

- `frontend/src/pages/Home.jsx`: pagina inicial.
- `frontend/src/pages/Login.jsx`: login.
- `frontend/src/pages/Produtos.jsx`: catalogo.
- `frontend/src/pages/Carrinho.jsx`: carrinho.
- `frontend/src/pages/Checkout.jsx`: finalizacao do pedido.
- `frontend/src/pages/Pedidos.jsx`: pedidos do cliente.
- `frontend/src/pages/Farmaceutico.jsx`: dashboard do dono e historico/analise de vendas.
- `frontend/src/pages/EntregadorDashboard.jsx`: painel do entregador.
- `frontend/src/services/api.js`: chamadas HTTP.
- `backend/src/models/Order.js`: modelo de pedido.
- `backend/src/services/orderService.js`: regras de pedido.
- `backend/src/services/paymentService.js`: regras de pagamento.
- `backend/src/services/pharmacyService.js`: dashboard da farmacia.
- `backend/src/app.js`: rotas da API.

## Prioridades futuras

1. Migrar analytics para PostgreSQL ou camada analitica dedicada.
2. Medir vendas por minuto, acessos por tempo, capacidade e demanda.
3. Evoluir auditoria para modulo completo.
4. Preparar benchmark/dashboard executivo.
5. Adicionar camada SNGPC conceitual para apresentacao.
6. Melhorar performance por code splitting no frontend, pois o build alerta bundle grande.
