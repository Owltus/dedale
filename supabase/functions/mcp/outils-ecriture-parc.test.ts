// Tests des gestes Claude sur la Bibliothèque et le parc existant (188, 190) :
// schémas (plafonds identiques au SQL), résolution par nom, traduction vers la
// base, rendu des aperçus, refus de rôle et de lecture seule. Aucun réseau : la
// base est remplacée par un faux client.

import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { type Contexte, executerOutil, OUTILS } from './outils.ts'
import { PLAFONDS } from './outils-ecriture-equipements.ts'
import { presenterAvantApres, presenterGabaritModifie, selectionFacultative } from './outils-ecriture-parc.ts'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const SITE_A = { id: ID(1), nom: 'Hôtel Alpha' }
const SITE_B = { id: ID(2), nom: 'Hôtel Bêta' }
const outil = (nom: string) => OUTILS.find((o) => o.name === nom)!
const valide = (nom: string, args: Record<string, unknown>) => outil(nom).schema.safeParse(args).success
const GESTES = [
  'installer_modele',
  'modifier_modele',
  'modifier_flotte',
  'modifier_equipements',
  'deplacer_equipements',
  'rattacher_plan',
  'supprimer_equipements',
]

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

function chaines(v: unknown, cle = ''): [string, string][] {
  if (typeof v === 'string') return [[cle, v]]
  if (Array.isArray(v)) return v.flatMap((x) => chaines(x, cle))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => chaines(x, k))
  return []
}
const sansIdentifiant = (v: unknown) => {
  for (const [cle, texte] of chaines(v)) assert(!UUID.test(texte), `identifiant sous « ${cle} »`)
}
const params = (appels: { nom: string; params: unknown }[], nom: string) =>
  appels.find((a) => a.nom === nom)?.params as Record<string, unknown>

const APERCU = { mode: 'aperçu (rien n’est enregistré)', code_confirmation: 'ABCD1234', site: SITE_A.nom, alertes: [] }
const FLOTTES = [
  { id: ID(10), nom: 'Détecteur', site_id: SITE_A.id, parent: { nom: 'Sécurité incendie' } },
  { id: ID(11), nom: 'Détecteur', site_id: SITE_B.id, parent: { nom: 'Sécurité incendie' } },
]

// ─── Schémas ─────────────────────────────────────────────────────────────────

Deno.test('gestes de la Bibliothèque et du parc : écriture ; seule la suppression est sensible', () => {
  for (const nom of GESTES) {
    assertEquals(outil(nom).annotations.readOnlyHint, false, nom)
    assertEquals(outil(nom).annotations.destructiveHint, nom === 'supprimer_equipements', nom)
  }
})

Deno.test('installer_modele : nom du modèle obligatoire, plafonds du SQL', () => {
  assert(valide('installer_modele', { modele: 'DO-200' }))
  assert(!valide('installer_modele', {}))
  assert(!valide('installer_modele', { modele: 'x'.repeat(PLAFONDS.nom + 1) }))
  assert(!valide('installer_modele', { modele: 'DO-200', nom_flotte: 'x'.repeat(PLAFONDS.nom + 1) }))
  assert(!valide('installer_modele', { modele: 'DO-200', valeur_principale: 'x'.repeat(61) }))
})

