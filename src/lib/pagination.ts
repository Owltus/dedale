/**
 * Taille d'une page PostgREST. Supabase plafonne par défaut une réponse à 1 000
 * lignes (`max_rows`) SANS le signaler : au-delà, les lignes manquent en silence.
 */
export const TAILLE_PAGE = 1000

/**
 * Lit TOUTES les lignes d'une requête, page par page, au lieu de se fier à une
 * réponse unique plafonnée à `TAILLE_PAGE`.
 *
 * Pourquoi : la liste des OT et le tableau de bord chargeaient tous les OT du site
 * (865 au 07/11/2026, ~30 de plus par mois). Triés par date croissante, ce sont
 * les OT À VENIR qui auraient disparu en premier, sans erreur, une fois le
 * plafond franchi.
 *
 * `page(debut, fin)` construit la requête avec `.range(debut, fin)` et un tri
 * TOTAL (ajouter `.order('id')` en départage) : sans ordre stable, deux pages
 * peuvent se chevaucher ou laisser un trou.
 */
export async function toutesLesLignes<T>(
  page: (debut: number, fin: number) => PromiseLike<{ data: T[] | null }>,
  taille: number = TAILLE_PAGE,
): Promise<T[]> {
  const lignes: T[] = []
  for (let debut = 0; ; debut += taille) {
    const { data } = await page(debut, debut + taille - 1)
    const lot = data ?? []
    lignes.push(...lot)
    if (lot.length < taille) return lignes
  }
}
