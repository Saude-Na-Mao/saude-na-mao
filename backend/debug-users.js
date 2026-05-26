require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const bcrypt = require('bcryptjs');

async function fixUsersDebug() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/saude-na-mao');
    
    console.log('Deletando e recriando usuários com debug...\n');

    // CLIENTE (teste existente)
    const cliente = await User.findOne({ email: 'teste@teste.com' });
    if (cliente) {
      const testCompare = await cliente.comparePassword('Teste@123');
      console.log(`Cliente teste@teste.com - comparePassword('Teste@123'): ${testCompare}`);
    }

    // Deletar os antigos
    await User.deleteMany({
      email: { $in: ['farmaceutico@saudenamao.com', 'entregador@saudenamao.com', 'dono@farmacia.com'] }
    });

    // Recriar com debug
    const senhaFarm = 'Farm@123';
    const hashedFarm = await bcrypt.hash(senhaFarm, 12);
    
    console.log(`\nSenha farmacêutico: ${senhaFarm}`);
    console.log(`Hashed: ${hashedFarm}`);
    console.log(`Test compare: ${await bcrypt.compare(senhaFarm, hashedFarm)}`);

    const newFarm = new User({
      nome: 'Maria Farmacêutica',
      email: 'farmaceutico@saudenamao.com',
      senha: hashedFarm,
      tipo_usuario: 'farmaceutico',
      cpf: '222.333.444-55',
      telefone: '(62) 98888-2222',
      ativo: true
    });
    
    await newFarm.save();
    console.log('\n✅ Farmacêutico criado');
    
    // Testar o método comparePassword do documento salvo
    const farmReloaded = await User.findOne({ email: 'farmaceutico@saudenamao.com' }).select('+senha');
    console.log(`Document senha field: ${farmReloaded.senha.substring(0, 20)}...`);
    const compareResult = await farmReloaded.comparePassword('Farm@123');
    console.log(`comparePassword result: ${compareResult}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

fixUsersDebug();
