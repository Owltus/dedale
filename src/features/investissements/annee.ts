/**
 * Année de budget lue dans l'adresse (`/investissements/2027`) : quatre
 * chiffres entre 2000 et 2100 (miroir du CHECK de la 138), sinon `null` — un
 * ancien lien `/investissements/<dossier>` retombe alors sur la liste des années.
 */
export function anneeDeParam(param: string): number | null {
  if (!/^\d{4}$/.test(param)) return null
  const annee = Number(param)
  return annee >= 2000 && annee <= 2100 ? annee : null
}
