import React, { useState, useRef, useEffect } from 'react'
import { AlertCircle, Check, X, Loader } from 'lucide-react'
import axios from 'axios'
import { apiUrl } from '../config/env'
import './QRVerification.css'

const QRVerification = () => {
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [stream, setStream] = useState(null)

  const startCamera = async () => {
    try {
      setScanning(true)
      setError(null)

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        setStream(mediaStream)
      }
    } catch (err) {
      setError('Não foi possível acessar a câmera. Verifique as permissões.')
      setScanning(false)
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      setStream(null)
    }
    setScanning(false)
  }

  const captureFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return

    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight

    context.drawImage(
      videoRef.current,
      0,
      0,
      canvas.width,
      canvas.height
    )

    // Simular leitura de QR code
    // Em produção, usar biblioteca como jsQR ou html5-qrcode
    const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)

    // Mock QR data para demonstração
    try {
      const qrData = await decodeQRCode(imageData)
      if (qrData) {
        verifyTracking(qrData)
      }
    } catch (err) {
      console.error('Erro ao decodificar QR:', err)
    }
  }

  const decodeQRCode = async (imageData) => {
    // Aqui você implementaria a decodificação real
    // Para agora, retornamos null para permitir input manual
    return null
  }

  const verifyTracking = async (trackingData) => {
    try {
      setLoading(true)
      setError(null)

      // trackingData deve ser o ID ou JSON com blockchain_hash
      const trackingId = trackingData.tracking_id || trackingData

      const response = await axios.post(apiUrl(`/tracking/${trackingId}/verify`))

      setResult(response.data.data)
      stopCamera()
    } catch (err) {
      setError(err.response?.data?.message || 'Erro ao verificar autenticidade')
    } finally {
      setLoading(false)
    }
  }

  const handleManualInput = async (e) => {
    e.preventDefault()
    const trackingId = e.target.trackingId.value

    if (!trackingId.trim()) {
      setError('Por favor, insira um ID de rastreamento')
      return
    }

    await verifyTracking(trackingId)
    e.target.reset()
  }

  return (
    <div className="qr-verification-container">
      <div className="qr-card">
        <h1 className="qr-title">Verificar Autenticidade do Medicamento</h1>
        <p className="qr-subtitle">
          Escaneie o QR code da embalagem ou insira o ID de rastreamento
        </p>

        {/* Câmera */}
        {!scanning && !result && (
          <>
            <div className="camera-button-group">
              <button
                onClick={startCamera}
                className="btn btn-primary w-full"
              >
                📷 Abrir Câmera
              </button>
            </div>

            <div className="manual-input-section">
              <h3 className="input-title">Ou insira manualmente</h3>
              <form onSubmit={handleManualInput}>
                <input
                  type="text"
                  name="trackingId"
                  placeholder="ID de Rastreamento"
                  className="input-field"
                />
                <button
                  type="submit"
                  className="btn btn-secondary w-full"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader className="inline w-4 h-4 mr-2 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    'Verificar'
                  )}
                </button>
              </form>
            </div>
          </>
        )}

        {scanning && (
          <div className="camera-container">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="camera-video"
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            <div className="camera-controls">
              <button
                onClick={captureFrame}
                className="btn btn-success"
              >
                📸 Capturar
              </button>
              <button
                onClick={stopCamera}
                className="btn btn-danger"
              >
                ✕ Cancelar
              </button>
            </div>

            <div className="qr-scanner-overlay">
              <div className="qr-scanner-box"></div>
            </div>
          </div>
        )}

        {/* Resultado de Verificação */}
        {result && (
          <div className="verification-result">
            {result.autenticidade ? (
              <div className="result-success">
                <div className="result-icon success">
                  <Check className="w-8 h-8" />
                </div>
                <h2 className="result-title">Medicamento Autêntico</h2>
                <p className="result-subtitle">
                  Este medicamento foi validado com sucesso pelo sistema de blockchain
                </p>

                <div className="result-details">
                  <div className="detail-item">
                    <span className="detail-label">Verificado por:</span>
                    <span className="detail-value">
                      {result.verificado_por || 'Farmacêutico'}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Etapas Validadas:</span>
                    <span className="detail-value">
                      {result.etapas_validadas || 0}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Status:</span>
                    <span className="detail-value badge-success">
                      ✓ VALIDADO
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setResult(null)
                    setScanning(false)
                  }}
                  className="btn btn-primary w-full mt-4"
                >
                  Nova Verificação
                </button>
              </div>
            ) : (
              <div className="result-error">
                <div className="result-icon error">
                  <X className="w-8 h-8" />
                </div>
                <h2 className="result-title">Falha na Verificação</h2>
                <p className="result-subtitle">
                  {result.motivo || 'Este medicamento não pôde ser verificado'}
                </p>

                <div className="warning-box">
                  <AlertCircle className="w-5 h-5" />
                  <p>
                    ⚠️ Por sua segurança, não use este medicamento até
                    verificar com um farmacêutico
                  </p>
                </div>

                <button
                  onClick={() => {
                    setResult(null)
                    setScanning(false)
                  }}
                  className="btn btn-secondary w-full mt-4"
                >
                  Tentar Novamente
                </button>
              </div>
            )}
          </div>
        )}

        {/* Erro */}
        {error && (
          <div className="error-box">
            <AlertCircle className="w-5 h-5" />
            <p>{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-sm text-blue-600 hover:text-blue-800 mt-2"
            >
              Descartar
            </button>
          </div>
        )}
      </div>

      {/* Informações Adicionais */}
      <div className="info-section">
        <h3 className="info-title">Como usar</h3>
        <ol className="info-list">
          <li>Clique em "Abrir Câmera" para escanear o QR code</li>
          <li>Posicione a câmera sobre o código QR da embalagem</li>
          <li>Clique em "Capturar" quando o código estiver enquadrado</li>
          <li>Aguarde a verificação no blockchain</li>
          <li>Confirme a autenticidade do medicamento</li>
        </ol>
      </div>
    </div>
  )
}

export default QRVerification
