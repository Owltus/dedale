import { isoLocale, parseDateLocale } from '@/lib/date'

/**
 * Logique CALENDAIRE de l'axe temporel des graphiques de relevés : granularité,
 * repères, rattachement d'un relevé à sa période, construction des lignes de
 * données. Fonctions PURES, sans React ni Recharts — le composant
 * `serie-temporelle.tsx` ne fait plus que les câbler au rendu.
 */

export interface PointTemporel {
  /** Date RÉELLE du point (ISO) — jamais arrondie à un bucket, cf. pipeline Relevés. */
  date: string
  valeur: number | null
  /** Conformité (mode « ligne » uniquement) — colore ET change la forme du point. */
  conforme?: boolean | null
  /** Relevé de remplacement de compteur (index dépose/pose) — signalé dans le tooltip. */
  remplacement?: boolean
  otId: string
}

export interface SerieTemporelle {
  cle: string
  label: string
  points: PointTemporel[]
  /**
   * Seuils PROPRES à cette série (mode « ligne » uniquement) — une série peut
   * n'avoir qu'un seuil haut, qu'un seuil bas, les deux, ou aucun ; chacune porte
   * les siens indépendamment des autres séries du même graphique (deux mesures
   * du même groupe, ex. Température E.C.S/E.F.S, ont souvent des seuils
   * différents). Tracé dans la MÊME couleur que la série, comme l'ancien système.
   */
  seuilMinimum?: number | null
  seuilMaximum?: number | null
}

// ─────────────────────────────────────────────────────────────────────────
// Granularité de l'axe temporel — repères TOUJOURS posés sur une frontière de
// calendrier propre (1er du mois / du trimestre / de l'année), jamais sur le
// quantième d'un relevé (qui varie sans logique visible d'une occurrence à
// l'autre). La granularité la plus fine dont les repères tiennent dans la
// largeur mesurée est choisie automatiquement — même principe que
// `d3.scaleTime().ticks()` : on ne sous-échantillonne pas une grille fixe, on
// choisit l'UNITÉ de la grille selon l'étendue affichée. Sur une période courte
// (3 mois) → un repère par mois ; sur un historique de plusieurs années (« Tout »)
// → l'axe bascule automatiquement au trimestre puis à l'année plutôt que de
// garder un repère « mois » sur deux ou trois au hasard.
export type Granularite = 'mois' | 'trimestre' | 'annee'

const FR_MOIS_ANNEE = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  year: '2-digit',
})
const FR_ANNEE = new Intl.DateTimeFormat('fr-FR', { year: 'numeric' })
// Info-bulle au survol : date complète, précise, sans ambiguïté d'année.
const FR_DATE_COMPLETE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function labelRepere(dateMs: number, granularite: Granularite): string {
  return granularite === 'annee'
    ? FR_ANNEE.format(new Date(dateMs))
    : FR_MOIS_ANNEE.format(new Date(dateMs))
}
export function labelDateComplete(dateMs: number): string {
  return FR_DATE_COMPLETE.format(new Date(dateMs))
}

/**
 * Date « logique » pour RATTACHER un relevé à sa période de calendrier — jamais
 * pour sa position réelle sur l'axe ni pour le tooltip (qui gardent la date
 * exacte). Un relevé fait le 15 du mois ou avant est un relevé de FIN du mois
 * PRÉCÉDENT (le releveur clôture parfois son passage avec quelques jours de
 * retard sur le mois suivant) — sans ce rattachement, un mois où il y a
 * pourtant un relevé (juste enregistré 1-2 jours en retard) serait compté à
 * tort comme vide dans le mode colonnes (repère manquant, faux « trou »).
 */
export function dateLogique(date: Date): Date {
  return date.getDate() <= 15
    ? new Date(date.getFullYear(), date.getMonth(), 0)
    : date
}

/** 1er jour de la période (mois/trimestre/année) contenant `date`, à minuit local. */
export function debutPeriode(date: Date, granularite: Granularite): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  if (granularite === 'trimestre') d.setMonth(Math.floor(d.getMonth() / 3) * 3)
  else if (granularite === 'annee') d.setMonth(0)
  return d
}

export function periodeSuivante(date: Date, granularite: Granularite): Date {
  const d = new Date(date)
  if (granularite === 'annee') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + (granularite === 'trimestre' ? 3 : 1))
  return d
}

/** Repères (frontières de calendrier) de `granularite` couvrant [debutMs, finMs]. */
export function genererReperes(
  granularite: Granularite,
  debutMs: number,
  finMs: number,
): number[] {
  const reperes: number[] = []
  let curseur = debutPeriode(new Date(debutMs), granularite)
  while (curseur.getTime() <= finMs) {
    reperes.push(curseur.getTime())
    curseur = periodeSuivante(curseur, granularite)
  }
  return reperes
}

/** La granularité la plus FINE dont les repères tiennent dans `maxReperes`. */
export function choisirGranularite(
  debutMs: number,
  finMs: number,
  maxReperes: number,
): Granularite {
  for (const g of ['mois', 'trimestre', 'annee'] as const) {
    if (genererReperes(g, debutMs, finMs).length <= maxReperes) return g
  }
  return 'annee'
}

/**
 * Filet de sécurité : réduit `items` à au plus `max`, TOUJOURS le premier et le
 * dernier, répartis uniformément — au cas où même la granularité « année » ne
 * tiendrait pas dans un conteneur extrêmement étroit.
 */
