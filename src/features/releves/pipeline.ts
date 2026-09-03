import {
  estCompteur,
  estCompteurCumulatif,
  estMesureExecution,
} from '@/features/ordres-travail/operation-predicats'
import {
  consoOperation,
  sommesCompteursParUnite,
} from '@/features/ordres-travail/schemas'
import { formatDate, isoLocale, parseDateLocale } from '@/lib/date'
import type { Database } from '@/lib/database.types'

type OperationExecution =
  Database['public']['Tables']['operations_execution']['Row']

/**
 * Ligne d'historique d'un relevé : la ligne `operations_execution` complète,
 * enrichie de l'OT qui la porte (jointure `ordres_travail!inner`). Une seule
 * requête ramène tout l'historique d'un site — le reste (regroupements,
 * séries, bandeau) est calculé ici, en pur, comme dans l'ancien système.
 */
export interface HistoriqueLigne extends OperationExecution {
  ordres_travail: {
    id: string
    gamme_id: string | null
    nom_gamme: string | null
    date_prevue: string
    date_cloture: string | null
    /** Snapshot souple hérité de la gamme (migration 067) — même mécanisme que
     * les cartes OT (`ot-card.tsx`) : un OT garde son image même si la gamme en
     * change ensuite. Sert ici à illustrer la gamme dans Relevés. */
    miniature_id: string | null
  } | null
}

// ─────────────────────────────────────────────────────────────────────────
// Page liste : une carte par gamme ayant au moins un relevé.
// ─────────────────────────────────────────────────────────────────────────

export interface GammeReleveResume {
  /** Id de la gamme — nommé `id` (et non `gammeId`) pour satisfaire `SlugDetailRoute`. */
  id: string
  nomGamme: string
  nbTypes: number
  nbOt: number
  dernierReleve: string | null
  /** Vignette de l'OT le plus RÉCENT (snapshot souple hérité de la gamme —
   * migration 067, cf. `HistoriqueLigne`) : la meilleure approximation dispo
   * de « l'image actuelle de la gamme » sans requête supplémentaire. */
  miniatureId: string | null
}

export function gammesAvecReleves(
  lignes: readonly HistoriqueLigne[],
): GammeReleveResume[] {
  interface Acc {
    nomGamme: string
    noms: Set<string>
    ots: Set<string>
    dernier: string | null
    miniatureId: string | null
  }
  const parGamme = new Map<string, Acc>()
  for (const l of lignes) {
    const gammeId = l.ordres_travail?.gamme_id
    if (!gammeId || !estMesureExecution(l)) continue
    const acc = parGamme.get(gammeId) ?? {
      nomGamme: l.ordres_travail?.nom_gamme ?? '(gamme supprimée)',
      noms: new Set<string>(),
      ots: new Set<string>(),
      dernier: null,
      miniatureId: null,
    }
    acc.noms.add(l.nom)
    acc.ots.add(l.ordre_travail_id)
    const date = l.ordres_travail?.date_cloture ?? l.date_execution
    if (date && (acc.dernier === null || date > acc.dernier)) {
      acc.dernier = date
      acc.miniatureId = l.ordres_travail?.miniature_id ?? null
    }
    parGamme.set(gammeId, acc)
  }
  return [...parGamme.entries()]
    .map(([gammeId, acc]) => ({
      id: gammeId,
      nomGamme: acc.nomGamme,
      nbTypes: acc.noms.size,
      nbOt: acc.ots.size,
      dernierReleve: acc.dernier,
      miniatureId: acc.miniatureId,
    }))
    .sort((a, b) => a.nomGamme.localeCompare(b.nomGamme, 'fr'))
}

// ─────────────────────────────────────────────────────────────────────────
// Page détail : séries temporelles d'une gamme.
// ─────────────────────────────────────────────────────────────────────────

export interface PointReleve {
  otId: string
  /**
   * Date RÉELLE du point (date de clôture de l'OT, sinon d'exécution, sinon
   * prévue). Chaque point garde sa date exacte — aucun regroupement par mois :
   * une gamme hebdomadaire (fréquente chez Dédale) ferait s'entasser plusieurs
   * points sur un même bucket mensuel, avec un mécanisme de décalage qui finit
   * par disperser les points à des mois sans rapport avec leur date réelle
   * (constaté : jusqu'à 40 mois d'écart sur une gamme hebdomadaire réelle).
   * L'axe des graphiques est donc un axe TEMPOREL CONTINU (cf. `serie-temporelle.tsx`).
   */
  date: string
  /** Valeur brute (moyenne si la tâche apparaît plusieurs fois dans l'OT). */
  valeur: number | null
  /** Consommation (compteur cumulatif uniquement), via `consoOperation`. */
  conso: number | null
  conforme: boolean | null
  /**
   * `true` si ce point marque un REMPLACEMENT de compteur (index_depose/pose
   * renseignés) — la consommation reste exacte (cf. `consoOperation`), mais
   * l'origine mérite d'être signalée : l'ancien système la marquait d'un
   * astérisque dans le tooltip, la fiche OT l'affiche déjà explicitement.
   */
  remplacement: boolean
}

