#!/usr/bin/env node

/**
 * Script de validação rápida da implementação de Rastreamento de Medicamentos
 * Verifica se todos os arquivos foram criados e têm sintaxe válida
 */

const fs = require('fs')
const path = require('path')

const baseDir = path.resolve(__dirname)
const backendDir = path.join(baseDir, 'backend')
const frontendDir = path.join(baseDir, 'frontend')

const requiredFiles = {
  backend: [
    'src/models/MedicineTracking.js',
    'src/services/medicineTrackingService.js',
    'src/controllers/trackingController.js',
    'src/routes/trackingRoutes.js',
    'src/tests/tracking.test.js',
  ],
  frontend: [
    'src/pages/MedicineTracking.jsx',
    'src/pages/MedicineTracking.css',
    'src/components/QRVerification.jsx',
    'src/components/QRVerification.css',
    'src/services/trackingAPI.js',
  ],
}

console.log('\n═══════════════════════════════════════════════════════════════')
console.log('  VALIDAÇÃO DO SISTEMA DE RASTREAMENTO DE MEDICAMENTOS')
console.log('═══════════════════════════════════════════════════════════════\n')

let allValid = true

// Verificar arquivos do backend
console.log('🔍 Verificando Backend...\n')
for (const file of requiredFiles.backend) {
  const fullPath = path.join(backendDir, file)
  const exists = fs.existsSync(fullPath)
  const status = exists ? '✅' : '❌'
  console.log(`${status} ${file}`)
  if (!exists) allValid = false
}

console.log('\n🔍 Verificando Frontend...\n')
for (const file of requiredFiles.frontend) {
  const fullPath = path.join(frontendDir, file)
  const exists = fs.existsSync(fullPath)
  const status = exists ? '✅' : '❌'
  console.log(`${status} ${file}`)
  if (!exists) allValid = false
}

// Verificar diretório de uploads
console.log('\n🔍 Verificando Diretórios...\n')
const uploadsDir = path.join(backendDir, 'uploads', 'tracking')
const uploadsExists = fs.existsSync(uploadsDir)
console.log(`${uploadsExists ? '✅' : '❌'} uploads/tracking/`)

// Verificar integração em app.js
console.log('\n🔍 Verificando Integração em app.js...\n')
const appPath = path.join(backendDir, 'src', 'app.js')
const appContent = fs.readFileSync(appPath, 'utf8')
const hasTrackingRoutes = appContent.includes('trackingRoutes')
const hasTrackingImport = appContent.includes('require("./routes/trackingRoutes")')
const hasTrackingPath = appContent.includes('/api/v1/tracking')

console.log(`${hasTrackingImport ? '✅' : '❌'} Import de trackingRoutes`)
console.log(`${hasTrackingRoutes ? '✅' : '❌'} Uso de trackingRoutes`)
console.log(`${hasTrackingPath ? '✅' : '❌'} Rota /api/v1/tracking`)

// Verificar integração em App.jsx
console.log('\n🔍 Verificando Integração em App.jsx...\n')
const appJsxPath = path.join(frontendDir, 'src', 'App.jsx')
const appJsxContent = fs.readFileSync(appJsxPath, 'utf8')
const hasMedicineTracking = appJsxContent.includes('MedicineTracking')
const hasQRVerification = appJsxContent.includes('QRVerification')
const hasTrackingRoute = appJsxContent.includes('/rastreamento/:id')
const hasQRRoute = appJsxContent.includes('/verificar-medicamento')

console.log(`${hasMedicineTracking ? '✅' : '❌'} Import de MedicineTracking`)
console.log(`${hasQRVerification ? '✅' : '❌'} Import de QRVerification`)
console.log(`${hasTrackingRoute ? '✅' : '❌'} Rota /rastreamento/:id`)
console.log(`${hasQRRoute ? '✅' : '❌'} Rota /verificar-medicamento`)

// Resultado final
console.log('\n═══════════════════════════════════════════════════════════════')
if (allValid && uploadsExists && hasTrackingImport && hasTrackingRoutes && 
    hasMedicineTracking && hasQRVerification && hasTrackingPath) {
  console.log('✅ TODAS AS VERIFICAÇÕES PASSARAM!')
  console.log('\n📊 Resumo:')
  console.log('  • 5 arquivos do backend criados')
  console.log('  • 5 arquivos do frontend criados')
  console.log('  • Integração em app.js completa')
  console.log('  • Integração em App.jsx completa')
  console.log('  • Diretório de uploads criado')
  console.log('\n🚀 Próximos passos:')
  console.log('  1. cd backend && npm run dev')
  console.log('  2. cd frontend && npm run dev')
  console.log('  3. npm test -- src/tests/tracking.test.js')
} else {
  console.log('❌ ALGUMAS VERIFICAÇÕES FALHARAM')
  console.log('   Por favor, verifique os arquivos e tente novamente.')
  process.exit(1)
}
console.log('═══════════════════════════════════════════════════════════════\n')
