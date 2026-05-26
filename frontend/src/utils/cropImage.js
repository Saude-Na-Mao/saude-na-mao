const MAX_OUTPUT_PX = 1200

function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (e) => reject(e))
    image.setAttribute('crossOrigin', 'anonymous')
    image.src = url
  })
}

async function getCroppedCanvas(imageSrc, pixelCrop, maxSize = MAX_OUTPUT_PX) {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const side = Math.min(maxSize, Math.max(pixelCrop.width, pixelCrop.height))
  canvas.width = side
  canvas.height = side
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas não suportado')

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    side,
    side,
  )
  return canvas
}

export async function getCroppedImageBlob(imageSrc, pixelCrop) {
  const canvas = await getCroppedCanvas(imageSrc, pixelCrop)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Falha ao processar imagem'))
          return
        }
        resolve(blob)
      },
      'image/jpeg',
      0.9,
    )
  })
}