export interface SerieReleve {
  /** Type de relevé — `nom` de l'opération, clé de regroupement. */
  nom: string
  uniteSymbole: string
  uniteNom: string | null
  /** Seuils les plus récents de la série (une opération peut évoluer dans le temps). */
  seuilMinimum: number | null
  seuilMaximum: number | null
  estCompteur: boolean
  estCompteurCumulatif: boolean
  points: PointReleve[]
}

interface PointBrut {
  otId: string
  date: string
  valeur: number | null
  conforme: boolean | null
  depose: number | null
  pose: number | null
}

function construirePoint(
  otId: string,
  lignes: HistoriqueLigne[],
): PointBrut | null {
  const ot = lignes[0]?.ordres_travail ?? null
  const valeurs = lignes
    .map((l) => l.valeur_mesuree)
    .filter((v): v is number => v !== null)
  if (valeurs.length === 0) return null
  const valeur = valeurs.reduce((a, b) => a + b, 0) / valeurs.length

  const datesExecution = lignes
    .map((l) => l.date_execution)
    .filter((d): d is string => d !== null)
    .sort()
  const date =
    ot?.date_cloture ?? datesExecution.at(-1) ?? ot?.date_prevue ?? null
  if (date === null) return null

  const conformites = lignes.map((l) => l.est_conforme)
  const conforme = conformites.some((c) => c === false)
    ? false
    : conformites.every((c) => c === true)
      ? true
      : null

  // Dépose/pose n'a de sens que si UNE seule ligne contribue au point (cas usuel —
  // une tâche compteur apparaît en général une fois par OT). Au-delà, l'ambiguïté
  // d'un remplacement sur plusieurs lignes est écartée au profit d'un delta simple.
  const uneLigne = lignes.length === 1 ? lignes[0] : null
  const depose = uneLigne?.index_depose ?? null
  const pose = uneLigne?.index_pose ?? null

  return { otId, date, valeur, conforme, depose, pose }
}

function calculerConsos(
  points: PointBrut[],
): (PointBrut & { conso: number | null; remplacement: boolean })[] {
  const out: (PointBrut & { conso: number | null; remplacement: boolean })[] =
    []
  let precedent: number | null = null
  for (const p of points) {
    const conso = consoOperation({
      precedent,
      courant: p.valeur,
      depose: p.depose,
      pose: p.pose,
    })
    out.push({
      ...p,
      conso,
      remplacement: p.depose !== null && p.pose !== null,
    })
    if (p.valeur !== null) precedent = p.valeur
  }
  return out
}

function seuilRecent(
  lignes: HistoriqueLigne[],
  cle: 'seuil_minimum' | 'seuil_maximum',
): number | null {
  const triees = [...lignes].sort((a, b) =>
    (a.date_execution ?? '').localeCompare(b.date_execution ?? ''),
  )
  for (let i = triees.length - 1; i >= 0; i -= 1) {
    const v = triees[i]?.[cle]
    if (v !== null && v !== undefined) return v
  }
  return null
}

