#!/usr/bin/env node

/**
 * Quick Test - Verifica se o sistema está funcionando
 * Executa testes de sintaxe e importações
 */

const path = require('path')
const fs = require('fs')

console.log('\n🧪 TESTE RÁPIDO DO SISTEMA DE RASTREAMENTO\n')

const baseDir = path.resolve(__dirname)
const backendDir = path.join(baseDir, 'backend')

try {
  console.log('1️⃣  Testando importação do modelo...')
  const MedicineTracking = require(path.join(backendDir, 'src', 'models', 'MedicineTracking.js'))
  console.log('   ✅ MedicineTracking importado com sucesso')

  console.log('\n2️⃣  Testando importação do serviço...')
  const medicineTrackingService = require(path.join(backendDir, 'src', 'services', 'medicineTrackingService.js'))
  console.log('   ✅ Service importado com sucesso')
  console.log(`   Métodos disponíveis: ${Object.getOwnPropertyNames(Object.getPrototypeOf(medicineTrackingService)).length}`)

  console.log('\n3️⃣  Testando importação do controller...')
  const trackingController = require(path.join(backendDir, 'src', 'controllers', 'trackingController.js'))
  console.log('   ✅ Controller importado com sucesso')
  console.log(`   Handlers: ${Object.keys(trackingController).length}`)

  console.log('\n4️⃣  Testando importação das rotas...')
  const trackingRoutes = require(path.join(backendDir, 'src', 'routes', 'trackingRoutes.js'))
  console.log('   ✅ Rotas importadas com sucesso')

  console.log('\n5️⃣  Testando integração em app.js...')
  const appPath = path.join(backendDir, 'src', 'app.js')
  const appContent = fs.readFileSync(appPath, 'utf8')
  if (appContent.includes('trackingRoutes')) {
    console.log('   ✅ Rotas de rastreamento integradas')
  } else {
    throw new Error('trackingRoutes não encontrado em app.js')
  }

  console.log('\n✅ TODOS OS TESTES PASSARAM!')
  console.log('\n📊 Resumo:')
  console.log('   • Modelo Mongoose: OK')
  console.log('   • Serviço: OK')
  console.log('   • Controller: OK')
  console.log('   • Rotas: OK')
  console.log('   • Integração: OK')

  console.log('\n🚀 Sistema pronto para usar!')
  console.log('\n   Frontend:  /rastreamento/:id')
  console.log('   Frontend:  /verificar-medicamento')
  console.log('   API:       /api/v1/tracking')
  console.log('   API:       /api/v1/rastreamento')

} catch (error) {
  console.error('\n❌ ERRO:', error.message)
  console.error('\nStack:', error.stack)
  process.exit(1)
}

console.log('\n')
