import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import axios from 'axios'
import { Check, Package, Truck, Home, AlertCircle, Clock } from 'lucide-react'
import { apiUrl } from '../config/env'
import './MedicineTracking.css'

const MedicineTracking = () => {
  const { id } = useParams()
  const [rastreamento, setRastreamento] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [qrCode, setQrCode] = useState(null)
  const [showQR, setShowQR] = useState(false)

  useEffect(() => {
    const fetchRastreamento = async () => {
      try {
        setLoading(true)
        const response = await axios.get(apiUrl(`/tracking/${id}`))
        setRastreamento(response.data.data.rastreamento)
      } catch (err) {
        setError(err.response?.data?.message || 'Erro ao carregar rastreamento')
      } finally {
        setLoading(false)
      }
    }

    fetchRastreamento()
  }, [id])

  const gerarQRCode = async () => {
    try {
      const response = await axios.get(apiUrl(`/tracking/${id}/qr`))
      setQrCode(response.data.data.qrCode)
      setShowQR(true)
    } catch (err) {
      console.error('Erro ao gerar QR code:', err)
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      pendente: 'bg-gray-100 text-gray-800',
      em_transito: 'bg-blue-100 text-blue-800',
      entregue: 'bg-green-100 text-green-800',
      cancelado: 'bg-red-100 text-red-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getEtapaIcon = (tipo) => {
    switch (tipo) {
      case 'SAIDA_FARMACIA':
        return <Package className="w-5 h-5" />
      case 'EM_TRANSITO':
        return <Truck className="w-5 h-5" />
      case 'ENTREGA':
        return <Truck className="w-5 h-5" />
      case 'ENTREGUE':
        return <Home className="w-5 h-5" />
      default:
        return <Clock className="w-5 h-5" />
    }
  }

  const getEtapaLabel = (tipo) => {
    const labels = {
      SAIDA_FARMACIA: 'Saída da Farmácia',
      EM_TRANSITO: 'Em Trânsito',
      ENTREGA: 'Entrega em Andamento',
      ENTREGUE: 'Entregue',
    }
    return labels[tipo] || tipo
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
        <div className="flex items-center">
          <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    )
  }

  if (!rastreamento) {
    return <div className="p-4 text-center">Rastreamento não encontrado</div>
  }

  // Coletar coordenadas para o mapa
  const coordenadas = rastreamento.etapas
    .filter((etapa) => etapa.localizacao)
    .map((etapa) => [etapa.localizacao.lat, etapa.localizacao.lng])

  const centerCoord =
    coordenadas.length > 0 ? coordenadas[0] : [-23.5505, -46.6333]

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Rastreamento de Medicamento
              </h1>
              <p className="text-gray-600">
                ID do Rastreamento: <span className="font-mono text-sm">{rastreamento._id}</span>
              </p>
            </div>
            <div className={`px-4 py-2 rounded-full font-semibold ${getStatusColor(rastreamento.status)}`}>
              {rastreamento.status.replace('_', ' ').toUpperCase()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Informações do Medicamento */}
          <div className="lg:col-span-2">
            {/* Dados do Medicamento */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Informações do Medicamento
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Medicamento</p>
                  <p className="text-lg font-semibold">
                    {rastreamento.medicamento_id?.nome || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Princípio Ativo</p>
                  <p className="text-lg font-semibold">
                    {rastreamento.medicamento_id?.principio_ativo || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Lote</p>
                  <p className="text-lg font-semibold font-mono">
                    {rastreamento.lote}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Dosagem</p>
                  <p className="text-lg font-semibold">
                    {rastreamento.medicamento_id?.dosagem || 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Informações da Farmácia */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Informações da Farmácia
              </h2>
              <p className="text-gray-800">
                <span className="font-semibold">
                  {rastreamento.farmacia_origem?.nome || 'N/A'}
                </span>
              </p>
              <p className="text-gray-600">
                {rastreamento.farmacia_origem?.endereco || 'N/A'}
              </p>
            </div>

            {/* Verificação de Autenticidade */}
            {rastreamento.autenticidade_verificada && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <Check className="w-5 h-5 text-green-600 mr-2" />
                  <div>
                    <p className="text-green-800 font-semibold">
                      Medicamento Autêntico
                    </p>
                    <p className="text-green-700 text-sm">
                      Verificado por: {rastreamento.farmaceutico_validador?.nome || 'Farmacêutico'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Timeline de Etapas */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">
                Histórico de Entrega
              </h2>

              <div className="space-y-6">
                {rastreamento.etapas && rastreamento.etapas.length > 0 ? (
                  rastreamento.etapas.map((etapa, index) => (
                    <div key={index} className="flex">
                      <div className="flex flex-col items-center mr-4">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            etapa.tipo === 'ENTREGUE'
                              ? 'bg-green-500 text-white'
                              : 'bg-blue-500 text-white'
                          }`}
                        >
                          {getEtapaIcon(etapa.tipo)}
                        </div>
                        {index < rastreamento.etapas.length - 1 && (
                          <div className="w-1 h-16 bg-gray-300 my-2"></div>
                        )}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="font-semibold text-gray-900">
                          {getEtapaLabel(etapa.tipo)}
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(etapa.timestamp).toLocaleString('pt-BR')}
                        </p>
                        {etapa.localizacao && (
                          <p className="text-sm text-gray-600">
                            📍 {etapa.localizacao.lat.toFixed(4)}, {etapa.localizacao.lng.toFixed(4)}
                          </p>
                        )}
                        {etapa.observacoes && (
                          <p className="text-sm text-gray-700 mt-1">
                            {etapa.observacoes}
                          </p>
                        )}
                        {etapa.foto_prova && (
                          <img
                            src={etapa.foto_prova}
                            alt="Prova de entrega"
                            className="mt-2 h-32 rounded border border-gray-300"
                          />
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-600">Nenhuma etapa registrada ainda</p>
                )}
              </div>
            </div>
          </div>

          {/* Painel Lateral */}
          <div className="space-y-6">
            {/* QR Code */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                QR Code de Verificação
              </h3>
              {showQR && qrCode ? (
                <div className="text-center">
                  <img src={qrCode} alt="QR Code" className="mx-auto w-48 h-48" />
                  <button
                    onClick={() => setShowQR(false)}
                    className="mt-4 text-sm text-blue-600 hover:text-blue-800"
                  >
                    Ocultar
                  </button>
                </div>
              ) : (
                <button
                  onClick={gerarQRCode}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                >
                  Gerar QR Code
                </button>
              )}
            </div>

            {/* Informações do Cliente */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Endereço de Entrega
              </h3>
              <p className="text-gray-800 font-semibold">
                {rastreamento.cliente_destino?.nome || 'Cliente'}
              </p>
              <p className="text-gray-600 text-sm">
                {rastreamento.cliente_destino?.email || 'Email não disponível'}
              </p>
              <p className="text-gray-600 text-sm">
                {rastreamento.cliente_destino?.telefone || 'Telefone não disponível'}
              </p>
            </div>

            {/* Estatísticas */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Status
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Etapas Completadas</span>
                  <span className="font-semibold">
                    {rastreamento.etapas?.length || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Criado em</span>
                  <span className="font-semibold text-sm">
                    {new Date(rastreamento.criado_em).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mapa */}
        {coordenadas.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Traço da Entrega
            </h2>
            <div className="h-96 rounded-lg overflow-hidden border border-gray-300">
              <MapContainer
                center={centerCoord}
                zoom={13}
                scrollWheelZoom={false}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {coordenadas.length > 1 && (
                  <Polyline positions={coordenadas} color="blue" weight={3} />
                )}
                {coordenadas.map((coord, index) => (
                  <Marker key={index} position={coord}>
                    <Popup>
                      Ponto {index + 1}: {rastreamento.etapas[index]?.tipo}
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MedicineTracking
