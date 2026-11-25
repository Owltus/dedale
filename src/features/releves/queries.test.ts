import { describe, expect, it, vi } from 'vitest'
import { QueryClient, skipToken } from '@tanstack/react-query'
import { relevesQueries } from './queries'

/**
 * Requêtes de la section Relevés : filtres envoyés à PostgREST, pagination de
 * l'historique (plafond silencieux de 1 000 lignes), résumé par gamme, et
 * localisations distinctes d'une gamme. Comportement ACTUEL.
 */
interface Requete {
  table: string
  appels: [string, ...unknown[]][]
}

const sb = vi.hoisted(() => ({
  requetes: [] as {
    table: string
    appels: [string, ...unknown[]][]
  }[],
  /** Réponse d'une requête, choisie d'après sa table et ses appels. */
  repondre: vi.fn<(r: Requete) => unknown>(),
  echec: null as Error | null,
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const requete = { table, appels: [] as [string, ...unknown[]][] }
      sb.requetes.push(requete)
      const envoyer = () =>
        sb.echec
          ? Promise.reject(sb.echec)
          : Promise.resolve({ data: sb.repondre(requete), error: null })
      const chaine: Record<string, unknown> = new Proxy(
        {},
        {
          get(_c, methode: string) {
            if (methode === 'then') return undefined
            if (methode === 'throwOnError') {
              return () => {
                requete.appels.push(['throwOnError'])
                const p = envoyer()
                return {
                  then: p.then.bind(p),
                  overrideTypes: () => p,
                }
              }
            }
            return (...args: unknown[]) => {
              requete.appels.push([methode, ...args])
              return chaine
            }
          },
        },
      )
      return chaine
    },
  },
}))

