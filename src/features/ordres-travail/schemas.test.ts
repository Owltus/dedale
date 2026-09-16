import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  FILTRE_NON_TERMINES,
  FILTRE_TOUS,
} from '@/components/common/list-filter-bar'
import {
  consoOperation,
  emptyOtCreate,
  estVerrouille,
  libelleStatutOt,
  LIBELLES_STATUT_OP,
  LIBELLES_STATUT_OT,
  matchStatutOt,
  motifSchema,
  otCreateSchema,
  sommesCompteursParUnite,
  statutOperationTone,
  statutOtFilterOptions,
  statutOtTone,
  STATUTS_OP_SAISISSABLES,
  STATUTS_OT_TERMINAUX,
  type StatutOt,
} from './schemas'

// Paramètres de tirage : déterministes (même graine à chaque exécution) pour que
// tout contre-exemple trouvé ici soit rejouable tel quel.
const TIRAGES = { numRuns: 1000, seed: 42 } as const

/**
 * Index de compteur tel qu'il peut arriver au helper : un nombre « normal »,
 * mais aussi les valeurs dégradées que la chaîne peut produire — `Number('')`
 * d'un champ vidé, un `numeric 'NaN'` PostgreSQL, un dépassement de borne.
 */
const indexQuelconque = fc.oneof(
  fc.constant(null),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
  fc.constant(Number.MAX_VALUE),
  fc.integer({ min: -1_000_000, max: 1_000_000 }),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
)

/** Index de compteur RÉALISTE : entier positif borné (index physique relevé). */
const indexReel = fc.integer({ min: 0, max: 5_000_000 })

describe('consoOperation — totalité', () => {
  it('une valeur courante absente ou illisible rend la consommation non calculable', () => {
    // ORACLE (doc du helper) : « Renvoie null si non calculable (pas de valeur
    // courante…) ». Sans relevé courant, aucune consommation ne peut exister,
    // quels que soient le précédent et les index de remplacement.
    fc.assert(
      fc.property(
        indexQuelconque,
        indexQuelconque,
        indexQuelconque,
        fc.constantFrom(null, Number.NaN),
        (precedent, depose, pose, courant) => {
          expect(
            consoOperation({ precedent, courant, depose, pose }),
          ).toBeNull()
        },
      ),
      TIRAGES,
    )
  })

  it('sans base de comparaison ni remplacement, la consommation est non calculable', () => {
    // ORACLE (doc du helper) : « …ou pas de base de comparaison ». Premier relevé
    // d'un compteur (aucun précédent) et aucun remplacement → rien à soustraire.
    fc.assert(
      fc.property(indexReel, (courant) => {
        expect(
          consoOperation({
            precedent: null,
            courant,
            depose: null,
            pose: null,
          }),
        ).toBeNull()
      }),
      TIRAGES,
    )
  })

  it.fails(
    'ne renvoie jamais NaN ni Infinity, quelles que soient les entrées',
    () => {
      // ORACLE : une consommation est une grandeur physique affichée telle quelle
      // à l'utilisateur (« 1 234 kWh »). Une fonction totale ne doit donc rendre
      // qu'un nombre FINI ou `null` (= non calculable) — jamais une valeur qui
      // s'affiche « NaN kWh » ou « Infinity kWh ».
      //
      // BUG CANDIDAT Martin : attendu `null` ou un nombre fini / observé `NaN`.
      // Le helper garde `Number.isNaN` sur `courant`, `depose` et `pose`, mais
      // PAS sur `precedent` : un précédent NaN traverse la soustraction.
      fc.assert(
        fc.property(
          indexQuelconque,
          indexQuelconque,
          indexQuelconque,
          indexQuelconque,
          (precedent, courant, depose, pose) => {
            const conso = consoOperation({ precedent, courant, depose, pose })
            if (conso === null) return
            expect(Number.isFinite(conso)).toBe(true)
          },
        ),
        TIRAGES,
      )
    },
  )

  it.fails('un précédent NaN ne contamine pas la consommation', () => {
    // ORACLE : identique au précédent, sur le contre-exemple MINIMAL isolé.
    // Un index précédent illisible équivaut à une absence de base de comparaison
    // → la consommation doit être `null`, pas `NaN`.
    //
    // BUG CANDIDAT Martin : attendu `null` / observé `NaN`.
    // Rejouable : consoOperation({ precedent: NaN, courant: 10, depose: null, pose: null })
    expect(
      consoOperation({
        precedent: Number.NaN,
        courant: 10,
        depose: null,
        pose: null,
      }),
    ).toBeNull()
  })

  it.fails('un remplacement à index infinis ne produit pas NaN', () => {
    // ORACLE : même règle de totalité, par la branche « remplacement ».
    // Infinity − Infinity = NaN : la garde `Number.isNaN` sur `depose`/`pose`
    // ne protège pas des infinis, qui la franchissent puis se soustraient.
    //
    // BUG CANDIDAT Martin : attendu `null` ou fini / observé `NaN`.
    // Rejouable : consoOperation({ precedent: 0, courant: Infinity, depose: 5, pose: Infinity })
    const conso = consoOperation({
      precedent: 0,
      courant: Number.POSITIVE_INFINITY,
      depose: 5,
      pose: Number.POSITIVE_INFINITY,
    })
    expect(conso === null || Number.isFinite(conso)).toBe(true)
  })
})

