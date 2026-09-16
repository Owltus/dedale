import { describe, expect, it, vi } from 'vitest'
import type { QueryKey } from '@tanstack/react-query'
import { documentsQueries } from './documents/queries'
import { travauxQueries } from './travaux/queries'
import { evenementsQueries } from './evenements/queries'
import { ordresTravailQueries } from './ordres-travail/queries'
import { OT_QUERY_KEYS } from './ordres-travail/query-keys'
import { dashboardQueries } from './dashboard/queries'
import { gammesQueries } from './gammes/queries'
import { modelesOperationsQueries } from './modeles-operations/queries'
import { modelesDiQueries as modelesDiCatalogueQueries } from './modeles-di/queries'
import { modelesDiQueries as modelesDiDemandesQueries } from './demandes/queries'

// Les modules de requêtes construisent le client Supabase à l'import, ce qui
// exige des variables d'environnement. Rien ici n'appelle le réseau : on
// n'inspecte que des CLÉS de cache, jamais un `queryFn`.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const SITE = '11111111-1111-1111-1111-111111111111'
const MODELE = '22222222-2222-2222-2222-222222222222'

/**
 * `invalidateQueries({ queryKey: racine })` atteint-il `cle` ? TanStack Query
 * apparie par PRÉFIXE : une clé est invalidée si elle commence exactement par
 * la clé passée à l'invalidation. C'est tout l'enjeu de l'étape 6 — une vue
 * rangée sous `['travaux']` est hors d'atteinte d'une invalidation `['documents']`,
 * même si elle lit une table de documents.
 */
function atteintePar(cle: QueryKey, racine: QueryKey): boolean {
  return racine.every((segment, i) => cle[i] === segment)
}

describe('atteintePar (oracle du test lui-même)', () => {
  it('une clé est atteinte par son propre préfixe', () => {
    expect(atteintePar(['a', 'b', 'c'], ['a'])).toBe(true)
    expect(atteintePar(['a', 'b', 'c'], ['a', 'b'])).toBe(true)
  })

  it('une clé n’est pas atteinte par un préfixe étranger', () => {
    expect(atteintePar(['a', 'b'], ['z'])).toBe(false)
    expect(atteintePar(['a', 'b'], ['a', 'z'])).toBe(false)
  })
})

// ── G1 — les indicateurs de documents des listes ──────────────────────────────
//
// Ces trois vues lisent une table de LIAISON de documents mais sont rangées
// sous la clé de leur feature. L'invalidation interne de `DocumentsTab`
// (`['documents']`) ne les atteint donc pas : c'est pourquoi les trois fiches
// (OT, Travaux, Événement) câblent `onLiaisonChanged` sur la clé de leur
// feature. Si l'un de ces `expect(...).toBe(false)` devenait vrai, le câblage
// serait devenu inutile — et devrait être retiré plutôt que laissé en doublon.
describe('G1 — indicateurs documents des listes', () => {
  const cas = [
    {
      nom: 'travaux',
      cle: travauxQueries.documentsParTravaux(SITE).queryKey,
      racine: travauxQueries.all(),
    },
    {
      nom: 'événements',
      cle: evenementsQueries.documentsParEvenement(SITE).queryKey,
      racine: evenementsQueries.all(),
    },
    {
      nom: 'ordres de travail',
      cle: ordresTravailQueries.documentsParOt(SITE).queryKey,
      racine: ordresTravailQueries.all(),
    },
  ] as const

  for (const { nom, cle, racine } of cas) {
    it(`${nom} : la vue documents est hors de portée d’une invalidation « documents »`, () => {
      expect(atteintePar(cle, documentsQueries.all())).toBe(false)
    })

    it(`${nom} : la vue documents est atteinte par la clé racine de sa feature`, () => {
      expect(atteintePar(cle, racine)).toBe(true)
    })
  }
})

// ── G2 — l'alerte « justificatifs manquants » ─────────────────────────────────
describe('G2 — alerte « justificatifs manquants »', () => {
  const cle = dashboardQueries.justificatifsManquants(SITE).queryKey

  it('lit une table de documents mais vit sous « dashboard »', () => {
    expect(atteintePar(cle, documentsQueries.all())).toBe(false)
    expect(atteintePar(cle, dashboardQueries.all())).toBe(true)
  })

  it('n’est pas davantage atteinte par les clés OT', () => {
    // Le justificatif se joint depuis la fiche OT : ni `ordres_travail` ni
    // `planning` ne couvrent l'alerte, d'où `dashboardQueries.all()` ajouté au
    // `onLiaisonChanged` de la fiche.
    for (const racine of OT_QUERY_KEYS) {
      expect(atteintePar(cle, racine)).toBe(false)
    }
  })
})

// ── G3 — les deux lectures de `gamme_modeles` ─────────────────────────────────
describe('G3 — liaisons gamme_modeles', () => {
  it('« gammes d’un modèle » est hors de portée d’une invalidation « gammes »', () => {
    const cle = modelesOperationsQueries.liens(MODELE).queryKey
    expect(atteintePar(cle, gammesQueries.all())).toBe(false)
    expect(atteintePar(cle, modelesOperationsQueries.all())).toBe(true)
  })
})

// ── G4 — les deux `modelesDiQueries` homonymes ────────────────────────────────
describe('G4 — modelesDiQueries (catalogue vs demandes)', () => {
  it('les deux modules partagent la même clé racine', () => {
    // Les deux modules exposent un objet de requêtes pour la MÊME table. Leurs
    // clés racines doivent coïncider, sinon une mutation n'invalide plus qu'une
    // moitié des vues — sans que rien ne le signale. La clé du module
    // « demandes » est DÉRIVÉE de celle du catalogue : ce test verrouille le
    // fait qu'elle le reste.
    expect(modelesDiDemandesQueries.all()).toEqual(
      modelesDiCatalogueQueries.all(),
    )
  })

  it('les mutations du catalogue atteignent la liste proposée au demandeur', () => {
    const cleDemandeur = modelesDiDemandesQueries.list(SITE).queryKey
    const clePool = modelesDiCatalogueQueries.pool().queryKey
    expect(atteintePar(cleDemandeur, modelesDiCatalogueQueries.all())).toBe(
      true,
    )
    expect(atteintePar(clePool, modelesDiDemandesQueries.all())).toBe(true)
  })
})
