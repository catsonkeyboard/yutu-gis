import type maplibregl from 'maplibre-gl'

/**
 * Compose the current map view into a PNG blob with an attribution strip
 * in the bottom-right corner. Requires the map to be initialized with
 * `canvasContextAttributes: { preserveDrawingBuffer: true }`.
 */
export async function composeMapPng(map: maplibregl.Map, attribution: string): Promise<Blob> {
  // Force a fresh frame so the drawing buffer is guaranteed current
  map.triggerRepaint()
  await new Promise<void>((resolve) => map.once('render', () => resolve()))

  const source = map.getCanvas()
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  ctx.drawImage(source, 0, 0)

  if (attribution) {
    const fontSize = Math.max(11, Math.round(canvas.width / 120))
    ctx.font = `${fontSize}px sans-serif`
    const padding = Math.round(fontSize * 0.5)
    const metrics = ctx.measureText(attribution)
    const boxW = metrics.width + padding * 2
    const boxH = fontSize + padding * 1.5
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.fillRect(canvas.width - boxW, canvas.height - boxH, boxW, boxH)
    ctx.fillStyle = '#333'
    ctx.textBaseline = 'middle'
    ctx.fillText(attribution, canvas.width - boxW + padding, canvas.height - boxH / 2)
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG 编码失败'))
    }, 'image/png')
  })
}