export function echantillonner<T>(items: T[], max: number): T[] {
  if (max < 1 || items.length === 0) return []
  if (items.length <= max) return items
  if (max === 1) return [items[items.length - 1]!]
  const pas = (items.length - 1) / (max - 1)
  const retenus = new Set<number>()
  for (let i = 0; i < max; i += 1) retenus.add(Math.round(i * pas))
  return items.filter((_, i) => retenus.has(i))
}

export type LigneDonnees = Record<string, string | number | null>

/** Clé de la valeur d'une série dans une ligne de données du graphique. */
export function cleValeur(serieCle: string): string {
  return serieCle
}
export function cleConforme(serieCle: string): string {
  return `${serieCle}__conforme`
}
export function cleOt(serieCle: string): string {
  return `${serieCle}__ot`
}
export function cleDates(serieCle: string): string {
  return `${serieCle}__dates`
}
export function cleRemplacement(serieCle: string): string {
  return `${serieCle}__remplacement`
}

/**
 * Une ligne par date RÉELLE distincte (union de toutes les séries) — jamais de
 * bucket : les tâches d'une même gamme sont exécutées ensemble dans le même OT,
 * donc leurs dates coïncident déjà naturellement d'une série à l'autre. Aucun
 * risque de collision (contrairement à l'ancien bucket mensuel, qui écrasait ou
 * dispersait les points dès qu'une gamme avait plus d'un relevé par mois).
 */
export function construireDonneesLigne(
  series: SerieTemporelle[],
): LigneDonnees[] {
  const dates = [
    ...new Set(series.flatMap((s) => s.points.map((p) => p.date))),
  ].sort()
  return dates.map((date) => {
    const ligne: LigneDonnees = { date, dateMs: new Date(date).getTime() }
    for (const s of series) {
      const point = s.points.find((p) => p.date === date)
      ligne[cleValeur(s.cle)] = point?.valeur ?? null
      ligne[cleConforme(s.cle)] =
        point?.conforme === true ? 1 : point?.conforme === false ? 0 : null
      ligne[cleOt(s.cle)] = point?.otId ?? null
    }
    return ligne
  })
}

/**
 * Une colonne par date RÉELLE distincte — RIEN n'est jamais additionné, moyenné
 * ni fusionné : chaque relevé garde sa propre colonne, toujours, y compris en
 * mode « Tout ». Seules les ÉTIQUETTES de l'axe (cf. `reperesEtiquettesColonnes`)
 * sont choisies avec parcimonie pour rester lisibles — exactement comme le mode
 * ligne, où l'axe n'affiche pas une étiquette par relevé sans que les points
 * eux-mêmes disparaissent pour autant.
 *
 * Des colonnes VIDES (sans aucun relevé) sont ajoutées à chaque frontière de
 * calendrier qui n'a aucune donnée — pas pour fusionner quoi que ce soit, mais
 * pour qu'une fenêtre « 3 mois » avec un seul relevé montre bien ses 3 mois
 * complets plutôt qu'une colonne isolée collée à un bord.
 */
export function construireDonneesColonnes(
  series: SerieTemporelle[],
  granularite: Granularite,
  debutMs: number,
  finMs: number,
): LigneDonnees[] {
  const reelles = new Set(series.flatMap((s) => s.points.map((p) => p.date)))
  // `isoLocale` (jamais `.toISOString()`, qui convertit en UTC et décale la date
  // d'un jour — parfois d'un MOIS entier ici, un « 1er du mois » minuit local
  // proche du changement de fuseau retombant sur le 30 du mois précédent en UTC).
  const periodesAvecDonnee = new Set(
    [...reelles].map((d) =>
      isoLocale(debutPeriode(dateLogique(new Date(d)), granularite)),
    ),
  )
  const periodesVides = genererReperes(granularite, debutMs, finMs)
    .map((ms) => isoLocale(new Date(ms)))
    .filter((cle) => !periodesAvecDonnee.has(cle))
  const dates = [...reelles, ...periodesVides].sort()

  return dates.map((date) => {
    const ligne: LigneDonnees = {
      date,
      dateMs: parseDateLocale(date).getTime(),
    }
    for (const s of series) {
      const point = s.points.find((p) => p.date === date && p.valeur !== null)
      ligne[cleValeur(s.cle)] = point?.valeur ?? null
      ligne[cleConforme(s.cle)] = null // compteurs : pas de conformité
      ligne[cleOt(s.cle)] = point?.otId ?? null
      ligne[cleDates(s.cle)] = point
        ? `le ${labelDateComplete(new Date(point.date).getTime())}`
        : null
      ligne[cleRemplacement(s.cle)] = point?.remplacement ? 1 : null
    }
    return ligne
  })
}

/**
 * Étiquettes de l'axe (mode colonnes) : une par période de calendrier couverte
 * — la PREMIÈRE colonne (réelle ou vide) rencontrée à partir de chaque
 * frontière porte l'étiquette. Ne change RIEN aux colonnes elles-mêmes
 * (`construireDonneesColonnes` reste inchangée) — uniquement lesquelles, parmi
 * toutes les colonnes déjà là, reçoivent un texte lisible sous l'axe.
 */
export function reperesEtiquettesColonnes(
  dates: string[],
  granularite: Granularite,
  max: number,
): string[] {
  const candidats: string[] = []
  const periodesVues = new Set<string>()
  for (const date of dates) {
    const periode = isoLocale(
      debutPeriode(dateLogique(parseDateLocale(date)), granularite),
    )
    if (!periodesVues.has(periode)) {
      periodesVues.add(periode)
      candidats.push(date)
    }
  }
  return echantillonner(candidats, max)
}
