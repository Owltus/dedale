import { z } from 'zod'

// Création d'une DI. Le constat est obligatoire ; liaisons et prestataire
// optionnels. La table demandes_intervention n'a PAS de colonne `titre` :
// le constat tient lieu de description du signalement (le titre affiché en
// liste est dérivé de la 1re ligne du constat, cf. route).
export const diSchema = z.object({
  constat: z.string().trim().min(1, 'Le constat est obligatoire').max(4000),
  date_constat: z.string().min(1, 'La date de constat est obligatoire'),
  local_id: z.string(), // '' = aucun
  equipement_id: z.string(), // '' = aucun
  prestataire_id: z.string(), // '' = aucun
})

export type DiFormValues = z.infer<typeof diSchema>

// Résolution d'une DI : seule la description est saisie. date_resolution et
// resolved_by sont forcés côté serveur (triggers) → on ne les envoie pas.
export const diResolutionSchema = z.object({
  description_resolution: z
    .string()
    .trim()
    .min(1, 'La description de résolution est obligatoire')
    .max(4000),
})

export type DiResolutionFormValues = z.infer<typeof diResolutionSchema>

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function emptyDi(): DiFormValues {
  return {
    constat: '',
    date_constat: today(),
    local_id: '',
    equipement_id: '',
    prestataire_id: '',
  }
}

/** Titre court dérivé du constat (1re ligne, tronquée) pour l'affichage liste. */
export function diTitre(constat: string): string {
  const first = (constat.split('\n')[0] ?? '').trim()
  if (first.length <= 80) return first || 'Demande sans constat'
  return `${first.slice(0, 80)}…`
}
