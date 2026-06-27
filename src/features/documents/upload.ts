import { supabase } from '@/lib/supabase'
import { imageToWebp, isBitmapImage } from '@/lib/image'
import { splitExtension } from './naming'

export const MAX_TAILLE_OCTETS = 20 * 1024 * 1024 // 20 Mo

// Bornes de préparation d'une image de document : on vise la LISIBILITÉ (scans
// de factures, photos d'équipement) plutôt que la vignette → côté le plus long
// plafonné + budget d'octets cible. Sert AUSSI de seuil « déjà compressé » : un
// WebP sous ces bornes est gardé tel quel (pas de ré-encodage destructeur).
const IMG_MAX_DIM = 2000
const IMG_MAX_BYTES = 2 * 1024 * 1024 // ~2 Mo

/** Liste MIME par défaut (toutes les fiches métier) : PDF + toute image. */
export const MIME_AUTORISES = ['application/pdf', 'image/*'] as const
/** Sous-ensemble PDF uniquement (ex. investissements : pièce jointe « plus pro »). */
export const MIME_PDF = ['application/pdf'] as const

/** Libellés humains des MIME pris en charge (pour les messages d'erreur). */
const LABELS_MIME: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/*': 'image',
  'image/webp': 'WebP',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
}

/** Vrai si le fichier correspond à une entrée MIME autorisée (gère `image/*`). */
function mimeAccepte(file: File, mimesAutorises: readonly string[]): boolean {
  return mimesAutorises.some((m) =>
    // `image/*` = toute image BITMAP (le SVG est exclu : non géré par la
    // conversion WebP, et le bucket n'accepte que PDF/WebP côté serveur).
    m === 'image/*' ? isBitmapImage(file) : file.type === m,
  )
}

/**
 * Valide un fichier avant upload (type MIME + taille). `mimesAutorises` permet
 * de restreindre les formats acceptés (défaut : `MIME_AUTORISES`).
 * Retourne un message d'erreur français, ou null si le fichier est valide.
 */
export function validerFichier(
  file: File,
  mimesAutorises: readonly string[] = MIME_AUTORISES,
): string | null {
  if (!mimeAccepte(file, mimesAutorises)) {
    const noms = mimesAutorises.map((m) => LABELS_MIME[m] ?? m).join(' ou ')
    return `Format non pris en charge (${noms} uniquement).`
  }
  if (file.size > MAX_TAILLE_OCTETS) {
    return 'Fichier trop volumineux (20 Mo maximum).'
  }
  return null
}

/**
 * Prépare un fichier avant upload. Les non-images (PDF…) passent telles quelles.
 * Une image est convertie en WebP compressé (redimensionnée à `IMG_MAX_DIM`,
 * budget `IMG_MAX_BYTES`) — SAUF si c'est DÉJÀ un WebP tenant dans les bornes
 * (poids ET dimensions) : on le garde alors INTACT. Motif : ré-encoder un WebP
 * en WebP est destructeur à chaque passe → renvoyer plusieurs fois la même image
 * la transformerait en « bouillie de pixels ». Le bucket n'accepte que PDF/WebP
 * côté serveur : la conversion garantit qu'on ne lui envoie jamais autre chose.
 */
async function preparerFichier(file: File): Promise<File> {
  if (!isBitmapImage(file)) return file

  // WebP déjà sous le budget de poids → on ne ré-encode pas s'il tient aussi en
  // dimensions (seul contrôle qui nécessite un décodage).
  if (file.type === 'image/webp' && file.size <= IMG_MAX_BYTES) {
    const bitmap = await createImageBitmap(file)
    const dansLesBornes = Math.max(bitmap.width, bitmap.height) <= IMG_MAX_DIM
    bitmap.close()
    if (dansLesBornes) return file
  }

  // Autre format, ou WebP hors bornes → une seule passe de conversion/réduction.
  const { blob } = await imageToWebp(file, {
    maxDim: IMG_MAX_DIM,
    quality: 0.82,
    maxBytes: IMG_MAX_BYTES,
  })
  // Retrait d'extension via splitExtension (SOURCE UNIQUE) — pas une regex maison :
  // garantit que la base coïncide exactement avec le nom_original re-dérivé plus
  // bas (sinon un nom sans extension reconnue mais avec un point se désynchronise).
  const nom = `${splitExtension(file.name).base}.webp`
  return new File([blob], nom, { type: 'image/webp' })
}

/** SHA-256 hexadécimal (64 caractères) du contenu du fichier. */
async function hashSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Nettoie un nom de fichier pour un chemin Storage sûr (anti path-traversal). */
function nomFichierSur(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // supprime les accents combinés
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(-120)
}

export interface UploadResult {
  id: string
  storage_path: string
}

/**
 * Étapes (a) et (b) de la doctrine d'upload :
 *  a) upload du fichier dans le bucket Storage `documents`,
 *  b) insert des métadonnées dans la table `documents` (avec `site_id`).
 *
 * Si l'insert échoue, l'objet Storage est nettoyé pour éviter un orphelin.
 * Retourne l'id du document créé (pour l'étape c — rattachement éventuel).
 */
export async function uploadDocument(params: {
  file: File
  siteId: string
  uploadedBy: string
  typeDocumentId: number
}): Promise<UploadResult> {
  const { siteId, uploadedBy, typeDocumentId } = params
  // Préparation côté front : images converties/compressées en WebP (un WebP déjà
  // optimal est gardé intact). Tout ce qui part vers Storage est donc PDF ou WebP
  // — ce que le bucket exige côté serveur. nom_original / mime / taille suivent.
  const file = await preparerFichier(params.file)
  // nom_original = nom d'affichage SANS extension (exigence métier). L'extension
  // reste sur le storage_path (objet réel) → le téléchargement la conserve.
  const nomOriginal = splitExtension(file.name).base || file.name

  const id = crypto.randomUUID()
  const storagePath = `${siteId}/${id}-${nomFichierSur(file.name)}`
  const hash = await hashSha256(file)

  // (a) Upload Storage
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, { contentType: file.type, upsert: false })
  if (uploadError) throw uploadError

  // (b) Insert métadonnées
  const { data, error: insertError } = await supabase
    .from('documents')
    .insert({
      id,
      site_id: siteId,
      type_document_id: typeDocumentId,
      nom_original: nomOriginal,
      storage_path: storagePath,
      hash_sha256: hash,
      taille_octets: file.size,
      mime_type: file.type,
      uploaded_by: uploadedBy,
    })
    .select('id, storage_path')
    .single()

  if (insertError) {
    // Rollback best-effort de l'objet Storage pour ne pas laisser d'orphelin.
    await supabase.storage.from('documents').remove([storagePath])
    throw insertError
  }

  return data
}

/**
 * Crée une URL signée temporaire pour télécharger/prévisualiser un document.
 * `expiresInSeconds` (défaut 60 s) : à allonger pour un aperçu confortable.
 */
export async function getSignedUrl(
  storagePath: string,
  expiresInSeconds = 60,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}