Deno.test('modifier_modele et modifier_flotte : au moins un changement, gabarit contrôlé', () => {
  assert(!valide('modifier_modele', { modele: 'DO-200' }), 'rien à modifier')
  assert(valide('modifier_modele', { modele: 'DO-200', actif: false }))
  assert(valide('modifier_modele', { modele: 'DO-200', description: '' }), 'description vide = effacée')
  assert(valide('modifier_modele', { modele: 'DO-200', origine: 'commun', nom: 'DO-300' }))
  assert(!valide('modifier_modele', { modele: 'DO-200', origine: 'partout', nom: 'DO-300' }))
  assert(!valide('modifier_modele', { modele: 'DO-200', description: 'x'.repeat(PLAFONDS.description + 1) }))
  const c = (n: number) => Array.from({ length: n }, (_, i) => ({ libelle: `C${i}`, type: 'texte' }))
  assert(valide('modifier_modele', { modele: 'DO-200', caracteristiques: c(PLAFONDS.caracteristiques) }))
  assert(!valide('modifier_modele', { modele: 'DO-200', caracteristiques: c(PLAFONDS.caracteristiques + 1) }))
  assert(
    !valide('modifier_modele', {
      modele: 'DO-200',
      caracteristiques: [{ libelle: 'A', type: 'texte' }, { libelle: ' a', type: 'texte' }],
    }),
    'libellés en double',
  )
  assert(valide('modifier_modele', { modele: 'DO-200', caracteristiques: [] }), 'gabarit vidé')

  assert(!valide('modifier_flotte', { flotte: 'Détecteur' }), 'rien à modifier')
  assert(valide('modifier_flotte', { flotte: 'Détecteur', valeur_principale: '' }), 'valeur principale retirée')
  assert(valide('modifier_flotte', { flotte: 'Détecteur', caracteristiques: c(3), nom: 'Détecteur optique' }))
  assert(!valide('modifier_flotte', { flotte: 'Détecteur', caracteristiques: [{ libelle: 'T', type: 'liste' }] }))
})

Deno.test('modifier_equipements : sélection facultative (toute la flotte), dates réelles, plafonds', () => {
  const f = { flotte: 'Détecteur' }
  assert(!valide('modifier_equipements', f), 'rien à modifier')
  assert(valide('modifier_equipements', { ...f, valeurs: { Repère: 'A1' } }), 'toute la flotte')
  assert(valide('modifier_equipements', { ...f, batiment: 'A', niveau: 'R+2', date_mise_en_service: '2026-03-01' }))
  assert(valide('modifier_equipements', { ...f, local_ids: [ID(3)], date_fin_garantie: null }), 'null = effacer')
  assert(!valide('modifier_equipements', { ...f, date_mise_en_service: '2026-02-30' }), 'date inexistante')
  assert(!valide('modifier_equipements', { ...f, date_mise_en_service: '01/03/2026' }))
  assert(!valide('modifier_equipements', { ...f, batiment: 'A', local_ids: [ID(3)], valeurs: { R: 1 } }))
  assert(!valide('modifier_equipements', { ...f, niveau: 'R+2', valeurs: { R: 1 } }), 'niveau sans bâtiment')
  const lieux = (n: number) => Array.from({ length: n }, (_, i) => ID(1000 + i))
  assert(valide('modifier_equipements', { ...f, local_ids: lieux(PLAFONDS.lieux), valeurs: { R: 1 } }))
  assert(!valide('modifier_equipements', { ...f, local_ids: lieux(PLAFONDS.lieux + 1), valeurs: { R: 1 } }))
  const v = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`C${i}`, i]))
  assert(valide('modifier_equipements', { ...f, valeurs: v(PLAFONDS.valeurs) }))
  assert(!valide('modifier_equipements', { ...f, valeurs: v(PLAFONDS.valeurs + 1) }))
  assert(!valide('modifier_equipements', { ...f, code_inventaire: 'X' }), 'code d’inventaire jamais')
})