/** Séries temporelles (une par type de relevé) d'une gamme, prêtes pour les graphiques. */
export function seriesParGamme(
  lignes: readonly HistoriqueLigne[],
  gammeId: string,
): SerieReleve[] {
  const mesures = lignes.filter(
    (l) => l.ordres_travail?.gamme_id === gammeId && estMesureExecution(l),
  )

  const parNom = new Map<string, HistoriqueLigne[]>()
  for (const l of mesures) {
    const arr = parNom.get(l.nom) ?? []
    arr.push(l)
    parNom.set(l.nom, arr)
  }

  const series: SerieReleve[] = []
  for (const [nom, lignesNom] of parNom) {
    const premiere = lignesNom[0]
    if (!premiere) continue
    const compteur = estCompteur(premiere)
    const cumulatif = estCompteurCumulatif(premiere)

    const parOt = new Map<string, HistoriqueLigne[]>()
    for (const l of lignesNom) {
      const arr = parOt.get(l.ordre_travail_id) ?? []
      arr.push(l)
      parOt.set(l.ordre_travail_id, arr)
    }

    const bruts = [...parOt.entries()]
      .map(([otId, ls]) => construirePoint(otId, ls))
      .filter((p): p is PointBrut => p !== null)
      .sort((a, b) => a.date.localeCompare(b.date))

    // Consommation calculée sur l'historique COMPLET déjà chargé — le précédent est
    // le point d'avant dans la même série, pas besoin de requête séparée.
    const avecConso = cumulatif
      ? calculerConsos(bruts)
      : bruts.map((p) => ({
          ...p,
          conso: null as number | null,
          remplacement: false,
        }))

    // Un compteur sans conso calculable (pas de précédent, pas de remplacement
    // documenté) ne porte aucune information de série temporelle → écarté (règle de
    // l'ancien système « premier point retiré », généralisée à tout point non calculable).
    const utiles = cumulatif
      ? avecConso.filter((p) => p.conso !== null)
      : avecConso

    series.push({
      nom,
      uniteSymbole: premiere.unite_symbole ?? '',
      uniteNom: premiere.unite_nom,
      seuilMinimum: seuilRecent(lignesNom, 'seuil_minimum'),
      seuilMaximum: seuilRecent(lignesNom, 'seuil_maximum'),
      estCompteur: compteur,
      estCompteurCumulatif: cumulatif,
      points: utiles.map(
        ({ otId, date, valeur, conso, conforme, remplacement }) => ({
          otId,
          date,
          valeur,
          conso,
          conforme,
          remplacement,
        }),
      ),
    })
  }
  return series.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

// ─────────────────────────────────────────────────────────────────────────
// Regroupement par unité, axe des mois commun, filtre de période.
// ─────────────────────────────────────────────────────────────────────────

export interface GroupeUnite {
  uniteSymbole: string
  uniteNom: string | null
  estCompteur: boolean
  /** Choisit le mode du graphique : colonnes (consommation) si vrai, ligne sinon. */
  estCompteurCumulatif: boolean
  series: SerieReleve[]
}

/** Un graphique par unité — compteurs d'abord, puis ordre alphabétique. */
export function chartGroups(series: SerieReleve[]): GroupeUnite[] {
  const groupes = new Map<string, GroupeUnite>()
  for (const s of series) {
    const g = groupes.get(s.uniteSymbole) ?? {
      uniteSymbole: s.uniteSymbole,
      uniteNom: s.uniteNom,
      estCompteur: s.estCompteur,
      estCompteurCumulatif: s.estCompteurCumulatif,
      series: [],
    }
    g.series.push(s)
    groupes.set(s.uniteSymbole, g)
  }
  return [...groupes.values()].sort((a, b) => {
    if (a.estCompteur !== b.estCompteur) return a.estCompteur ? -1 : 1
    return a.uniteSymbole.localeCompare(b.uniteSymbole, 'fr')
  })
}

/**
 * En-têtes + lignes CSV d'un graphique (un groupe d'unité) — l'export brut des
 * MÊMES points réels que ceux tracés, jamais une valeur recalculée : une ligne
 * par date réelle, une colonne par série (+ conformité en mode « ligne », +
 * changement de compteur en mode compteur cumulatif). Utilisé par le bouton
 * d'export CSV de chaque graphique (`releve-detail.tsx`).
 */
export function csvGroupe(g: GroupeUnite): {
  entetes: string[]
  lignes: string[][]
} {
  const dates = [
    ...new Set(g.series.flatMap((s) => s.points.map((p) => p.date))),
  ].sort()
  const avecConformite = !g.estCompteur
  const avecRemplacement = g.estCompteurCumulatif

  const entetes = [
    'Date',
    ...g.series.flatMap((s) => [
      `${s.nom} (${g.uniteSymbole})`,
      ...(avecConformite ? [`${s.nom} — conforme`] : []),
      ...(avecRemplacement ? [`${s.nom} — changement de compteur`] : []),
    ]),
  ]

  const lignes = dates.map((date) => [
    formatDate(date),
    ...g.series.flatMap((s) => {
      const point = s.points.find((p) => p.date === date)
      const valeur = g.estCompteurCumulatif ? point?.conso : point?.valeur
      return [
        valeur !== null && valeur !== undefined ? String(valeur) : '',
        ...(avecConformite
          ? [
              point?.conforme === true
                ? 'Oui'
                : point?.conforme === false
                  ? 'Non'
                  : '',
            ]
          : []),
        ...(avecRemplacement ? [point?.remplacement ? 'Oui' : ''] : []),
      ]
    }),
  ])

  return { entetes, lignes }
}

/**
 * Étendue [date la plus ancienne, date la plus récente] de toutes les séries d'une
 * gamme — sert de domaine d'axe X commun aux graphiques (chacun sur sa propre unité,
 * mais tous alignés sur la même plage temporelle). `null` si aucun point.
 */
export function domaineDates(
  series: SerieReleve[],
): { debut: string; fin: string } | null {
  const dates = series.flatMap((s) => s.points.map((p) => p.date)).sort()
  if (dates.length === 0) return null
  return { debut: dates[0]!, fin: dates.at(-1)! }
}

export type Periode = '3m' | '6m' | '12m' | 'annee' | 'tout'

export const PERIODE_OPTIONS: { value: Periode; label: string }[] = [
  { value: '3m', label: '3 mois' },
  { value: '6m', label: '6 mois' },
  { value: '12m', label: '12 mois' },
  { value: 'annee', label: 'Année en cours' },
  { value: 'tout', label: 'Tout' },
]

/**
 * Fenêtre [debut, fin] CONCEPTUELLE d'une période — indépendante des données
 * réellement présentes dedans. Sert à dessiner un axe TOUJOURS complet (ex. les 3
 * mois entiers du filtre « 3 mois »), même quand une gamme n'a qu'un seul relevé
 * dans cette fenêtre : sans elle, l'axe se réduirait à la date de cet unique
 * point (un seul repère, tout le reste de la largeur perdu). `toutesSeries`
 * (NON filtrées) n'est utilisé que pour « tout », où la fenêtre EST l'étendue
 * réelle des données (il n'y a pas d'autre borne naturelle).
 */
export function fenetrePeriode(
  periode: Periode,
  ancre: Date,
  toutesSeries: SerieReleve[],
): { debut: string; fin: string } | null {
  if (periode === 'tout') return domaineDates(toutesSeries)
  if (periode === 'annee') {
    return {
      debut: isoLocale(new Date(ancre.getFullYear(), 0, 1)),
      fin: isoLocale(ancre),
    }
  }
  const nbMois = periode === '3m' ? 3 : periode === '6m' ? 6 : 12
  return {
    debut: isoLocale(
      new Date(ancre.getFullYear(), ancre.getMonth() - nbMois + 1, 1),
    ),
    fin: isoLocale(ancre),
  }
}

/**
 * Filtre de période sur la date RÉELLE du point (comparaison sur les 10 premiers
 * caractères `AAAA-MM-JJ` — fiable que `date` soit une date nue ou un horodatage
 * complet) — par défaut les 12 derniers mois glissants (ancre = aujourd'hui).
 * Bornes partagées avec `fenetrePeriode` (même fenêtre que celle dessinée sur
 * l'axe) — y compris pour « année en cours », qui exclut désormais elle aussi
 * les dates futures, comme les autres périodes glissantes.
 */
export function filtrerParPeriode(
  series: SerieReleve[],
  periode: Periode,
  ancre: Date,
): SerieReleve[] {
  if (periode === 'tout') return series
  const fenetre = fenetrePeriode(periode, ancre, series)!
  return series.map((s) => ({
    ...s,
    points: s.points.filter((p) => {
      const jour = p.date.slice(0, 10)
      return jour >= fenetre.debut && jour <= fenetre.fin
    }),
  }))
}

// ─────────────────────────────────────────────────────────────────────────
// Bandeau de statistiques conditionnel.
// ─────────────────────────────────────────────────────────────────────────

export interface BandeauStats {
  types: number
  points: number
  /** Localisations distinctes des équipements liés — calculée hors pipeline (N–N). */
  localisation: string | null
  conformes?: number
  nonConformes?: number
  periodeCouverte?: string | null
  consommations?: { symbole: string; total: number }[]
}

const FR_MOIS_ANNEE = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  year: 'numeric',
})

