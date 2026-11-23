/**
 * Lieu(x) de chaque demande, prêts à afficher : di_id → « Chambre 214, Chambre 109 ».
 * `select` de `demandesQueries.locauxParDi` : partagé par la page Demandes et le
 * tableau de bord, qui titrent leurs cartes par le lieu (une DI peut en avoir
 * plusieurs, dans l'ordre de la requête, sans doublon).
 */
export function lieuxParDi(
  rows: readonly { di_id: string; locaux: { nom: string | null } }[],
): Map<string, string> {
  const noms = new Map<string, string[]>()
  for (const r of rows) {
    const nom = r.locaux.nom
    if (!nom) continue
    const liste = noms.get(r.di_id) ?? []
    if (!liste.includes(nom)) liste.push(nom)
    noms.set(r.di_id, liste)
  }
  return new Map([...noms].map(([id, l]) => [id, l.join(', ')]))
}

/** Titre d'une DI sans lieu (aucun local rattaché). */
export const LIEU_NON_PRECISE = 'Lieu non précisé'
