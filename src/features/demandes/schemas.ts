import { z } from 'zod'
import { todayLocal } from '@/lib/date'
import { dateObligatoire } from '@/lib/dates-zod'
import { texteObligatoire } from '@/lib/texte-zod'

// Création d'une DI. Le constat est obligatoire ; liaisons et prestataire
// optionnels. La table demandes_intervention n'a PAS de colonne `titre` :
// le constat tient lieu de description du signalement (le titre affiché en
// liste est dérivé de la 1re ligne du constat, cf. route).
export const diSchema = z.object({
  constat: texteObligatoire('Le constat est obligatoire', 'constat').max(4000),
  date_constat: dateObligatoire('La date de constat est obligatoire'),
  local_id: z.string(), // '' = aucun
  equipement_id: z.string(), // '' = aucun
})

export type DiFormValues = z.infer<typeof diSchema>

export function emptyDi(): DiFormValues {
  return {
    constat: '',
    date_constat: todayLocal(),
    local_id: '',
    equipement_id: '',
  }
}

// Édition d'une DI : seul le constat est validé (obligatoire) ; la date de
// constat n'est pas modifiable. Les liaisons (facultatives) ne sont réconciliées
// que pour les rôles métier — le demandeur n'édite que son constat.
export const diEditSchema = z.object({
  // Même borne que `diSchema` : la colonne porte `CHECK (length(constat) <=
  // 5000)`, et le champ de création s'arrête à 4 000. Sans ce `.max()`, l'écran
  // d'ÉDITION était plus permissif que celui de création ET que la base — un
  // constat rallongé au-delà de 5 000 caractères partait chercher un 23514.
  constat: texteObligatoire('Le constat est obligatoire', 'constat').max(4000),
  local_id: z.string(), // '' = aucun
  equipement_id: z.string(), // '' = aucun
})

export type DiEditFormValues = z.infer<typeof diEditSchema>

/** Titre court dérivé du constat (1re ligne, tronquée) pour l'affichage liste. */
export function diTitre(constat: string): string {
  const first = (constat.split('\n')[0] ?? '').trim()
  if (first.length <= 80) return first || 'Demande sans constat'
  return `${first.slice(0, 80)}…`
}
