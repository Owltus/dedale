import { describe, expect, it } from 'vitest'
import {
  calculerRelevesParOt,
  libelleReleve,
  type ReleveLigne,
} from './releves'

function ligne(p: {
  ot: string
  /** `null` = relevé orphelin (opération source supprimée, cf. migration 063). */
  src: string | null
  val: number | null
  gamme?: string | null
  date?: string | null
  statut?: string
  depose?: number | null
  pose?: number | null
  symbole?: string | null
  dateExec?: string | null
  /** Horodatage de création — départage deux relevés de MÊME date d'exécution. */
  creeLe?: string
  /** Relevé dont la jointure OT est absente (gamme supprimée, vue partielle). */
  sansOt?: boolean
  /**
   * Nom snapshot — clé de corrélation de REPLI (ADR 0012). Par défaut on reprend
   * `src` : deux sources distinctes gardent ainsi deux noms distincts, et les
   * tests écrits AVANT le repli conservent exactement leur sens. Le préciser sert
   * à éprouver le repli lui-même (même nom, sources différentes ou absentes).
   */
  nom?: string
}): ReleveLigne {
  return {
    ordre_travail_id: p.ot,
    source_type: 'operation',
    source_id: p.src,
    nom: p.nom ?? `compteur ${p.src ?? 'sans-source'}`,
    valeur_mesuree: p.val,
    index_depose: p.depose ?? null,
    index_pose: p.pose ?? null,
    statut: p.statut ?? 'terminee',
    // `dateExec: null` doit rester NULL (relevé jamais exécuté) — d'où le test
    // sur `undefined` plutôt qu'un `??` qui retomberait sur la date prévue.
    date_execution: p.dateExec === undefined ? (p.date ?? null) : p.dateExec,
    created_at: p.creeLe ?? '2026-01-01T00:00:00Z',
    unite_symbole: p.symbole === undefined ? 'kWh' : p.symbole,
    ordres_travail: p.sansOt
      ? null
      : {
          gamme_id: p.gamme ?? 'g1',
          date_prevue: p.date ?? null,
        },
  }
}

