import { describe, expect, it } from 'vitest'
import {
  calculerBandeau,
  chartGroups,
  csvGroupe,
  domaineDates,
  fenetrePeriode,
  filtrerParPeriode,
  gammesAvecReleves,
  PERIODE_OPTIONS,
  seriesParGamme,
  type HistoriqueLigne,
  type PointReleve,
  type SerieReleve,
} from './pipeline'

function ligne(p: {
  ot: string
  nom: string
  gamme?: string
  val?: number | null
  seuilMin?: number | null
  seuilMax?: number | null
  uniteSymbole?: string | null
  uniteNom?: string | null
  cumulatif?: boolean
  conforme?: boolean | null
  depose?: number | null
  pose?: number | null
  dateExec?: string | null
  dateCloture?: string | null
  datePrevue?: string
}): HistoriqueLigne {
  return {
    id: `${p.ot}-${p.nom}`,
    ordre_travail_id: p.ot,
    source_type: 1,
    source_id: 'src-1',
    nom: p.nom,
    type_operation: 'Relevé',
    seuil_minimum: p.seuilMin ?? null,
    seuil_maximum: p.seuilMax ?? null,
    // `=== undefined` et non `??` : un `null` explicite doit RESTER null (relevé
    // sans unité, sans date d'exécution…), pas retomber sur le défaut.
    unite_nom: p.uniteNom === undefined ? 'kilowattheure' : p.uniteNom,
    unite_symbole: p.uniteSymbole === undefined ? 'kWh' : p.uniteSymbole,
    unite_est_cumulatif: p.cumulatif ?? true,
    valeur_mesuree: p.val ?? null,
    est_conforme: p.conforme ?? null,
    index_depose: p.depose ?? null,
    index_pose: p.pose ?? null,
    date_execution:
      p.dateExec === undefined ? (p.dateCloture ?? null) : p.dateExec,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    statut: 'terminee',
    // Champs non utilisés par le pipeline mais requis par le type généré Supabase.
    duree_minutes: null,
    commentaires: null,
    ordre_execution: 0,
    unite_id: null,
    type_operation_id: 1,
  } as unknown as HistoriqueLigne
}

function avecOt(
  l: HistoriqueLigne,
  p: {
    gamme?: string | null
    nomGamme?: string | null
    datePrevue?: string
    dateCloture?: string | null
    miniature?: string | null
  },
): HistoriqueLigne {
  return {
    ...l,
    ordres_travail: {
      id: `ordre-${l.ordre_travail_id}`,
      gamme_id: p.gamme === undefined ? 'g1' : p.gamme,
      nom_gamme: p.nomGamme === undefined ? 'Chaudière principale' : p.nomGamme,
      date_prevue: p.datePrevue ?? l.date_execution ?? '2026-01-01',
      date_cloture:
        p.dateCloture === undefined
          ? (l.date_execution ?? null)
          : p.dateCloture,
      miniature_id: p.miniature ?? null,
    },
  }
}

/** Relevé dont la jointure `ordres_travail` est absente (OT supprimé, vue partielle). */
function sansOt(l: HistoriqueLigne): HistoriqueLigne {
  return { ...l, ordres_travail: null }
}

describe('seriesParGamme — mesure (avec seuils)', () => {
  it('une série par nom, un point par OT, coloré par conformité', () => {
    const lignes = [
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'Température chaudière',
          uniteSymbole: '°C',
          uniteNom: 'degré Celsius',
          cumulatif: false,
          seuilMin: 60,
          seuilMax: 80,
          val: 70,
          conforme: true,
          dateExec: '2026-01-10T10:00:00Z',
        }),
        { dateCloture: '2026-01-10T12:00:00Z' },
      ),
      avecOt(
        ligne({
          ot: 'ot2',
          nom: 'Température chaudière',
          uniteSymbole: '°C',
          uniteNom: 'degré Celsius',
          cumulatif: false,
          seuilMin: 60,
          seuilMax: 80,
          val: 90,
          conforme: false,
          dateExec: '2026-02-10T10:00:00Z',
        }),
        { dateCloture: '2026-02-10T12:00:00Z' },
      ),
    ]
    const series = seriesParGamme(lignes, 'g1')
    expect(series).toHaveLength(1)
    expect(series[0]?.estCompteur).toBe(false)
    expect(series[0]?.points).toHaveLength(2)
    expect(series[0]?.points.map((p) => p.conforme)).toEqual([true, false])
    expect(series[0]?.points.map((p) => p.valeur)).toEqual([70, 90])
  })

  it('moyenne la valeur quand la tâche apparaît plusieurs fois dans le même OT', () => {
    const lignes = [
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'pH bassin',
          uniteSymbole: 'pH',
          cumulatif: false,
          val: 7,
          dateExec: '2026-01-10T08:00:00Z',
        }),
        { dateCloture: '2026-01-10T12:00:00Z' },
      ),
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'pH bassin',
          uniteSymbole: 'pH',
          cumulatif: false,
          val: 9,
          dateExec: '2026-01-10T09:00:00Z',
        }),
        { dateCloture: '2026-01-10T12:00:00Z' },
      ),
    ]
    const series = seriesParGamme(lignes, 'g1')
    expect(series[0]?.points).toHaveLength(1)
    expect(series[0]?.points[0]?.valeur).toBe(8)
  })

  it('ne perd et ne décale AUCUN point sur une gamme hebdomadaire (plusieurs relevés par mois)', () => {
    // Régression du bug du bucket mensuel : 6 relevés hebdomadaires sur le même
    // mois calendaire devaient auparavant être dispersés (mode ligne) ou réduits à
    // 1 seul (mode colonnes). Chaque point garde maintenant sa date réelle.
    const lignes = Array.from({ length: 6 }, (_, i) =>
      avecOt(
        ligne({
          ot: `ot${String(i)}`,
          nom: 'Température',
          uniteSymbole: '°C',
          cumulatif: false,
          val: 20 + i,
          dateExec: `2026-01-${String(5 + i * 7).padStart(2, '0')}T10:00:00Z`,
        }),
        {
          dateCloture: `2026-01-${String(5 + i * 7).padStart(2, '0')}T12:00:00Z`,
        },
      ),
    )
    const series = seriesParGamme(lignes, 'g1')
    expect(series[0]?.points).toHaveLength(6)
    expect(series[0]?.points.map((p) => p.date)).toEqual(
      lignes.map((l) => l.ordres_travail!.date_cloture),
    )
  })
})