Deno.test('deplacer_equipements : UNE destination, correspondances seules, plafonds', () => {
  const f = { flotte: 'Détecteur' }
  assert(!valide('deplacer_equipements', f), 'sans destination')
  assert(valide('deplacer_equipements', { ...f, vers_lieu: 'Réserve' }))
  assert(valide('deplacer_equipements', { ...f, batiment: 'A', vers_lieu: 'Réserve', vers_niveau: 'R-1' }))
  assert(valide('deplacer_equipements', { ...f, vers_local_id: ID(5) }))
  assert(!valide('deplacer_equipements', { ...f, vers_local_id: 'Réserve' }), 'identifiant invalide')
  assert(!valide('deplacer_equipements', { ...f, vers_lieu: 'Réserve', vers_local_id: ID(5) }), 'deux destinations')
  assert(!valide('deplacer_equipements', { ...f, vers_local_id: ID(5), vers_batiment: 'A' }))
  const paires = (n: number) => Array.from({ length: n }, (_, i) => ({ de: ID(2000 + i), vers: ID(3000 + i) }))
  assert(valide('deplacer_equipements', { ...f, correspondances: paires(PLAFONDS.lieux) }))
  assert(!valide('deplacer_equipements', { ...f, correspondances: paires(PLAFONDS.lieux + 1) }))
  assert(!valide('deplacer_equipements', { ...f, correspondances: paires(1), batiment: 'A' }), 'sélection en plus')
  assert(!valide('deplacer_equipements', { ...f, correspondances: [{ de: ID(1), vers: ID(2), x: 1 }] }))
  assert(!valide('deplacer_equipements', { ...f, correspondances: [{ de: 'Chambre 1', vers: ID(2) }] }))
})

Deno.test('rattacher_plan et supprimer_equipements : action fermée ; toute la flotte explicite', () => {
  const r = { plan_maintenance: 'Contrôle annuel', flotte: 'Détecteur' }
  assert(valide('rattacher_plan', { ...r, action: 'ajouter' }))
  assert(valide('rattacher_plan', { ...r, action: 'retirer', batiment: 'A' }))
  assert(!valide('rattacher_plan', r), 'action obligatoire')
  assert(!valide('rattacher_plan', { ...r, action: 'remplacer' }))

  const f = { flotte: 'Détecteur' }
  assert(!valide('supprimer_equipements', f), 'ni lieux ni toute la flotte')
  assert(valide('supprimer_equipements', { ...f, toute_la_flotte: true }))
  assert(valide('supprimer_equipements', { ...f, batiment: 'A', niveau: 'R+2' }))
  assert(valide('supprimer_equipements', { ...f, local_ids: [ID(3)] }))
  assert(!valide('supprimer_equipements', { ...f, batiment: 'A', toute_la_flotte: true }), 'les deux')
})

// ─── Traductions et rendu ────────────────────────────────────────────────────

Deno.test('selectionFacultative : rien = toute la flotte (null), sinon ce que la base attend', () => {
  assertEquals(selectionFacultative({}), null)
  assertEquals(selectionFacultative({ local_ids: [ID(3)] }), { local_ids: [ID(3)] })
  assertEquals(selectionFacultative({ batiment: 'A', type_lieu: 'Chambre' }), { batiment: 'A', type_local: 'Chambre' })
})

Deno.test('aperçus : gabarit après lisible, avant / après lisibles, dates en français', () => {
  const g = presenterGabaritModifie({
    caracteristiques: {
      ajoutees: ['Techno'],
      apres: { champs: [{ cle: 'Techno', type: 'liste', options: ['Optique'], requis: true, defaut: 'Optique' }] },
    },
  })
  assertEquals(g.caracteristiques, {
    ajoutees: ['Techno'],
    gabarit_apres: [{ libelle: 'Techno', type: 'Liste', options: ['Optique'], requis: true, defaut: 'Optique' }],
  })
  assertEquals(presenterGabaritModifie({ caracteristiques: null }).caracteristiques, null)

  const m = presenterAvantApres({
    modifications: { date_mise_en_service: '2026-03-02', valeurs: { Repère: 'A1' } },
    exemples: [{
      equipement: 'Détecteur Chambre 101',
      lieu: 'Chambre 101',
      avant: { date_mise_en_service: null, caracteristiques: [{ cle: 'Repère', type: 'texte', valeur: 'C101' }] },
      apres: {
        date_mise_en_service: '2026-03-02',
        caracteristiques: [{ cle: 'Repère', type: 'texte', valeur: 'A1' }],
      },
    }],
  })
  assertEquals((m.modifications as Record<string, unknown>).date_mise_en_service, '02/03/2026 (S10)')
  const e = (m.exemples as Record<string, Record<string, unknown>>[])[0]
  assertEquals(e.avant.caracteristiques, { Repère: 'C101' })
  assertEquals(e.apres, { date_mise_en_service: '02/03/2026 (S10)', caracteristiques: { Repère: 'A1' } })
})

