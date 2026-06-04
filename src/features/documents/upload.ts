import { supabase } from '@/lib/supabase'

export const MAX_TAILLE_OCTETS = 20 * 1024 * 1024 // 20 Mo
export const MIME_AUTORISES = ['application/pdf', 'image/webp'] as const
export const ACCEPT_FICHIER = MIME_AUTORISES.join(',')

/**
 * Valide un fichier avant upload (type MIME + taille).
 * Retourne un message d'erreur français, ou null si le fichier est valide.
 */
export function validerFichier(file: File): string | null {
  if (!MIME_AUTORISES.includes(file.type as (typeof MIME_AUTORISES)[number])) {
    return 'Format non pris en charge (PDF ou WebP uniquement).'
  }
  if (file.size > MAX_TAILLE_OCTETS) {
    return 'Fichier trop volumineux (20 Mo maximum).'
  }
  return null
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
  const { file, siteId, uploadedBy, typeDocumentId } = params

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
      nom_original: file.name,
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

/** Crée une URL signée temporaire (60 s) pour télécharger/prévisualiser. */
export async function getSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, 60)
  if (error) throw error
  return data.signedUrl
}