describe('consoOperation — cohérence physique', () => {
  it('hors remplacement : consommation = courant − précédent', () => {
    // ORACLE (doc du helper) : « Sinon : courant − précédent ». Oracle
    // arithmétique indépendant, recalculé ici et non recopié d'une sortie.
    fc.assert(
      fc.property(indexReel, indexReel, (precedent, courant) => {
        expect(
          consoOperation({ precedent, courant, depose: null, pose: null }),
        ).toBe(courant - precedent)
      }),
      TIRAGES,
    )
  })

  it('remplacement : (index déposé − précédent) + (courant − index posé)', () => {
    // ORACLE (doc du helper + physique du compteur) : la consommation de la
    // période se partage entre l'ancien appareil (ce qu'il a compté depuis le
    // dernier relevé, jusqu'à son index de dépose) et le neuf (ce qu'il a compté
    // depuis son index de pose). Parenthésage identique à l'oracle pour que
    // l'égalité ne dépende pas de l'ordre des arrondis flottants.
    fc.assert(
      fc.property(
        indexReel,
        indexReel,
        indexReel,
        indexReel,
        (precedent, courant, depose, pose) => {
          expect(consoOperation({ precedent, courant, depose, pose })).toBe(
            depose - precedent + (courant - pose),
          )
        },
      ),
      TIRAGES,
    )
  })

  it('remplacement au premier relevé : seule la part du compteur neuf est comptée', () => {
    // ORACLE (doc du helper) : « sans précédent (1er relevé) → (courant − pose)
    // seul (part ancien non calculable) ». On ne sait pas ce que l'ancien
    // appareil avait consommé depuis un relevé qui n'existe pas.
    fc.assert(
      fc.property(indexReel, indexReel, indexReel, (courant, depose, pose) => {
        expect(consoOperation({ precedent: null, courant, depose, pose })).toBe(
          courant - pose,
        )
      }),
      TIRAGES,
    )
  })

  it('un remplacement incomplet (un seul des deux index) retombe sur le calcul simple', () => {
    // ORACLE (doc du helper) : la branche « remplacement » exige dépose ET pose.
    // Un seul index renseigné ne décrit pas un remplacement → calcul ordinaire.
    fc.assert(
      fc.property(
        indexReel,
        indexReel,
        indexReel,
        fc.boolean(),
        (precedent, courant, index, surDepose) => {
          expect(
            consoOperation({
              precedent,
              courant,
              depose: surDepose ? index : null,
              pose: surDepose ? null : index,
            }),
          ).toBe(courant - precedent)
        },
      ),
      TIRAGES,
    )
  })

  it('un compteur qui ne bouge pas consomme zéro, remplacement compris', () => {
    // ORACLE (physique) : si rien n'est consommé, l'ancien appareil est déposé à
    // son index du dernier relevé et le neuf est relevé à son index de pose →
    // consommation nulle. Invariant de cohérence entre les deux branches.
    fc.assert(
      fc.property(indexReel, indexReel, (index, pose) => {
        expect(
          consoOperation({
            precedent: index,
            courant: pose,
            depose: index,
            pose,
          }),
        ).toBe(0)
      }),
      TIRAGES,
    )
  })
})