// ─── Bout en bout (faux client) ──────────────────────────────────────────────

Deno.test('installer_modele (faux client) : modèle du commun seulement, catégorie de parc du site, aucun identifiant', async () => {
  const sansParc = fauxContexte({}, {})
  const r0 = await executerOutil('installer_modele', { site: 'Alpha', modele: 'DO-200' }, sansParc.ctx)
  assertMatch(r0.content[0].text, /catégorie de parc/)
  assert(!sansParc.appels.some((a) => a.nom.startsWith('claude_')))

  const { ctx, appels } = fauxContexte({
    modeles_equipements: [
      { id: ID(40), nom: 'DO-200', site_id: SITE_A.id, categorie: { nom: 'Incendie' } },
      { id: ID(41), nom: 'DO-200', site_id: null, categorie: { nom: 'Incendie' } },
    ],
    categories: [{ id: ID(50), nom: 'Sécurité incendie', site_id: SITE_A.id }],
  }, {
    claude_installer_modele_equipement: {
      ...APERCU,
      modele: { nom: 'DO-200', specifications: { champs: [{ cle: 'Repère', type: 'texte', requis: true }] } },
      flotte: { nom: 'DO-200', categorie: 'Sécurité incendie' },
    },
  })
  const r = await executerOutil('installer_modele', {
    site: 'Alpha',
    modele: 'do-200',
    categorie_parc: 'incendie',
    valeur_principale: 'Repère',
  }, ctx)
  assertEquals(r.isError, undefined, r.content[0].text)
  assertEquals(params(appels, 'claude_installer_modele_equipement'), {
    p_modele_id: ID(41),
    p_site_id: SITE_A.id,
    p_creer_flotte: true,
    p_flotte_parent_id: ID(50),
    p_nom_flotte: null,
    p_valeur_principale: 'Repère',
    p_appliquer: false,
    p_code: null,
  })
  const donnees = JSON.parse(r.content[0].text)
  assertEquals(donnees.modele.gabarit, [{ libelle: 'Repère', type: 'Texte', requis: true }])
  assertMatch(donnees.consigne, /APERÇU SEULEMENT.*code=ABCD1234/)
  sansIdentifiant(donnees)
})

Deno.test('modifier_modele (faux client) : commun refusé au technicien, ouvert au manager, homonymes à départager', async () => {
  const modeles = [
    { id: ID(40), nom: 'DO-200', site_id: SITE_A.id, categorie: { nom: 'Incendie' } },
    { id: ID(41), nom: 'DO-200', site_id: null, categorie: { nom: 'Incendie' } },
  ]
  const ambigu = fauxContexte({ modeles_equipements: modeles }, {})
  const r1 = await executerOutil('modifier_modele', { modele: 'DO-200', actif: false }, ambigu.ctx)
  assertMatch(r1.content[0].text, /ambigu.*DO-200 \(Commun, Incendie\).*DO-200 \(Hôtel Alpha, Incendie\)/)

  const tech = fauxContexte({ modeles_equipements: modeles }, {})
  const r2 = await executerOutil('modifier_modele', { modele: 'DO-200', origine: 'commun', nom: 'DO-300' }, tech.ctx)
  assertEquals(r2.isError, true)
  assertMatch(r2.content[0].text, /réservé aux administrateurs et managers/)
  assert(!tech.appels.some((a) => a.nom.startsWith('claude_')), 'aucun geste tenté')

  const site = fauxContexte({ modeles_equipements: modeles }, { claude_modifier_modele_equipement: APERCU })
  const r3 = await executerOutil('modifier_modele', { modele: 'DO-200', site: 'Alpha', description: '' }, site.ctx)
  assertEquals(r3.isError, undefined, r3.content[0].text)
  assertEquals(
    params(site.appels, 'claude_modifier_modele_equipement').p_modele_id,
    ID(40),
    'site visé = modèle du site',
  )

  const manager = fauxContexte({ modeles_equipements: modeles }, {
    current_role: 'manager',
    claude_modifier_modele_equipement: APERCU,
  })
  const r4 = await executerOutil('modifier_modele', {
    modele: 'DO-200',
    origine: 'commun',
    caracteristiques: [{ libelle: 'Repère', type: 'texte' }],
  }, manager.ctx)
  assertEquals(r4.isError, undefined, r4.content[0].text)
  assertEquals(params(manager.appels, 'claude_modifier_modele_equipement'), {
    p_modele_id: ID(41),
    p_nom: null,
    p_description: null,
    p_champs: [{ cle: 'Repère', type: 'texte', requis: false, defaut: null }],
    p_actif: null,
    p_appliquer: false,
    p_code: null,
  })
})

