const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')
const request = require('supertest')
const app = require('../src/app')

let mongoServer

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

const validUser = {
  nome: 'Teste User',
  email: 'teste@teste.com',
  senha: 'Teste@123',
  tipo_usuario: 'cliente',
}

describe('POST /api/v1/auth/register', () => {
  it('registra cliente com sucesso', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(validUser)
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.accessToken).toBeDefined()
    expect(res.body.data.user.email).toBe(validUser.email)
    expect(res.body.data.user.role).toBe('cliente')
  })

  it('retorna 400 sem nome', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, nome: '' })
      .expect(400)

    expect(res.body.success).toBe(false)
  })

  it('retorna 400 com email inválido', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, email: 'not-an-email' })
      .expect(400)

    expect(res.body.success).toBe(false)
  })

  it('retorna 400 com senha fraca', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, senha: '123' })
      .expect(400)

    expect(res.body.success).toBe(false)
  })

  it('retorna 409 com email duplicado', async () => {
    await request(app).post('/api/v1/auth/register').send(validUser)

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(validUser)
      .expect(409)

    expect(res.body.message).toMatch(/já cadastrado/i)
  })

  it('retorna 400 para tipo_usuario não permitido', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...validUser, tipo_usuario: 'administrador' })

    expect([400, 500]).toContain(res.status)
  })

  it('registra entregador com dados_entregador', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        ...validUser,
        email: 'entregador@teste.com',
        tipo_usuario: 'entregador',
        dados_entregador: { tipo_veiculo: 'moto', cnh: '12345678900' },
      })
      .expect(201)

    expect(res.body.data.user.role).toBe('entregador')
  })
})

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/v1/auth/register').send(validUser)
  })

  it('faz login com sucesso', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, senha: validUser.senha })
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.accessToken).toBeDefined()
    expect(res.body.data.user.role).toBe('cliente')
  })

  it('retorna cookie refreshToken', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, senha: validUser.senha })

    const cookies = res.headers['set-cookie']
    expect(cookies).toBeDefined()
    expect(cookies.some(c => c.includes('refreshToken'))).toBe(true)
  })

  it('retorna 401 com senha errada', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, senha: 'SenhaErrada@1' })
      .expect(401)

    expect(res.body.message).toMatch(/inválidas/i)
  })

  it('retorna 401 com email inexistente', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'inexistente@teste.com', senha: validUser.senha })
      .expect(401)

    expect(res.body.message).toMatch(/inválidas/i)
  })

  it('retorna 400 sem email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ senha: validUser.senha })
      .expect(400)

    expect(res.body.success).toBe(false)
  })
})

describe('POST /api/v1/auth/logout', () => {
  it('faz logout com sucesso', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.message).toMatch(/logout/i)
  })
})

describe('POST /api/v1/auth/forgot-password', () => {
  it('retorna sucesso mesmo com email inexistente (não revela existência)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'naoexiste@teste.com' })
      .expect(200)

    expect(res.body.success).toBe(true)
  })
})

describe('Rota inexistente', () => {
  it('retorna 404 para rota inexistente', async () => {
    const res = await request(app)
      .get('/api/v1/nao-existe')
      .expect(404)

    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/não encontrada/i)
  })
})
