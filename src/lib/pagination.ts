/**
 * Taille d'une page PostgREST. Supabase plafonne par défaut une réponse à 1 000
 * lignes (`max_rows`) SANS le signaler : au-delà, les lignes manquent en silence.
 */
export const TAILLE_PAGE = 1000

/** Pages demandées ensemble au-delà de la première (cf. `toutesLesLignes`). */
export const PAGES_EN_PARALLELE = 4

/**
 * Lit TOUTES les lignes d'une requête, page par page, au lieu de se fier à une
 * réponse unique plafonnée à `TAILLE_PAGE`. Le résultat est le même qu'une
 * lecture page après page : mêmes lignes, même ordre.
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
  // 1re page seule : la plupart des listes tiennent dedans (un seul appel).
  const premiere = (await page(0, taille - 1)).data ?? []
  const lignes: T[] = [...premiere]
  if (premiere.length < taille) return lignes
  // Au-delà : les pages suivantes partent PAR LOTS EN PARALLÈLE plutôt qu'une
  // par une. Les 4 071 DI (5 pages) arrivaient en 5 allers-retours successifs ;
  // ici en 2. Le lot peut demander une ou deux pages vides de trop : quelques
  // millisecondes, contre une seconde par page attendue.
  for (let debut = taille; ; debut += taille * PAGES_EN_PARALLELE) {
    const lot = await Promise.all(
      Array.from({ length: PAGES_EN_PARALLELE }, (_, i) => {
        const d = debut + i * taille
        return page(d, d + taille - 1)
      }),
    )
    for (const { data } of lot) {
      const tranche = data ?? []
      lignes.push(...tranche)
      // Une page incomplète marque la fin : les suivantes du lot sont ignorées.
      if (tranche.length < taille) return lignes
    }
  }
}
