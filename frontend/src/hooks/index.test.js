import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useForm, useDebounce, useLocalStorage, useOnline } from './index'

describe('Custom Hooks', () => {
  describe('useForm', () => {
    it('deve inicializar com valores corretos', () => {
      const initialValues = { email: '', password: '' }
      const onSubmit = vi.fn()
      const validate = vi.fn()

      const { result } = renderHook(() => useForm(initialValues, onSubmit, validate))

      expect(result.current.values).toEqual(initialValues)
      expect(result.current.errors).toEqual({})
      expect(result.current.touched).toEqual({})
      expect(result.current.isSubmitting).toBe(false)
    })

    it('deve atualizar valores ao digitar', () => {
      const initialValues = { email: '' }
      const onSubmit = vi.fn()

      const { result } = renderHook(() => useForm(initialValues, onSubmit))

      act(() => {
        const event = {
          target: { name: 'email', value: 'test@example.com', type: 'text' },
        }
        result.current.handleChange(event)
      })

      expect(result.current.values.email).toBe('test@example.com')
    })

    it('deve resetar formulário', () => {
      const initialValues = { email: '', password: '' }
      const onSubmit = vi.fn()

      const { result } = renderHook(() => useForm(initialValues, onSubmit))

      act(() => {
        const event = {
          target: { name: 'email', value: 'test@example.com', type: 'text' },
        }
        result.current.handleChange(event)
      })

      expect(result.current.values.email).toBe('test@example.com')

      act(() => {
        result.current.resetForm()
      })

      expect(result.current.values).toEqual(initialValues)
    })
  })

  describe('useDebounce', () => {
    it('deve retornar valor após delay', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: 'initial', delay: 100 } }
      )

      expect(result.current).toBe('initial')

      act(() => {
        rerender({ value: 'updated', delay: 100 })
      })

      expect(result.current).toBe('initial')

      await new Promise(resolve => setTimeout(resolve, 150))

      rerender({ value: 'updated', delay: 100 })
      expect(result.current).toBe('updated')
    })
  })

  describe('useOnline', () => {
    it('deve detectar status de conexão', () => {
      const { result } = renderHook(() => useOnline())
      expect(typeof result.current).toBe('boolean')
    })
  })
})