describe('seriesParGamme — compteur cumulatif', () => {
  it('calcule la consommation et retire le premier point (sans précédent)', () => {
    const lignes = [
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'Compteur eau cuisine',
          uniteSymbole: 'm³',
          cumulatif: true,
          val: 100,
          dateExec: '2026-01-10T10:00:00Z',
        }),
        { dateCloture: '2026-01-10T12:00:00Z' },
      ),
      avecOt(
        ligne({
          ot: 'ot2',
          nom: 'Compteur eau cuisine',
          uniteSymbole: 'm³',
          cumulatif: true,
          val: 130,
          dateExec: '2026-02-10T10:00:00Z',
        }),
        { dateCloture: '2026-02-10T12:00:00Z' },
      ),
    ]
    const series = seriesParGamme(lignes, 'g1')
    expect(series[0]?.estCompteurCumulatif).toBe(true)
    expect(series[0]?.points).toHaveLength(1)
    expect(series[0]?.points[0]?.conso).toBe(30)
  })

  it('gère un remplacement de compteur via index_depose/index_pose', () => {
    const lignes = [
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'Compteur électrique',
          uniteSymbole: 'kWh',
          cumulatif: true,
          val: 100,
          dateExec: '2026-01-10T10:00:00Z',
        }),
        { dateCloture: '2026-01-10T12:00:00Z' },
      ),
      avecOt(
        ligne({
          ot: 'ot2',
          nom: 'Compteur électrique',
          uniteSymbole: 'kWh',
          cumulatif: true,
          val: 20,
          depose: 150,
          pose: 0,
          dateExec: '2026-02-10T10:00:00Z',
        }),
        { dateCloture: '2026-02-10T12:00:00Z' },
      ),
    ]
    const series = seriesParGamme(lignes, 'g1')
    // (150 − 100) + (20 − 0) = 70 — le premier relevé (sans conso calculable) est
    // retiré (règle « premier point retiré »), seul celui du remplacement reste.
    expect(series[0]?.points).toHaveLength(1)
    expect(series[0]?.points[0]?.conso).toBe(70)
    // Le point du remplacement est marqué — l'ancien système le signalait par un
    // astérisque dans le tooltip, la fiche OT l'affiche déjà explicitement.
    expect(series[0]?.points.map((p) => p.remplacement)).toEqual([true])
  })

  it('un compteur non cumulatif (ex. kVA) est traité comme une mesure : pas de conso', () => {
    const lignes = [
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'Puissance souscrite',
          uniteSymbole: 'kVA',
          cumulatif: false,
          val: 36,
          dateExec: '2026-01-10T10:00:00Z',
        }),
        { dateCloture: '2026-01-10T12:00:00Z' },
      ),
    ]
    const series = seriesParGamme(lignes, 'g1')
    expect(series[0]?.estCompteur).toBe(true)
    expect(series[0]?.estCompteurCumulatif).toBe(false)
    expect(series[0]?.points[0]?.conso).toBeNull()
    expect(series[0]?.points[0]?.valeur).toBe(36)
  })

  it('ne perd AUCUN relevé de consommation sur plusieurs relevés le même mois', () => {
    // Régression : `dedupliquerColonnes` gardait auparavant seulement le plus
    // récent du mois et jetait les autres sans avertissement.
    const lignes = [
      avecOt(
        ligne({
          ot: 'ot0',
          nom: 'Compteur eau',
          uniteSymbole: 'm³',
          cumulatif: true,
          val: 100,
          dateExec: '2025-12-28T10:00:00Z',
        }),
        { dateCloture: '2025-12-28T12:00:00Z' },
      ),
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'Compteur eau',
          uniteSymbole: 'm³',
          cumulatif: true,
          val: 110,
          dateExec: '2026-01-05T10:00:00Z',
        }),
        { dateCloture: '2026-01-05T12:00:00Z' },
      ),
      avecOt(
        ligne({
          ot: 'ot2',
          nom: 'Compteur eau',
          uniteSymbole: 'm³',
          cumulatif: true,
          val: 125,
          dateExec: '2026-01-20T10:00:00Z',
        }),
        { dateCloture: '2026-01-20T12:00:00Z' },
      ),
    ]
    const series = seriesParGamme(lignes, 'g1')
    // 2 points de consommation (le 1er relevé n'a pas de précédent) — les DEUX
    // relevés de janvier sont conservés, aucun n'est jeté au profit de l'autre.
    expect(series[0]?.points).toHaveLength(2)
    expect(series[0]?.points.map((p) => p.conso)).toEqual([10, 15])
  })
})

describe('chartGroups', () => {
  it('regroupe par unité, compteurs cumulatifs en premier puis ordre alphabétique', () => {
    const groupes = chartGroups([
      {
        nom: 'Température',
        uniteSymbole: '°C',
        uniteNom: null,
        seuilMinimum: null,
        seuilMaximum: null,
        estCompteur: false,
        estCompteurCumulatif: false,
        points: [],
      },
      {
        nom: 'Compteur eau',
        uniteSymbole: 'm³',
        uniteNom: null,
        seuilMinimum: null,
        seuilMaximum: null,
        estCompteur: true,
        estCompteurCumulatif: true,
        points: [],
      },
    ])
    expect(groupes.map((g) => g.uniteSymbole)).toEqual(['m³', '°C'])
  })
})

describe('csvGroupe', () => {
  it('mode mesure : une colonne valeur + une colonne conforme par série', () => {
    const { entetes, lignes } = csvGroupe({
      uniteSymbole: '°C',
      uniteNom: null,
      estCompteur: false,
      estCompteurCumulatif: false,
      series: [
        {
          nom: 'Température E.C.S',
          uniteSymbole: '°C',
          uniteNom: null,
          seuilMinimum: 55,
          seuilMaximum: null,
          estCompteur: false,
          estCompteurCumulatif: false,
          points: [
            {
              otId: 'ot1',
              date: '2026-01-10T10:00:00Z',
              valeur: 58,
              conso: null,
              conforme: true,
              remplacement: false,
            },
          ],
        },
      ],
    })
    expect(entetes).toEqual([
      'Date',
      'Température E.C.S (°C)',
      'Température E.C.S — conforme',
    ])
    expect(lignes).toEqual([['10/01/2026', '58', 'Oui']])
  })

  it('mode compteur cumulatif : valeur = consommation, colonne remplacement', () => {
    const { entetes, lignes } = csvGroupe({
      uniteSymbole: 'kWh',
      uniteNom: null,
      estCompteur: true,
      estCompteurCumulatif: true,
      series: [
        {
          nom: 'Compteur électrique',
          uniteSymbole: 'kWh',
          uniteNom: null,
          seuilMinimum: null,
          seuilMaximum: null,
          estCompteur: true,
          estCompteurCumulatif: true,
          points: [
            {
              otId: 'ot2',
              date: '2026-02-10T10:00:00Z',
              valeur: 20,
              conso: 70,
              conforme: null,
              remplacement: true,
            },
          ],
        },
      ],
    })
    expect(entetes).toEqual([
      'Date',
      'Compteur électrique (kWh)',
      'Compteur électrique — changement de compteur',
    ])
    expect(lignes).toEqual([['10/02/2026', '70', 'Oui']])
  })
})

describe('domaineDates', () => {
  it('renvoie la date la plus ancienne et la plus récente, sans arrondi', () => {
    const domaine = domaineDates([
      {
        nom: 'a',
        uniteSymbole: 'x',
        uniteNom: null,
        seuilMinimum: null,
        seuilMaximum: null,
        estCompteur: false,
        estCompteurCumulatif: false,
        points: [
          {
            otId: 'ot1',
            date: '2026-01-10',
            valeur: 1,
            conso: null,
            conforme: null,
            remplacement: false,
          },
          {
            otId: 'ot2',
            date: '2026-04-22',
            valeur: 1,
            conso: null,
            conforme: null,
            remplacement: false,
          },
        ],
      },
    ])
    expect(domaine).toEqual({ debut: '2026-01-10', fin: '2026-04-22' })
  })

  it('renvoie null sans aucun point', () => {
    expect(domaineDates([])).toBeNull()
  })
})

