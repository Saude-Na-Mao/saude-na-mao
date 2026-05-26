# Sistema de Rastreamento de Medicamentos com Blockchain

## Visão Geral

O Sistema de Rastreamento de Medicamentos implementa uma solução completa de rastreamento end-to-end usando blockchain imutável, QR codes verificáveis e assinaturas PKI para garantir a autenticidade e integridade dos medicamentos desde a farmácia até o cliente.

## Arquitetura

### Backend

#### Modelos
- **MedicineTracking** (`backend/src/models/MedicineTracking.js`)
  - Rastreamento completo do medicamento
  - Etapas do fluxo (SAIDA_FARMACIA → EM_TRANSITO → ENTREGA → ENTREGUE)
  - Dados de localização e fotos de prova
  - Hashes do blockchain e assinaturas digitais

#### Serviços
- **medicineTrackingService** (`backend/src/services/medicineTrackingService.js`)
  - Gerenciamento do ciclo de vida do rastreamento
  - Validação de transições de etapas
  - Geração de QR codes
  - Verificação de autenticidade com blockchain
  - Integração com blockchainAuditService para imutabilidade
  - Integração com lgpdEncryptionService para dados sensíveis

#### Controllers
- **trackingController** (`backend/src/controllers/trackingController.js`)
  - Handlers para todos os endpoints
  - Validação de permissões
  - Auditoria de ações

#### Rotas
- **trackingRoutes** (`backend/src/routes/trackingRoutes.js`)
  - POST `/api/v1/tracking` - Iniciar rastreamento
  - POST `/api/v1/tracking/:id/etapa` - Adicionar etapa
  - GET `/api/v1/tracking/:id` - Ver status
  - GET `/api/v1/tracking/:id/qr` - Gerar QR code
  - GET `/api/v1/medicamento/:id/tracking/history` - Histórico
  - POST `/api/v1/tracking/:id/verify` - Verificar autenticidade
  - POST `/api/v1/tracking/:id/cancelar` - Cancelar

### Frontend

#### Componentes
- **MedicineTracking** (`frontend/src/pages/MedicineTracking.jsx`)
  - Timeline visual com todas as etapas
  - Mapa interativo com traço da entrega (Leaflet)
  - QR code para verificação
  - Informações do medicamento, farmácia e cliente
  - Badge de autenticidade verificada
  - Responsivo para mobile

- **QRVerification** (`frontend/src/components/QRVerification.jsx`)
  - Scanner de câmera para QR codes
  - Input manual para rastreamento
  - Verificação contra blockchain
  - Status visual de autenticidade
  - Interface intuitiva

#### Serviços
- **trackingAPI** (`frontend/src/services/trackingAPI.js`)
  - Chamadas HTTP para backend
  - Gestão de dados de rastreamento

## Fluxo de Funcionamento

### 1. Criação do Rastreamento
```javascript
POST /api/v1/tracking
{
  medicamento_id: "ObjectId",
  lote: "LOTE123",
  cliente_id: "ObjectId"
}
```
- Cria documento MedicineTracking
- Gera hash único do blockchain
- Cria QR code data
- Registra no blockchain

### 2. Adição de Etapas
```javascript
POST /api/v1/tracking/:id/etapa
{
  tipo: "SAIDA_FARMACIA|EM_TRANSITO|ENTREGA|ENTREGUE",
  localizacao: { lat, lng },
  observacoes: "texto"
}
```
- Valida transição de etapa (não pode voltar)
- Gera assinatura blockchain para etapa
- Atualiza status do rastreamento
- Registra auditoria

### 3. Geração de QR Code
```javascript
GET /api/v1/tracking/:id/qr
```
- Gera imagem QR code em base64
- Contém tracking_id e blockchain_hash
- Scanável e verificável

### 4. Verificação de Autenticidade
```javascript
POST /api/v1/tracking/:id/verify
```
- Valida integridade do blockchain
- Verifica assinaturas de todas as etapas
- Gera assinatura PKI do farmacêutico
- Retorna status de autenticidade

## Segurança

### Blockchain Audit
- Transações imutáveis
- Prova de trabalho (mining com difficulty)
- Verificação de integridade da cadeia

### LGPD Compliance
- Encriptação de dados sensíveis (AES-256-GCM)
- Sanitização de dados pessoais
- Anonimização quando necessário

### PKI Signatures
- Assinatura SHA-256 de dados críticos
- Verificação de integridade
- Validador farmacêutico identificado

### Autorização
- Controle de acesso por tipo de usuário
- Cliente vê apenas seus rastreamentos
- Farmácia vê apenas seus rastreamentos
- Admin vê tudo

## Testes

Execute os testes com:
```bash
cd backend
npm test -- src/tests/tracking.test.js
```

Testes cobrem:
- Criar rastreamento
- Validar transições de etapas
- Rejeitar transições inválidas
- Permitir sequência correta
- Gerar QR code
- Verificar autenticidade
- Obter histórico
- Cancelamento

## Integração com App.jsx

Rotas adicionadas:
```javascript
<Route path="/rastreamento/:id" element={<MedicineTracking />} />
<Route path="/verificar-medicamento" element={<QRVerification />} />
```

## Dados Armazenados

### MedicineTracking
```json
{
  "_id": "ObjectId",
  "medicamento_id": "ObjectId (ref: Product)",
  "lote": "LOTE123",
  "farmacia_origem": "ObjectId (ref: Pharmacy)",
  "cliente_destino": "ObjectId (ref: User)",
  "blockchain_hash": "sha256_hash",
  "qr_code_data": "json_string",
  "status": "pendente|em_transito|entregue|cancelado",
  "autenticidade_verificada": true,
  "etapas": [
    {
      "tipo": "SAIDA_FARMACIA|EM_TRANSITO|ENTREGA|ENTREGUE",
      "timestamp": "Date",
      "localizacao": { "lat": -23.5505, "lng": -46.6333 },
      "assinatura_blockchain": "hash",
      "validado_por": "ObjectId (ref: User)",
      "foto_prova": "url"
    }
  ]
}
```

## Endpoints da API

### Públicos
- GET `/api/v1/medicamento/:id/tracking/history` - Histórico de medicamento

### Autenticados
- POST `/api/v1/tracking` - Criar (dono_farmacia, admin)
- GET `/api/v1/tracking/:id` - Ver status
- POST `/api/v1/tracking/:id/etapa` - Adicionar etapa
- GET `/api/v1/tracking/:id/qr` - Gerar QR
- POST `/api/v1/tracking/:id/verify` - Verificar (farmaceutico, admin)
- GET `/api/v1/tracking/meus/rastreamentos` - Meus (cliente)
- GET `/api/v1/tracking/farmacia/rastreamentos` - Farmácia (dono_farmacia)
- POST `/api/v1/tracking/:id/cancelar` - Cancelar
- GET `/api/v1/tracking` - Estatísticas

## Variáveis de Ambiente

```bash
# Encriptação
ENCRYPTION_KEY=<32-byte-key>

# URLs
FRONTEND_URL=http://localhost:3000
```

## Próximos Passos

1. Implementar decodificação real de QR code (jsQR ou html5-qrcode)
2. Adicionar integração com GPS em tempo real
3. Notificações push para mudanças de status
4. Dashboard analítico para farmácias
5. Certificação de autenticidade em PDF
6. Integração com APIs de logística
7. Backup de blockchain em banco externo

## Contribuindo

Todas as mudanças no rastreamento devem:
1. Validar transições de etapa
2. Registrar no blockchain
3. Manter auditoria completa
4. Respeitar permissões de acesso
5. Adicionar testes correspondentes
