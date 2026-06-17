import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/store'
import { userService } from '../services/api'

/**
 * Indica se o cliente logado já tem um endereço cadastrado. Usado para só
 * exibir o frete depois que o endereço existir (o valor do frete não muda).
 * Retorna `true` enquanto carrega para não esconder/piscar à toa? Não: começa
 * em `false` e fica `true` apenas quando confirmamos um endereço.
 */
export default function useHasRegisteredAddress() {
  const { token } = useAuthStore()
  const [temEndereco, setTemEndereco] = useState(false)

  useEffect(() => {
    if (!token) {
      setTemEndereco(false)
      return
    }
    let cancelado = false
    userService
      .getAddresses()
      .then((res) => {
        if (cancelado) return
        const list = res.data?.data?.enderecos || []
        setTemEndereco(list.length > 0)
      })
      .catch(() => {
        if (!cancelado) setTemEndereco(false)
      })
    return () => {
      cancelado = true
    }
  }, [token])

  return temEndereco
}