describe('filtrerParPeriode', () => {
  const serie = {
    nom: 'a',
    uniteSymbole: 'x',
    uniteNom: null,
    seuilMinimum: null,
    seuilMaximum: null,
    estCompteur: false,
    estCompteurCumulatif: false,
    points: [
      {
        otId: 'ot1',
        date: '2025-01-10',
        valeur: 1,
        conso: null,
        conforme: null,
        remplacement: false,
      },
      {
        otId: 'ot2',
        date: '2026-06-10',
        valeur: 1,
        conso: null,
        conforme: null,
        remplacement: false,
      },
    ],
  }
  it('« 3 mois » ne garde que les points récents (ancre juin 2026)', () => {
    const [res] = filtrerParPeriode([serie], '3m', new Date(2026, 5, 20))
    expect(res?.points.map((p) => p.date)).toEqual(['2026-06-10'])
  })
  it('« tout » ne filtre rien', () => {
    const [res] = filtrerParPeriode([serie], 'tout', new Date(2026, 5, 20))
    expect(res?.points).toHaveLength(2)
  })

  it('exclut aussi les points POSTÉRIEURS à l’ancre (données de test à date future)', () => {
    const avecFutur = {
      ...serie,
      points: [
        ...serie.points,
        {
          otId: 'ot3',
          date: '2029-01-10',
          valeur: 1,
          conso: null,
          conforme: null,
          remplacement: false,
        },
      ],
    }
    const [res] = filtrerParPeriode([avecFutur], '12m', new Date(2026, 5, 20))
    expect(res?.points.map((p) => p.date)).toEqual(['2026-06-10'])
  })
})

describe('fenetrePeriode', () => {
  it('« 3 mois » couvre la fenêtre ENTIÈRE, indépendamment des données réelles', () => {
    // Régression : avec un seul relevé dans la fenêtre, l'axe ne doit PAS se
    // réduire à ce point unique — la fenêtre reste les 3 mois calendaires entiers.
    const fenetre = fenetrePeriode('3m', new Date(2026, 5, 20), [])
    expect(fenetre).toEqual({ debut: '2026-04-01', fin: '2026-06-20' })
  })
  it('« 12 mois »', () => {
    const fenetre = fenetrePeriode('12m', new Date(2026, 5, 20), [])
    expect(fenetre).toEqual({ debut: '2025-07-01', fin: '2026-06-20' })
  })
  it('« année en cours » : du 1er janvier à aujourd’hui', () => {
    const fenetre = fenetrePeriode('annee', new Date(2026, 5, 20), [])
    expect(fenetre).toEqual({ debut: '2026-01-01', fin: '2026-06-20' })
  })
  it('« tout » : étendue réelle des données (seul cas qui en dépend)', () => {
    const uneSerie = {
      nom: 'a',
      uniteSymbole: 'x',
      uniteNom: null,
      seuilMinimum: null,
      seuilMaximum: null,
      estCompteur: false,
      estCompteurCumulatif: false,
      points: [
        {
          otId: 'ot1',
          date: '2025-01-10',
          valeur: 1,
          conso: null,
          conforme: null,
          remplacement: false,
        },
        {
          otId: 'ot2',
          date: '2026-06-10',
          valeur: 1,
          conso: null,
          conforme: null,
          remplacement: false,
        },
      ],
    }
    const fenetre = fenetrePeriode('tout', new Date(2026, 5, 20), [uneSerie])
    expect(fenetre).toEqual({ debut: '2025-01-10', fin: '2026-06-10' })
  })
  it('« tout » sans aucun point renvoie null', () => {
    expect(fenetrePeriode('tout', new Date(2026, 5, 20), [])).toBeNull()
  })
})

describe('calculerBandeau', () => {
  it('sans compteur : conformes / non conformes', () => {
    const stats = calculerBandeau(
      [
        {
          nom: 'a',
          uniteSymbole: '°C',
          uniteNom: null,
          seuilMinimum: 0,
          seuilMaximum: 100,
          estCompteur: false,
          estCompteurCumulatif: false,
          points: [
            {
              otId: 'ot1',
              date: '2026-01-10',
              valeur: 50,
              conso: null,
              conforme: true,
              remplacement: false,
            },
            {
              otId: 'ot2',
              date: '2026-02-10',
              valeur: 150,
              conso: null,
              conforme: false,
              remplacement: false,
            },
          ],
        },
      ],
      'Chaufferie',
    )
    expect(stats).toMatchObject({
      types: 1,
      points: 2,
      conformes: 1,
      nonConformes: 1,
    })
    expect(stats.consommations).toBeUndefined()
  })

  it('avec compteur : période couverte + consommation totale', () => {
    const stats = calculerBandeau(
      [
        {
          nom: 'Compteur eau',
          uniteSymbole: 'm³',
          uniteNom: null,
          seuilMinimum: null,
          seuilMaximum: null,
          estCompteur: true,
          estCompteurCumulatif: true,
          points: [
            {
              otId: 'ot1',
              date: '2026-01-10',
              valeur: 130,
              conso: 30,
              conforme: null,
              remplacement: false,
            },
          ],
        },
      ],
      null,
    )
    expect(stats.conformes).toBeUndefined()
    expect(stats.periodeCouverte).toBeTruthy()
    expect(stats.consommations).toEqual([{ symbole: 'm³', total: 30 }])
  })
})

