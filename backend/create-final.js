require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const bcrypt = require('bcryptjs');

async function createUsersSimple() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/saude-na-mao');
    
    console.log('Deletando usuários antigos...');
    
    // Deletar
    await User.deleteMany({
      email: { $in: ['farmaceutico@saudenamao.com', 'entregador@saudenamao.com', 'dono@farmacia.com'] }
    });

    console.log('Criando usuários novo...\n');

    // 1. Farmacêutico
    const farm = new User({
      nome: 'Maria Farmacêutica',
      email: 'farmaceutico@saudenamao.com',
      senha: 'Farm@123',  // Deixar sem hash - o middleware va fazer
      tipo_usuario: 'farmaceutico',
      cpf: '222.333.444-55',
      telefone: '(62) 98888-2222',
      ativo: true
    });
    await farm.save();
    console.log('✅ Farmacêutico: farmaceutico@saudenamao.com / Farm@123');

    // 2. Entregador
    const entrega = new User({
      nome: 'Carlos Entregador',
      email: 'entregador@saudenamao.com',
      senha: 'Entrega@123',
      tipo_usuario: 'entregador',
      cpf: '333.444.555-66',
      telefone: '(62) 97777-3333',
      ativo: true
    });
    await entrega.save();
    console.log('✅ Entregador: entregador@saudenamao.com / Entrega@123');

    // 3. Dono
    const dono = new User({
      nome: 'João Proprietário',
      email: 'dono@farmacia.com',
      senha: 'Dono@123',
      tipo_usuario: 'dono_farmacia',
      cpf: '111.222.333-44',
      telefone: '(62) 99999-1111',
      ativo: true
    });
    await dono.save();
    console.log('✅ Dono: dono@farmacia.com / Dono@123');

    console.log('\n✅ Todos os usuários criados!');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

createUsersSimple();
