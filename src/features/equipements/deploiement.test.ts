import { describe, expect, it } from 'vitest'
import type { Tables } from '@/lib/database.types'
import type { Champ } from '@/lib/champs'
import {
  champObligatoireManquant,
  flottesDeployables,
  gabaritSousCategorie,
  lireApercuAnnulation,
  lireApercuDeploiement,
  messageErreurDeploiement,
  nbEquipements,
  valeurInitiale,
  valeursDeploiement,
} from './deploiement'

type Categorie = Tables<'categories'>

const SITE = 'site-1'

function cat(p: Partial<Categorie> & Pick<Categorie, 'id' | 'nom'>): Categorie {
  return {
    scope: 'parc',
    site_id: SITE,
    parent_id: null,
    est_actif: true,
    valeur_principale: null,
    valeur_secondaire: null,
    valeur_tertiaire: null,
    modele_equipement_id: null,
    specifications: null,
    miniature_id: null,
    description: null,
    ordre: 0,
    ...p,
  } as Categorie
}

const champs: Champ[] = [
  { cle: 'Repère', type: 'texte', requis: true, defaut: null },
  { cle: 'Marque', type: 'texte', requis: false, defaut: 'Acme' },
  { cle: 'Puissance', type: 'nombre', requis: true, defaut: 5 },
  { cle: 'Raccordé', type: 'oui-non', requis: true, defaut: null },
  {
    cle: 'ZDM',
    type: 'double-reference',
    requis: false,
    defaut: { a: '1', b: '2' },
  },
]

describe('flottesDeployables — ce que deployer_equipements accepte', () => {
  const racine = cat({ id: 'r', nom: 'Sécurité incendie' })
  it('sous-catégories de parc actives du site, sous une racine du site, triées', () => {
    const liste = flottesDeployables(
      [
        racine,
        cat({ id: 'b', nom: 'Détecteurs', parent_id: 'r' }),
        cat({ id: 'a', nom: 'Déclencheurs', parent_id: 'r' }),
        cat({ id: 'x', nom: 'Archivée', parent_id: 'r', est_actif: false }),
        cat({ id: 'y', nom: 'Autre site', parent_id: 'r', site_id: 'site-2' }),
        cat({ id: 'z', nom: 'Modèles', parent_id: 'r', scope: 'equipement' }),
        cat({ id: 'p', nom: 'Petit-fils', parent_id: 'b' }),
        cat({ id: 'o', nom: 'Orpheline', parent_id: 'absente' }),
      ],
      SITE,
    )
    expect(liste.map((f) => f.id)).toEqual(['a', 'b'])
    expect(liste[0]).toMatchObject({ categorie: 'Sécurité incendie' })
  })

  it('une racine seule n’est pas une flotte', () => {
    expect(flottesDeployables([racine], SITE)).toEqual([])
  })
})

describe('gabaritSousCategorie — modèle fixé, sinon gabarit propre', () => {
  const specs = { champs }
  it('modèle fixé : son gabarit et sa vignette', () => {
    const g = gabaritSousCategorie(
      { modele_equipement_id: 'm', specifications: null, miniature_id: 'v0' },
      [{ id: 'm', specifications: specs, miniature_id: 'v1' }],
    )
    expect(g).toEqual({ champs, miniatureId: 'v1', modeleId: 'm' })
  })
  it('modèle introuvable : gabarit vide mais modèle gardé', () => {
    expect(
      gabaritSousCategorie(
        {
          modele_equipement_id: 'm',
          specifications: specs,
          miniature_id: null,
        },
        [],
      ),
    ).toEqual({ champs: [], miniatureId: null, modeleId: 'm' })
  })
  it('sans modèle : gabarit de la sous-catégorie', () => {
    expect(
      gabaritSousCategorie(
        {
          modele_equipement_id: null,
          specifications: specs,
          miniature_id: 'v',
        },
        [],
      ),
    ).toEqual({ champs, miniatureId: 'v', modeleId: null })
  })
})

describe('valeursDeploiement — seules les valeurs changées partent', () => {
  const initiales = champs.map((c) => valeurInitiale(c, 'Repère'))

  it('la principale texte part vide (nom du lieu), les autres au défaut', () => {
    expect(initiales).toEqual([null, 'Acme', 5, null, { a: '1', b: '2' }])
  })

  it('rien de changé → null (la base applique les défauts et le nom du lieu)', () => {
    expect(valeursDeploiement(champs, initiales, 'Repère')).toBeNull()
  })

  it('principale saisie, valeur modifiée, double référence copiée', () => {
    expect(
      valeursDeploiement(
        champs,
        ['  ', 'Bosch', 5, true, { a: '3', b: '2' }],
        'Repère',
      ),
    ).toEqual({ Marque: 'Bosch', Raccordé: true, ZDM: { a: '3', b: '2' } })
    expect(
      valeursDeploiement(champs, ['Hall', 'Acme', null, null, null], 'Repère'),
    ).toEqual({ Repère: 'Hall', Puissance: null, ZDM: null })
  })

  it('principale d’un type non texte : traitée comme une valeur ordinaire', () => {
    const init = champs.map((c) => valeurInitiale(c, 'Puissance'))
    expect(init[2]).toBe(5)
    expect(
      valeursDeploiement(
        champs,
        [null, 'Acme', 7, null, { a: '1', b: '2' }],
        'Puissance',
      ),
    ).toEqual({ Puissance: 7 })
  })
})

