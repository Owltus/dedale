// Suggestion de nom de document à l'upload. SOURCE UNIQUE du format : ne pas
// redéfinir le motif ailleurs. Distinct de la reconstitution base+extension à
// l'enregistrement (cf. `splitExtension`).

const FR_DATE = new Intl.DateTimeFormat('fr-FR')

export interface DocumentNamingContext {
  /** Prestataire rattaché (ex. nom du prestataire de l'OT). */
  prestataire?: string | null
  /** Objet du document (ex. nom de la gamme de l'OT). */
  objet?: string | null
  /** Date de référence ISO (ex. date prévue de l'OT) → JJ/MM/AAAA, sinon année. */
  date?: string | null
}

/**
 * Sépare un nom de fichier en `base` + `ext` (extension CONNUE, point inclus).
 * Une extension = un dernier suffixe `.xxx` de 1 à 5 caractères alphanumériques
 * (`.pdf`, `.jpeg`…) ; sinon `ext = ''` et `base` = le nom entier. À réutiliser
 * pour ré-accoler l'extension réelle au nom édité au moment de l'envoi.
 */
export function splitExtension(filename: string): { base: string; ext: string } {
  const m = /\.[a-zA-Z0-9]{1,5}$/.exec(filename)
  if (!m) return { base: filename, ext: '' }
  return { base: filename.slice(0, m.index), ext: filename.slice(m.index) }
}

/**
 * Nom de document SUGGÉRÉ (sans extension) : assemble les segments DISPONIBLES
 * « [Type] - [Prestataire] - [Objet] - [Date] » joints par « - ». Tolérant aux
 * champs absents (segment omis). Le segment date vaut la date de contexte en
 * JJ/MM/AAAA si fournie, sinon l'année courante.
 *
 * Le `typeName` (1er segment) provient du type de document choisi dans le modal :
 * il change avec la sélection → le nom suggéré se met à jour en conséquence.
 */
export function suggestDocumentName(
  typeName: string | null | undefined,
  ctx: DocumentNamingContext,
): string {
  const segments = [typeName, ctx.prestataire, ctx.objet]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s))
  segments.push(segmentDate(ctx.date))
  return segments.join(' - ')
}

/** Segment date : JJ/MM/AAAA si la date est fournie et valide, sinon l'année courante. */
function segmentDate(iso?: string | null): string {
  if (iso) {
    const d = new Date(iso)
    if (!Number.isNaN(d.getTime())) return FR_DATE.format(d)
  }
  return String(new Date().getFullYear())
}