describe('calculerRelevesParOt', () => {
  it('somme les consos (relevé − précédent) par unité présente ≥ 2 fois, et la valeur brute', () => {
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot1', src: 'a', val: 100, date: '2026-01-01' }),
      ligne({ ot: 'ot1', src: 'b', val: 200, date: '2026-01-01' }),
      ligne({ ot: 'ot2', src: 'a', val: 130, date: '2026-02-01' }), // +30
      ligne({ ot: 'ot2', src: 'b', val: 250, date: '2026-02-01' }), // +50
    ])
    expect(map.get('ot2')).toEqual({ valeur: '380 kWh', conso: '+80 kWh' })
    // ot1 n'a aucun précédent → aucune conso calculable → pas de relevé.
    expect(map.has('ot1')).toBe(false)
  })

  it('affiche la valeur même avec un seul compteur (carte de liste, ≠ détail)', () => {
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot1', src: 'a', val: 100, date: '2026-01-01' }),
      ligne({ ot: 'ot2', src: 'a', val: 130, date: '2026-02-01' }), // +30
    ])
    expect(map.get('ot2')).toEqual({ valeur: '130 kWh', conso: '+30 kWh' })
    // ot1 reste sans précédent → rien.
    expect(map.has('ot1')).toBe(false)
  })

  it('gère un remplacement de compteur : (dépose − précédent) + (courant − pose)', () => {
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot1', src: 'a', val: 100, date: '2026-01-01' }),
      ligne({ ot: 'ot1', src: 'b', val: 200, date: '2026-01-01' }),
      // A remplacé : (150 − 100) + (20 − 0) = 70
      ligne({
        ot: 'ot2',
        src: 'a',
        val: 20,
        depose: 150,
        pose: 0,
        date: '2026-02-01',
      }),
      ligne({ ot: 'ot2', src: 'b', val: 250, date: '2026-02-01' }), // +50
    ])
    // valeur brute = courant après remplacement (20) + 250 = 270 ; conso = 70 + 50.
    expect(map.get('ot2')).toEqual({ valeur: '270 kWh', conso: '+120 kWh' })
  })

  it('ne prend pas un OT futur ou de même date comme précédent (antériorité stricte)', () => {
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot1', src: 'a', val: 100, date: '2026-02-01' }),
      ligne({ ot: 'ot1', src: 'b', val: 200, date: '2026-02-01' }),
      // Même date que ot1 → ne peut pas servir de précédent à ot1.
      ligne({ ot: 'ot2', src: 'a', val: 130, date: '2026-02-01' }),
      ligne({ ot: 'ot2', src: 'b', val: 250, date: '2026-02-01' }),
    ])
    expect(map.has('ot1')).toBe(false)
    expect(map.has('ot2')).toBe(false)
  })

  it('ignore un relevé précédent NON terminé', () => {
    const map = calculerRelevesParOt([
      ligne({
        ot: 'ot1',
        src: 'a',
        val: 100,
        date: '2026-01-01',
        statut: 'en_cours',
      }),
      ligne({
        ot: 'ot1',
        src: 'b',
        val: 200,
        date: '2026-01-01',
        statut: 'en_cours',
      }),
      ligne({ ot: 'ot2', src: 'a', val: 130, date: '2026-02-01' }),
      ligne({ ot: 'ot2', src: 'b', val: 250, date: '2026-02-01' }),
    ])
    // Les relevés d'ot1 (en cours) ne comptent pas comme précédent → ot2 sans base.
    expect(map.has('ot2')).toBe(false)
  })

  it('conso à 0 pile ne porte pas de signe « + » (compteur cumulatif, ne peut pas baisser)', () => {
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot1', src: 'a', val: 100, date: '2026-01-01' }),
      ligne({ ot: 'ot1', src: 'b', val: 200, date: '2026-01-01' }),
      ligne({ ot: 'ot2', src: 'a', val: 100, date: '2026-02-01' }), // +0
      ligne({ ot: 'ot2', src: 'b', val: 200, date: '2026-02-01' }), // +0
    ])
    expect(map.get('ot2')).toEqual({ valeur: '300 kWh', conso: '0 kWh' })
  })
})
describe('calculerRelevesParOt — choix du relevé précédent', () => {
  // Trois OT de la même gamme et du même compteur, aux dates prévues croissantes.
  // Le relevé de `ot-c` doit se comparer au PLUS RÉCENT des relevés antérieurs.
  // ORACLE arithmétique commun : conso(ot-c) = 200 − 130 = 70 si le précédent
  // retenu est `ot-b` (le bon), et 200 − 100 = 100 s'il retenait `ot-a`.
  const RECENT = { valeur: '200 kWh', conso: '+70 kWh' }
  const TROP_ANCIEN = { valeur: '200 kWh', conso: '+100 kWh' }

  it('retient le relevé antérieur de date d’exécution la PLUS RÉCENTE', () => {
    // `created_at` est volontairement en ordre INVERSE des dates d'exécution :
    // seule la date d'exécution doit décider (le created_at n'est qu'un
    // départage de second rang).
    const map = calculerRelevesParOt([
      ligne({
        ot: 'ot-a',
        src: 'c1',
        val: 100,
        date: '2026-01-01',
        dateExec: '2026-01-05',
        creeLe: '2026-01-05T10:00:00Z',
      }),
      ligne({
        ot: 'ot-b',
        src: 'c1',
        val: 130,
        date: '2026-02-01',
        dateExec: '2026-02-05',
        creeLe: '2026-01-01T10:00:00Z',
      }),
      ligne({
        ot: 'ot-c',
        src: 'c1',
        val: 200,
        date: '2026-03-01',
        dateExec: '2026-03-05',
        creeLe: '2026-03-05T10:00:00Z',
      }),
    ])
    expect(map.get('ot-c')).toEqual(RECENT)
    expect(map.get('ot-c')).not.toEqual(TROP_ANCIEN)
  })

  it('le choix ne dépend pas de l’ordre d’arrivée des lignes', () => {
    // Mêmes données que ci-dessus, relevés fournis du plus récent au plus
    // ancien. ORACLE : la comparaison est un ORDRE, pas un « dernier vu gagne ».
    const map = calculerRelevesParOt([
      ligne({
        ot: 'ot-b',
        src: 'c1',
        val: 130,
        date: '2026-02-01',
        dateExec: '2026-02-05',
        creeLe: '2026-01-01T10:00:00Z',
      }),
      ligne({
        ot: 'ot-a',
        src: 'c1',
        val: 100,
        date: '2026-01-01',
        dateExec: '2026-01-05',
        creeLe: '2026-01-05T10:00:00Z',
      }),
      ligne({
        ot: 'ot-c',
        src: 'c1',
        val: 200,
        date: '2026-03-01',
        dateExec: '2026-03-05',
        creeLe: '2026-03-05T10:00:00Z',
      }),
    ])
    expect(map.get('ot-c')).toEqual(RECENT)
  })

  it('à date d’exécution ÉGALE, départage par l’horodatage de création', () => {
    // ORACLE (doc de `plusRecent`) : « même ordre que la requête
    // previousReadings » = (date_execution NULLS LAST, created_at). Deux relevés
    // saisis pour le même jour d'exécution : le dernier ENREGISTRÉ fait foi.
    const map = calculerRelevesParOt([
      ligne({
        ot: 'ot-a',
        src: 'c1',
        val: 100,
        date: '2026-01-01',
        dateExec: '2026-01-15',
        creeLe: '2026-01-15T08:00:00Z',
      }),
      ligne({
        ot: 'ot-b',
        src: 'c1',
        val: 130,
        date: '2026-02-01',
        dateExec: '2026-01-15',
        creeLe: '2026-01-15T09:00:00Z',
      }),
      ligne({ ot: 'ot-c', src: 'c1', val: 200, date: '2026-03-01' }),
    ])
    expect(map.get('ot-c')).toEqual(RECENT)
  })

  it('le départage par horodatage ne dépend pas non plus de l’ordre d’arrivée', () => {
    const map = calculerRelevesParOt([
      ligne({
        ot: 'ot-b',
        src: 'c1',
        val: 130,
        date: '2026-02-01',
        dateExec: '2026-01-15',
        creeLe: '2026-01-15T09:00:00Z',
      }),
      ligne({
        ot: 'ot-a',
        src: 'c1',
        val: 100,
        date: '2026-01-01',
        dateExec: '2026-01-15',
        creeLe: '2026-01-15T08:00:00Z',
      }),
      ligne({ ot: 'ot-c', src: 'c1', val: 200, date: '2026-03-01' }),
    ])
    expect(map.get('ot-c')).toEqual(RECENT)
  })

  it('à horodatages strictement identiques, le résultat reste stable', () => {
    // ORACLE : « plus récent que » est un ordre STRICT — un relevé n'est jamais
    // plus récent qu'un autre de mêmes date d'exécution ET date de création.
    // Le premier rencontré est donc conservé, et le calcul est reproductible
    // (sans quoi deux rendus de la même liste pourraient différer).
    const memes = { dateExec: '2026-01-15', creeLe: '2026-01-15T08:00:00Z' }
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot-a', src: 'c1', val: 100, date: '2026-01-01', ...memes }),
      ligne({ ot: 'ot-b', src: 'c1', val: 130, date: '2026-02-01', ...memes }),
      ligne({ ot: 'ot-c', src: 'c1', val: 200, date: '2026-03-01' }),
    ])
    expect(map.get('ot-c')).toEqual(TROP_ANCIEN)
  })

  it('un relevé SANS date d’exécution passe après un relevé daté (NULLS LAST)', () => {
    // ORACLE (doc de `plusRecent`) : ordre « date_execution NULLS LAST ». Un
    // relevé antérieur jamais exécuté ne peut pas évincer un relevé exécuté,
    // même si sa ligne a été créée plus tard. 200 − 100 = 100 : c'est le relevé
    // DATÉ qui sert de base, dans les deux ordres d'arrivée possibles.
    const nonDate = {
      ot: 'ot-b',
      src: 'c1',
      val: 130,
      date: '2026-02-01',
      dateExec: null,
      creeLe: '2026-02-20T10:00:00Z',
    }
    const date = {
      ot: 'ot-a',
      src: 'c1',
      val: 100,
      date: '2026-01-01',
      dateExec: '2026-01-10',
      creeLe: '2026-01-10T10:00:00Z',
    }
    const courant = { ot: 'ot-c', src: 'c1', val: 200, date: '2026-03-01' }
    expect(
      calculerRelevesParOt([ligne(date), ligne(nonDate), ligne(courant)]).get(
        'ot-c',
      ),
    ).toEqual(TROP_ANCIEN)
    expect(
      calculerRelevesParOt([ligne(nonDate), ligne(date), ligne(courant)]).get(
        'ot-c',
      ),
    ).toEqual(TROP_ANCIEN)
  })

  it('un relevé plus récent mais SANS valeur ne masque pas le dernier relevé chiffré', () => {
    // ORACLE (doc) : le précédent est le dernier relevé « terminé ET VALUÉ ».
    // Un passage où le compteur n'a pas pu être lu ne doit pas rendre la
    // consommation incalculable : on remonte au dernier index réellement relevé.
    // 200 − 100 = 100.
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot-a', src: 'c1', val: 100, date: '2026-01-01' }),
      ligne({ ot: 'ot-b', src: 'c1', val: null, date: '2026-02-01' }),
      ligne({ ot: 'ot-c', src: 'c1', val: 200, date: '2026-03-01' }),
    ])
    expect(map.get('ot-c')).toEqual(TROP_ANCIEN)
    expect(map.has('ot-b')).toBe(false)
  })

  it('un OT sans date prévue n’a pas de base de comparaison', () => {
    // ORACLE (doc) : le précédent se cherche « sur un OT STRICTEMENT antérieur
    // (par date prévue) ». Sans date prévue, l'antériorité est indéterminable →
    // aucune consommation, plutôt qu'une consommation prise au hasard.
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot-a', src: 'c1', val: 100, date: '2026-01-01' }),
      ligne({ ot: 'ot-b', src: 'c1', val: 130, date: null }),
    ])
    expect(map.has('ot-b')).toBe(false)
  })

  it('un relevé antérieur sans date prévue n’est pas retenu comme précédent', () => {
    // ORACLE (symétrique du précédent) : l'antériorité doit être PROUVÉE. Un
    // candidat dont l'OT n'a pas de date prévue ne peut pas l'être.
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot-a', src: 'c1', val: 100, date: null }),
      ligne({ ot: 'ot-b', src: 'c1', val: 200, date: '2026-03-01' }),
    ])
    expect(map.has('ot-b')).toBe(false)
  })

  it('deux gammes ne se servent jamais de précédent l’une à l’autre', () => {
    // ORACLE (doc de `cleSource`) : la série d'un compteur est identifiée par
    // (gamme, source). Un relevé d'une AUTRE gamme, même sur la même source,
    // décrit un autre suivi : l'emprunter fabriquerait une consommation fausse
    // (ici 200 − 50 = 150, qui n'a aucun sens physique).
    const map = calculerRelevesParOt([
      ligne({
        ot: 'ot-a',
        gamme: 'g2',
        src: 'c1',
        val: 50,
        date: '2026-01-01',
      }),
      ligne({
        ot: 'ot-b',
        gamme: 'g1',
        src: 'c1',
        val: 200,
        date: '2026-03-01',
      }),
    ])
    expect(map.has('ot-b')).toBe(false)
  })

  it('un compteur sans historique indexé ne fait pas tomber le calcul des autres', () => {
    // ORACLE (robustesse) : la source « zz » n'a qu'un relevé non valué, donc
    // aucune entrée dans l'index des précédents. Le calcul doit l'ignorer et
    // rendre la consommation du compteur c1 : 130 − 100 = 30.
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot-a', src: 'c1', val: 100, date: '2026-01-01' }),
      ligne({ ot: 'ot-b', src: 'c1', val: 130, date: '2026-02-01' }),
      ligne({ ot: 'ot-b', src: 'zz', val: null, date: '2026-02-01' }),
    ])
    expect(map.get('ot-b')).toEqual({ valeur: '130 kWh', conso: '+30 kWh' })
  })

  it('des relevés ORPHELINS (sans opération source) forment quand même une série', () => {
    // ORACLE (doc de `cleSource` + données réelles, migration 063) : un relevé
    // dont l'opération source a été supprimée porte `source_id = NULL`. Deux
    // relevés orphelins de la même gamme et du même type restent le suivi d'un
    // même compteur : 200 − 150 = 50.
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot-a', src: null, val: 150, date: '2026-01-01' }),
      ligne({ ot: 'ot-b', src: null, val: 200, date: '2026-02-01' }),
    ])
    expect(map.get('ot-b')).toEqual({ valeur: '200 kWh', conso: '+50 kWh' })
  })

  it('un relevé dont la jointure OT est absente est ignoré sans erreur', () => {
    // ORACLE (robustesse) : la jointure `ordres_travail` est nullable côté type
    // (gamme supprimée, ligne orpheline). Le pipeline doit l'écarter, pas
    // planter la liste entière des OT.
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot-a', src: 'c1', val: 100, date: '2026-01-01' }),
      ligne({ ot: 'ot-b', src: 'c1', val: 130, date: '2026-02-01' }),
      ligne({ ot: 'ot-orphelin', src: 'c1', val: 999, sansOt: true }),
    ])
    expect(map.get('ot-b')).toEqual({ valeur: '130 kWh', conso: '+30 kWh' })
    expect(map.has('ot-orphelin')).toBe(false)
  })
})

