import { consoOperation, sommesCompteursParUnite } from './schemas'

/**
 * Libellé d'un relevé à partir d'items `{ symbole, conso }` : somme par unité
 * (`sommesCompteursParUnite`) puis format « 80 kWh » (unités jointes par « · »).
 * Renvoie `''` si rien à afficher. Utilisée par la carte d'en-tête de la fiche
 * détail (`minOccurrences = 2`) — la carte de LISTE utilise `calculerRelevesParOt`
 * ci-dessous (valeur brute + consommation, deux lignes).
 */
export function libelleReleve(
  items: { symbole: string; conso: number | null }[],
  minOccurrences = 2,
): string {
  return sommesCompteursParUnite(items, minOccurrences)
    .map((s) => `${s.total.toLocaleString('fr-FR')} ${s.symbole}`)
    .join(' · ')
}

/** Un groupe de compteurs d'une même unité, agrégés pour une carte de liste. */
interface ReleveGroupe {
  symbole: string
  /** Somme des relevés bruts (valeur affichée sur le compteur). */
  valeur: number
  /** Somme des consommations (delta vs relevé précédent, cf. `consoOperation`). */
  conso: number
}

/**
 * Regroupe par unité et somme À LA FOIS la valeur brute et la consommation —
 * même filtre que `sommesCompteursParUnite` (occurrences ≥ seuil, au moins une
 * conso calculable), pour que les deux sommes portent exactement sur le même
 * sous-ensemble de compteurs.
 */
function sommesReleves(
  items: {
    symbole: string
    valeurBrute: number | null
    conso: number | null
  }[],
  minOccurrences: number,
): ReleveGroupe[] {
  const groupes = new Map<
    string,
    { count: number; valeur: number; conso: number; aConso: boolean }
  >()
  for (const it of items) {
    if (it.symbole === '') continue
    const g = groupes.get(it.symbole) ?? {
      count: 0,
      valeur: 0,
      conso: 0,
      aConso: false,
    }
    g.count += 1
    if (it.conso !== null) {
      g.conso += it.conso
      g.aConso = true
      if (it.valeurBrute !== null) g.valeur += it.valeurBrute
    }
    groupes.set(it.symbole, g)
  }
  return [...groupes.entries()]
    .filter(([, g]) => g.count >= minOccurrences && g.aConso)
    .map(([symbole, g]) => ({ symbole, valeur: g.valeur, conso: g.conso }))
}

function formatValeur(groupes: ReleveGroupe[]): string {
  return groupes
    .map((g) => `${g.valeur.toLocaleString('fr-FR')} ${g.symbole}`)
    .join(' · ')
}

// Un compteur CUMULATIF ne peut que croître (§ doctrine) → la consommation
// affichée est toujours ≥ 0, signée « + » pour le dire explicitement (« +219
// m³ »), sauf à 0 pile (aucun signe). Même convention que `OperationRow`.
function formatConso(groupes: ReleveGroupe[]): string {
  return groupes
    .map(
      (g) =>
        `${g.conso > 0 ? '+' : ''}${g.conso.toLocaleString('fr-FR')} ${g.symbole}`,
    )
    .join(' · ')
}

/** Relevé affiché sur une carte de liste : valeur brute + consommation, deux
 * lignes — même information que `OperationRow` en lecture seule, agrégée au
 * niveau de l'OT plutôt que par opération. */
export interface ReleveAffiche {
  /** Relevé brut cumulé (ex. « 4 455 m³ »). */
  valeur: string
  /** Consommation cumulée depuis le relevé précédent (ex. « +219 m³ »). */
  conso: string
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
 * Calcule le relevé affiché sur la carte de chaque OT : valeur brute + somme
 * des consommations par unité — même information que `OperationRow` en lecture
 * seule (valeur du compteur, puis sa conso en dessous, cf. sa doc), agrégée au
 * niveau de l'OT. À la différence de la carte d'en-tête de la fiche détail (qui
 * exige ≥ 2 compteurs d'une unité), la carte de LISTE affiche la valeur même
 * avec UN seul compteur (`minOccurrences = 1`). La consommation d'un compteur =
 * son relevé courant moins le précédent (gérant un éventuel remplacement, cf.
 * `consoOperation`) — TOUJOURS ≥ 0 (un compteur cumulatif ne peut que croître).
 *
 * Pur : reçoit TOUS les relevés cumulatifs du site (un seul fetch) et rend une
 * map `ot_id → ReleveAffiche`. Une entrée n'existe QUE si l'OT a un relevé non
 * vide → la carte n'affiche rien sinon (même règle que le détail).
 */
export function calculerRelevesParOt(
  lignes: readonly ReleveLigne[],
): Map<string, ReleveAffiche> {
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

  const result = new Map<string, ReleveAffiche>()
  for (const [otId, lignesOt] of parOt) {
    const items = lignesOt.map((d) => ({
      symbole: d.l.unite_symbole ?? '',
      valeurBrute: d.l.valeur_mesuree,
      conso: consoOperation({
        precedent: precedent(d, otId, parGammeSource),
        courant: d.l.valeur_mesuree,
        depose: d.l.index_depose,
        pose: d.l.index_pose,
      }),
    }))
    // `minOccurrences = 1` : sur la carte de LISTE on affiche la valeur même avec
    // un SEUL compteur de l'unité (≠ carte d'en-tête détail, qui exige ≥ 2).
    const groupes = sommesReleves(items, 1)
    if (groupes.length > 0) {
      result.set(otId, {
        valeur: formatValeur(groupes),
        conso: formatConso(groupes),
      })
    }
  }
  return result
}
