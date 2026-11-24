import type { Json } from '@/lib/database.types'

/**
 * Lieu(x) de chaque demande, prêts à afficher : di_id → « Chambre 214, Chambre 109 ».
 * `select` de `demandesQueries.locauxParDi` : partagé par la page Demandes et le
 * tableau de bord, qui titrent leurs cartes par le lieu.
 *
 * La base compose déjà le texte (fonction `lieux_di_du_site`, 168 : noms dans
 * l'ordre des locaux, sans doublon ni nom vide) ; il ne reste qu'à passer de
 * l'objet JSON à une Map, en ignorant toute valeur qui ne serait pas un texte.
 */
export function lieuxParDi(objet: Json): Map<string, string> {
  if (!objet || typeof objet !== 'object' || Array.isArray(objet))
    return new Map()
  const lieux = new Map<string, string>()
  for (const [diId, texte] of Object.entries(objet)) {
    if (typeof texte === 'string' && texte) lieux.set(diId, texte)
  }
  return lieux
}

/** Titre d'une DI sans lieu (aucun local rattaché). */
export const LIEU_NON_PRECISE = 'Lieu non précisé'
