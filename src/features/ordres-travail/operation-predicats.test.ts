import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  conformiteLocale,
  estCompteur,
  estCompteurCumulatif,
  estMesureExecution,
  placeholderRange,
  type OperationExecution,
} from './operation-predicats'

const TIRAGES = { numRuns: 1000, seed: 42 } as const

/** Ligne `operations_execution` minimale : tout est vide sauf ce qu'on surcharge. */
function op(p: Partial<OperationExecution> = {}): OperationExecution {
  return {
    id: 'op-1',
    ordre_travail_id: 'ot-1',
    source_type: 1,
    source_id: 'src-1',
    nom: 'Opération',
    description: null,
    type_operation: 'Relevé',
    ordre: 0,
    statut: 'en_attente',
    seuil_minimum: null,
    seuil_maximum: null,
    unite_nom: null,
    unite_symbole: null,
    unite_est_cumulatif: null,
    valeur_mesuree: null,
    est_conforme: null,
    index_depose: null,
    index_pose: null,
    date_remplacement: null,
    date_execution: null,
    executed_by: null,
    commentaires: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...p,
  }
}

const seuil = fc.option(fc.integer({ min: -50, max: 50 }), { nil: null })
const nullable = <T>(g: fc.Arbitrary<T>) => fc.option(g, { nil: null })

/** Toutes les combinaisons de champs qui décident du caractère « mesure ». */
const opMesurable = fc.record({
  seuil_minimum: seuil,
  seuil_maximum: seuil,
  unite_nom: nullable(fc.constantFrom('kilowattheure', 'degré Celsius')),
  unite_symbole: nullable(fc.constantFrom('kWh', '°C', 'm³')),
  unite_est_cumulatif: fc.option(fc.boolean(), { nil: null }),
  valeur_mesuree: nullable(fc.integer({ min: -100, max: 100 })),
})

describe('estMesureExecution / estCompteur / estCompteurCumulatif', () => {
  it('une opération SANS aucun indice de mesure n’est pas une mesure', () => {
    // ORACLE (doc) : « Une opération CAPTE une valeur (type Mesure) : a une
    // UNITÉ, des seuils, ou une valeur déjà relevée. » Aucun des cinq indices →
    // c'est une simple tâche à cocher, pas un relevé.
    expect(estMesureExecution(op())).toBe(false)
    expect(estCompteur(op())).toBe(false)
    expect(estCompteurCumulatif(op())).toBe(false)
  })

  it('l’un quelconque des cinq indices suffit à faire une mesure', () => {
    // ORACLE (doc, disjonction explicite) : unité (nom OU symbole), seuil
    // (min OU max) ou valeur déjà relevée. Oracle recalculé, pas recopié.
    fc.assert(
      fc.property(opMesurable, (champs) => {
        const attendu =
          champs.unite_symbole !== null ||
          champs.unite_nom !== null ||
          champs.seuil_minimum !== null ||
          champs.seuil_maximum !== null ||
          champs.valeur_mesuree !== null
        expect(estMesureExecution(op(champs))).toBe(attendu)
      }),
      TIRAGES,
    )
  })

  it('les trois prédicats sont emboîtés : cumulatif ⊂ compteur ⊂ mesure', () => {
    // ORACLE (doc) : un COMPTEUR est « une mesure SANS seuils » ; un COMPTEUR
    // CUMULATIF est « un compteur dont l'unité s'incrémente ». Une inclusion
    // rompue ferait sommer des valeurs qui ne sont pas des index cumulatifs.
    fc.assert(
      fc.property(opMesurable, (champs) => {
        const o = op(champs)
        if (estCompteurCumulatif(o)) expect(estCompteur(o)).toBe(true)
        if (estCompteur(o)) expect(estMesureExecution(o)).toBe(true)
      }),
      TIRAGES,
    )
  })

  it('un compteur est exactement une mesure sans aucun seuil', () => {
    // ORACLE (doc) : « SANS seuils → relevé d'index cumulatif ». Équivalence
    // stricte : un seul seuil renseigné suffit à en faire une mesure à contrôler
    // (donc PAS un compteur), sinon on soustrairait des températures.
    fc.assert(
      fc.property(opMesurable, (champs) => {
        expect(estCompteur(op(champs))).toBe(
          estMesureExecution(op(champs)) &&
            champs.seuil_minimum === null &&
            champs.seuil_maximum === null,
        )
      }),
      TIRAGES,
    )
  })

  it('un drapeau cumulatif NULL (relevé orphelin) ne rend pas additionnable', () => {
    // ORACLE (doc) : « Le drapeau unite_est_cumulatif est snapshotté à la
    // génération (migration 068) ; NULL (relevés orphelins) → non cumulatif. »
    // Seul `true` autorise la somme — un NULL sommé fabriquerait des totaux faux.
    fc.assert(
      fc.property(opMesurable, (champs) => {
        expect(estCompteurCumulatif(op(champs))).toBe(
          estCompteur(op(champs)) && champs.unite_est_cumulatif === true,
        )
      }),
      TIRAGES,
    )
    expect(
      estCompteurCumulatif(
        op({ unite_symbole: 'kVA', unite_est_cumulatif: null }),
      ),
    ).toBe(false)
  })
})

