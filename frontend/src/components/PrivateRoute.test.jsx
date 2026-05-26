import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import PrivateRoute from './PrivateRoute'

vi.mock('../stores/store', () => ({
  useAuthStore: vi.fn(),
}))

describe('PrivateRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deve renderizar conteúdo quando usuário está autenticado', async () => {
    const { useAuthStore } = await import('../stores/store')
    useAuthStore.mockReturnValue({
      user: { id: 1, nome: 'João', role: 'user' },
      isAuthenticated: () => true,
    })

    render(
      <BrowserRouter>
        <PrivateRoute>
          <div>Conteúdo Protegido</div>
        </PrivateRoute>
      </BrowserRouter>
    )

    expect(screen.getByText('Conteúdo Protegido')).toBeInTheDocument()
  })

  it('deve redirecionar para login quando não autenticado', async () => {
    const { useAuthStore } = await import('../stores/store')
    useAuthStore.mockReturnValue({
      user: null,
      isAuthenticated: () => false,
    })

    const { container } = render(
      <BrowserRouter>
        <PrivateRoute>
          <div>Conteúdo Protegido</div>
        </PrivateRoute>
      </BrowserRouter>
    )

    expect(screen.queryByText('Conteúdo Protegido')).not.toBeInTheDocument()
  })

  it('deve redirecionar quando role não é admin', async () => {
    const { useAuthStore } = await import('../stores/store')
    useAuthStore.mockReturnValue({
      user: { id: 1, nome: 'João', role: 'user' },
      isAuthenticated: () => true,
    })

    render(
      <BrowserRouter>
        <PrivateRoute requiredRole="admin">
          <div>Painel Admin</div>
        </PrivateRoute>
      </BrowserRouter>
    )

    expect(screen.queryByText('Painel Admin')).not.toBeInTheDocument()
  })

  it('deve permitir acesso quando role é admin', async () => {
    const { useAuthStore } = await import('../stores/store')
    useAuthStore.mockReturnValue({
      user: { id: 1, nome: 'João', role: 'admin' },
      isAuthenticated: () => true,
    })

    render(
      <BrowserRouter>
        <PrivateRoute requiredRole="admin">
          <div>Painel Admin</div>
        </PrivateRoute>
      </BrowserRouter>
    )

    expect(screen.getByText('Painel Admin')).toBeInTheDocument()
  })

  it('deve permitir acesso com requiredRoles (array)', async () => {
    const { useAuthStore } = await import('../stores/store')
    useAuthStore.mockReturnValue({
      user: { id: 1, nome: 'Dono', role: 'dono_farmacia' },
      isAuthenticated: () => true,
    })

    render(
      <BrowserRouter>
        <PrivateRoute requiredRoles={['dono_farmacia', 'farmaceutico']}>
          <div>Painel Farmácia</div>
        </PrivateRoute>
      </BrowserRouter>
    )

    expect(screen.getByText('Painel Farmácia')).toBeInTheDocument()
  })

  it('deve bloquear acesso com requiredRoles quando role não está no array', async () => {
    const { useAuthStore } = await import('../stores/store')
    useAuthStore.mockReturnValue({
      user: { id: 1, nome: 'Cliente', role: 'cliente' },
      isAuthenticated: () => true,
    })

    render(
      <BrowserRouter>
        <PrivateRoute requiredRoles={['dono_farmacia', 'farmaceutico']}>
          <div>Painel Farmácia</div>
        </PrivateRoute>
      </BrowserRouter>
    )

    expect(screen.queryByText('Painel Farmácia')).not.toBeInTheDocument()
  })
})
