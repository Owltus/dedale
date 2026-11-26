// Tests des gestes Claude sur le parc (186) : schémas (plafonds identiques au
// SQL), traduction vers le format de la base, résolution par nom et rendu des
// aperçus. Aucun réseau : la base est remplacée par un faux client.

import { assert, assertEquals, assertMatch, assertThrows } from 'jsr:@std/assert@1'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { type Contexte, executerOutil, OUTILS } from './outils.ts'
import { ErreurOutil } from './commun.ts'
import {
  choisir,
  PLAFONDS,
  pluriel,
  presenterDeploiement,
  presenterModeleCree,
  selection,
  versChamp,
} from './outils-ecriture-equipements.ts'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const SITE_A = { id: ID(1), nom: 'Hôtel Alpha' }
const SITE_B = { id: ID(2), nom: 'Hôtel Bêta' }
const outil = (nom: string) => OUTILS.find((o) => o.name === nom)!
const valide = (nom: string, args: Record<string, unknown>) => outil(nom).schema.safeParse(args).success

// ─── Faux client : lignes fixes par table, RPC notées ────────────────────────

function fauxContexte(tablesDonnees: Record<string, unknown>, rpcs: Record<string, unknown>) {
  const tables: Record<string, unknown> = { users: { acces_ia_ecriture: true }, ...tablesDonnees }
  const appels: { nom: string; params: unknown }[] = []
  const constructeur = (table: string): unknown =>
    new Proxy({}, {
      get(_c, methode) {
        if (methode === 'then') {
          return (ok: (r: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok)
        }
        return () => constructeur(table)
      },
    })
  const toutes: Record<string, unknown> = { current_role: 'technicien', get_my_sites: [SITE_A, SITE_B], ...rpcs }
  const supabase = {
    from: (table: string) => constructeur(table),
    rpc: (nom: string, params?: unknown) => {
      appels.push({ nom, params })
      const r = { data: toutes[nom] ?? null, error: null }
      return { select: () => Promise.resolve(r), then: (ok: (x: unknown) => unknown) => Promise.resolve(r).then(ok) }
    },
  }
  return { ctx: { supabase: supabase as unknown as SupabaseClient, userId: ID(999) } as Contexte, appels }
}

/** Chaînes de la réponse, avec la clé qui les porte. */
function chaines(v: unknown, cle = ''): [string, string][] {
  if (typeof v === 'string') return [[cle, v]]
  if (Array.isArray(v)) return v.flatMap((x) => chaines(x, cle))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => chaines(x, k))
  return []
}

// ─── Schémas ─────────────────────────────────────────────────────────────────

Deno.test('gestes du parc : écriture, déploiement et annulation marqués sensibles', () => {
  assertEquals(outil('creer_modele_equipement').annotations.readOnlyHint, false)
  assertEquals(outil('creer_modele_equipement').annotations.destructiveHint, false)
  for (const nom of ['deployer_equipements', 'annuler_deploiement']) {
    assertEquals(outil(nom).annotations.readOnlyHint, false, nom)
    assertEquals(outil(nom).annotations.destructiveHint, true, nom)
  }
})

