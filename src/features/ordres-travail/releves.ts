import { consoOperation, sommesCompteursParUnite } from './schemas'

/**
 * Libellé d'un relevé à partir d'items `{ symbole, conso }` : somme par unité
 * (`sommesCompteursParUnite`) puis format « 80 kWh » (unités jointes par « · »).
 * Renvoie `''` si rien à afficher. Source UNIQUE du format de relevé — réutilisée
 * par la carte de liste (`minOccurrences = 1`) ET la carte d'en-tête de la fiche
 * détail (`minOccurrences = 2`).
 */
export function libelleReleve(
  items: { symbole: string; conso: number | null }[],
  minOccurrences = 2,
): string {
  return sommesCompteursParUnite(items, minOccurrences)
    .map((s) => `${s.total.toLocaleString('fr-FR')} ${s.symbole}`)
    .join(' · ')
}

/**
 * Un relevé de compteur CUMULATIF (ligne `operations_execution`) joint à l'OT
 * porteur (gamme + date prévue, pour retrouver le relevé précédent). Forme de
 * sortie de la requête groupée `ordresTravailQueries.relevesListe`.
 */
export interface ReleveLigne {
  ordre_travail_id: string
  source_type: string
  source_id: string | null
  valeur_mesuree: number | null
  index_depose: number | null
  index_pose: number | null
  statut: string
  date_execution: string | null
  created_at: string
  unite_symbole: string | null
  ordres_travail: { gamme_id: string | null; date_prevue: string | null } | null
}

interface Decoree {
  l: ReleveLigne
  gamme: string | null
  date: string | null
}

// Clé d'une série de relevés du même compteur dans la même gamme.
function cleSource(d: Decoree): string {
  return `${d.gamme ?? ''}|${d.l.source_type}|${d.l.source_id ?? ''}`
}

// `a` est-il PLUS RÉCENT que `b` selon (date_execution NULLS LAST, created_at) —
// même ordre que la requête `previousReadings` (le 1er = le précédent retenu).
function plusRecent(a: ReleveLigne, b: ReleveLigne): boolean {
  if (a.date_execution !== b.date_execution) {
    if (a.date_execution === null) return false
    if (b.date_execution === null) return true
    return a.date_execution > b.date_execution
  }
  return a.created_at > b.created_at
}

// Valeur du relevé PRÉCÉDENT d'un compteur : dernier relevé terminé et valué de la
// même (gamme, source) sur un OT STRICTEMENT antérieur (par date prévue).
function precedent(
  d: Decoree,
  otId: string,
  index: ReadonlyMap<string, Decoree[]>,
): number | null {
  if (d.gamme === null || d.date === null) return null
  const dateCourante = d.date
  let best: Decoree | null = null
  for (const c of index.get(cleSource(d)) ?? []) {
    if (c.l.ordre_travail_id === otId) continue
    if (c.date === null || c.date >= dateCourante) continue
    if (best === null || plusRecent(c.l, best.l)) best = c
  }
  return best?.l.valeur_mesuree ?? null
}

/**
 * Calcule le « relevé » affiché sur la carte de chaque OT : somme des
 * consommations par unité. À la différence de la carte d'en-tête de la fiche
 * détail (qui exige ≥ 2 compteurs d'une unité), la carte de LISTE affiche la
 * valeur même avec UN seul compteur (`minOccurrences = 1`). La consommation d'un
 * compteur = son relevé courant moins le précédent (gérant un éventuel
 * remplacement, cf. `consoOperation`).
 *
 * Pur : reçoit TOUS les relevés cumulatifs du site (un seul fetch) et rend une
 * map `ot_id → libellé` (ex. « 80 kWh »). Une entrée n'existe QUE si l'OT a un
 * relevé non vide → la carte n'affiche rien sinon (même règle que le détail).
 */
export function calculerRelevesParOt(
  lignes: readonly ReleveLigne[],
): Map<string, string> {
  const dec: Decoree[] = lignes.map((l) => ({
    l,
    gamme: l.ordres_travail?.gamme_id ?? null,
    date: l.ordres_travail?.date_prevue ?? null,
  }))

  // Index des précédents possibles par (gamme, source) : relevés TERMINÉS et valués.
  const parGammeSource = new Map<string, Decoree[]>()
  for (const d of dec) {
    if (
      d.gamme === null ||
      d.l.statut !== 'terminee' ||
      d.l.valeur_mesuree === null
    )
      continue
    const k = cleSource(d)
    const arr = parGammeSource.get(k) ?? []
    arr.push(d)
    parGammeSource.set(k, arr)
  }

  // Regroupe les relevés par OT.
  const parOt = new Map<string, Decoree[]>()
  for (const d of dec) {
    const arr = parOt.get(d.l.ordre_travail_id) ?? []
    arr.push(d)
    parOt.set(d.l.ordre_travail_id, arr)
  }

  const result = new Map<string, string>()
  for (const [otId, lignesOt] of parOt) {
    const items = lignesOt.map((d) => ({
      symbole: d.l.unite_symbole ?? '',
      conso: consoOperation({
        precedent: precedent(d, otId, parGammeSource),
        courant: d.l.valeur_mesuree,
        depose: d.l.index_depose,
        pose: d.l.index_pose,
      }),
    }))
    // `minOccurrences = 1` : sur la carte de LISTE on affiche la valeur même avec
    // un SEUL compteur de l'unité (≠ carte d'en-tête détail, qui exige ≥ 2).
    const releve = libelleReleve(items, 1)
    if (releve !== '') result.set(otId, releve)
  }
  return result
}
