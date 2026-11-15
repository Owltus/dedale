/**
 * Niveau d'« Accès Claude » d'un compte (153, 156), dérivé de deux colonnes :
 * `acces_ia` (lecture) et `acces_ia_ecriture` (modification, qui suppose la
 * lecture — CHECK `users_ecriture_ia_suppose_lecture`).
 */
export type NiveauAccesClaude = 'aucun' | 'lecture' | 'ecriture'

export function niveauAccesClaude(u: {
  acces_ia: boolean
  acces_ia_ecriture: boolean
}): NiveauAccesClaude {
  if (!u.acces_ia) return 'aucun'
  return u.acces_ia_ecriture ? 'ecriture' : 'lecture'
}

/** Les deux colonnes à écrire pour un niveau, toujours ENSEMBLE (CHECK). */
export function colonnesAccesClaude(niveau: NiveauAccesClaude): {
  acces_ia: boolean
  acces_ia_ecriture: boolean
} {
  return {
    acces_ia: niveau !== 'aucun',
    acces_ia_ecriture: niveau === 'ecriture',
  }
}