describe('sommesCompteursParUnite — conservation', () => {
  const item = fc.record({
    symbole: fc.constantFrom('kWh', 'm³', 'h', ''),
    conso: fc.option(fc.integer({ min: -10_000, max: 10_000 }), {
      nil: null,
    }),
  })

  it('le total d’une unité est exactement la somme de ses consommations calculables', () => {
    // ORACLE (doc) : « Somme des consommations par unité » — ni plus (aucune
    // conso d'une autre unité, aucune conso non calculable comptée pour 0 de
    // trop) ni moins (aucune conso retenue oubliée). Oracle recalculé à part.
    fc.assert(
      fc.property(
        fc.array(item, { maxLength: 30 }),
        fc.integer({ min: 1, max: 4 }),
        (items, min) => {
          for (const { symbole, total } of sommesCompteursParUnite(
            items,
            min,
          )) {
            const attendu = items
              .filter((i) => i.symbole === symbole)
              .reduce((acc, i) => acc + (i.conso ?? 0), 0)
            expect(total).toBe(attendu)
          }
        },
      ),
      TIRAGES,
    )
  })

  it('un groupe sous le seuil d’occurrences est exclu INTÉGRALEMENT', () => {
    // ORACLE (doc) : « On ne garde que les unités présentes au moins
    // `minOccurrences` fois ». Un groupe est retenu en entier ou pas du tout :
    // jamais une somme partielle sur un groupe trop rare.
    fc.assert(
      fc.property(
        fc.array(item, { maxLength: 30 }),
        fc.integer({ min: 1, max: 4 }),
        (items, min) => {
          const rendus = new Set(
            sommesCompteursParUnite(items, min).map((g) => g.symbole),
          )
          for (const symbole of new Set(items.map((i) => i.symbole))) {
            const groupe = items.filter((i) => i.symbole === symbole)
            const attendu =
              symbole !== '' &&
              groupe.length >= min &&
              groupe.some((i) => i.conso !== null)
            expect(rendus.has(symbole)).toBe(attendu)
          }
        },
      ),
      TIRAGES,
    )
  })

  it('ne somme jamais entre unités différentes', () => {
    // ORACLE (doc) : « Jamais de somme entre unités différentes » — 3 kWh et
    // 3 m³ ne font pas 6. Chaque unité rendue l'est une seule fois.
    fc.assert(
      fc.property(fc.array(item, { maxLength: 30 }), (items) => {
        const res = sommesCompteursParUnite(items, 1)
        expect(new Set(res.map((g) => g.symbole)).size).toBe(res.length)
        for (const g of res) expect(g.symbole).not.toBe('')
      }),
      TIRAGES,
    )
  })

  it('un groupe dont aucune consommation n’est calculable est écarté', () => {
    // ORACLE (doc) : « …et dont au moins une consommation est calculable ».
    // Trois compteurs kWh sans aucun relevé exploitable n'affichent pas « 0 kWh »,
    // ce qui se lirait comme une consommation nulle mesurée.
    expect(
      sommesCompteursParUnite(
        [
          { symbole: 'kWh', conso: null },
          { symbole: 'kWh', conso: null },
          { symbole: 'kWh', conso: null },
        ],
        2,
      ),
    ).toEqual([])
  })

  it('un total PARTIEL est accepté dès qu’une consommation est calculable', () => {
    // ORACLE (doc) : « total PARTIEL accepté ». Deux compteurs kWh dont un seul
    // est relevé donnent bien le total de celui-là.
    expect(
      sommesCompteursParUnite(
        [
          { symbole: 'kWh', conso: 120 },
          { symbole: 'kWh', conso: null },
        ],
        2,
      ),
    ).toEqual([{ symbole: 'kWh', total: 120 }])
  })
})

