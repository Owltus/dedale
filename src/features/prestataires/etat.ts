export type EtatContrat = 'a_venir' | 'actif' | 'termine'

interface EtatContratInfo {
  etat: EtatContrat
  label: string
  variant: 'default' | 'secondary' | 'outline'
}

const LABELS: Record<EtatContrat, EtatContratInfo> = {
  a_venir: { etat: 'a_venir', label: 'À venir', variant: 'outline' },
  actif: { etat: 'actif', label: 'Actif', variant: 'default' },
  termine: { etat: 'termine', label: 'Terminé', variant: 'secondary' },
}

/**
 * État d'un contrat dérivé de ses dates, calculé côté front à la date du jour.
 * - à venir : la date de début est dans le futur
 * - terminé : la date de fin est passée
 * - actif : sinon (en cours, ou sans date de fin)
 */
export function etatContrat(
  dateDebut: string,
  dateFin: string | null,
  aujourdhui = new Date(),
): EtatContratInfo {
  // Comparaison sur le jour (les dates Postgres sont au format YYYY-MM-DD).
  const today = aujourdhui.toISOString().slice(0, 10)

  if (dateDebut > today) return LABELS.a_venir
  if (dateFin && dateFin < today) return LABELS.termine
  return LABELS.actif
}
