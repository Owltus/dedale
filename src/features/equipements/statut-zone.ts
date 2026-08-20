/**
 * Statut d'avancement d'une zone/lieu concerné — codes stables, miroir du
 * CHECK backend partagé par `travaux_taches.statut` et `evenements_lieux.statut`
 * (088) : Travaux et Événements suivent leurs zones de la même façon (décision
 * PO — « les deux mêmes faces d'une même pièce »).
 */
export const STATUTS_ZONE = [
  'en_attente',
  'en_cours',
  'realise',
  'non_realise',
  'non_applicable',
] as const
export type StatutZone = (typeof STATUTS_ZONE)[number]

/** Libellé lisible d'un statut de zone. */
export const LIBELLES_STATUT_ZONE: Record<StatutZone, string> = {
  en_attente: 'En attente',
  en_cours: 'En cours',
  realise: 'Réalisé',
  non_realise: 'Non réalisé',
  non_applicable: 'Non applicable',
}

/** Variante de `Badge` cohérente pour un statut de zone. */
export function variantStatutZone(
  statut: StatutZone,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (statut) {
    case 'realise':
      return 'default'
    case 'non_realise':
      return 'destructive'
    case 'en_cours':
    case 'non_applicable':
      return 'secondary'
    default: // en_attente
      return 'outline'
  }
}

/**
 * Tonalité sémantique (`StatusTone`, `common/status-badge.tsx`) d'un statut de
 * zone — pastille discrète (fond teinté 10 %) plutôt que le badge plein de
 * `variantStatutZone`, pour une ligne de tâche compacte (093, refonte UI).
 */
export function toneStatutZone(
  statut: StatutZone,
): 'neutral' | 'info' | 'success' | 'destructive' {
  switch (statut) {
    case 'realise':
      return 'success'
    case 'non_realise':
      return 'destructive'
    case 'en_cours':
      return 'info'
    default: // en_attente, non_applicable
      return 'neutral'
  }
}