Deno.test('deployer_equipements : un bâtiment OU des lieux, plafonds du SQL', () => {
  const f = { flotte: 'Détecteur' }
  assert(valide('deployer_equipements', { ...f, batiment: 'Bat A' }))
  assert(valide('deployer_equipements', { ...f, batiment: 'Bat A', niveau: 'R+2', type_lieu: 'Chambre' }))
  assert(valide('deployer_equipements', { ...f, local_ids: [ID(3)] }))
  assert(!valide('deployer_equipements', f), 'ni bâtiment ni lieux')
  assert(!valide('deployer_equipements', { ...f, batiment: 'Bat A', local_ids: [ID(3)] }), 'les deux')
  assert(!valide('deployer_equipements', { ...f, local_ids: [ID(3)], niveau: 'R+2' }), 'niveau sans bâtiment')
  assert(!valide('deployer_equipements', { ...f, local_ids: ['Chambre 214'] }), 'identifiant invalide')
  const lieux = (n: number) => Array.from({ length: n }, (_, i) => ID(1000 + i))
  assert(valide('deployer_equipements', { ...f, local_ids: lieux(PLAFONDS.lieux) }))
  assert(!valide('deployer_equipements', { ...f, local_ids: lieux(PLAFONDS.lieux + 1) }), '501 lieux')
  const plans = (n: number) => Array.from({ length: n }, (_, i) => `Plan ${i}`)
  assert(valide('deployer_equipements', { ...f, batiment: 'A', plans_maintenance: plans(20) }))
  assert(!valide('deployer_equipements', { ...f, batiment: 'A', plans_maintenance: plans(21) }))
  const valeurs = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`C${i}`, i]))
  assert(valide('deployer_equipements', { ...f, batiment: 'A', valeurs: valeurs(40) }))
  assert(!valide('deployer_equipements', { ...f, batiment: 'A', valeurs: valeurs(41) }))
  assert(valide('deployer_equipements', { ...f, batiment: 'A', valeurs: { ZDM: { a: '3', b: '12' }, Pose: null } }))
  assert(!valide('deployer_equipements', { ...f, batiment: 'A', valeurs: { ZDM: { a: '3', b: '12', c: 1 } } }))
  assertEquals(PLAFONDS.lieux, 500)
})

Deno.test('annuler_deploiement : rang 1 à 20', () => {
  assert(valide('annuler_deploiement', { flotte: 'Détecteur' }))
  assert(valide('annuler_deploiement', { flotte: 'Détecteur', rang: 20 }))
  assert(!valide('annuler_deploiement', { flotte: 'Détecteur', rang: 0 }))
  assert(!valide('annuler_deploiement', { flotte: 'Détecteur', rang: 21 }))
})

Deno.test('creer_modele_equipement : caractéristiques contrôlées, 40 au plus, libellés uniques', () => {
  const base = { nom: 'Détecteur DO-200', categorie: 'Sécurité incendie' }
  assert(valide('creer_modele_equipement', base))
  assert(!valide('creer_modele_equipement', { ...base, nom: 'x'.repeat(121) }))
  assert(!valide('creer_modele_equipement', { ...base, description: 'x'.repeat(2001) }))
  const c = (n: number) => Array.from({ length: n }, (_, i) => ({ libelle: `C${i}`, type: 'texte' }))
  assert(valide('creer_modele_equipement', { ...base, caracteristiques: c(40) }))
  assert(!valide('creer_modele_equipement', { ...base, caracteristiques: c(41) }))
  assert(
    !valide('creer_modele_equipement', {
      ...base,
      caracteristiques: [{ libelle: 'A', type: 'texte' }, { libelle: 'a ', type: 'nombre' }],
    }),
  )
  assert(
    !valide('creer_modele_equipement', { ...base, caracteristiques: [{ libelle: 'Techno', type: 'liste' }] }),
    'liste sans choix',
  )
  assert(
    !valide('creer_modele_equipement', { ...base, caracteristiques: [{ libelle: 'ZDM', type: 'double-reference' }] }),
    'double référence sans parts',
  )
  assert(!valide('creer_modele_equipement', { ...base, caracteristiques: [{ libelle: 'X', type: 'couleur' }] }))
  assert(
    !valide('creer_modele_equipement', { ...base, caracteristiques: [{ libelle: 'X', type: 'texte', valeur: 'x' }] }),
    'valeur interdite',
  )
})

// ─── Traductions ─────────────────────────────────────────────────────────────

