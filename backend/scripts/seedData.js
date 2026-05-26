require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const Pharmacy = require('../src/models/Pharmacy');

const PHARMACIES_DATA = [
  {
    nome: 'Farmácia Vida',
    cnpj: '12345678000101',
    telefone: '(11) 98765-4321',
    email: 'vida@farmacia.com',
    logradouro: 'Rua das Flores',
    numero: '123',
    bairro: 'Centro',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '01310-100',
    horario_funcionamento: '08:00-22:00',
    disponivel_chat: true,
    location: { type: 'Point', coordinates: [-46.6333, -23.5505] },
  },
  {
    nome: 'Farmácia Central',
    cnpj: '12345678000102',
    telefone: '(11) 98765-4322',
    email: 'central@farmacia.com',
    logradouro: 'Avenida Paulista',
    numero: '1578',
    bairro: 'Bela Vista',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '01310-200',
    horario_funcionamento: '07:00-23:00',
    disponivel_chat: true,
    location: { type: 'Point', coordinates: [-46.6565, -23.5614] },
  },
  {
    nome: 'Farmácia Drogaria Popular',
    cnpj: '12345678000103',
    telefone: '(21) 98765-4323',
    email: 'popular@farmacia.com',
    logradouro: 'Rua da Lapa',
    numero: '456',
    bairro: 'Lapa',
    cidade: 'Rio de Janeiro',
    estado: 'RJ',
    cep: '20030-090',
    horario_funcionamento: '08:00-20:00',
    disponivel_chat: true,
    location: { type: 'Point', coordinates: [-43.1883, -22.9156] },
  },
  {
    nome: 'Farmácia 24h Super Saúde',
    cnpj: '12345678000104',
    telefone: '(85) 98765-4324',
    email: 'supersaude@farmacia.com',
    logradouro: 'Avenida Getúlio Vargas',
    numero: '789',
    bairro: 'Meireles',
    cidade: 'Fortaleza',
    estado: 'CE',
    cep: '60160-140',
    horario_funcionamento: '00:00-23:59',
    disponivel_chat: true,
    location: { type: 'Point', coordinates: [-38.4937, -3.7319] },
  },
  {
    nome: 'Farmácia Fiel',
    cnpj: '12345678000105',
    telefone: '(31) 98765-4325',
    email: 'fiel@farmacia.com',
    logradouro: 'Rua da Bahia',
    numero: '1000',
    bairro: 'Centro',
    cidade: 'Belo Horizonte',
    estado: 'MG',
    cep: '30130-100',
    horario_funcionamento: '07:00-22:00',
    disponivel_chat: true,
    location: { type: 'Point', coordinates: [-43.9378, -19.9245] },
  },
];

