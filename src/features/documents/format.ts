/** Métadonnées d'un document telles que listées dans la bibliothèque / les onglets. */
export interface DocumentMeta {
  id: string
  nom_original: string
  mime_type: string
  taille_octets: number
  type_document_id: number
  storage_path: string
  uploaded_at: string
  /** Présent uniquement quand la requête le sélectionne (ex. liste des documents liables). */
  site_id?: string | null
}

/**
 * Taille fichier lisible (Ko / Mo).
 *
 * Le seuil de bascule se teste APRÈS arrondi, jamais sur les octets bruts :
 * sinon 1 048 064 octets reste « en Ko » (il est sous 1 Mo) et s'arrondit à
 * « 1024 Ko », une taille qui n'existe pas. La fenêtre est étroite — 512 octets —
 * mais elle tombe pile là où les PDF sont nombreux.
 */
export function formatTaille(octets: number): string {
  if (octets < 1024) return `${String(octets)} o`
  const ko = octets / 1024
  if (ko < 1023.5) return `${ko.toFixed(0)} Ko`
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
