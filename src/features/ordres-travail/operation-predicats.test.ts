import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  CLE_GROUPE_GENERAL,
  basculerStatut,
  conformiteLocale,
  estCompteur,
  estCompteurCumulatif,
  estMesureExecution,
  grouperParEquipement,
  placeholderRange,
  type OperationEdit,
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
    equipement_id: null,
    nom_equipement: null,
    nom_localisation: null,
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

/** Saisie d'une ligne : tout vide sauf ce qu'on surcharge. */
function edit(p: Partial<OperationEdit> = {}): OperationEdit {
  return {
    statut: 'en_attente',
    valeur: '',
    dateExec: '2026-11-08',
    indexDepose: '',
    indexPose: '',
    dateRemplacement: '',
    ...p,
  }
}

describe('basculerStatut — le geste de ligne', () => {
  // ORACLE (D3) : double-clic / appui long = Terminée ↔ En attente pour une
  // non-mesure ; tout statut autre que « terminee » passe Terminée (N/A compris).
  it.each([
    ['en_attente', 'terminee'],
    ['en_cours', 'terminee'],
    ['non_applicable', 'terminee'],
    ['terminee', 'en_attente'],
  ])('une non-mesure « %s » passe « %s »', (avant, apres) => {
    const e = edit({ statut: avant, dateExec: '2026-01-02' })
    expect(basculerStatut(e, false)).toEqual({ ...e, statut: apres })
  })

  // ORACLE : une mesure ne se « termine » pas sans valeur → le geste la
  // réinitialise, remplacement de compteur compris ; la date est conservée.
  it('une mesure est réinitialisée, remplacement compris', () => {
    const e = edit({
      statut: 'terminee',
      valeur: '12',
      indexDepose: '100',
      indexPose: '0',
      dateRemplacement: '2026-11-01',
    })
    expect(basculerStatut(e, true)).toEqual(
      edit({ statut: 'en_attente', dateExec: e.dateExec }),
    )
  })

  it('ne modifie jamais la saisie reçue', () => {
    const e = edit({ statut: 'terminee' })
    basculerStatut(e, false)
    expect(e.statut).toBe('terminee')
  })
})

describe('grouperParEquipement', () => {
  const clim = (id: string, equipement: string | null, chemin: string | null) =>
    op({
      id,
      equipement_id: equipement,
      nom_equipement: equipement ? `Climatiseur ${equipement}` : null,
      nom_localisation: chemin,
    })

  // ORACLE : un OT sans aucune ligne rattachée garde l'écran à plat.
  it('renvoie null quand aucune ligne ne porte d’équipement', () => {
    expect(grouperParEquipement([])).toBeNull()
    expect(grouperParEquipement([op({ id: 'a' }), op({ id: 'b' })])).toBeNull()
  })

  // ORACLE (A3) : ordre NUMÉRIQUE des titres — « 302 » avant « 1010 ».
  it('trie les groupes par titre en ordre numérique', () => {
    const groupes = grouperParEquipement([
      clim('a', 'e1010', 'R+10 / Chambre 1010'),
      clim('b', 'e302', 'R+3 / Chambre 302'),
      clim('c', 'e45', 'R+0 / Chambre 45'),
    ])
    expect(groupes?.map((g) => g.titre)).toEqual([
      'Chambre 45',
      'Chambre 302',
      'Chambre 1010',
    ])
  })

  // ORACLE : la clé est l'équipement, jamais le libellé ; titre = dernier
  // segment du chemin, chemin complet + nom en infobulle ; ordre de la requête
  // conservé dans un groupe.
  it('regroupe par equipement_id en gardant l’ordre de la requête', () => {
    const groupes = grouperParEquipement([
      clim('a', 'e302', 'R+3 / Chambre 302'),
      clim('b', 'e303', 'R+3 / Chambre 303'),
      clim('c', 'e302', 'R+3 / Chambre 302'),
    ])
    expect(groupes).toHaveLength(2)
    expect(groupes?.[0]).toMatchObject({
      cle: 'e302',
      titre: 'Chambre 302',
      detail: 'R+3 / Chambre 302 — Climatiseur e302',
    })
    expect(groupes?.[0]?.ops.map((o) => o.id)).toEqual(['a', 'c'])
  })

  it('deux équipements au même libellé restent deux groupes', () => {
    const groupes = grouperParEquipement([
      clim('a', 'e1', 'Chambre 302'),
      clim('b', 'e2', 'Chambre 302'),
    ])
    expect(groupes?.map((g) => g.cle)).toEqual(['e1', 'e2'])
  })

  // ORACLE : sans localisation, le nom de l'équipement sert de titre.
  it('retombe sur le nom de l’équipement sans localisation', () => {
    const groupes = grouperParEquipement([clim('a', 'e9', null)])
    expect(groupes?.[0]?.titre).toBe('Climatiseur e9')
  })

  // ORACLE : dans un OT mixte, les lignes sans équipement forment « Général »,
  // en tête, quel que soit leur rang dans la requête.
  it('place les lignes sans équipement dans « Général », en tête', () => {
    const groupes = grouperParEquipement([
      clim('a', 'e302', 'R+3 / Chambre 302'),
      op({ id: 'b' }),
      op({ id: 'c' }),
    ])
    expect(groupes?.map((g) => g.cle)).toEqual([CLE_GROUPE_GENERAL, 'e302'])
    expect(groupes?.[0]?.titre).toBe('Général')
    expect(groupes?.[0]?.ops.map((o) => o.id)).toEqual(['b', 'c'])
  })

  // ORACLE (propriété) : le regroupement ne perd ni ne duplique aucune ligne.
  it('chaque ligne apparaît exactement une fois', () => {
    fc.assert(
      fc.property(
        fc.array(fc.option(fc.constantFrom('e1', 'e2', 'e3'), { nil: null }), {
          minLength: 1,
          maxLength: 20,
        }),
        (equipements) => {
          const ops = equipements.map((e, i) =>
            clim(`op-${String(i)}`, e, e ? `Chambre ${e}` : null),
          )
          const groupes = grouperParEquipement(ops)
          if (equipements.every((e) => e === null)) {
            expect(groupes).toBeNull()
            return
          }
          const ids = (groupes ?? []).flatMap((g) => g.ops.map((o) => o.id))
          expect([...ids].sort()).toEqual(ops.map((o) => o.id).sort())
        },
      ),
      TIRAGES,
    )
  })
})