Deno.test('modifier_flotte et modifier_equipements (faux client) : flotte du site, modifications données seulement', async () => {
  const { ctx, appels } = fauxContexte({ categories: FLOTTES }, {
    claude_modifier_flotte: APERCU,
    claude_modifier_equipements: { ...APERCU, exemples: [] },
  })
  const r1 = await executerOutil('modifier_flotte', { flotte: 'Détecteur', site: 'Bêta', valeur_principale: '' }, ctx)
  assertEquals(r1.isError, undefined, r1.content[0].text)
  assertEquals(params(appels, 'claude_modifier_flotte'), {
    p_flotte_id: ID(11),
    p_nom: null,
    p_description: null,
    p_champs: null,
    p_valeur_principale: '',
    p_appliquer: false,
    p_code: null,
  })
  const r2 = await executerOutil('modifier_equipements', {
    flotte: 'Détecteur',
    site: 'Alpha',
    date_fin_garantie: null,
    valeurs: { Repère: 'A1' },
  }, ctx)
  assertEquals(r2.isError, undefined, r2.content[0].text)
  assertEquals(params(appels, 'claude_modifier_equipements'), {
    p_flotte_id: ID(10),
    p_selection: null,
    p_modifs: { valeurs: { Repère: 'A1' }, date_fin_garantie: null },
    p_appliquer: false,
    p_code: null,
  })
})

Deno.test('deplacer_equipements (faux client) : lieu de destination résolu sur le site de la flotte', async () => {
  const locaux = [
    { id: ID(60), nom: 'Réserve', niveaux: { nom: 'R-1', batiments: { nom: 'Bat A', site_id: SITE_A.id } } },
    { id: ID(61), nom: 'Réserve', niveaux: { nom: 'R+1', batiments: { nom: 'Bat A', site_id: SITE_A.id } } },
    { id: ID(62), nom: 'Réserve', niveaux: { nom: 'R-1', batiments: { nom: 'Bat B', site_id: SITE_B.id } } },
  ]
  const { ctx, appels } = fauxContexte({ categories: FLOTTES, locaux }, { claude_deplacer_equipements: APERCU })
  const ambigu = await executerOutil('deplacer_equipements', {
    flotte: 'Détecteur',
    site: 'Alpha',
    vers_lieu: 'réserve',
  }, ctx)
  assertMatch(ambigu.content[0].text, /ambigu : 2 lieux.*Réserve \(Bat A, R\+1\).*Réserve \(Bat A, R-1\)/)
  assert(!appels.some((a) => a.nom === 'claude_deplacer_equipements'))

  const r = await executerOutil('deplacer_equipements', {
    flotte: 'Détecteur',
    site: 'Alpha',
    batiment: 'Bat A',
    niveau: 'R+2',
    vers_lieu: 'Réserve',
    vers_niveau: 'r-1',
  }, ctx)
  assertEquals(r.isError, undefined, r.content[0].text)
  assertEquals(params(appels, 'claude_deplacer_equipements'), {
    p_flotte_id: ID(10),
    p_selection: { batiment: 'Bat A', niveau: 'R+2' },
    p_vers_local_id: ID(60),
    p_correspondances: null,
    p_autoriser_doublon: false,
    p_appliquer: false,
    p_code: null,
  })
  sansIdentifiant(JSON.parse(r.content[0].text))
})