describe('calculerRelevesParOt — agrégation par unité', () => {
  it('un relevé sans unité n’est pas agrégé (ni sous une unité vide)', () => {
    // ORACLE (doc de `sommesReleves`) : « Jamais de somme entre unités
    // différentes » — et une unité ABSENTE n'est pas une unité. Un relevé sans
    // symbole ne doit apparaître ni seul, ni fondu dans un autre total.
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot-a', src: 'c1', val: 100, date: '2026-01-01' }),
      ligne({
        ot: 'ot-a',
        src: 'c2',
        val: 40,
        date: '2026-01-01',
        symbole: null,
      }),
      ligne({ ot: 'ot-b', src: 'c1', val: 130, date: '2026-02-01' }),
      ligne({
        ot: 'ot-b',
        src: 'c2',
        val: 55,
        date: '2026-02-01',
        symbole: null,
      }),
    ])
    // Seul le compteur kWh compte : 130 brut, 130 − 100 = 30 de consommation.
    expect(map.get('ot-b')).toEqual({ valeur: '130 kWh', conso: '+30 kWh' })
  })

  it('deux unités sont affichées séparément, jointes par « · », au format français', () => {
    // ORACLE arithmétique : kWh 130 − 100 = 30 ; m³ 32,5 − 20 = 12,5. Les deux
    // totaux restent distincts (jamais 42,5) et la décimale s'écrit à la
    // française (virgule), comme partout dans l'app.
    const map = calculerRelevesParOt([
      ligne({ ot: 'ot-a', src: 'c1', val: 100, date: '2026-01-01' }),
      ligne({
        ot: 'ot-a',
        src: 'c2',
        val: 20,
        date: '2026-01-01',
        symbole: 'm³',
      }),
      ligne({ ot: 'ot-b', src: 'c1', val: 130, date: '2026-02-01' }),
      ligne({
        ot: 'ot-b',
        src: 'c2',
        val: 32.5,
        date: '2026-02-01',
        symbole: 'm³',
      }),
    ])
    expect(map.get('ot-b')).toEqual({
      valeur: '130 kWh · 32,5 m³',
      conso: '+30 kWh · +12,5 m³',
    })
  })
})

