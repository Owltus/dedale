/** Métadonnées d'un document telles que listées dans la bibliothèque / les onglets. */
export interface DocumentMeta {
  id: string
  nom_original: string
  mime_type: string
  taille_octets: number
  type_document_id: number
  storage_path: string
  uploaded_at: string
}

/** Taille fichier lisible (Ko / Mo). */
export function formatTaille(octets: number): string {
  if (octets < 1024) return `${String(octets)} o`
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

/** Libellé court du format à partir du type MIME. */
export function formatMime(mime: string): string {
  if (mime === 'application/pdf') return 'PDF'
  if (mime === 'image/*') return 'image'
  if (mime === 'image/webp') return 'WebP'
  if (mime.startsWith('image/')) return 'Image'
  return mime
}
