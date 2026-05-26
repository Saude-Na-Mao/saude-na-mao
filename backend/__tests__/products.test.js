const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')
const request = require('supertest')
const app = require('../src/app')
const Product = require('../src/models/Product')
const Pharmacy = require('../src/models/Pharmacy')
const User = require('../src/models/User')
const jwt = require('jsonwebtoken')

let mongoServer
let pharmacy
let adminToken

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create()
  process.env.JWT_SECRET = 'test-jwt-secret'
  process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret'
  process.env.NODE_ENV = 'test'
  await mongoose.connect(mongoServer.getUri())
})

afterAll(async () => {
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
  await mongoServer.stop()
})

afterEach(async () => {
  const collections = mongoose.connection.collections
  for (const key in collections) {
    await collections[key].deleteMany({})
  }
})

async function seedData() {
  const admin = await User.create({
    nome: 'Admin Test',
    email: 'admin@test.com',
    senha: 'Admin@123',
    tipo_usuario: 'administrador',
  })
  adminToken = jwt.sign(
    { id: admin._id, tipo: admin.tipo_usuario },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  )

  pharmacy = await Pharmacy.create({
    nome: 'Farmácia Teste',
    cnpj: '12345678000199',
    telefone: '11999990000',
    email: 'farm@test.com',
    logradouro: 'Rua Teste',
    numero: '100',
    bairro: 'Centro',
    cidade: 'São Paulo',
    estado: 'SP',
    cep: '01000000',
    id_dono: admin._id,
  })

  await Product.create([
    {
      nome: 'Paracetamol 500mg',
      principio_ativo: 'Paracetamol',
      categoria: 'Analgésico',
      preco: 12.5,
      estoque: 100,
      id_farmacia: pharmacy._id,
      ativo: true,
    },
    {
      nome: 'Ibuprofeno 400mg',
      principio_ativo: 'Ibuprofeno',
      categoria: 'Anti-inflamatório',
      preco: 18.9,
      estoque: 50,
      id_farmacia: pharmacy._id,
      ativo: true,
    },
    {
      nome: 'Dipirona 1g',
      principio_ativo: 'Dipirona',
      categoria: 'Analgésico',
      preco: 8.0,
      estoque: 0,
      id_farmacia: pharmacy._id,
      ativo: true,
    },
    {
      nome: 'Produto Inativo',
      principio_ativo: 'Teste',
      categoria: 'Teste',
      preco: 5.0,
      estoque: 10,
      id_farmacia: pharmacy._id,
      ativo: false,
    },
  ])
}

describe('GET /api/v1/produtos', () => {
  beforeEach(seedData)

  it('lista produtos ativos', async () => {
    const res = await request(app)
      .get('/api/v1/produtos')
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.docs.length).toBe(3) // 3 ativos
  })

  it('filtra por categoria', async () => {
    const res = await request(app)
      .get('/api/v1/produtos?categoria=Analgésico')
      .expect(200)

    expect(res.body.data.docs.length).toBe(2)
  })

  it('filtra por faixa de preço', async () => {
    const res = await request(app)
      .get('/api/v1/produtos?preco_min=10&preco_max=15')
      .expect(200)

    expect(res.body.data.docs.length).toBe(1)
    expect(res.body.data.docs[0].nome).toBe('Paracetamol 500mg')
  })

  it('filtra produtos disponíveis', async () => {
    const res = await request(app)
      .get('/api/v1/produtos?disponivel=true')
      .expect(200)

    // Dipirona tem estoque 0, deve ser excluída
    expect(res.body.data.docs.every(p => p.estoque > 0)).toBe(true)
  })

  it('ordena por preço ascendente', async () => {
    const res = await request(app)
      .get('/api/v1/produtos?ordenar=preco_asc')
      .expect(200)

    const prices = res.body.data.docs.map(p => p.preco)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
  })

  it('suporta paginação', async () => {
    const res = await request(app)
      .get('/api/v1/produtos?page=1&limit=2')
      .expect(200)

    expect(res.body.data.docs.length).toBe(2)
    expect(res.body.data.totalDocs).toBe(3)
    expect(res.body.data.hasNextPage).toBe(true)
  })
})

describe('GET /api/v1/produtos/destaque', () => {
  beforeEach(seedData)

  it('retorna produtos em destaque', async () => {
    const res = await request(app)
      .get('/api/v1/produtos/destaque')
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data.produtos)).toBe(true)
    // Only products with stock > 0
    expect(res.body.data.produtos.every(p => p.estoque > 0)).toBe(true)
  })

  it('respeita limite', async () => {
    const res = await request(app)
      .get('/api/v1/produtos/destaque?limit=1')
      .expect(200)

    expect(res.body.data.produtos.length).toBe(1)
  })
})

describe('GET /api/v1/produtos/categorias', () => {
  beforeEach(seedData)

  it('retorna categorias distintas', async () => {
    const res = await request(app)
      .get('/api/v1/produtos/categorias')
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.categorias).toContain('Analgésico')
    expect(res.body.data.categorias).toContain('Anti-inflamatório')
    // Não deve conter categoria do produto inativo
    expect(res.body.data.categorias).not.toContain('Teste')
  })
})

describe('GET /api/v1/produtos/:id', () => {
  beforeEach(seedData)

  it('retorna produto por ID', async () => {
    const products = await Product.find({ ativo: true })
    const res = await request(app)
      .get(`/api/v1/produtos/${products[0]._id}`)
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.produto.nome).toBe(products[0].nome)
  })

  it('retorna 400 para ID inválido', async () => {
    const res = await request(app)
      .get('/api/v1/produtos/invalid-id')
      .expect(400)

    expect(res.body.success).toBe(false)
  })

  it('retorna 404 para produto inexistente', async () => {
    const fakeId = new mongoose.Types.ObjectId()
    const res = await request(app)
      .get(`/api/v1/produtos/${fakeId}`)
      .expect(404)

    expect(res.body.message).toMatch(/não encontrado/i)
  })
})

describe('POST /api/v1/produtos (autenticado)', () => {
  beforeEach(seedData)

  it('cria produto com admin token', async () => {
    const res = await request(app)
      .post('/api/v1/produtos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nome: 'Novo Produto',
        principio_ativo: 'Teste',
        categoria: 'Vitaminas',
        preco: 25.0,
        estoque: 30,
        id_farmacia: pharmacy._id,
      })
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.produto.nome).toBe('Novo Produto')
  })

  it('retorna 401 sem token', async () => {
    const res = await request(app)
      .post('/api/v1/produtos')
      .send({ nome: 'Teste' })
      .expect(401)

    expect(res.body.success).toBe(false)
  })

  it('retorna 403 com token de cliente', async () => {
    const cliente = await User.create({
      nome: 'Cliente',
      email: 'cliente@test.com',
      senha: 'Cliente@123',
      tipo_usuario: 'cliente',
    })
    const clienteToken = jwt.sign(
      { id: cliente._id, tipo: 'cliente' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    )

    const res = await request(app)
      .post('/api/v1/produtos')
      .set('Authorization', `Bearer ${clienteToken}`)
      .send({
        nome: 'Novo Produto',
        preco: 25.0,
        id_farmacia: pharmacy._id,
      })
      .expect(403)

    expect(res.body.success).toBe(false)
  })
})