describe('matchStatutOt', () => {
  const statutQuelconque = fc.oneof(
    fc.constantFrom<StatutOt>(
      'planifie',
      'en_cours',
      'cloture',
      'annule',
      'reouvert',
    ),
    fc.string(),
  )

  it('« Tous les statuts » ne masque jamais rien et ne jette jamais', () => {
    // ORACLE (doc) : « FILTRE_TOUS = tout ». Un filtre « tous » qui cacherait un
    // OT ferait disparaître du travail de la liste.
    fc.assert(
      fc.property(statutQuelconque, (statut) => {
        expect(matchStatutOt(statut, FILTRE_TOUS)).toBe(true)
      }),
      TIRAGES,
    )
  })

  it('« Non terminés » exclut exactement les statuts terminaux', () => {
    // ORACLE (doc + STATUTS_OT_TERMINAUX) : « exclut les statuts terminaux ».
    // Oracle recalculé depuis la constante exportée, pas depuis la sortie.
    fc.assert(
      fc.property(statutQuelconque, (statut) => {
        const terminal = (STATUTS_OT_TERMINAUX as string[]).includes(statut)
        expect(matchStatutOt(statut, FILTRE_NON_TERMINES)).toBe(!terminal)
      }),
      TIRAGES,
    )
  })

  it('un statut inconnu ne jette pas et n’est jamais « terminé »', () => {
    // ORACLE (totalité) : le statut vient de la base (enum susceptible d'être
    // étendu par une migration). Un statut non prévu par le front doit rester
    // VISIBLE dans la liste par défaut plutôt que de faire tomber l'écran.
    fc.assert(
      fc.property(fc.string(), (statut) => {
        expect(() => matchStatutOt(statut, FILTRE_NON_TERMINES)).not.toThrow()
        expect(() =>
          matchStatutOt(statut, 'statut_venu_du_futur'),
        ).not.toThrow()
      }),
      TIRAGES,
    )
  })

  it('les options de statut forment une partition : un OT connu matche une seule d’entre elles', () => {
    // ORACLE (UX du filtre) : les entrées du Select autres que les deux
    // sentinelles désignent un statut précis → un OT donné en satisfait
    // exactement une, jamais deux (sinon il apparaîtrait sous deux filtres).
    const precises = statutOtFilterOptions().filter(
      (o) => o.value !== FILTRE_TOUS && o.value !== FILTRE_NON_TERMINES,
    )
    fc.assert(
      fc.property(
        fc.constantFrom<StatutOt>(
          'planifie',
          'en_cours',
          'cloture',
          'annule',
          'reouvert',
        ),
        (statut) => {
          const matches = precises.filter((o) => matchStatutOt(statut, o.value))
          expect(matches).toHaveLength(1)
        },
      ),
      TIRAGES,
    )
  })

  it('les options couvrent tous les statuts connus et portent un libellé', () => {
    // ORACLE : le Select doit proposer chaque statut du cycle de vie, libellé en
    // français — un statut absent du filtre serait introuvable par l'utilisateur.
    const options = statutOtFilterOptions()
    for (const statut of Object.keys(LIBELLES_STATUT_OT)) {
      const option = options.find((o) => o.value === statut)
      expect(option?.label).toBe(LIBELLES_STATUT_OT[statut])
    }
  })
})