describe('gammesAvecReleves', () => {
  it('agrège par gamme : types, OT distincts, dernier relevé, vignette du plus récent', () => {
    const lignes = [
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'Température',
          val: 70,
          dateExec: '2026-01-10T10:00:00Z',
        }),
        {
          gamme: 'g1',
          dateCloture: '2026-01-10T12:00:00Z',
          miniature: 'min-ancienne',
        },
      ),
      avecOt(
        ligne({
          ot: 'ot2',
          nom: 'Pression',
          val: 2,
          dateExec: '2026-03-10T10:00:00Z',
        }),
        {
          gamme: 'g1',
          dateCloture: '2026-03-10T12:00:00Z',
          miniature: 'min-recente',
        },
      ),
    ]
    const resume = gammesAvecReleves(lignes)
    expect(resume).toEqual([
      {
        id: 'g1',
        nomGamme: 'Chaudière principale',
        nbTypes: 2,
        nbOt: 2,
        dernierReleve: '2026-03-10T12:00:00Z',
        // Vignette de l'OT le plus RÉCENT (ot2), jamais celle d'un OT plus
        // ancien — même si la gamme a changé d'image entre-temps.
        miniatureId: 'min-recente',
      },
    ])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Fabriques de séries/points déjà calculés — pour les fonctions d'aval
// (`chartGroups`, `csvGroupe`, `domaineDates`, filtres, bandeau).
// ─────────────────────────────────────────────────────────────────────────

function pt(p: Partial<PointReleve> & { date: string }): PointReleve {
  return {
    otId: `ot-${p.date}`,
    valeur: null,
    conso: null,
    conforme: null,
    remplacement: false,
    ...p,
  }
}

function serie(p: Partial<SerieReleve> & { nom: string }): SerieReleve {
  return {
    uniteSymbole: '°C',
    uniteNom: null,
    seuilMinimum: null,
    seuilMaximum: null,
    estCompteur: false,
    estCompteurCumulatif: false,
    points: [],
    ...p,
  }
}

describe('gammesAvecReleves — périmètre', () => {
  it('écarte ce qui n’est pas un relevé rattaché à une gamme', () => {
    // ORACLE (doc) : « une carte par gamme ayant au moins un relevé ». Sont hors
    // périmètre : un relevé orphelin (jointure OT absente), un OT sans gamme, et
    // une opération qui ne CAPTE aucune valeur (ni unité, ni seuil, ni mesure —
    // cf. `estMesureExecution`), par exemple « Vérifier la vanne ».
    const resume = gammesAvecReleves([
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'Température',
          val: 70,
          dateExec: '2026-01-10',
        }),
        { gamme: 'g1', dateCloture: '2026-01-10' },
      ),
      sansOt(
        ligne({ ot: 'ot2', nom: 'Pression', val: 2, dateExec: '2026-02-10' }),
      ),
      avecOt(
        ligne({ ot: 'ot3', nom: 'Débit', val: 9, dateExec: '2026-02-11' }),
        { gamme: null, dateCloture: '2026-02-11' },
      ),
      avecOt(
        ligne({
          ot: 'ot4',
          nom: 'Vérifier la vanne',
          val: null,
          uniteSymbole: null,
          uniteNom: null,
          dateExec: '2026-03-10',
        }),
        { gamme: 'g1', dateCloture: '2026-03-10' },
      ),
    ])
    expect(resume).toEqual([
      {
        id: 'g1',
        nomGamme: 'Chaudière principale',
        nbTypes: 1,
        nbOt: 1,
        dernierReleve: '2026-01-10',
        miniatureId: null,
      },
    ])
  })

  it('une gamme supprimée reste identifiable', () => {
    // ORACLE (UI) : la jointure ne ramène plus le nom quand la gamme a été
    // supprimée ; la carte doit rester lisible plutôt que d'afficher un vide.
    const resume = gammesAvecReleves([
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'Température',
          val: 70,
          dateExec: '2026-01-10',
        }),
        { gamme: 'g9', nomGamme: null, dateCloture: '2026-01-10' },
      ),
    ])
    expect(resume[0]?.nomGamme).toBe('(gamme supprimée)')
  })

  it('le dernier relevé est le plus RÉCENT, quel que soit l’ordre d’arrivée', () => {
    // ORACLE : `dernierReleve` est un MAXIMUM de dates, pas « la dernière ligne
    // lue ». La vignette qui l'accompagne est celle de ce même OT (migration
    // 067) — ici les lignes arrivent du plus récent au plus ancien.
    const resume = gammesAvecReleves([
      avecOt(
        ligne({ ot: 'ot2', nom: 'Pression', val: 2, dateExec: '2026-03-10' }),
        { dateCloture: '2026-03-10', miniature: 'min-recente' },
      ),
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'Température',
          val: 70,
          dateExec: '2026-01-10',
        }),
        { dateCloture: '2026-01-10', miniature: 'min-ancienne' },
      ),
    ])
    expect(resume[0]?.dernierReleve).toBe('2026-03-10')
    expect(resume[0]?.miniatureId).toBe('min-recente')
  })

  it('à date égale, la vignette retenue ne change pas (comparaison STRICTE)', () => {
    // ORACLE (déterminisme) : deux OT clôturés le même jour ne se départagent
    // pas par la date ; la comparaison doit rester stricte, sinon la vignette
    // affichée dépendrait de l'ordre — non garanti — des lignes reçues.
    const resume = gammesAvecReleves([
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'Température',
          val: 70,
          dateExec: '2026-02-10',
        }),
        { dateCloture: '2026-02-10', miniature: 'min-1' },
      ),
      avecOt(
        ligne({ ot: 'ot2', nom: 'Pression', val: 2, dateExec: '2026-02-10' }),
        { dateCloture: '2026-02-10', miniature: 'min-2' },
      ),
    ])
    expect(resume[0]?.miniatureId).toBe('min-1')
  })

  it('un OT non clôturé est daté par sa date d’exécution', () => {
    // ORACLE (doc) : `date_cloture ?? date_execution`. Un relevé saisi sur un OT
    // encore ouvert compte quand même comme « dernier relevé ».
    const resume = gammesAvecReleves([
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'Température',
          val: 70,
          dateExec: '2026-05-02',
        }),
        { dateCloture: null },
      ),
    ])
    expect(resume[0]?.dernierReleve).toBe('2026-05-02')
  })

  it('les gammes sont triées par nom, pas par ordre de rencontre', () => {
    // ORACLE (UI) : la liste des gammes à relevés est alphabétique (français).
    const resume = gammesAvecReleves([
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'Température',
          val: 70,
          dateExec: '2026-01-10',
        }),
        { gamme: 'g2', nomGamme: 'Zone technique', dateCloture: '2026-01-10' },
      ),
      avecOt(
        ligne({ ot: 'ot2', nom: 'Pression', val: 2, dateExec: '2026-02-10' }),
        { gamme: 'g1', nomGamme: 'Aération', dateCloture: '2026-02-10' },
      ),
    ])
    expect(resume.map((g) => g.nomGamme)).toEqual([
      'Aération',
      'Zone technique',
    ])
  })
})

