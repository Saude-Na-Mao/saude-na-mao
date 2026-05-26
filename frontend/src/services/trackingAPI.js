import axios from 'axios'
import { getApiBaseUrl } from '../config/env'

const API_URL = getApiBaseUrl()

const trackingAPI = {
  // Criar rastreamento
  criarRastreamento: async (medicamento_id, lote, cliente_id) => {
    const response = await axios.post(`${API_URL}/tracking`, {
      medicamento_id,
      lote,
      cliente_id,
    })
    return response.data
  },

  // Adicionar etapa
  adicionarEtapa: async (rastreamento_id, tipo, localizacao, foto, observacoes) => {
    const formData = new FormData()
    formData.append('tipo', tipo)
    formData.append('localizacao[lat]', localizacao?.lat)
    formData.append('localizacao[lng]', localizacao?.lng)
    if (foto) {
      formData.append('foto', foto)
    }
    if (observacoes) {
      formData.append('observacoes', observacoes)
    }

    const response = await axios.post(
      `${API_URL}/tracking/${rastreamento_id}/etapa`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )
    return response.data
  },

  // Obter rastreamento específico
  obterRastreamento: async (rastreamento_id) => {
    const response = await axios.get(`${API_URL}/tracking/${rastreamento_id}`)
    return response.data
  },

  // Gerar QR Code
  gerarQRCode: async (rastreamento_id) => {
    const response = await axios.get(`${API_URL}/tracking/${rastreamento_id}/qr`)
    return response.data
  },

  // Obter histórico
  obterHistorico: async (medicamento_id, lote) => {
    const params = lote ? { lote } : {}
    const response = await axios.get(
      `${API_URL}/medicamento/${medicamento_id}/tracking/history`,
      { params }
    )
    return response.data
  },

  // Meus rastreamentos
  obterMeusRastreamentos: async (page = 1, limit = 10) => {
    const response = await axios.get(`${API_URL}/tracking/meus/rastreamentos`, {
      params: { page, limit },
    })
    return response.data
  },

  // Rastreamentos da farmácia
  obterRastreamentosFarmacia: async (page = 1, limit = 10) => {
    const response = await axios.get(`${API_URL}/tracking/farmacia/rastreamentos`, {
      params: { page, limit },
    })
    return response.data
  },

  // Verificar autenticidade
  verificarAutenticidade: async (rastreamento_id) => {
    const response = await axios.post(
      `${API_URL}/tracking/${rastreamento_id}/verify`
    )
    return response.data
  },

  // Obter estatísticas
  obterEstatisticas: async () => {
    const response = await axios.get(`${API_URL}/tracking`)
    return response.data
  },

  // Cancelar rastreamento
  cancelarRastreamento: async (rastreamento_id, motivo) => {
    const response = await axios.post(
      `${API_URL}/tracking/${rastreamento_id}/cancelar`,
      { motivo }
    )
    return response.data
  },
}

export default trackingAPI