describe('libelleReleve', () => {
  it('somme par unité et formate « total symbole », unités jointes par « · »', () => {
    // ORACLE arithmétique : kWh 30 + 50 = 80 ; m³ 12,5 + 0,25 = 12,75 (écrit à
    // la française). Deux occurrences par unité → le seuil par défaut (2) est
    // atteint pour chacune.
    expect(
      libelleReleve([
        { symbole: 'kWh', conso: 30 },
        { symbole: 'kWh', conso: 50 },
        { symbole: 'm³', conso: 12.5 },
        { symbole: 'm³', conso: 0.25 },
      ]),
    ).toBe('80 kWh · 12,75 m³')
  })

  it('par défaut, une unité vue une seule fois n’est pas affichée', () => {
    // ORACLE (doc) : « minOccurrences = 2 » par défaut — la carte d'EN-TÊTE
    // d'un OT ne somme pas un compteur isolé. Avec le seuil abaissé à 1, les
    // mêmes données s'affichent.
    const items = [
      { symbole: 'kWh', conso: 30 },
      { symbole: 'm³', conso: 12 },
    ]
    expect(libelleReleve(items)).toBe('')
    expect(libelleReleve(items, 1)).toBe('30 kWh · 12 m³')
  })

  it('rien à afficher rend la chaîne vide', () => {
    // ORACLE (doc) : « Renvoie '' si rien à afficher ».
    expect(libelleReleve([])).toBe('')
    expect(
      libelleReleve([
        { symbole: 'kWh', conso: null },
        { symbole: 'kWh', conso: null },
      ]),
    ).toBe('')
  })
})