describe('seriesParGamme — périmètre et construction du point', () => {
  it('ne retient que les relevés de LA gamme demandée', () => {
    // ORACLE (doc) : une série par type de relevé « d'une gamme ». Un relevé
    // d'une autre gamme, un relevé orphelin ou une opération sans valeur ne
    // doivent pas s'y glisser — ils fausseraient la série temporelle.
    const series = seriesParGamme(
      [
        avecOt(
          ligne({
            ot: 'ot1',
            nom: 'Température',
            uniteSymbole: '°C',
            cumulatif: false,
            val: 70,
            dateExec: '2026-01-10',
          }),
          { gamme: 'g1', dateCloture: '2026-01-10' },
        ),
        avecOt(
          ligne({
            ot: 'ot2',
            nom: 'Pression',
            uniteSymbole: 'bar',
            cumulatif: false,
            val: 2,
            dateExec: '2026-02-10',
          }),
          { gamme: 'g2', dateCloture: '2026-02-10' },
        ),
        sansOt(
          ligne({
            ot: 'ot3',
            nom: 'Débit',
            uniteSymbole: 'L/h',
            cumulatif: false,
            val: 9,
            dateExec: '2026-02-11',
          }),
        ),
        avecOt(
          ligne({
            ot: 'ot4',
            nom: 'Vérifier la vanne',
            val: null,
            uniteSymbole: null,
            uniteNom: null,
            dateExec: '2026-03-10',
          }),
          { gamme: 'g1', dateCloture: '2026-03-10' },
        ),
      ],
      'g1',
    )
    expect(series.map((s) => s.nom)).toEqual(['Température'])
  })

  it('les séries sont triées par nom de relevé', () => {
    // ORACLE (UI) : ordre alphabétique français, indépendant de l'ordre des lignes.
    const lignes = ['Pression', 'Aération'].map((nom, i) =>
      avecOt(
        ligne({
          ot: `ot${String(i)}`,
          nom,
          uniteSymbole: '°C',
          cumulatif: false,
          val: 10 + i,
          dateExec: `2026-0${String(i + 1)}-10`,
        }),
        { dateCloture: `2026-0${String(i + 1)}-10` },
      ),
    )
    expect(seriesParGamme(lignes, 'g1').map((s) => s.nom)).toEqual([
      'Aération',
      'Pression',
    ])
  })

  it('les points d’une série sont ordonnés par date, pas par ordre d’arrivée', () => {
    // ORACLE (graphique) : l'axe est temporel — un point de mars ne peut pas
    // précéder un point de janvier, sinon la courbe part en arrière.
    const lignes = ['2026-03-10', '2026-01-10', '2026-02-10'].map((d, i) =>
      avecOt(
        ligne({
          ot: `ot${String(i)}`,
          nom: 'Température',
          uniteSymbole: '°C',
          cumulatif: false,
          val: 20 + i,
          dateExec: d,
        }),
        { dateCloture: d },
      ),
    )
    expect(seriesParGamme(lignes, 'g1')[0]?.points.map((p) => p.date)).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
    ])
  })

  it('une valeur non relevée n’entre pas dans la moyenne du point', () => {
    // ORACLE arithmétique : la tâche est relevée trois fois dans le même OT,
    // dont une sans valeur → moyenne = (10 + 20) / 2 = 15 (et non 30 / 3 = 10,
    // qui traiterait l'absence de relevé comme un zéro).
    const lignes = [10, null, 20].map((val) =>
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'pH bassin',
          uniteSymbole: 'pH',
          cumulatif: false,
          val,
          dateExec: '2026-01-10',
        }),
        { dateCloture: '2026-01-10' },
      ),
    )
    expect(seriesParGamme(lignes, 'g1')[0]?.points[0]?.valeur).toBe(15)
  })

  it('un OT dont AUCUNE valeur n’est relevée ne produit pas de point', () => {
    // ORACLE : un point sans valeur n'a rien à tracer. Il doit disparaître, et
    // surtout pas devenir un point à valeur NaN (0 / 0) sur le graphique.
    const series = seriesParGamme(
      [
        avecOt(
          ligne({
            ot: 'ot1',
            nom: 'pH bassin',
            uniteSymbole: 'pH',
            cumulatif: false,
            val: null,
            dateExec: '2026-01-10',
          }),
          { dateCloture: '2026-01-10' },
        ),
        avecOt(
          ligne({
            ot: 'ot2',
            nom: 'pH bassin',
            uniteSymbole: 'pH',
            cumulatif: false,
            val: 20,
            dateExec: '2026-02-10',
          }),
          { dateCloture: '2026-02-10' },
        ),
      ],
      'g1',
    )
    expect(series[0]?.points).toHaveLength(1)
    expect(series[0]?.points[0]?.valeur).toBe(20)
  })

  it('un OT non clôturé est daté par sa DERNIÈRE date d’exécution', () => {
    // ORACLE (doc de `PointReleve`) : « date de clôture de l'OT, sinon
    // d'exécution, sinon prévue ». Quatre saisies dans le même OT, dans le
    // désordre et dont une jamais exécutée : la date du point est la plus
    // TARDIVE des dates d'exécution réelles (mars), pas une date intermédiaire
    // ni la date prévue.
    const dates = ['2026-03-05', '2026-01-05', '2026-02-05', null]
    const lignes = dates.map((d) =>
      avecOt(
        ligne({
          ot: 'ot1',
          nom: 'pH bassin',
          uniteSymbole: 'pH',
          cumulatif: false,
          val: 10,
          dateExec: d,
        }),
        { datePrevue: '2025-12-01', dateCloture: null },
      ),
    )
    const point = seriesParGamme(lignes, 'g1')[0]?.points[0]
    expect(point?.date).toBe('2026-03-05')
    expect(point?.valeur).toBe(10)
  })

  it('un OT ni clôturé ni exécuté est daté par sa date prévue', () => {
    // ORACLE (doc de `PointReleve`) : dernier repli de la cascade de dates.
    const series = seriesParGamme(
      [
        avecOt(
          ligne({
            ot: 'ot1',
            nom: 'pH bassin',
            uniteSymbole: 'pH',
            cumulatif: false,
            val: 7,
            dateExec: null,
          }),
          { datePrevue: '2026-04-15', dateCloture: null },
        ),
      ],
      'g1',
    )
    expect(series[0]?.points[0]?.date).toBe('2026-04-15')
  })

  it('la conformité d’un point agrège toutes les saisies de l’OT', () => {
    // ORACLE (prudence métier) : un seul relevé NON conforme rend le point non
    // conforme ; le point n'est déclaré conforme que si TOUTES les saisies le
    // sont ; un doute (relevé sans verdict) laisse le point indéterminé plutôt
    // que de le peindre en vert.
    const cas: [string, string, (boolean | null)[]][] = [
      ['ot1', '2026-01-10', [true, false]],
      ['ot2', '2026-02-10', [true, null]],
      ['ot3', '2026-03-10', [true, true]],
      ['ot4', '2026-04-10', [null, null]],
    ]
    const lignes = cas.flatMap(([ot, date, conformites]) =>
      conformites.map((conforme) =>
        avecOt(
          ligne({
            ot,
            nom: 'Température E.C.S',
            uniteSymbole: '°C',
            cumulatif: false,
            seuilMin: 55,
            val: 58,
            conforme,
            dateExec: date,
          }),
          { dateCloture: date },
        ),
      ),
    )
    expect(
      seriesParGamme(lignes, 'g1')[0]?.points.map((p) => p.conforme),
    ).toEqual([false, null, true, null])
  })

  it('le symbole d’unité manquant devient une chaîne vide', () => {
    // ORACLE (doc du type) : `uniteSymbole` est une chaîne (jamais null) —
    // elle sert de clé de regroupement dans `chartGroups` et de suffixe d'axe.
    const avecSymbole = seriesParGamme(
      [
        avecOt(
          ligne({
            ot: 'ot1',
            nom: 'Compteur eau',
            uniteSymbole: 'm³',
            uniteNom: 'mètre cube',
            val: 100,
            dateExec: '2026-01-10',
          }),
          { dateCloture: '2026-01-10' },
        ),
      ],
      'g1',
    )
    expect(avecSymbole[0]?.uniteSymbole).toBe('m³')
    expect(avecSymbole[0]?.uniteNom).toBe('mètre cube')

    const sansSymbole = seriesParGamme(
      [
        avecOt(
          ligne({
            ot: 'ot1',
            nom: 'Relevé orphelin',
            uniteSymbole: null,
            uniteNom: 'unité inconnue',
            val: 100,
            dateExec: '2026-01-10',
          }),
          { dateCloture: '2026-01-10' },
        ),
      ],
      'g1',
    )
    expect(sansSymbole[0]?.uniteSymbole).toBe('')
  })
})