Deno.test('versChamp : format du front (serializeChamps), champs hors type écartés', () => {
  assertEquals(versChamp({ libelle: 'Numéro', type: 'texte', requis: true }), {
    cle: 'Numéro',
    type: 'texte',
    requis: true,
    defaut: null,
  })
  assertEquals(versChamp({ libelle: 'Puissance', type: 'nombre', unite: 'kW', requis: false, defaut: 2.5 }), {
    cle: 'Puissance',
    type: 'nombre',
    unite: 'kW',
    requis: false,
    defaut: 2.5,
  })
  assertEquals(versChamp({ libelle: 'Raccordé', type: 'oui-non', requis: true, unite: 'x' }), {
    cle: 'Raccordé',
    type: 'oui-non',
    requis: false,
    defaut: null,
  })
  assertEquals(versChamp({ libelle: 'ZDM', type: 'double-reference', parts: ['Zone', ''], requis: false }), {
    cle: 'ZDM',
    type: 'double-reference',
    libelleA: 'Zone',
    requis: false,
    defaut: null,
  })
  assertEquals(
    versChamp({ libelle: 'Techno', type: 'liste', options: ['Optique'], requis: false, defaut: 'Optique' }),
    {
      cle: 'Techno',
      type: 'liste',
      options: ['Optique'],
      requis: false,
      defaut: 'Optique',
    },
  )
})

Deno.test('selection : ce que la base attend (type_lieu → type_local)', () => {
  assertEquals(selection({ local_ids: [ID(3)] }), { local_ids: [ID(3)] })
  assertEquals(selection({ batiment: 'Bat A' }), { batiment: 'Bat A' })
  assertEquals(selection({ batiment: 'Bat A', niveau: 'R+2', type_lieu: 'Chambre' }), {
    batiment: 'Bat A',
    niveau: 'R+2',
    type_local: 'Chambre',
  })
})

Deno.test('choisir : égalité, puis seul nom qui contient, sinon refus listant les candidats', () => {
  const noms = ['Détecteur', 'Détecteur optique', 'Extincteur CO2']
  const id = (n: string) => n
  assertEquals(choisir('flotte', ' détecteur ', noms, id), 'Détecteur')
  assertEquals(choisir('flotte', 'co2', noms, id), 'Extincteur CO2')
  const ambigu = assertThrows(() => choisir('flotte', 'teur', noms, id), ErreurOutil)
  assertMatch(ambigu.message, /ambigu : 3 flottes correspondent/)
  const aucun = assertThrows(() => choisir('flotte', 'BAES', noms, id), ErreurOutil)
  assertMatch(aucun.message, /Aucun\(e\) flotte.*Possibles : « Détecteur »/)
  const lieux = assertThrows(() => choisir('lieu', 'r', ['Réserve', 'Remise'], id), ErreurOutil)
  assertMatch(lieux.message, /2 lieux correspondent/)
  assertEquals(pluriel('plan de maintenance'), 'plans de maintenance')
  assertEquals(pluriel('niveau'), 'niveaux')
})

// ─── Rendu ───────────────────────────────────────────────────────────────────

Deno.test('aperçu de déploiement : caractéristiques lisibles, aucun identifiant', () => {
  const r = presenterDeploiement({
    flotte: 'Détecteur',
    exemples: [{
      lieu: 'Chambre 214',
      libelle: 'Détecteur Chambre 214',
      specifications: {
        champs: [
          { cle: 'Numéro', type: 'texte', valeur: 'Chambre 214' },
          { cle: 'Puissance', type: 'nombre', unite: 'kW', valeur: 2.5 },
          { cle: 'ZDM', type: 'double-reference', libelleA: 'Zone', valeur: { a: '3', b: '12' } },
          { cle: 'Raccordé', type: 'oui-non', valeur: true },
        ],
      },
    }],
  })
  assertEquals(r.exemples, [{
    lieu: 'Chambre 214',
    nom: 'Détecteur Chambre 214',
    caracteristiques: { Numéro: 'Chambre 214', Puissance: '2.5 kW', ZDM: '3/12', Raccordé: 'Oui' },
  }])
  const m = presenterModeleCree({
    modele: {
      nom: 'DO-200',
      specifications: {
        champs: [{ cle: 'Techno', type: 'liste', options: ['Optique'], requis: true, defaut: 'Optique' }],
      },
    },
  })
  assertEquals((m.modele as Record<string, unknown>).gabarit, [
    { libelle: 'Techno', type: 'Liste', options: ['Optique'], requis: true, defaut: 'Optique' },
  ])
  assert(!('specifications' in (m.modele as Record<string, unknown>)))
})