const PRODUCTS_DATA = [
  { nome: 'Dipirona 500mg', principio_ativo: 'Dipirona', categoria: 'Analgésico', dosagem: '500mg', fabricante: 'EMS', descricao: 'Comprimido para alívio de febre e dor', preco: 15.50, estoque: 50, receita_obrigatoria: false, controlado: false },
  { nome: 'Ibuprofeno 400mg', principio_ativo: 'Ibuprofeno', categoria: 'Anti-inflamatório', dosagem: '400mg', fabricante: 'Hypermarcas', descricao: 'Anti-inflamatório e analgésico', preco: 22.90, estoque: 30, receita_obrigatoria: false, controlado: false },
  { nome: 'Paracetamol 750mg', principio_ativo: 'Paracetamol', categoria: 'Analgésico', dosagem: '750mg', fabricante: 'Medley', descricao: 'Alívio rápido de dor e febre', preco: 18.50, estoque: 0, receita_obrigatoria: false, controlado: false },
  { nome: 'Amoxicilina 500mg', principio_ativo: 'Amoxicilina', categoria: 'Antibiótico', dosagem: '500mg', fabricante: 'Eurofarma', descricao: 'Antibiótico para infecções bacterianas', preco: 45.00, estoque: 25, receita_obrigatoria: true, controlado: false },
  { nome: 'Amoxicilina + Clavulanato 875mg', principio_ativo: 'Amoxicilina + Clavulanato', categoria: 'Antibiótico', dosagem: '875mg', fabricante: 'Pfizer', descricao: 'Antibiótico potencializado', preco: 68.90, estoque: 15, receita_obrigatoria: true, controlado: false },
  { nome: 'Azitromicina 500mg', principio_ativo: 'Azitromicina', categoria: 'Antibiótico', dosagem: '500mg', fabricante: 'EMS', descricao: 'Macrolídeo para infecções respiratórias', preco: 75.50, estoque: 10, receita_obrigatoria: true, controlado: false },
  { nome: 'Loratadina 10mg', principio_ativo: 'Loratadina', categoria: 'Anti-alérgico', dosagem: '10mg', fabricante: 'Hypermarcas', descricao: 'Anti-histamínico para alergias', preco: 25.00, estoque: 40, receita_obrigatoria: false, controlado: false },
  { nome: 'Cetirizina 10mg', principio_ativo: 'Cetirizina', categoria: 'Anti-alérgico', dosagem: '10mg', fabricante: 'Medley', descricao: 'Alívio de rinite alérgica', preco: 28.90, estoque: 0, receita_obrigatoria: false, controlado: false },
  { nome: 'Pseudoefedrina 60mg', principio_ativo: 'Pseudoefedrina', categoria: 'Descongestionante', dosagem: '60mg', fabricante: 'EMS', descricao: 'Descongestionante nasal', preco: 32.50, estoque: 20, receita_obrigatoria: true, controlado: false },
  { nome: 'Fluconazol 150mg', principio_ativo: 'Fluconazol', categoria: 'Antimicrobiano', dosagem: '150mg', fabricante: 'Pfizer', descricao: 'Antifúngico oral', preco: 42.00, estoque: 12, receita_obrigatoria: true, controlado: false },
  { nome: 'Vitamina C 1000mg', principio_ativo: 'Ácido Ascórbico', categoria: 'Vitamina', dosagem: '1000mg', fabricante: 'Nature Plus', descricao: 'Reforço imunológico', preco: 35.90, estoque: 60, receita_obrigatoria: false, controlado: false },
  { nome: 'Complexo B', principio_ativo: 'Vitaminas do complexo B', categoria: 'Vitamina', dosagem: 'Múltipla', fabricante: 'Medley', descricao: 'Energia e vitalidade', preco: 38.50, estoque: 45, receita_obrigatoria: false, controlado: false },
  { nome: 'Ritalina 10mg', principio_ativo: 'Metilfenidato', categoria: 'Estimulante', dosagem: '10mg', fabricante: 'Novartis', descricao: 'Medicamento controlado para TDAH', preco: 120.00, estoque: 5, receita_obrigatoria: true, controlado: true },
  { nome: 'Alprazolam 1mg', principio_ativo: 'Alprazolam', categoria: 'Benzodiazepínico', dosagem: '1mg', fabricante: 'Pfizer', descricao: 'Medicamento controlado para ansiedade', preco: 85.00, estoque: 0, receita_obrigatoria: true, controlado: true },
  { nome: 'Metamizol 500mg', principio_ativo: 'Metamizol', categoria: 'Analgésico', dosagem: '500mg', fabricante: 'Medley', descricao: 'Analgésico de rápida ação', preco: 16.90, estoque: 35, receita_obrigatoria: false, controlado: false },
  { nome: 'Tramadol 50mg', principio_ativo: 'Tramadol', categoria: 'Analgésico', dosagem: '50mg', fabricante: 'EMS', descricao: 'Analgésico potente controlado', preco: 65.00, estoque: 8, receita_obrigatoria: true, controlado: true },
  { nome: 'Ciprofloxacino 500mg', principio_ativo: 'Ciprofloxacino', categoria: 'Antibiótico', dosagem: '500mg', fabricante: 'EMS', descricao: 'Fluoroquinolona de amplo espectro', preco: 55.00, estoque: 18, receita_obrigatoria: true, controlado: false },
  { nome: 'Doxiciclina 100mg', principio_ativo: 'Doxiciclina', categoria: 'Antibiótico', dosagem: '100mg', fabricante: 'Hypermarcas', descricao: 'Tetraciclina para infecções', preco: 48.50, estoque: 22, receita_obrigatoria: true, controlado: false },
  { nome: 'Omeprazol 20mg', principio_ativo: 'Omeprazol', categoria: 'Gastroenterologia', dosagem: '20mg', fabricante: 'EMS', descricao: 'Protetor gástrico', preco: 35.00, estoque: 50, receita_obrigatoria: false, controlado: false },
  { nome: 'Metoclopramida 10mg', principio_ativo: 'Metoclopramida', categoria: 'Gastroenterologia', dosagem: '10mg', fabricante: 'Medley', descricao: 'Antiemético e pró-cinético', preco: 28.00, estoque: 30, receita_obrigatoria: false, controlado: false },
  { nome: 'Atenolol 50mg', principio_ativo: 'Atenolol', categoria: 'Cardiovascular', dosagem: '50mg', fabricante: 'EMS', descricao: 'Beta-bloqueador para hipertensão', preco: 40.00, estoque: 25, receita_obrigatoria: true, controlado: false },
  { nome: 'Losartana 50mg', principio_ativo: 'Losartana', categoria: 'Cardiovascular', dosagem: '50mg', fabricante: 'Medley', descricao: 'Anti-hipertensivo', preco: 50.00, estoque: 40, receita_obrigatoria: true, controlado: false },
  { nome: 'Ferro + Ácido Fólico', principio_ativo: 'Ferro + Ácido Fólico', categoria: 'Vitamina', dosagem: 'Múltipla', fabricante: 'Nature Plus', descricao: 'Suplementação para anemia', preco: 42.90, estoque: 55, receita_obrigatoria: false, controlado: false },
];

async function seedDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ssm');
    console.log('✅ Conectado ao MongoDB');

    console.log('\n📦 Criando farmácias...');
    const pharmaciesCreated = await Pharmacy.insertMany(PHARMACIES_DATA, { ordered: false }).catch(err => {
      if (err.code === 11000) {
        console.log('⚠️  Algumas farmácias já existem');
        return [];
      }
      throw err;
    });
    console.log(`✅ ${pharmaciesCreated.length || 'Verificadas'} farmácias`);

    console.log('\n💊 Criando produtos...');
    const productsCreated = await Product.insertMany(PRODUCTS_DATA, { ordered: false }).catch(err => {
      if (err.code === 11000) {
        console.log('⚠️  Alguns produtos já existem');
        return [];
      }
      throw err;
    });
    console.log(`✅ ${productsCreated.length || 'Verificados'} produtos`);

    const totalPharmacies = await Pharmacy.countDocuments();
    const totalProducts = await Product.countDocuments();
    const productsOutOfStock = await Product.countDocuments({ estoque: 0 });
    const productsControlled = await Product.countDocuments({ controlado: true });

    console.log('\n📊 ESTATÍSTICAS:');
    console.log(`   Total de Farmácias: ${totalPharmacies}`);
    console.log(`   Total de Produtos: ${totalProducts}`);
    console.log(`   Produtos Fora de Estoque: ${productsOutOfStock}`);
    console.log(`   Produtos Controlados: ${productsControlled}`);

    console.log('\n✅ SEED CONCLUÍDO!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

seedDatabase();