describe('statutOtTone / libelleStatutOt / estVerrouille', () => {
  const TONES_VALIDES = [
    'neutral',
    'success',
    'warning',
    'destructive',
    'info',
    'violet',
    'yellow',
  ]

  it('toute paire (statut, origine) rend une tonalité connue', () => {
    // ORACLE (totalité) : `statutOtTone` alimente `StatusBadge`, dont la table de
    // classes est indexée par tonalité — une tonalité hors liste rendrait un
    // badge sans couleur. Repli attendu : `neutral`.
    fc.assert(
      fc.property(
        fc.string(),
        fc.option(fc.string(), { nil: undefined }),
        (statut, origine) => {
          expect(TONES_VALIDES).toContain(statutOtTone(statut, origine))
        },
      ),
      TIRAGES,
    )
  })

  it('seul « Planifié » se nuance selon l’origine', () => {
    // ORACLE (doc) : « le statut Planifié se nuance selon l'ORIGINE » — violet si
    // la date vient d'un humain, gris si l'OT est généré par le cycle. Les autres
    // statuts sont insensibles à l'origine.
    fc.assert(
      fc.property(
        fc.constantFrom('en_cours', 'cloture', 'annule', 'reouvert'),
        fc.constantFrom('programme', 'planifie', 'autre'),
        (statut, origine) => {
          expect(statutOtTone(statut, origine)).toBe(statutOtTone(statut))
        },
      ),
      TIRAGES,
    )
    expect(statutOtTone('planifie', 'programme')).toBe('neutral')
    expect(statutOtTone('planifie', 'planifie')).toBe('violet')
    expect(statutOtTone('planifie')).toBe('violet')
  })

  it('le libellé suit l’origine pour « Programmé » et reste lisible sur les statuts du cycle', () => {
    // ORACLE (doc) : « un OT généré automatiquement par le cycle
    // (origine = 'programme') s'affiche Programmé ; sinon on reprend le libellé
    // standard du statut ».
    expect(libelleStatutOt('planifie', 'programme')).toBe('Programmé')
    expect(libelleStatutOt('planifie', 'planifie')).toBe('Planifié')
    fc.assert(
      fc.property(
        fc.constantFrom<StatutOt>(
          'planifie',
          'en_cours',
          'cloture',
          'annule',
          'reouvert',
        ),
        fc.option(fc.string(), { nil: undefined }),
        (statut, origine) => {
          expect(typeof libelleStatutOt(statut, origine)).toBe('string')
          expect(libelleStatutOt(statut, origine).length).toBeGreaterThan(0)
        },
      ),
      TIRAGES,
    )
  })

  it.fails('le libellé est TOUJOURS une chaîne non vide', () => {
    // ORACLE (totalité) : `libelleStatutOt` est typée `=> string` et son
    // résultat part directement dans le rendu (badge, en-tête d'OT). Quelle que
    // soit la chaîne reçue, elle doit rendre une chaîne non vide — au pire le
    // statut brut, comme le prévoit son repli `?? statut`.
    //
    // BUG CANDIDAT Martin : attendu la chaîne 'toString' / observé la FONCTION
    // `Function.prototype.toString`. `LIBELLES_STATUT_OT` est un objet littéral :
    // `LIBELLES_STATUT_OT['toString']` remonte la chaîne de prototypes et rend
    // une fonction, donc non nulle → le repli `??` ne se déclenche jamais.
    // Même faille sur `LIBELLES_STATUT_OP` (consommé par `OperationRow` avec le
    // `statut` texte brut de `operations_execution`).
    // Rejouable : libelleStatutOt('toString') / libelleStatutOt('constructor')
    expect(typeof libelleStatutOt('toString')).toBe('string')
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.option(fc.string(), { nil: undefined }),
        (statut, origine) => {
          expect(typeof libelleStatutOt(statut, origine)).toBe('string')
          expect(libelleStatutOt(statut, origine).length).toBeGreaterThan(0)
        },
      ),
      TIRAGES,
    )
  })

  it('chaque statut du cycle porte sa tonalité sémantique nominale', () => {
    // ORACLE (doc de `statutOtTone`) : « En cours = bleu (info), Rouvert =
    // orange (warning), Clôturé = vert (success), Annulé = rouge
    // (destructive) », le repli étant `neutral`. Le tirage aléatoire ne tombe
    // jamais sur ces quatre chaînes exactes : il faut les nommer une par une,
    // sinon une couleur peut être changée sans qu'aucun test ne bronche.
    expect(statutOtTone('en_cours')).toBe('info')
    expect(statutOtTone('reouvert')).toBe('warning')
    expect(statutOtTone('cloture')).toBe('success')
    expect(statutOtTone('annule')).toBe('destructive')
    expect(statutOtTone('statut_inconnu')).toBe('neutral')
  })

  it('« Programmé » n’est PAS le libellé d’un autre statut d’origine programmée', () => {
    // ORACLE (doc) : seule la paire (planifie, programme) s'affiche
    // « Programmé ». Un OT EN COURS issu du cycle reste « En cours » — sinon la
    // liste afficherait « Programmé » sur un OT déjà commencé ou déjà clôturé.
    expect(libelleStatutOt('en_cours', 'programme')).toBe('En cours')
    expect(libelleStatutOt('cloture', 'programme')).toBe('Clôturé')
    expect(libelleStatutOt('annule', 'programme')).toBe('Annulé')
    expect(libelleStatutOt('reouvert', 'programme')).toBe('Rouvert')
  })

  it('un OT est verrouillé si et seulement s’il est clôturé ou annulé', () => {
    // ORACLE (doc + NF EN 13306) : « Un OT clôturé ou annulé est en lecture
    // seule (preuve légale) ». Équivalence stricte avec STATUTS_OT_TERMINAUX :
    // les deux notions doivent rester alignées, sinon un OT terminal resterait
    // modifiable (ou l'inverse).
    fc.assert(
      fc.property(fc.string(), (statut) => {
        expect(estVerrouille(statut)).toBe(
          (STATUTS_OT_TERMINAUX as string[]).includes(statut),
        )
      }),
      TIRAGES,
    )
    // Le tirage de chaînes ne produit jamais 'cloture' ni 'annule' : sans ces
    // trois lignes, la propriété ci-dessus se vérifie sur un univers où la
    // réponse est TOUJOURS `false`, et le verrou pourrait être neutralisé sans
    // qu'aucun test ne tombe. Oracle = la doctrine (NF EN 13306), pas la sortie.
    expect(estVerrouille('cloture')).toBe(true)
    expect(estVerrouille('annule')).toBe(true)
    expect(estVerrouille('planifie')).toBe(false)
    expect(estVerrouille('en_cours')).toBe(false)
    expect(estVerrouille('reouvert')).toBe(false)
    // …et la constante qui sert d'oracle aux propriétés ci-dessus est elle-même
    // vérifiée en dur : vidée, elle rendrait toutes ces propriétés vraies.
    expect(STATUTS_OT_TERMINAUX).toEqual(['cloture', 'annule'])
  })
})

