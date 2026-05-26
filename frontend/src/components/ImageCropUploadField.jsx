import { useState, useCallback, useRef } from 'react'
import Cropper from 'react-easy-crop'
import { ImagePlus, X, Loader2, RefreshCw } from 'lucide-react'
import { getCroppedImageBlob } from '../utils/cropImage'
import { resolveMediaUrl } from '../utils/mediaUrl'
import { productService } from '../services/api'

async function getCroppedAreaPixels(imageSrc, croppedAreaPixels) {
  return getCroppedImageBlob(imageSrc, croppedAreaPixels)
}

export default function ImageCropUploadField({
  value = '',
  onChange,
  label = 'Imagem do produto',
  disabled = false,
}) {
  const fileInputRef = useRef(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [imageSrc, setImageSrc] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  const onCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const resetCropState = () => {
    if (imageSrc) URL.revokeObjectURL(imageSrc)
    setImageSrc(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setCropOpen(false)
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem (JPG, PNG ou WEBP).')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('Imagem muito grande. Máximo 15MB antes do recorte.')
      return
    }
    setError(null)
    const url = URL.createObjectURL(file)
    setImageSrc(url)
    setCropOpen(true)
  }

  const handleConfirmCrop = async () => {
    if (!imageSrc || !croppedAreaPixels) return
    try {
      setUploading(true)
      setError(null)
      const blob = await getCroppedAreaPixels(imageSrc, croppedAreaPixels)
      const file = new File([blob], `produto-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const res = await productService.uploadProductImage(file)
      const url = res.data?.data?.url || res.data?.data?.url_publica || ''
      if (!url) throw new Error('Resposta inválida do servidor')
      onChange?.(url)
      resetCropState()
    } catch (err) {
      setError(err.message || err.data?.message || 'Erro ao enviar imagem')
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = () => {
    onChange?.('')
    setError(null)
  }

  const previewSrc = value ? resolveMediaUrl(value) : ''

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-500">{label}</label>

      {previewSrc ? (
        <div className="flex items-start gap-4">
          <div className="w-28 h-28 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 shrink-0">
            <img src={previewSrc} alt="Preview" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              Trocar imagem
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={handleRemove}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              <X className="w-4 h-4" />
              Remover
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-primary/40 hover:bg-primary/5 transition disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          ) : (
            <ImagePlus className="w-8 h-8 text-gray-400" />
          )}
          <span className="text-sm font-medium">
            {uploading ? 'Enviando...' : 'Adicionar imagem'}
          </span>
          <span className="text-xs text-gray-400">Recorte quadrado 1:1 · JPG, PNG ou WEBP</span>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      {cropOpen && imageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-gray-900">Ajustar imagem</h3>
              <button
                type="button"
                onClick={resetCropState}
                className="p-1 rounded-lg hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="px-4 pt-2 text-xs text-gray-500">
              Arraste para posicionar e use o zoom para encaixar no quadrado da vitrine.
            </p>
            <div className="relative w-full h-72 bg-gray-900 mx-4 mt-2 rounded-lg overflow-hidden" style={{ maxWidth: 'calc(100% - 2rem)' }}>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="rect"
                showGrid
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="px-4 py-3">
              <label className="text-xs text-gray-500 mb-1 block">Zoom</label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="flex gap-2 p-4 border-t">
              <button
                type="button"
                onClick={resetCropState}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={uploading || !croppedAreaPixels}
                onClick={handleConfirmCrop}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-secondary disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {uploading ? 'Enviando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
