export type Onglet = 'contrats' | 'gammes' | 'ot' | 'documents'

/** Accès partagé aux vignettes (UNE instance pour toute la fiche → un seul canal). */
export interface MiniatureAccess {
  urlOf: (id: string | null) => string | null
  refreshMiniatures: () => void
}