describe('tables de libellés et de statuts', () => {
  it('chaque statut OT porte son libellé français exact', () => {
    // ORACLE (UI) : ces libellés sont ceux affichés sur les badges et dans le
    // filtre. Les propriétés qui bouclent sur `Object.keys(LIBELLES_STATUT_OT)`
    // ne prouvent rien si la table est vide — il faut la nommer en dur.
    expect(LIBELLES_STATUT_OT).toEqual({
      planifie: 'Planifié',
      en_cours: 'En cours',
      cloture: 'Clôturé',
      annule: 'Annulé',
      reouvert: 'Rouvert',
    })
  })

  it('chaque statut d’opération porte son libellé français exact', () => {
    // ORACLE (UI) : table consommée par `OperationRow` avec le `statut` brut de
    // `operations_execution` — les 5 valeurs de l'enum doivent être couvertes.
    expect(LIBELLES_STATUT_OP).toEqual({
      en_attente: 'En attente',
      en_cours: 'En cours',
      terminee: 'Terminée',
      annulee: 'Annulée',
      non_applicable: 'Non applicable',
    })
  })

  it('« annulée » n’est pas saisissable à la main (cascade système seule)', () => {
    // ORACLE (doc) : « annulee est réservé à la cascade système (OT annulé) →
    // exclu ». La liste est celle du Select de saisie d'une opération : si elle
    // était vide, l'utilisateur ne pourrait plus changer de statut du tout.
    expect(STATUTS_OP_SAISISSABLES).toEqual([
      'en_attente',
      'en_cours',
      'terminee',
      'non_applicable',
    ])
    expect(STATUTS_OP_SAISISSABLES).not.toContain('annulee')
  })

  it('le liseré d’une opération suit son statut', () => {
    // ORACLE (doc de `statutOperationTone`) : « en attente = gris (neutral), en
    // cours = bleu (info), terminée = vert (success), non applicable / annulée =
    // rouge (destructive) ». Un statut inconnu retombe sur `neutral`.
    expect(statutOperationTone('en_attente')).toBe('neutral')
    expect(statutOperationTone('en_cours')).toBe('info')
    expect(statutOperationTone('terminee')).toBe('success')
    expect(statutOperationTone('non_applicable')).toBe('destructive')
    expect(statutOperationTone('annulee')).toBe('destructive')
    expect(statutOperationTone('statut_venu_du_futur')).toBe('neutral')
  })

  it('les deux sentinelles du filtre portent leur libellé', () => {
    // ORACLE (UX du filtre) : les deux premières entrées du Select sont « Non
    // terminés » (défaut) puis « Tous les statuts » — dans cet ordre, le défaut
    // en tête. Sans assertion en dur, leurs libellés peuvent être vidés.
    const [premiere, seconde] = statutOtFilterOptions()
    expect(premiere).toEqual({
      value: FILTRE_NON_TERMINES,
      label: 'Non terminés',
    })
    expect(seconde).toEqual({ value: FILTRE_TOUS, label: 'Tous les statuts' })
  })
})