describe('corrélation de repli par le nom (ADR 0012)', () => {
  // Le cas réel des 53 exécutions en production : l'opération d'origine a été
  // supprimée du modèle, et chaque exécution porte un `source_id` qui n'appartient
  // qu'à elle (séquelle de l'import 061 que la migration 063 n'a pas pu repointer).
  // Sans le repli, chaque relevé est une série d'un seul élément : aucune conso.
  it('recolle deux relevés du même compteur dont les source_id sont isolés', () => {
    const map = calculerRelevesParOt([
      ligne({
        ot: 'ot1',
        src: 'id-unique-a',
        nom: 'Relevé compteur eau',
        val: 100,
        date: '2026-01-01',
      }),
      ligne({
        ot: 'ot2',
        src: 'id-unique-b',
        nom: 'Relevé compteur eau',
        val: 130,
        date: '2026-02-01',
      }),
    ])
    expect(map.get('ot2')).toEqual({ valeur: '130 kWh', conso: '+30 kWh' })
  })

  it('tolère la casse et les espaces dans le nom recollé', () => {
    const map = calculerRelevesParOt([
      ligne({
        ot: 'ot1',
        src: 'a',
        nom: 'Relevé  COMPTEUR eau ',
        val: 100,
        date: '2026-01-01',
      }),
      ligne({
        ot: 'ot2',
        src: 'b',
        nom: 'relevé compteur eau',
        val: 130,
        date: '2026-02-01',
      }),
    ])
    expect(map.get('ot2')).toEqual({ valeur: '130 kWh', conso: '+30 kWh' })
  })

  // La provenance reste la clé de référence : quand elle rattache, le repli ne
  // doit jamais s'en mêler. C'est ce qui protège les huit séries dont l'opération
  // a été renommée en cours de route.
  it('un renommage ne casse pas la série tant que la provenance rattache', () => {
    const map = calculerRelevesParOt([
      ligne({
        ot: 'ot1',
        src: 'meme-source',
        nom: 'Essai de manœuvre manuelle',
        val: 100,
        date: '2026-01-01',
      }),
      ligne({
        ot: 'ot2',
        src: 'meme-source',
        nom: 'Essai manœuvre CCF',
        val: 130,
        date: '2026-02-01',
      }),
    ])
    expect(map.get('ot2')).toEqual({ valeur: '130 kWh', conso: '+30 kWh' })
  })

  // Le repli ne doit pas rapprocher deux compteurs DIFFÉRENTS qui partageraient
  // un nom dans deux gammes distinctes.
  it('ne recolle pas deux homonymes de gammes différentes', () => {
    const map = calculerRelevesParOt([
      ligne({
        ot: 'ot1',
        src: 'a',
        nom: 'Relevé compteur',
        val: 100,
        gamme: 'g1',
        date: '2026-01-01',
      }),
      ligne({
        ot: 'ot2',
        src: 'b',
        nom: 'Relevé compteur',
        val: 130,
        gamme: 'g2',
        date: '2026-02-01',
      }),
    ])
    // Aucun précédent dans sa propre gamme → aucune conso calculable.
    expect(map.has('ot2')).toBe(false)
  })
})
