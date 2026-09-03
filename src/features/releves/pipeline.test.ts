import { describe, expect, it } from 'vitest'
import {
  calculerBandeau,
  chartGroups,
  csvGroupe,
  domaineDates,
  fenetrePeriode,
  filtrerParPeriode,
  gammesAvecReleves,
  seriesParGamme,
  type HistoriqueLigne,
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
    unite_nom: p.uniteNom ?? 'kilowattheure',
    unite_symbole: p.uniteSymbole ?? 'kWh',
    unite_est_cumulatif: p.cumulatif ?? true,
    valeur_mesuree: p.val ?? null,
    est_conforme: p.conforme ?? null,
    index_depose: p.depose ?? null,
    index_pose: p.pose ?? null,
    date_execution: p.dateExec ?? p.dateCloture ?? null,
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
  p: { gamme?: string; datePrevue?: string; dateCloture?: string | null },
): HistoriqueLigne {
  return {
    ...l,
    ordres_travail: {
      id: `ordre-${l.ordre_travail_id}`,
      gamme_id: p.gamme ?? 'g1',
      nom_gamme: 'Chaudière principale',
      date_prevue: p.datePrevue ?? l.date_execution ?? '2026-01-01',
      date_cloture: p.dateCloture ?? l.date_execution ?? null,
    },
  }
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
  it('agrège par gamme : types, OT distincts, dernier relevé', () => {
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
      },
    ])
  })
})