describe('formulaires OT (schémas Zod)', () => {
  it('la création d’un OT exige une gamme ET une date prévue', () => {
    // ORACLE (doc du schéma + contraintes NOT NULL de `ordres_travail`) : les
    // deux champs sont obligatoires, avec leur message français respectif.
    const sansGamme = otCreateSchema.safeParse({
      gamme_id: '',
      date_prevue: '2026-03-01',
    })
    expect(sansGamme.success).toBe(false)
    expect(sansGamme.error?.issues[0]?.message).toBe('Sélectionnez une gamme')

    const sansDate = otCreateSchema.safeParse({
      gamme_id: 'gamme-1',
      date_prevue: '',
    })
    expect(sansDate.success).toBe(false)
    expect(sansDate.error?.issues[0]?.message).toBe(
      'La date prévue est obligatoire',
    )

    // …et un formulaire complet passe (une borne MAXIMALE à la place du minimum
    // rejetterait au contraire toute saisie réelle).
    const valide = otCreateSchema.safeParse({
      gamme_id: 'gamme-1',
      date_prevue: '2026-03-01',
    })
    expect(valide.success).toBe(true)
    expect(valide.data).toEqual({
      gamme_id: 'gamme-1',
      date_prevue: '2026-03-01',
    })
  })

  it('le formulaire de création s’ouvre vide, à la date du jour', () => {
    // ORACLE (doc) : `emptyOtCreate` pré-remplit `date_prevue` avec la date du
    // JOUR en heure LOCALE (cf. `todayLocal`) — recalculée ici à part, jamais
    // recopiée de la sortie. Aucune gamme n'est pré-sélectionnée.
    const maintenant = new Date()
    const jourLocal = `${String(maintenant.getFullYear())}-${String(
      maintenant.getMonth() + 1,
    ).padStart(2, '0')}-${String(maintenant.getDate()).padStart(2, '0')}`
    expect(emptyOtCreate()).toEqual({ gamme_id: '', date_prevue: jourLocal })
  })

  it('le motif d’annulation ou de réouverture est obligatoire et borné', () => {
    // ORACLE (CHECK + RPC backend) : motif non vide une fois ROGNÉ (des espaces
    // ne sont pas un motif) et au plus 2000 caractères.
    const vide = motifSchema.safeParse({ motif: '   ' })
    expect(vide.success).toBe(false)
    expect(vide.error?.issues[0]?.message).toBe('Le motif est obligatoire')

    const tropLong = motifSchema.safeParse({ motif: 'x'.repeat(2001) })
    expect(tropLong.success).toBe(false)

    // Un motif réel passe et ressort ROGNÉ (le `.trim()` fait partie du schéma).
    const valide = motifSchema.safeParse({ motif: '  Fuite constatée  ' })
    expect(valide.success).toBe(true)
    expect(valide.data?.motif).toBe('Fuite constatée')

    // La borne haute est bien 2000 (et non un minimum) : 2000 caractères passent.
    expect(motifSchema.safeParse({ motif: 'x'.repeat(2000) }).success).toBe(
      true,
    )
  })
})