// ─── Bout en bout (faux client) ──────────────────────────────────────────────

const FLOTTES = [
  { id: ID(10), nom: 'Détecteur', site_id: SITE_A.id, parent: { nom: 'Sécurité incendie' } },
  { id: ID(11), nom: 'Détecteur', site_id: SITE_B.id, parent: { nom: 'Sécurité incendie' } },
]
const APERCU = {
  mode: 'aperçu (rien n’est enregistré)',
  code_confirmation: 'ABCD1234',
  site: SITE_A.nom,
  flotte: 'Détecteur',
  lieux: 2,
  a_creer: 2,
  exemples: [{ lieu: 'Chambre 214', libelle: 'Détecteur Chambre 214', specifications: { champs: [] } }],
  plans_maintenance: [{ nom: 'Contrôle annuel SSI', ot_ouverts: 1, operations_ajoutees_ot_ouverts: 2 }],
  alertes: [],
}

Deno.test('deployer_equipements (faux client) : flotte ambiguë entre deux sites refusée', async () => {
  const { ctx, appels } = fauxContexte({ categories: FLOTTES }, {})
  const r = await executerOutil('deployer_equipements', { flotte: 'Détecteur', batiment: 'Bat A' }, ctx)
  assertEquals(r.isError, true)
  assertMatch(r.content[0].text, /ambigu.*Hôtel Alpha.*Hôtel Bêta/)
  assert(!appels.some((a) => a.nom === 'claude_deployer_equipements'), 'aucune écriture tentée')
})

Deno.test('deployer_equipements (faux client) : noms résolus, sélection et gammes transmises, consigne d’aperçu', async () => {
  const { ctx, appels } = fauxContexte({
    categories: FLOTTES,
    gammes: [{ id: ID(20), nom: 'Contrôle annuel SSI' }, { id: ID(21), nom: 'Contrôle semestriel' }],
  }, { claude_deployer_equipements: APERCU })
  const r = await executerOutil('deployer_equipements', {
    flotte: 'détecteur',
    site: 'Alpha',
    batiment: 'Bat A',
    niveau: 'R+2',
    plans_maintenance: ['annuel'],
  }, ctx)
  assertEquals(r.isError, undefined, r.content[0].text)
  const appel = appels.find((a) => a.nom === 'claude_deployer_equipements')!
  assertEquals(appel.params, {
    p_categorie_id: ID(10),
    p_selection: { batiment: 'Bat A', niveau: 'R+2' },
    p_valeurs: null,
    p_gamme_ids: [ID(20)],
    p_ignorer_doublons: true,
    p_appliquer: false,
    p_code: null,
  })
  const donnees = JSON.parse(r.content[0].text)
  assertMatch(donnees.consigne, /APERÇU SEULEMENT.*code=ABCD1234/)
  for (const [cle, texte] of chaines(donnees)) assert(!UUID.test(texte), `identifiant sous « ${cle} »`)
})

