/**
 * Traitement d'image côté client, sans dépendance externe (APIs natives :
 * createImageBitmap, Canvas 2D, crypto.subtle). Réutilisable partout :
 * miniatures, avatars à venir, pièces jointes image, etc.
 *
 * Règle d'or : le front prépare (redimensionne, compresse, hashe) ; le backend
 * stocke et valide.
 */

/** Hash SHA-256 hexadécimal d'un Blob ou d'un ArrayBuffer. */
export async function sha256Hex(data: Blob | ArrayBuffer): Promise<string> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface WebpEncodeOptions {
  /** Qualité initiale 0..1 (défaut 0.82). */
  quality?: number
  /** Budget d'octets : réduit la qualité par paliers jusqu'à passer dessous. */
  maxBytes?: number
  /** Qualité plancher (défaut 0.4) : en dessous, on renvoie le meilleur effort. */
  minQuality?: number
}

/**
 * Encode un canvas en WebP. Si `maxBytes` est fourni, baisse la qualité par
 * paliers de 0.1 jusqu'à passer sous le budget (ou atteindre le plancher).
 */
export async function canvasToWebp(
  canvas: HTMLCanvasElement,
  options: WebpEncodeOptions = {},
): Promise<{ blob: Blob; quality: number }> {
  const encode = (q: number) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', q),
    )

  const floor = options.minQuality ?? 0.4
  let quality = options.quality ?? 0.82
  let blob = await encode(quality)
  if (!blob) throw new Error('Conversion WebP impossible.')

  const budget = options.maxBytes
  while (budget !== undefined && blob.size > budget && quality > floor) {
    quality = Math.max(floor, Math.round((quality - 0.1) * 100) / 100)
    const next = await encode(quality)
    if (!next) break
    blob = next
  }

  return { blob, quality }
}

export interface ImageToWebpOptions extends WebpEncodeOptions {
  /** Borne le côté le plus long (préserve le ratio, jamais d'upscale). */
  maxDim?: number
  /** Aplatit la transparence sur ce fond (sinon l'alpha est conservé). */
  background?: string
}

export interface ImageToWebpResult {
  blob: Blob
  hash: string
  width: number
  height: number
  quality: number
}

/**
 * Pipeline complet : décode une image (tout format raster décodable par le
 * navigateur), la redimensionne au besoin (fit, sans upscale) et l'encode en
 * WebP compressé. Renvoie le blob, son hash SHA-256 et ses dimensions finales.
 *
 * L'orientation EXIF est appliquée (sinon les photos portrait sont couchées).
 */
export async function imageToWebp(
  source: File | Blob,
  options: ImageToWebpOptions = {},
): Promise<ImageToWebpResult> {
  const bitmap = await createImageBitmap(source, {
    imageOrientation: 'from-image',
  })

  const max = options.maxDim
  const scale =
    max !== undefined
      ? Math.min(1, max / Math.max(bitmap.width, bitmap.height))
      : 1
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Canvas indisponible pour le redimensionnement.')
  }
  try {
    if (options.background !== undefined) {
      ctx.fillStyle = options.background
      ctx.fillRect(0, 0, width, height)
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
  } finally {
    // Libère le bitmap même si drawImage lève (sinon fuite de ressource).
    bitmap.close()
  }

  const { blob, quality } = await canvasToWebp(canvas, options)
  const hash = await sha256Hex(blob)
  return { blob, hash, width, height, quality }
}
