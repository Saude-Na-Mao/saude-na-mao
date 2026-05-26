import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import html2pdf from 'html2pdf.js'
import Logger from '../utils/logger'
import { apiUrl } from '../config/env'

const logger = new Logger('ReceitaDigital')

function ReceitaDigital() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qrCodeRef = useRef(null)
  const receitaRef = useRef(null)

  const [receita, setReceita] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [qrCode, setQrCode] = useState(null)

  useEffect(() => {
    fetchReceita()
  }, [id])

  const fetchReceita = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')

      if (!token) {
        throw new Error('Autenticação necessária')
      }

      const response = await fetch(apiUrl(`/prescriptions/${id}/receita`), {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Receita não encontrada')
        } else if (response.status === 401) {
          throw new Error('Sessão expirada')
        }
        throw new Error('Erro ao carregar receita')
      }

      const result = await response.json()

      // Validar estrutura de resposta
      if (!result || typeof result !== 'object') {
        throw new Error('Formato de resposta inválido')
      }

      // Extrair data do resultado (pode vir como { data: ... } ou direto)
      const receiptData = result.data || result

      // Validar campos obrigatórios
      if (!receiptData.id || !receiptData.paciente || !receiptData.farmaceutico) {
        throw new Error('Dados incompletos na receita')
      }

      setReceita(receiptData)
      generateQRCode(receiptData)
    } catch (err) {
      logger.error('Erro ao carregar receita:', err)
      setError(err.message || 'Erro desconhecido ao carregar receita')
    } finally {
      setLoading(false)
    }
  }

  const generateQRCode = async (receitaData) => {
    try {
      if (!receitaData || typeof receitaData !== 'object') {
        throw new Error('Dados de receita inválidos')
      }

      // Validar campos necessários para QR Code
      if (!receitaData.id || !receitaData.paciente || !receitaData.farmaceutico) {
        throw new Error('Campos obrigatórios faltando para gerar QR Code')
      }

      const qrData = JSON.stringify({
        id: receitaData.id,
        paciente: receitaData.paciente,
        data: receitaData.data,
        farmaceutico: receitaData.farmaceutico,
        assinatura: receitaData.assinatura,
        hash: receitaData.hash,
      })

      const qrImage = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        quality: 0.95,
        margin: 1,
        width: 200,
        color: { dark: '#000000', light: '#ffffff' },
      })

      setQrCode(qrImage)
    } catch (err) {
      logger.error('Erro ao gerar QR Code:', err)
      setError(`Erro ao gerar QR Code: ${err.message}`)
    }
  }

  const downloadPDF = async () => {
    if (!receitaRef.current) return

    const element = receitaRef.current
    const opt = {
      margin: 10,
      filename: `receita-${receita.id}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' },
    }

    html2pdf().set(opt).from(element).save()
    logger.info('PDF baixado com sucesso')
  }

  const downloadQRCode = async () => {
    if (!qrCode) return

    const link = document.createElement('a')
    link.href = qrCode
    link.download = `qrcode-receita-${receita.id}.png`
    link.click()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando receita digital...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-md">
          <h2 className="text-red-800 font-bold">Erro</h2>
          <p className="text-red-700 mt-2">{error}</p>
          <button
            onClick={() => navigate('/pedidos')}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
          >
            Voltar aos Pedidos
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Receita Digital</h1>
          <button
            onClick={() => navigate('/pedidos')}
            className="text-blue-600 hover:text-blue-800 underline"
          >
            ← Voltar
          </button>
        </div>

        {receita && (
          <>
            <div
              ref={receitaRef}
              className="bg-white rounded-lg shadow-lg p-8 mb-6 border-2 border-blue-200"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-blue-600">
                    ℞ RECEITA MÉDICA DIGITAL
                  </h2>
                  <p className="text-gray-600 text-sm">
                    Documento válido de acordo com LGPD e regulamentação ANVISA
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">ID: {receita.id}</p>
                  <p className="text-gray-600 text-sm">
                    {new Date(receita.data).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>

              <hr className="my-4" />

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="font-bold text-gray-700 mb-2">Paciente</h3>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="font-bold">{receita.paciente?.nome}</p>
                    <p className="text-sm text-gray-600">
                      CPF: {receita.paciente?.cpf || 'N/A'}
                    </p>
                    <p className="text-sm text-gray-600">
                      Data Nasc.: {receita.paciente?.dataNascimento || 'N/A'}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-gray-700 mb-2">Farmacêutico</h3>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="font-bold">{receita.farmaceutico?.nome}</p>
                    <p className="text-sm text-gray-600">
                      CRM: {receita.farmaceutico?.crm}
                    </p>
                    <p className="text-sm text-gray-600">
                      {receita.farmaceutico?.farmacia}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-bold text-gray-700 mb-3">Medicamentos</h3>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-blue-100">
                      <th className="border border-gray-300 p-2 text-left">
                        Medicamento
                      </th>
                      <th className="border border-gray-300 p-2 text-center">
                        Dosagem
                      </th>
                      <th className="border border-gray-300 p-2 text-center">
                        Quantidade
                      </th>
                      <th className="border border-gray-300 p-2 text-left">
                        Orientação
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {receita.medicamentos?.map((med, idx) => (
                      <tr key={idx} className="hover:bg-blue-50">
                        <td className="border border-gray-300 p-2 font-bold">
                          {med.nome}
                        </td>
                        <td className="border border-gray-300 p-2 text-center">
                          {med.dosagem}
                        </td>
                        <td className="border border-gray-300 p-2 text-center">
                          {med.quantidade}
                        </td>
                        <td className="border border-gray-300 p-2 text-sm">
                          {med.orientacao}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {receita.observacoes && (
                <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded p-3">
                  <h3 className="font-bold text-gray-700 mb-2">Observações</h3>
                  <p className="text-gray-600">{receita.observacoes}</p>
                </div>
              )}

              <hr className="my-4" />

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-bold text-gray-700 mb-3">Assinatura Digital</h3>
                  {receita.assinatura && (
                    <div className="bg-gray-50 p-4 rounded border-2 border-green-200">
                      <p className="font-bold text-green-600 text-sm break-all">
                        {receita.assinatura.substring(0, 50)}...
                      </p>
                      <p className="text-xs text-gray-600 mt-2">
                        Assinado por: {receita.farmaceutico?.nome}
                      </p>
                      <p className="text-xs text-gray-600">
                        {new Date(receita.data).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="font-bold text-gray-700 mb-3">QR Code</h3>
                  {qrCode && (
                    <div
                      ref={qrCodeRef}
                      className="bg-white p-2 rounded border-2 border-blue-200 flex justify-center"
                    >
                      <img
                        src={qrCode}
                        alt="QR Code da Receita"
                        className="w-40 h-40"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 text-xs text-gray-500 border-t pt-4">
                <p>
                  <strong>Hash de Integridade:</strong> {receita.hash?.substring(0, 64)}
                  ...
                </p>
                <p className="mt-1">
                  Este documento é válido e imutável. Qualquer alteração pode ser
                  detectada pelo hash.
                </p>
              </div>
            </div>

            <div className="flex justify-center gap-4">
              <button
                onClick={downloadPDF}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg flex items-center gap-2 transition"
              >
                📄 Baixar em PDF
              </button>
              <button
                onClick={downloadQRCode}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg flex items-center gap-2 transition"
              >
                🔲 Baixar QR Code
              </button>
              <button
                onClick={() => window.print()}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg flex items-center gap-2 transition"
              >
                🖨️ Imprimir
              </button>
            </div>

            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-bold text-blue-900 mb-2">
                ℹ️ Informações Importantes
              </h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>
                  • Esta receita digital é válida e segura, protegida por hash
                  criptográfico
                </li>
                <li>
                  • O QR Code pode ser escaneado para verificação automática em
                  farmácias
                </li>
                <li>
                  • Seus dados pessoais foram encriptados conforme LGPD e
                  regulamentações
                </li>
                <li>
                  • A assinatura do farmacêutico é digitalmente verificável
                </li>
                <li>
                  • Guarde este documento para comprovação de medicamentos
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ReceitaDigital