Deno.test('creer_modele_equipement (faux client) : site unique exigé, catégorie du site préférée au commun', async () => {
  const sansSite = fauxContexte({}, {})
  const r1 = await executerOutil('creer_modele_equipement', { nom: 'DO-200', categorie: 'Incendie' }, sansSite.ctx)
  assertMatch(r1.content[0].text, /Précise le site/)

  const { ctx, appels } = fauxContexte({
    categories: [
      { id: ID(30), nom: 'Incendie', site_id: null },
      { id: ID(31), nom: 'Incendie', site_id: SITE_A.id },
    ],
  }, { claude_creer_modele_equipement: { code_confirmation: 'ABCD1234', modele: { nom: 'DO-200' } } })
  const r2 = await executerOutil('creer_modele_equipement', {
    site: 'Alpha',
    nom: 'DO-200',
    categorie: 'incendie',
    creer_flotte: false,
    caracteristiques: [{ libelle: 'Numéro', type: 'texte', requis: true }],
  }, ctx)
  assertEquals(r2.isError, undefined, r2.content[0].text)
  const p = appels.find((a) => a.nom === 'claude_creer_modele_equipement')!.params as Record<string, unknown>
  assertEquals(p.p_categorie_id, ID(31))
  assertEquals(p.p_site_id, SITE_A.id)
  assertEquals(p.p_champs, [{ cle: 'Numéro', type: 'texte', requis: true, defaut: null }])
  assertEquals(p.p_flotte_parent_id, null)

  const r3 = await executerOutil(
    'creer_modele_equipement',
    { site: 'Alpha', nom: 'DO-200', categorie: 'incendie' },
    ctx,
  )
  assertMatch(r3.content[0].text, /catégorie de parc/)
})

Deno.test('gestes du parc (faux client) : lecture seule et rôle sans droit refusés avant toute résolution', async () => {
  for (
    const [tables, rpcs, motif] of [
      [{ users: { acces_ia_ecriture: false } }, {}, /lecture seule/],
      [{}, { current_role: 'demandeur' }, /Ton rôle ne permet pas/],
    ] as const
  ) {
    const { ctx, appels } = fauxContexte(tables, rpcs)
    for (
      const [nom, args] of [
        ['creer_modele_equipement', { site: 'Alpha', nom: 'DO-200', categorie: 'Incendie' }],
        ['deployer_equipements', { flotte: 'Détecteur', batiment: 'Bat A' }],
        ['annuler_deploiement', { flotte: 'Détecteur' }],
      ] as const
    ) {
      const r = await executerOutil(nom, args, ctx)
      assertEquals(r.isError, true, nom)
      assertMatch(r.content[0].text, motif)
    }
    assert(!appels.some((a) => a.nom.startsWith('claude_')), 'aucun geste tenté')
  }
})

Deno.test('creer_modele_equipement (faux client) : commun réservé à l’admin et au manager, sans site ni flotte', async () => {
  const categories = [
    { id: ID(30), nom: 'Incendie', site_id: null },
    { id: ID(31), nom: 'Incendie', site_id: SITE_A.id },
  ]
  const tech = fauxContexte({ categories }, {})
  const r1 = await executerOutil(
    'creer_modele_equipement',
    { commun: true, nom: 'DO-200', categorie: 'Incendie' },
    tech.ctx,
  )
  assertEquals(r1.isError, true)
  assertMatch(r1.content[0].text, /réservé aux administrateurs et managers/)
  assert(!tech.appels.some((a) => a.nom.startsWith('claude_')), 'aucun geste tenté')

  const { ctx, appels } = fauxContexte({ categories }, {
    current_role: 'manager',
    claude_creer_modele_equipement: { code_confirmation: 'ABCD1234', modele: { nom: 'DO-200' } },
  })
  const r2 = await executerOutil('creer_modele_equipement', {
    commun: true,
    nom: 'DO-200',
    categorie: 'incendie',
    categorie_parc: 'Sécurité incendie',
  }, ctx)
  assertMatch(r2.content[0].text, /ni site, ni flotte/)
  const r3 = await executerOutil('creer_modele_equipement', { commun: true, nom: 'DO-200', categorie: 'incendie' }, ctx)
  assertEquals(r3.isError, undefined, r3.content[0].text)
  const p = appels.find((a) => a.nom === 'claude_creer_modele_equipement')!.params as Record<string, unknown>
  assertEquals(p.p_site_id, null)
  assertEquals(p.p_categorie_id, ID(30), 'catégorie du commun')
  assertEquals(p.p_creer_flotte, false)
  assertEquals(p.p_flotte_parent_id, null)
})