describe('conformiteLocale — oracle indépendant', () => {
  it('conforme si et seulement si la valeur est DANS la plage, bornes INCLUSES', () => {
    // ORACLE (métier, NF : un seuil est une limite admissible, pas exclue) :
    // conforme ⟺ (min absent ou v ≥ min) ET (max absent ou v ≤ max). Indéterminé
    // seulement si aucun seuil, ou si la saisie n'est pas un nombre.
    // Plages étroites volontairement : la valeur tombe souvent PILE sur une borne.
    fc.assert(
      fc.property(
        seuil,
        seuil,
        fc.integer({ min: -55, max: 55 }),
        (min, max, v) => {
          const o = op({ seuil_minimum: min, seuil_maximum: max })
          const attendu =
            min === null && max === null
              ? null
              : (min === null || v >= min) && (max === null || v <= max)
          expect(conformiteLocale(String(v), o)).toBe(attendu)
        },
      ),
      TIRAGES,
    )
  })

  it('les bornes elles-mêmes sont conformes (pas d’off-by-one)', () => {
    // ORACLE (même règle, cas limites isolés) : une valeur égale au seuil
    // minimum ou maximum est conforme ; un pas de plus la rend non conforme.
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (min, largeur) => {
          const max = min + largeur
          const o = op({ seuil_minimum: min, seuil_maximum: max })
          expect(conformiteLocale(String(min), o)).toBe(true)
          expect(conformiteLocale(String(max), o)).toBe(true)
          expect(conformiteLocale(String(min - 1), o)).toBe(false)
          expect(conformiteLocale(String(max + 1), o)).toBe(false)
        },
      ),
      TIRAGES,
    )
  })

  it('une plage impossible (min > max) ne déclare rien conforme', () => {
    // ORACLE (logique) : [min, max] avec min > max est l'ensemble VIDE — aucune
    // valeur ne peut y appartenir. La fonction ne doit pas « choisir un camp »
    // et valider quand même une valeur mal saisie côté référentiel.
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: -200, max: 200 }),
        (max, ecart, v) => {
          const o = op({ seuil_minimum: max + ecart, seuil_maximum: max })
          expect(conformiteLocale(String(v), o)).toBe(false)
        },
      ),
      TIRAGES,
    )
  })

  it('sans seuils, la conformité est indéterminée quelle que soit la saisie', () => {
    // ORACLE (doc) : « sinon (pas de seuils / pas de valeur / valeur invalide) →
    // indéterminé ». Un compteur n'a pas de conformité : ni conforme ni non
    // conforme, sans quoi la fiche afficherait une pastille mensongère.
    fc.assert(
      fc.property(fc.string(), (saisie) => {
        expect(conformiteLocale(saisie, op())).toBeNull()
      }),
      TIRAGES,
    )
  })

  it('une saisie vide, blanche ou non numérique reste indéterminée', () => {
    // ORACLE (doc) : « pas de valeur / valeur invalide → indéterminé ». Tant que
    // le technicien n'a rien saisi de lisible, la fiche ne le déclare pas
    // NON CONFORME — ce serait une non-conformité inventée.
    const o = op({ seuil_minimum: 0, seuil_maximum: 100 })
    for (const saisie of ['', '   ', '\t', 'abc', '—', '12 kWh']) {
      expect(conformiteLocale(saisie, o)).toBeNull()
    }
  })

  it('les espaces autour de la valeur sont sans effet', () => {
    // ORACLE (robustesse de saisie) : « 12 » et «  12  » décrivent la même
    // mesure — un copier-coller ne doit pas changer la conformité.
    fc.assert(
      fc.property(fc.integer({ min: -50, max: 50 }), (v) => {
        const o = op({ seuil_minimum: -10, seuil_maximum: 10 })
        expect(conformiteLocale(`  ${String(v)}  `, o)).toBe(
          conformiteLocale(String(v), o),
        )
      }),
      TIRAGES,
    )
  })

  it.fails('une décimale à la française est comprise comme un nombre', () => {
    // ORACLE (UI 100 % française, cf. CLAUDE.md) : l'application affiche ses
    // nombres avec une virgule décimale (`toLocaleString('fr-FR')`). Une valeur
    // relue puis resaisie sous la forme affichée doit être comprise.
    //
    // BUG CANDIDAT Martin : attendu `true` (12,5 est dans [0, 100]) / observé
    // `null` (indéterminé). `Number('12,5')` vaut NaN → la conformité passe
    // silencieusement en « indéterminé » au lieu d'être calculée.
    // Rejouable : conformiteLocale('12,5', op({ seuil_minimum: 0, seuil_maximum: 100 }))
    // Portée : dépend du clavier obtenu par le champ de saisie ; sur mobile FR,
    // la virgule est la touche décimale proposée par défaut.
    expect(
      conformiteLocale('12,5', op({ seuil_minimum: 0, seuil_maximum: 100 })),
    ).toBe(true)
  })
})

