require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const bcrypt = require('bcryptjs');

async function fixUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/saude-na-mao');
    
    console.log('Corrigindo usuários...\n');

    // 1. Corrigir/Criar FARMACÊUTICO com email correto
    await User.deleteOne({ email: 'farmaceutico@farmaceutico.com' });
    
    const newFarm = new User({
      nome: 'Maria Farmacêutica Silva',
      email: 'farmaceutico@saudenamao.com',
      senha: await bcrypt.hash('Farm@123', 12),
      tipo_usuario: 'farmaceutico',
      cpf: '222.333.444-55',
      telefone: '(62) 98888-2222',
      ativo: true
    });
    await newFarm.save();
    console.log('✅ Farmacêutico criado: farmaceutico@saudenamao.com');

    // 2. Criar ENTREGADOR
    await User.deleteOne({ email: 'entregador@saudenamao.com' });
    
    const newEntregador = new User({
      nome: 'Carlos Entregador Silva',
      email: 'entregador@saudenamao.com',
      senha: await bcrypt.hash('Entrega@123', 12),
      tipo_usuario: 'entregador',
      cpf: '333.444.555-66',
      telefone: '(62) 97777-3333',
      ativo: true
    });
    await newEntregador.save();
    console.log('✅ Entregador criado: entregador@saudenamao.com');

    // 3. Criar DONO DE FARMÁCIA
    await User.deleteOne({ email: 'dono@farmacia.com' });
    
    const newDono = new User({
      nome: 'João Proprietário Farmácia',
      email: 'dono@farmacia.com',
      senha: await bcrypt.hash('Dono@123', 12),
      tipo_usuario: 'dono_farmacia',
      cpf: '111.222.333-44',
      telefone: '(62) 99999-1111',
      ativo: true
    });
    await newDono.save();
    console.log('✅ Dono de Farmácia criado: dono@farmacia.com');

    // 4. Listar todos os usuários
    console.log('\n═════════════════════════════════════');
    console.log('TODOS OS USUÁRIOS NO BANCO:');
    console.log('═════════════════════════════════════\n');
    
    const allUsers = await User.find({}, 'email nome tipo_usuario ativo');
    allUsers.forEach(user => {
      console.log(`✅ ${user.nome}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Tipo: ${user.tipo_usuario}\n`);
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

fixUsers();