describe('seriesParGamme — seuils de la série', () => {
  function releveSeuil(p: {
    ot: string
    dateExec: string | null
    dateCloture: string
    min: number | null
    max: number | null
  }) {
    return avecOt(
      ligne({
        ot: p.ot,
        nom: 'Température E.C.S',
        uniteSymbole: '°C',
        cumulatif: false,
        seuilMin: p.min,
        seuilMax: p.max,
        val: 58,
        dateExec: p.dateExec,
      }),
      { dateCloture: p.dateCloture },
    )
  }

  it('affiche les seuils du relevé le plus RÉCENT', () => {
    // ORACLE (doc) : « Seuils les plus récents de la série (une opération peut
    // évoluer dans le temps) ». Les lignes arrivent dans le désordre : c'est la
    // date d'exécution qui tranche, jamais l'ordre de la requête.
    const series = seriesParGamme(
      [
        releveSeuil({
          ot: 'ot2',
          dateExec: '2026-02-10',
          dateCloture: '2026-02-10',
          min: 55,
          max: 75,
        }),
        releveSeuil({
          ot: 'ot3',
          dateExec: '2026-03-10',
          dateCloture: '2026-03-10',
          min: 60,
          max: 80,
        }),
        releveSeuil({
          ot: 'ot1',
          dateExec: '2026-01-10',
          dateCloture: '2026-01-10',
          min: 50,
          max: 70,
        }),
      ],
      'g1',
    )
    expect(series[0]?.seuilMinimum).toBe(60)
    expect(series[0]?.seuilMaximum).toBe(80)
  })

  it('un relevé récent SANS seuil ne les efface pas : on remonte le temps', () => {
    // ORACLE (doc) : « les plus récents » = les derniers seuils RENSEIGNÉS. Des
    // relevés ultérieurs saisis sans seuils (données historiques importées) ne
    // doivent pas faire disparaître la plage de conformité du graphique.
    const series = seriesParGamme(
      [
        releveSeuil({
          ot: 'ot1',
          dateExec: '2026-01-10',
          dateCloture: '2026-01-10',
          min: 60,
          max: 80,
        }),
        releveSeuil({
          ot: 'ot2',
          dateExec: '2026-02-10',
          dateCloture: '2026-02-10',
          min: null,
          max: null,
        }),
        releveSeuil({
          ot: 'ot3',
          dateExec: '2026-03-10',
          dateCloture: '2026-03-10',
          min: null,
          max: null,
        }),
      ],
      'g1',
    )
    expect(series[0]?.seuilMinimum).toBe(60)
    expect(series[0]?.seuilMaximum).toBe(80)
  })

  it('un relevé sans date d’exécution ne passe pas pour le plus récent', () => {
    // ORACLE : une ligne non datée ne peut pas prétendre être la dernière — ses
    // seuils (ici 10/20, aberrants pour de l'eau chaude sanitaire) ne doivent
    // pas supplanter ceux du relevé réellement le plus récent. Vérifié dans les
    // DEUX ordres d'arrivée : le classement ne doit rien devoir au hasard.
    const nonDatee = {
      ot: 'ot1',
      dateExec: null,
      dateCloture: '2026-01-10',
      min: 10,
      max: 20,
    } as const
    const datee = {
      ot: 'ot2',
      dateExec: '2026-02-10',
      dateCloture: '2026-02-10',
      min: 60,
      max: 80,
    } as const
    for (const lignes of [
      [releveSeuil(nonDatee), releveSeuil(datee)],
      [releveSeuil(datee), releveSeuil(nonDatee)],
    ]) {
      const series = seriesParGamme(lignes, 'g1')
      expect(series[0]?.seuilMinimum).toBe(60)
      expect(series[0]?.seuilMaximum).toBe(80)
    }
  })
})

describe('seriesParGamme — remplacement de compteur', () => {
  function compteur(p: {
    ot: string
    date: string
    val: number | null
    depose?: number | null
    pose?: number | null
  }) {
    return avecOt(
      ligne({
        ot: p.ot,
        nom: 'Compteur eau',
        uniteSymbole: 'm³',
        cumulatif: true,
        val: p.val,
        depose: p.depose ?? null,
        pose: p.pose ?? null,
        dateExec: p.date,
      }),
      { dateCloture: p.date },
    )
  }

  it('consommation d’un remplacement avec index posé NON nul', () => {
    // ORACLE (physique du compteur, cf. `consoOperation`) :
    // (index déposé − précédent) + (courant − index posé) = (150 − 100) + (20 − 5) = 65.
    // L'index de pose est ici 5 (compteur neuf non remis à zéro), cas où un
    // simple « courant − précédent » donnerait −80, une consommation négative.
    const series = seriesParGamme(
      [
        compteur({ ot: 'ot1', date: '2026-01-10', val: 100 }),
        compteur({
          ot: 'ot2',
          date: '2026-02-10',
          val: 20,
          depose: 150,
          pose: 5,
        }),
      ],
      'g1',
    )
    expect(series[0]?.points).toHaveLength(1)
    expect(series[0]?.points[0]?.conso).toBe(65)
    expect(series[0]?.points[0]?.remplacement).toBe(true)
  })

  it('un remplacement INCOMPLET n’est ni marqué ni pris en compte', () => {
    // ORACLE (doc de `consoOperation`) : la branche remplacement exige dépose ET
    // pose. Un seul index (saisie interrompue) retombe sur le calcul simple :
    // 130 − 100 = 30 — et le point ne porte PAS la mention « changement de
    // compteur », qui serait mensongère.
    const series = seriesParGamme(
      [
        compteur({ ot: 'ot1', date: '2026-01-10', val: 100 }),
        compteur({ ot: 'ot2', date: '2026-02-10', val: 130, depose: 150 }),
        compteur({ ot: 'ot3', date: '2026-03-10', val: 160 }),
      ],
      'g1',
    )
    expect(series[0]?.points.map((p) => p.conso)).toEqual([30, 30])
    expect(series[0]?.points.map((p) => p.remplacement)).toEqual([false, false])

    // …et symétriquement avec le SEUL index de pose renseigné : la mention
    // « changement de compteur » exige les DEUX index, pas l'un ou l'autre.
    const posseSeule = seriesParGamme(
      [
        compteur({ ot: 'ot1', date: '2026-01-10', val: 100 }),
        compteur({ ot: 'ot2', date: '2026-02-10', val: 130, pose: 5 }),
      ],
      'g1',
    )
    expect(posseSeule[0]?.points.map((p) => p.conso)).toEqual([30])
    expect(posseSeule[0]?.points.map((p) => p.remplacement)).toEqual([false])
  })

  it('dépose/pose sont ignorés quand la tâche est saisie plusieurs fois dans l’OT', () => {
    // ORACLE (doc de `construirePoint`) : « Dépose/pose n'a de sens que si UNE
    // seule ligne contribue au point […] au profit d'un delta simple ».
    // Moyenne du 2e OT = (120 + 140) / 2 = 130 → conso = 130 − 100 = 30
    // (et non (150 − 100) + (130 − 0) = 180 si la dépose était appliquée).
    const series = seriesParGamme(
      [
        compteur({ ot: 'ot1', date: '2026-01-10', val: 100 }),
        compteur({
          ot: 'ot2',
          date: '2026-02-10',
          val: 120,
          depose: 150,
          pose: 0,
        }),
        compteur({ ot: 'ot2', date: '2026-02-10', val: 140 }),
      ],
      'g1',
    )
    expect(series[0]?.points).toHaveLength(1)
    expect(series[0]?.points[0]?.conso).toBe(30)
    expect(series[0]?.points[0]?.remplacement).toBe(false)
  })

  it('une mesure NON cumulative n’est jamais marquée « remplacement »', () => {
    // ORACLE (doc de `GroupeUnite`) : seul un compteur cumulatif porte une
    // consommation et donc un changement de compteur. Une puissance souscrite
    // (kVA) qui porterait par accident des index reste une simple mesure.
    const series = seriesParGamme(
      [
        avecOt(
          ligne({
            ot: 'ot1',
            nom: 'Puissance souscrite',
            uniteSymbole: 'kVA',
            cumulatif: false,
            val: 36,
            depose: 150,
            pose: 0,
            dateExec: '2026-01-10',
          }),
          { dateCloture: '2026-01-10' },
        ),
      ],
      'g1',
    )
    expect(series[0]?.points[0]?.remplacement).toBe(false)
    expect(series[0]?.points[0]?.conso).toBeNull()
  })
})

