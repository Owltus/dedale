/** Ligne utilisateur telle que consommée par la fiche détail et ses cartes. */
export interface UserRow {
  id: string
  nom_complet: string
  est_actif: boolean
  /** « Accès Claude » (153) : peut utiliser Dédale via le connecteur Claude. */
  acces_ia: boolean
  /** Modification via Claude (156) : suppose `acces_ia`. */
  acces_ia_ecriture: boolean
  anonymized_at: string | null
  role_id: number
  roles: { code: string; description: string | null } | null
}
