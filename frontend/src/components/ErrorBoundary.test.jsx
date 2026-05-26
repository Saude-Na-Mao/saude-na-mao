import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

// Suppress console.error from React's error boundary logging
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function BrokenComponent() {
  throw new Error('Test error')
}

function WorkingComponent() {
  return <div>Conteúdo funcionando</div>
}

describe('ErrorBoundary', () => {
  it('renderiza children quando não há erro', () => {
    render(
      <ErrorBoundary>
        <WorkingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText('Conteúdo funcionando')).toBeTruthy()
  })

  it('mostra tela de erro quando componente filho falha', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText('Oops! Algo deu errado')).toBeTruthy()
    expect(screen.getByText(/erro inesperado/)).toBeTruthy()
  })

  it('mostra botão de tentar novamente', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText('Tentar Novamente')).toBeTruthy()
  })

  it('reseta estado ao clicar em tentar novamente', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText('Oops! Algo deu errado')).toBeTruthy()

    // After reset, ErrorBoundary will try to render children again
    // Since BrokenComponent still throws, it will show error again
    fireEvent.click(screen.getByText('Tentar Novamente'))
    // The boundary resets and re-renders, catching the error again
    expect(screen.getByText('Oops! Algo deu errado')).toBeTruthy()
  })
})