describe('chartGroups — regroupement', () => {
  it('deux séries de même unité partagent un seul graphique', () => {
    // ORACLE (doc) : « Un graphique par unité ». Les deux séries doivent s'y
    // retrouver TOUTES LES DEUX, avec la nature (compteur cumulatif) du groupe.
    const groupes = chartGroups([
      serie({
        nom: 'Compteur eau cuisine',
        uniteSymbole: 'm³',
        uniteNom: 'mètre cube',
        estCompteur: true,
        estCompteurCumulatif: true,
      }),
      serie({
        nom: 'Compteur eau sanitaires',
        uniteSymbole: 'm³',
        uniteNom: 'mètre cube',
        estCompteur: true,
        estCompteurCumulatif: true,
      }),
    ])
    expect(groupes).toHaveLength(1)
    expect(groupes[0]?.series.map((s) => s.nom)).toEqual([
      'Compteur eau cuisine',
      'Compteur eau sanitaires',
    ])
    expect(groupes[0]).toMatchObject({
      uniteSymbole: 'm³',
      uniteNom: 'mètre cube',
      estCompteur: true,
      estCompteurCumulatif: true,
    })
  })

  it('à nature égale, les unités sont rangées par ordre alphabétique', () => {
    // ORACLE (doc) : « compteurs d'abord, puis ordre alphabétique ». Le second
    // critère doit s'appliquer AUSSI entre deux unités de même nature, sinon
    // l'ordre des graphiques dépendrait de celui des séries reçues.
    const mesures = chartGroups([
      serie({ nom: 'Ozone', uniteSymbole: 'ppm' }),
      serie({ nom: 'Pression', uniteSymbole: 'bar' }),
    ])
    expect(mesures.map((g) => g.uniteSymbole)).toEqual(['bar', 'ppm'])

    const compteurs = chartGroups([
      serie({
        nom: 'Eau',
        uniteSymbole: 'm³',
        estCompteur: true,
        estCompteurCumulatif: true,
      }),
      serie({
        nom: 'Électricité',
        uniteSymbole: 'kWh',
        estCompteur: true,
        estCompteurCumulatif: true,
      }),
    ])
    expect(compteurs.map((g) => g.uniteSymbole)).toEqual(['kWh', 'm³'])
  })
})

describe('csvGroupe — export brut des points tracés', () => {
  it('mode mesure : une ligne par date réelle, cellules vides quand la série n’a pas de point', () => {
    // ORACLE (doc) : « une ligne par date réelle, une colonne par série ». Les
    // trois dates des deux séries sont fusionnées et TRIÉES ; là où une série
    // n'a rien relevé, la cellule reste vide (jamais « undefined », jamais la
    // valeur du point voisin). La conformité s'écrit Oui / Non / vide.
    const { entetes, lignes } = csvGroupe({
      uniteSymbole: '°C',
      uniteNom: null,
      estCompteur: false,
      estCompteurCumulatif: false,
      series: [
        serie({
          nom: 'E.C.S',
          points: [
            pt({ date: '2026-01-10', valeur: 58, conforme: true }),
            pt({ date: '2026-03-10', valeur: 61, conforme: false }),
          ],
        }),
        serie({
          nom: 'Retour boucle',
          points: [pt({ date: '2026-02-10', valeur: 7, conforme: null })],
        }),
      ],
    })
    expect(entetes).toEqual([
      'Date',
      'E.C.S (°C)',
      'E.C.S — conforme',
      'Retour boucle (°C)',
      'Retour boucle — conforme',
    ])
    expect(lignes).toEqual([
      ['10/01/2026', '58', 'Oui', '', ''],
      ['10/02/2026', '', '', '7', ''],
      ['10/03/2026', '61', 'Non', '', ''],
    ])
  })

  it('mode compteur cumulatif : la colonne exporte la CONSO, le changement de compteur est Oui ou vide', () => {
    // ORACLE (doc) : « valeur = consommation » en mode colonnes. Un point sans
    // consommation calculable donne une cellule vide (pas « null »), et un point
    // sans remplacement une cellule vide (pas « Non », qui suggérerait un
    // contrôle effectué).
    const { entetes, lignes } = csvGroupe({
      uniteSymbole: 'm³',
      uniteNom: null,
      estCompteur: true,
      estCompteurCumulatif: true,
      series: [
        serie({
          nom: 'Eau cuisine',
          uniteSymbole: 'm³',
          estCompteur: true,
          estCompteurCumulatif: true,
          points: [
            pt({
              date: '2026-01-10',
              valeur: 320,
              conso: 70,
              remplacement: true,
            }),
            pt({ date: '2026-03-10', valeur: 400, conso: null }),
          ],
        }),
        serie({
          nom: 'Eau sanitaires',
          uniteSymbole: 'm³',
          estCompteur: true,
          estCompteurCumulatif: true,
          points: [pt({ date: '2026-02-10', valeur: 90, conso: 12 })],
        }),
      ],
    })
    expect(entetes).toEqual([
      'Date',
      'Eau cuisine (m³)',
      'Eau cuisine — changement de compteur',
      'Eau sanitaires (m³)',
      'Eau sanitaires — changement de compteur',
    ])
    expect(lignes).toEqual([
      ['10/01/2026', '70', 'Oui', '', ''],
      ['10/02/2026', '', '', '12', ''],
      ['10/03/2026', '', '', '', ''],
    ])
  })

  it('compteur NON cumulatif : ni conformité ni changement de compteur, et la valeur BRUTE', () => {
    // ORACLE (doc) : la colonne « conforme » n'existe que hors compteur, celle du
    // changement de compteur que pour un compteur CUMULATIF. Un kVA n'a ni l'une
    // ni l'autre, et s'exporte avec sa valeur relevée (36), pas une consommation.
    const { entetes, lignes } = csvGroupe({
      uniteSymbole: 'kVA',
      uniteNom: null,
      estCompteur: true,
      estCompteurCumulatif: false,
      series: [
        serie({
          nom: 'Puissance souscrite',
          uniteSymbole: 'kVA',
          estCompteur: true,
          points: [pt({ date: '2026-01-10', valeur: 36, conso: 999 })],
        }),
      ],
    })
    expect(entetes).toEqual(['Date', 'Puissance souscrite (kVA)'])
    expect(lignes).toEqual([['10/01/2026', '36']])
  })
})

