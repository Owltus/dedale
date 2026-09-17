import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  cleNom,
  cleProvenance,
  messageHistoriqueIntrouvable,
  normaliserNomOperation,
  valeurPrecedente,
  type IndexPrecedents,
  type OperationCorrelable,
} from './correlation'

function op(p: Partial<OperationCorrelable> = {}): OperationCorrelable {
  return {
    source_type: 'operation',
    source_id: 'src-1',
    nom: 'Relevé compteur eau',
    ...p,
  }
}

const VIDE: IndexPrecedents = { parProvenance: {}, parNom: {} }

describe('normaliserNomOperation', () => {
  it('met en minuscules, rogne les bords et réduit les espaces internes', () => {
    expect(normaliserNomOperation('  Relevé   COMPTEUR\tEau \n')).toBe(
      'relevé compteur eau',
    )
  })

  // CONTRAT FIGÉ (ADR 0012). Élargir la normalisation redécouperait
  // SILENCIEUSEMENT des séries de relevés existantes : deux historiques se
  // fondraient, ou un seul se scinderait, sans erreur ni trace. Ce test est là
  // pour qu'un tel changement devienne bruyant — s'il casse, ce n'est pas lui
  // qu'il faut corriger, c'est la décision qu'il faut rouvrir.
  it('ne replie NI les accents NI la ponctuation — deux noms proches restent distincts', () => {
    expect(normaliserNomOperation('Température')).not.toBe(
      normaliserNomOperation('Temperature'),
    )
    expect(normaliserNomOperation("Poste d'appât")).not.toBe(
      normaliserNomOperation('Poste d appât'),
    )
    expect(normaliserNomOperation('Essai manœuvre')).not.toBe(
      normaliserNomOperation('Essai manoeuvre'),
    )
  })

  it('est idempotente : normaliser deux fois ne change plus rien', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const une = normaliserNomOperation(s)
        expect(normaliserNomOperation(une)).toBe(une)
      }),
      { numRuns: 1000 },
    )
  })

  it('ne rend jamais un nom à espaces de bord ou à espaces doublés', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = normaliserNomOperation(s)
        expect(r).toBe(r.trim())
        expect(r).not.toMatch(/\s\s/)
      }),
      { numRuns: 1000 },
    )
  })
})

describe('cleProvenance', () => {
  it('compose le type et l’identifiant', () => {
    expect(cleProvenance(op({ source_type: 1, source_id: 'a' }))).toBe('1:a')
  })

  it('rend null sans identifiant — une exécution sans provenance ne corrèle pas', () => {
    expect(cleProvenance(op({ source_id: null }))).toBeNull()
  })
})

describe('cleNom', () => {
  it('porte la gamme : deux homonymes de gammes différentes ne se confondent pas', () => {
    expect(cleNom('g1', op({ nom: 'Relevé' }))).not.toBe(
      cleNom('g2', op({ nom: 'Relevé' })),
    )
  })

  it('rend null sans gamme — sans elle, la clé confondrait tout le site', () => {
    expect(cleNom(null, op())).toBeNull()
  })
})

describe('valeurPrecedente — corrélation en deux temps (ADR 0012)', () => {
  it('rend la valeur trouvée par la provenance', () => {
    const index: IndexPrecedents = {
      parProvenance: { 'operation:src-1': 120 },
      parNom: {},
    }
    expect(valeurPrecedente(index, 'g1', op())).toBe(120)
  })

  // Le cœur de la décision : le repli récupère les 53 exécutions dont
  // l'opération d'origine a été supprimée du modèle et dont le `source_id`
  // n'appartient qu'à leur propre ligne.
  it('se replie sur le nom quand la provenance ne rattache rien', () => {
    const index: IndexPrecedents = {
      parProvenance: { 'operation:un-autre': 999 },
      parNom: { 'g1|relevé compteur eau': 120 },
    }
    expect(valeurPrecedente(index, 'g1', op({ source_id: 'orpheline' }))).toBe(
      120,
    )
  })

  // L'inverse coûterait les huit séries dont l'opération a été renommée en cours
  // de route (« Essai de manœuvre manuelle » → « Essai manœuvre CCF »).
  it('NE se replie PAS quand la provenance a rattaché, même si le nom a changé', () => {
    const index: IndexPrecedents = {
      parProvenance: { 'operation:src-1': 120 },
      parNom: { 'g1|essai manœuvre ccf': 999 },
    }
    expect(
      valeurPrecedente(index, 'g1', op({ nom: 'Essai manœuvre CCF' })),
    ).toBe(120)
  })

  it('rend null quand aucune des deux clés ne rattache — l’écran doit le dire', () => {
    expect(valeurPrecedente(VIDE, 'g1', op())).toBeNull()
  })

  it('rend null tant que l’index n’est pas chargé', () => {
    expect(valeurPrecedente(undefined, 'g1', op())).toBeNull()
  })

  // Piège classique : `?? null` sur une lecture d'index confond « absent » et
  // « relevé à zéro ». Un compteur neuf relevé à 0 a bien un précédent.
  it('distingue un relevé précédent à 0 d’une absence de précédent', () => {
    const index: IndexPrecedents = {
      parProvenance: { 'operation:src-1': 0 },
      parNom: {},
    }
    expect(valeurPrecedente(index, 'g1', op())).toBe(0)
  })

  it('n’utilise pas le repli quand la gamme est inconnue', () => {
    const index: IndexPrecedents = {
      parProvenance: {},
      parNom: { 'g1|relevé compteur eau': 120 },
    }
    expect(valeurPrecedente(index, null, op({ source_id: null }))).toBeNull()
  })
})

describe('messageHistoriqueIntrouvable — troisième temps (ADR 0012)', () => {
  const VIVANTES = new Set(['src-1', 'src-2'])

  it('se tait quand l’opération d’origine existe toujours — c’est une première mesure', () => {
    expect(messageHistoriqueIntrouvable(op(), VIVANTES)).toBeNull()
  })

  it('explique quand l’opération d’origine a été supprimée', () => {
    expect(
      messageHistoriqueIntrouvable(op({ source_id: 'disparue' }), VIVANTES),
    ).toBe(
      "Historique indisponible : l'opération d'origine a été supprimée du modèle.",
    )
  })

  // On n'affirme une cause que lorsqu'on l'a CONSTATÉE. Tant que la liste n'est
  // pas chargée, se taire vaut mieux que deviner — un message qui clignote à
  // chaque ouverture de fiche serait pire que pas de message du tout.
  it('se tait tant que la liste des opérations n’est pas chargée', () => {
    expect(
      messageHistoriqueIntrouvable(op({ source_id: 'disparue' }), undefined),
    ).toBeNull()
  })

  it('se tait pour une exécution sans provenance — rien à constater', () => {
    expect(
      messageHistoriqueIntrouvable(op({ source_id: null }), VIVANTES),
    ).toBeNull()
  })
})
