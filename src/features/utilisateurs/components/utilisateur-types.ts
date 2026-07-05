/** Ligne utilisateur telle que consommée par la fiche détail et ses cartes. */
export interface UserRow {
  id: string
  nom_complet: string
  est_actif: boolean
  anonymized_at: string | null
  role_id: number
  roles: { code: string; description: string | null } | null
}