describe('domaineDates — bornes', () => {
  it('prend le minimum et le maximum, quel que soit l’ordre des points', () => {
    // ORACLE : bornes de l'axe X commun = min et max de TOUTES les séries. Avec
    // trois points en désordre, ni « le deuxième » ni « le dernier reçu » ne
    // conviennent.
    const domaine = domaineDates([
      serie({
        nom: 'a',
        points: [
          pt({ date: '2026-04-22' }),
          pt({ date: '2026-01-10' }),
          pt({ date: '2026-09-03' }),
        ],
      }),
    ])
    expect(domaine).toEqual({ debut: '2026-01-10', fin: '2026-09-03' })
  })
})

describe('PERIODE_OPTIONS', () => {
  it('propose les cinq périodes du filtre, libellées en français', () => {
    // ORACLE (UI) : ce tableau alimente le Select de période de la fiche Relevés.
    // Vidé ou dépouillé de ses libellés, le filtre deviendrait inutilisable.
    expect(PERIODE_OPTIONS).toEqual([
      { value: '3m', label: '3 mois' },
      { value: '6m', label: '6 mois' },
      { value: '12m', label: '12 mois' },
      { value: 'annee', label: 'Année en cours' },
      { value: 'tout', label: 'Tout' },
    ])
  })
})

describe('fenetrePeriode — « 6 mois »', () => {
  it('couvre les six mois calendaires entiers qui précèdent l’ancre', () => {
    // ORACLE : six mois ENTIERS finissant au mois de l'ancre (juin 2026) →
    // du 1er janvier 2026 au 20 juin 2026. Sans ce cas, « 6 mois » pourrait
    // retomber silencieusement sur 3 ou 12 mois.
    expect(fenetrePeriode('6m', new Date(2026, 5, 20), [])).toEqual({
      debut: '2026-01-01',
      fin: '2026-06-20',
    })
  })
})

describe('filtrerParPeriode — bornes et horodatages', () => {
  const ancre = new Date(2026, 5, 20)

  it('les deux bornes de la fenêtre sont INCLUSES', () => {
    // ORACLE (doc) : la fenêtre « 3 mois » ancrée au 20/06/2026 est
    // [01/04/2026, 20/06/2026]. Un relevé fait le jour même de la borne doit
    // rester visible — l'exclure ferait disparaître le dernier relevé du
    // graphique le jour de sa saisie.
    const [res] = filtrerParPeriode(
      [
        serie({
          nom: 'a',
          points: [
            pt({ date: '2026-03-31' }),
            pt({ date: '2026-04-01' }),
            pt({ date: '2026-06-20' }),
            pt({ date: '2026-06-21' }),
          ],
        }),
      ],
      '3m',
      ancre,
    )
    expect(res?.points.map((p) => p.date)).toEqual(['2026-04-01', '2026-06-20'])
  })

  it('un horodatage complet est comparé sur son JOUR', () => {
    // ORACLE (doc) : « comparaison sur les 10 premiers caractères AAAA-MM-JJ —
    // fiable que `date` soit une date nue ou un horodatage complet ». Un relevé
    // clôturé le 20/06 à 10 h ne doit pas être rejeté par la borne du 20/06.
    const serieHorodatee = serie({
      nom: 'a',
      points: [
        pt({ date: '2025-01-10T15:00:00Z' }),
        pt({ date: '2026-06-20T10:00:00Z' }),
      ],
    })
    expect(
      filtrerParPeriode([serieHorodatee], '3m', ancre)[0]?.points.map(
        (p) => p.date,
      ),
    ).toEqual(['2026-06-20T10:00:00Z'])
    // « Tout » ne filtre RIEN — surtout pas les points aux extrémités.
    expect(
      filtrerParPeriode([serieHorodatee], 'tout', ancre)[0]?.points,
    ).toHaveLength(2)
  })
})

describe('calculerBandeau — détail', () => {
  it('la conformité ne compte QUE les mesures, et ignore les points sans verdict', () => {
    // ORACLE (doc) : « Sans compteur : conformité ». Un compteur — même non
    // cumulatif, comme un kVA — n'a pas de conformité à afficher : le compter
    // gonflerait artificiellement le nombre de relevés conformes. Un point sans
    // verdict n'est ni conforme ni non conforme.
    const stats = calculerBandeau(
      [
        serie({
          nom: 'Température E.C.S',
          points: [
            pt({ date: '2026-01-10', conforme: true }),
            pt({ date: '2026-02-10', conforme: false }),
            pt({ date: '2026-03-10', conforme: null }),
          ],
        }),
        serie({
          nom: 'Puissance souscrite',
          uniteSymbole: 'kVA',
          estCompteur: true,
          points: [
            pt({ date: '2026-01-10', conforme: true }),
            pt({ date: '2026-02-10', conforme: true }),
          ],
        }),
      ],
      'Chaufferie',
    )
    expect(stats).toEqual({
      types: 2,
      points: 5,
      localisation: 'Chaufferie',
      conformes: 1,
      nonConformes: 1,
    })
  })

  it('la période couverte s’écrit « mois abrégé année », bornes prises sur TOUTES les séries', () => {
    // ORACLE : la période annoncée doit encadrer l'intégralité des relevés de la
    // fiche — y compris ceux des séries non compteur (ici janvier, plus ancien
    // que le premier relevé de compteur). Format français abrégé.
    const stats = calculerBandeau(
      [
        serie({
          nom: 'Compteur eau',
          uniteSymbole: 'm³',
          estCompteur: true,
          estCompteurCumulatif: true,
          points: [pt({ date: '2026-03-10', valeur: 130, conso: 30 })],
        }),
        serie({
          nom: 'Température',
          points: [pt({ date: '2026-01-10', valeur: 58, conforme: true })],
        }),
      ],
      null,
    )
    expect(stats.periodeCouverte).toBe('janv. 2026 – mars 2026')
    expect(stats.consommations).toEqual([{ symbole: 'm³', total: 30 }])
    expect(stats.types).toBe(2)
    expect(stats.points).toBe(2)
  })

  it('un compteur sans aucun relevé n’annonce pas de période', () => {
    // ORACLE : sans point, il n'y a pas de période couverte — et surtout pas une
    // période bâtie sur une date inexistante.
    const stats = calculerBandeau(
      [
        serie({
          nom: 'Compteur eau',
          uniteSymbole: 'm³',
          estCompteur: true,
          estCompteurCumulatif: true,
        }),
      ],
      null,
    )
    expect(stats.periodeCouverte).toBeNull()
    expect(stats.consommations).toEqual([])
    expect(stats.points).toBe(0)
  })
})