function preparer(repondre: (r: Requete) => unknown) {
  sb.requetes.length = 0
  sb.echec = null
  sb.repondre.mockReset().mockImplementation(repondre)
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function ligne(p: {
  id: string
  ot: string
  gamme: string | null
  nomGamme?: string | null
  nom?: string
  cloture?: string | null
  exec?: string | null
  miniature?: string | null
}) {
  return {
    id: p.id,
    ordre_travail_id: p.ot,
    nom: p.nom ?? 'Température',
    equipement_id: null,
    unite_symbole: '°C',
    unite_nom: 'degré',
    seuil_minimum: null,
    seuil_maximum: null,
    valeur_mesuree: 20,
    date_execution: p.exec ?? null,
    ordres_travail: {
      id: p.ot,
      gamme_id: p.gamme,
      nom_gamme: p.nomGamme === undefined ? 'Légionelle' : p.nomGamme,
      date_prevue: '2026-01-01',
      date_cloture: p.cloture ?? null,
      miniature_id: p.miniature ?? null,
    },
  }
}

const range = (r: Requete) =>
  r.appels.find(([m]) => m === 'range') as [string, number, number]

describe('relevesQueries — clés', () => {
  it('clés distinctes par usage et par site / gamme', () => {
    expect(relevesQueries.all()).toEqual(['releves'])
    expect(relevesQueries.historique('S').queryKey).toEqual([
      'releves',
      'historique',
      'S',
    ])
    expect(relevesQueries.gammesListe('S').queryKey).toEqual([
      'releves',
      'gammes-liste',
      'S',
    ])
    expect(relevesQueries.localisationGamme('G').queryKey).toEqual([
      'releves',
      'localisation',
      'G',
    ])
    expect(relevesQueries.historique('S').staleTime).toBe(60_000)
  })

  it('paramètre absent : skipToken, rien n’est demandé', () => {
    preparer(() => [])
    expect(relevesQueries.historique(null).queryFn).toBe(skipToken)
    expect(relevesQueries.gammesListe(null).queryFn).toBe(skipToken)
    expect(relevesQueries.localisationGamme(null).queryFn).toBe(skipToken)
    expect(sb.requetes).toHaveLength(0)
  })
})

describe('relevesQueries.historique', () => {
  it('filtres : site de l’OT, opérations terminées, valeur mesurée renseignée, tri total par id', async () => {
    const qc = preparer(() => [ligne({ id: 'a', ot: 'OT1', gamme: 'G1' })])
    const lignes = await qc.fetchQuery(relevesQueries.historique('S-1'))
    expect(lignes).toHaveLength(1)
    expect(sb.requetes).toHaveLength(1)
    const [r] = sb.requetes
    expect(r!.table).toBe('operations_execution')
    expect(r!.appels[0]![0]).toBe('select')
    expect(String(r!.appels[0]![1])).toContain('ordres_travail!inner(')
    expect(r!.appels).toContainEqual(['eq', 'ordres_travail.site_id', 'S-1'])
    expect(r!.appels).toContainEqual(['eq', 'statut', 'terminee'])
    expect(r!.appels).toContainEqual(['not', 'valeur_mesuree', 'is', null])
    expect(r!.appels).toContainEqual(['order', 'id', { ascending: true }])
    expect(range(r!)).toEqual(['range', 0, 999])
  })

  it('au-delà de 1 000 lignes : pages suivantes demandées, rien ne manque', async () => {
    const qc = preparer((r) => {
      const [, debut] = range(r)
      const n = debut === 0 ? 1000 : debut === 1000 ? 30 : 0
      return Array.from({ length: n }, (_, i) =>
        ligne({ id: String(debut + i), ot: 'OT', gamme: 'G' }),
      )
    })
    const lignes = await qc.fetchQuery(relevesQueries.historique('S-1'))
    expect(lignes).toHaveLength(1030)
    expect(range(sb.requetes[1]!)).toEqual(['range', 1000, 1999])
  })

  it('échec de la base : l’erreur remonte', async () => {
    const qc = preparer(() => [])
    sb.echec = new Error('panne')
    await expect(
      qc.fetchQuery(relevesQueries.historique('S-1')),
    ).rejects.toThrow('panne')
  })
})

describe('relevesQueries.gammesListe', () => {
  it('résumé par gamme calculé sur l’historique (même lecture, clé propre)', async () => {
    const qc = preparer(() => [
      ligne({ id: 'a', ot: 'OT1', gamme: 'G1', cloture: '2026-03-01' }),
      ligne({
        id: 'b',
        ot: 'OT2',
        gamme: 'G1',
        cloture: '2026-05-01',
        miniature: 'M2',
      }),
      ligne({ id: 'c', ot: 'OT3', gamme: 'G2', nomGamme: 'Chaufferie' }),
    ])
    const gammes = await qc.fetchQuery(relevesQueries.gammesListe('S-1'))
    expect(gammes).toEqual([
      {
        id: 'G2',
        nomGamme: 'Chaufferie',
        nbTypes: 1,
        nbOt: 1,
        dernierReleve: null,
        miniatureId: null,
      },
      {
        id: 'G1',
        nomGamme: 'Légionelle',
        nbTypes: 1,
        nbOt: 2,
        dernierReleve: '2026-05-01',
        miniatureId: 'M2',
      },
    ])
    expect(sb.requetes[0]!.table).toBe('operations_execution')
  })
})

describe('relevesQueries.localisationGamme', () => {
  it('aucun équipement lié : null, la vue n’est pas interrogée', async () => {
    const qc = preparer(() => [])
    const lieu = await qc.fetchQuery(relevesQueries.localisationGamme('G1'))
    expect(lieu).toBeNull()
    expect(sb.requetes.map((r) => r.table)).toEqual(['gammes_equipements'])
    expect(sb.requetes[0]!.appels).toContainEqual(['eq', 'gamme_id', 'G1'])
  })

  it('localisations distinctes, vides écartées, jointes par « · »', async () => {
    const qc = preparer((r) =>
      r.table === 'gammes_equipements'
        ? [
            { equipement_id: 'E1' },
            { equipement_id: 'E2' },
            { equipement_id: 'E3' },
          ]
        : [
            { localisation_complete: 'Bât. A / R+1' },
            { localisation_complete: null },
            { localisation_complete: 'Bât. A / R+1' },
            { localisation_complete: '' },
            { localisation_complete: 'Bât. B' },
          ],
    )
    const lieu = await qc.fetchQuery(relevesQueries.localisationGamme('G1'))
    expect(lieu).toBe('Bât. A / R+1 · Bât. B')
    expect(sb.requetes[1]!.table).toBe('v_equipements_complet')
    expect(sb.requetes[1]!.appels).toContainEqual([
      'in',
      'id',
      ['E1', 'E2', 'E3'],
    ])
  })

  it('équipements sans localisation : null', async () => {
    const qc = preparer((r) =>
      r.table === 'gammes_equipements'
        ? [{ equipement_id: 'E1' }]
        : [{ localisation_complete: null }],
    )
    expect(
      await qc.fetchQuery(relevesQueries.localisationGamme('G1')),
    ).toBeNull()
  })
})