describe('placeholderRange — totalité', () => {
  it('ne jette jamais et rend soit rien, soit une plage non vide', () => {
    // ORACLE (totalité) : le retour part en `placeholder` d'un `<input>`. Il doit
    // être soit `undefined` (pas de placeholder), soit une chaîne non vide —
    // jamais une chaîne blanche qui laisserait un champ muet.
    fc.assert(
      fc.property(seuil, seuil, (min, max) => {
        const rendu = placeholderRange(
          op({ seuil_minimum: min, seuil_maximum: max }),
        )
        if (rendu === undefined) return
        expect(rendu.trim().length).toBeGreaterThan(0)
      }),
      TIRAGES,
    )
  })

  it('un compteur (aucun seuil) n’affiche AUCUNE plage', () => {
    // ORACLE (doc) : « Vide pour un compteur (pas de seuils) » — un index de
    // compteur n'a pas de plage attendue.
    expect(placeholderRange(op())).toBeUndefined()
  })

  it('la plage affichée contient les seuils réellement posés, et eux seuls', () => {
    // ORACLE (doc) : plage complète si les deux seuils existent, « ≥ min » ou
    // « ≤ max » si un seul. Le placeholder ne doit jamais annoncer une borne
    // que le référentiel n'a pas fixée.
    fc.assert(
      fc.property(seuil, seuil, (min, max) => {
        const rendu =
          placeholderRange(op({ seuil_minimum: min, seuil_maximum: max })) ?? ''
        if (min !== null) expect(rendu).toContain(String(min))
        if (max !== null) expect(rendu).toContain(String(max))
        if (min === null && max === null) expect(rendu).toBe('')
        if (min === null && max !== null)
          expect(rendu.startsWith('≤')).toBe(true)
        if (min !== null && max === null)
          expect(rendu.startsWith('≥')).toBe(true)
      }),
      TIRAGES,
    )
  })
})