describe('champObligatoireManquant — miroir de la base', () => {
  it('principale texte et oui-non exemptés ; premier requis vide sinon', () => {
    expect(
      champObligatoireManquant(champs, [null, null, 5, null, null], 'Repère'),
    ).toBeNull()
    expect(
      champObligatoireManquant(
        champs,
        [null, null, null, null, null],
        'Repère',
      ),
    ).toBe('Puissance')
    expect(
      champObligatoireManquant(champs, ['', null, 5, null, null], null),
    ).toBe('Repère')
  })
})

describe('lireApercuDeploiement — forme rendue par la RPC', () => {
  it('lit chaque bloc', () => {
    const a = lireApercuDeploiement({
      mode: 'aperçu',
      site: { id: SITE, nom: 'Hôtel' },
      sous_categorie: {
        id: 'b',
        nom: 'Détecteurs',
        categorie: 'SSI',
        modele: null,
      },
      lieux_demandes: 3,
      a_creer: 2,
      doublons_ignores: true,
      doublons: [
        {
          local_id: 'l3',
          lieu: 'Ch 3',
          batiment: 'A',
          niveau: 'R+1',
          existants: 1,
        },
      ],
      par_batiment_niveau: [
        { batiment: 'A', niveau: 'R+1', a_creer: 2, doublons: 1 },
      ],
      exemples: [
        {
          lieu: 'Ch 1',
          libelle: 'Détecteurs Ch 1',
          specifications: {
            champs: [
              {
                cle: 'Repère',
                type: 'texte',
                requis: true,
                defaut: null,
                valeur: 'Ch 1',
              },
            ],
          },
        },
      ],
      gammes: [
        {
          id: 'g',
          nom: 'SSI annuel',
          repeter_par_equipement: true,
          ot_ouverts: 2,
          operations_ajoutees_ot_ouverts: 4,
        },
      ],
      lot: null,
      equipement_ids: [],
    })
    expect(a).toMatchObject({
      site: 'Hôtel',
      sousCategorie: { nom: 'Détecteurs', categorie: 'SSI', modele: null },
      lieuxDemandes: 3,
      aCreer: 2,
      doublonsIgnores: true,
      doublons: [{ localId: 'l3', lieu: 'Ch 3', existants: 1 }],
      parBatimentNiveau: [
        { batiment: 'A', niveau: 'R+1', aCreer: 2, doublons: 1 },
      ],
      gammes: [
        {
          id: 'g',
          repeterParEquipement: true,
          otOuverts: 2,
          operationsAjoutees: 4,
        },
      ],
      lot: null,
      equipementIds: [],
    })
    expect(a.exemples[0]?.champs[0]?.valeur).toBe('Ch 1')
  })

  it('réponse inattendue : valeurs neutres, jamais d’exception', () => {
    expect(lireApercuDeploiement(null)).toMatchObject({
      aCreer: 0,
      doublons: [],
      gammes: [],
      lot: null,
      equipementIds: [],
    })
    expect(
      lireApercuDeploiement({ lot: 'L', equipement_ids: ['e1', 2, 'e2'] }),
    ).toMatchObject({ lot: 'L', equipementIds: ['e1', 'e2'] })
  })
})

describe('lireApercuAnnulation', () => {
  it('lit total, suppressions, conservés et raisons, opérations retirées', () => {
    expect(
      lireApercuAnnulation({
        total: 3,
        a_supprimer: 2,
        supprimes: 0,
        conserves: [
          {
            id: 'e',
            lieu: 'Ch 1',
            sous_categorie: 'D',
            raisons: ['documents', 7],
          },
        ],
        gammes: [{ id: 'g', nom: 'SSI', operations_retirees_ot_ouverts: 2 }],
      }),
    ).toEqual({
      total: 3,
      aSupprimer: 2,
      supprimes: 0,
      conserves: [{ id: 'e', lieu: 'Ch 1', raisons: ['documents'] }],
      gammes: [{ id: 'g', nom: 'SSI', operationsRetirees: 2 }],
    })
    expect(lireApercuAnnulation('x')).toMatchObject({ total: 0, conserves: [] })
  })
})

describe('messageErreurDeploiement', () => {
  const erreur = (code: string, message: string) =>
    Object.assign(new Error(message), { code })
  it('refus métier de la base (P0001) : message tel quel', () => {
    expect(
      messageErreurDeploiement(
        erreur(
          'P0001',
          'Au plus 500 lieux par déploiement (501 demandés) : découpe-le en plusieurs fois.',
        ),
      ),
    ).toMatch(/Au plus 500 lieux/)
  })
  it('refus de droits (42501) : reformulé pour le déploiement', () => {
    expect(messageErreurDeploiement(erreur('42501', 'denied'))).toMatch(
      /^Déploiement refusé/,
    )
  })
})

describe('nbEquipements', () => {
  it('accorde le nom', () => {
    expect(nbEquipements(1)).toBe('1 équipement')
    expect(nbEquipements(0)).toBe('0 équipement')
    expect(nbEquipements(12)).toBe('12 équipements')
  })
})