function formatMoisAnnee(dateIso: string): string {
  return FR_MOIS_ANNEE.format(parseDateLocale(dateIso))
}

/** Sans compteur : conformité. Avec au moins un compteur cumulatif : période + consommation. */
export function calculerBandeau(
  series: SerieReleve[],
  localisation: string | null,
): BandeauStats {
  const types = series.length
  const points = series.reduce((acc, s) => acc + s.points.length, 0)
  const compteurs = series.filter((s) => s.estCompteurCumulatif)

  if (compteurs.length === 0) {
    const mesures = series.filter((s) => !s.estCompteur)
    let conformes = 0
    let nonConformes = 0
    for (const s of mesures) {
      for (const p of s.points) {
        if (p.conforme === true) conformes += 1
        else if (p.conforme === false) nonConformes += 1
      }
    }
    return { types, points, localisation, conformes, nonConformes }
  }

  const toutesDates = series.flatMap((s) => s.points.map((p) => p.date)).sort()
  const periodeCouverte =
    toutesDates.length > 0
      ? `${formatMoisAnnee(toutesDates[0]!)} – ${formatMoisAnnee(toutesDates.at(-1)!)}`
      : null

  const items = compteurs.flatMap((s) =>
    s.points.map((p) => ({ symbole: s.uniteSymbole, conso: p.conso })),
  )
  // minOccurrences = 1 : la fiche d'une gamme affiche le total même avec un seul compteur.
  const consommations = sommesCompteursParUnite(items, 1)

  return { types, points, localisation, periodeCouverte, consommations }
}