Deno.test('rattacher_plan et supprimer_equipements (faux client) : plan du site, sélection transmise', async () => {
  const { ctx, appels } = fauxContexte({
    categories: FLOTTES,
    gammes: [{ id: ID(20), nom: 'Contrôle annuel SSI' }, { id: ID(21), nom: 'Contrôle semestriel' }],
  }, { claude_rattacher_equipements_gamme: APERCU, claude_supprimer_equipements: APERCU })
  const r1 = await executerOutil('rattacher_plan', {
    plan_maintenance: 'annuel',
    action: 'retirer',
    flotte: 'Détecteur',
    site: 'Alpha',
    local_ids: [ID(3)],
  }, ctx)
  assertEquals(r1.isError, undefined, r1.content[0].text)
  assertEquals(params(appels, 'claude_rattacher_equipements_gamme'), {
    p_gamme_id: ID(20),
    p_flotte_id: ID(10),
    p_selection: { local_ids: [ID(3)] },
    p_action: 'retirer',
    p_appliquer: false,
    p_code: null,
  })
  const r2 = await executerOutil('supprimer_equipements', {
    flotte: 'Détecteur',
    site: 'Alpha',
    toute_la_flotte: true,
    appliquer: true,
    code: 'abcd1234',
  }, ctx)
  assertEquals(r2.isError, undefined, r2.content[0].text)
  assertEquals(params(appels, 'claude_supprimer_equipements'), {
    p_flotte_id: ID(10),
    p_selection: null,
    p_appliquer: true,
    p_code: 'abcd1234',
  })
  assertMatch(JSON.parse(r2.content[0].text).consigne, /^C’est enregistré/)
})

Deno.test('gestes du parc (faux client) : lecture seule et rôle sans droit refusés avant toute résolution', async () => {
  const exemples: Record<string, Record<string, unknown>> = {
    installer_modele: { site: 'Alpha', modele: 'DO-200', categorie_parc: 'Incendie' },
    modifier_modele: { modele: 'DO-200', actif: false },
    modifier_flotte: { flotte: 'Détecteur', nom: 'Détecteur optique' },
    modifier_equipements: { flotte: 'Détecteur', valeurs: { Repère: 'A1' } },
    deplacer_equipements: { flotte: 'Détecteur', vers_lieu: 'Réserve' },
    rattacher_plan: { plan_maintenance: 'Contrôle', action: 'ajouter', flotte: 'Détecteur' },
    supprimer_equipements: { flotte: 'Détecteur', batiment: 'Bat A' },
  }
  assertEquals(Object.keys(exemples).sort(), [...GESTES].sort())
  for (
    const [tables, rpcs, motif] of [
      [{ users: { acces_ia_ecriture: false } }, {}, /lecture seule/],
      [{}, { current_role: 'lecteur' }, /Ton rôle ne permet pas/],
      [{}, { current_role: 'demandeur' }, /Ton rôle ne permet pas/],
    ] as const
  ) {
    const { ctx, appels } = fauxContexte(tables, rpcs)
    for (const [nom, args] of Object.entries(exemples)) {
      const r = await executerOutil(nom, args, ctx)
      assertEquals(r.isError, true, nom)
      assertMatch(r.content[0].text, motif, nom)
    }
    assert(!appels.some((a) => a.nom.startsWith('claude_')), 'aucun geste tenté')
  }
})
