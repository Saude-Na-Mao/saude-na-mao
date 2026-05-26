import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Alert from './Alert'

describe('Alert', () => {
  it('renderiza mensagem', () => {
    render(<Alert message="Operação realizada com sucesso" />)
    expect(screen.getByText('Operação realizada com sucesso')).toBeTruthy()
  })

  it('renderiza tipo info por padrão', () => {
    const { container } = render(<Alert message="Info" />)
    expect(container.firstChild.className).toContain('bg-blue-50')
  })

  it('renderiza tipo success', () => {
    const { container } = render(<Alert type="success" message="OK" />)
    expect(container.firstChild.className).toContain('bg-green-50')
  })

  it('renderiza tipo error', () => {
    const { container } = render(<Alert type="error" message="Erro" />)
    expect(container.firstChild.className).toContain('bg-red-50')
  })

  it('renderiza tipo warning', () => {
    const { container } = render(<Alert type="warning" message="Atenção" />)
    expect(container.firstChild.className).toContain('bg-amber-50')
  })

  it('mostra botão fechar quando onClose é fornecido', () => {
    const onClose = vi.fn()
    render(<Alert message="Test" onClose={onClose} />)
    const closeBtn = screen.getByRole('button', { name: 'Fechar' })
    expect(closeBtn).toBeTruthy()
  })

  it('chama onClose ao clicar no botão', () => {
    const onClose = vi.fn()
    render(<Alert message="Test" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('não mostra botão fechar sem onClose', () => {
    render(<Alert message="Test" />)
    expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull()
  })
})
