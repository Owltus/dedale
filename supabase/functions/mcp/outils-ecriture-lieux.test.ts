// Tests des gestes Claude sur les lieux (189) : schémas (plafonds identiques au
// SQL et à localSchema), traduction vers la base, rendu des aperçus, refus de
// rôle et de lecture seule. Aucun réseau : la base est remplacée par un faux
// client.

import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { type Contexte, executerOutil, OUTILS } from './outils.ts'
import { PLAFONDS_LIEUX, presenterCreationLieux, presenterModificationLieux } from './outils-ecriture-lieux.ts'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const SITE_A = { id: ID(1), nom: 'Hôtel Alpha' }
const SITE_B = { id: ID(2), nom: 'Hôtel Bêta' }
const outil = (nom: string) => OUTILS.find((o) => o.name === nom)!
const valide = (nom: string, args: Record<string, unknown>) => outil(nom).schema.safeParse(args).success

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

const L = { batiment: 'Bat A', niveau: 'R+3', nom: 'Chambre 301' }
const APERCU = { mode: 'aperçu (rien n’est enregistré)', code_confirmation: 'ABCD1234', site: SITE_A.nom, alertes: [] }

// ─── Schémas ─────────────────────────────────────────────────────────────────

Deno.test('gestes sur les lieux : écriture, jamais destructifs', () => {
  for (const nom of ['creer_lieux', 'modifier_lieux']) {
    assertEquals(outil(nom).annotations.readOnlyHint, false, nom)
    assertEquals(outil(nom).annotations.destructiveHint, false, nom)
  }
})

Deno.test('creer_lieux : 1 à 500 lieux, plafonds de 189 (localSchema)', () => {
  const n = (k: number) => Array.from({ length: k }, (_, i) => ({ ...L, nom: `Chambre ${i}` }))
  assert(valide('creer_lieux', { lieux: n(1) }))
  assert(valide('creer_lieux', { lieux: n(PLAFONDS_LIEUX.lieux) }))
  assert(!valide('creer_lieux', { lieux: [] }))
  assert(!valide('creer_lieux', { lieux: n(PLAFONDS_LIEUX.lieux + 1) }))
  const un = (x: Record<string, unknown>) => valide('creer_lieux', { lieux: [{ ...L, ...x }] })
  assert(!un({ nom: '' }))
  assert(!un({ nom: 'x'.repeat(201) }))
  assert(!un({ batiment: 'x'.repeat(201) }))
  assert(un({ type: 'Chambre standard', surface: 18.5, hauteur: 2.5, effectif: 2, pmr: true, chauffe: false }))
  assert(!un({ surface: 0 }), 'surface > 0')
  assert(!un({ surface: 1_000_000 }))
  assert(!un({ hauteur: 100 }))
  assert(!un({ effectif: -1 }))
  assert(!un({ effectif: 1.5 }))
  assert(!un({ effectif: 32768 }))
  assert(un({ ordre_niveau: -32768 }) && un({ ordre_niveau: 32767 }))
  assert(!un({ ordre_niveau: 32768 }))
  assert(!un({ description: 'x'.repeat(2001) }))
  assert(!un({ valeurs: { Literie: 'Double' } }), 'valeurs sans type')
  assert(un({ type: 'Chambre standard', valeurs: { Literie: 'Double' } }))
  const v = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`C${i}`, i]))
  assert(!un({ type: 'Chambre standard', valeurs: v }))
  assert(!un({ surface_m2: 18 }), 'clé inconnue dans un lieu')
})

Deno.test('modifier_lieux : sélection obligatoire, au moins un changement, renommer un seul lieu', () => {
  const b = { batiment: 'Bat A', niveau: 'R+3' }
  assert(!valide('modifier_lieux', { surface: 20 }), 'sans sélection')
  assert(!valide('modifier_lieux', b), 'rien à modifier')
  assert(valide('modifier_lieux', { ...b, type: 'Bureau' }))
  assert(valide('modifier_lieux', { ...b, type: null, surface: null, effectif: null, description: null }))
  assert(valide('modifier_lieux', { local_ids: [ID(3)], nom: 'Chambre 301 bis' }))
  assert(!valide('modifier_lieux', { local_ids: [ID(3), ID(4)], nom: 'X' }), 'renommer deux lieux')
  assert(!valide('modifier_lieux', { ...b, nom: 'X' }), 'renommer un bâtiment entier')
  assert(!valide('modifier_lieux', { ...b, pmr: null }), 'PMR : vrai ou faux')
  assert(!valide('modifier_lieux', { ...b, hauteur: 0 }))
  assert(!valide('modifier_lieux', { local_ids: [ID(3)], niveau: 'R+3', surface: 1 }))
  const lieux = (k: number) => Array.from({ length: k }, (_, i) => ID(1000 + i))
  assert(valide('modifier_lieux', { local_ids: lieux(500), chauffe: true }))
  assert(!valide('modifier_lieux', { local_ids: lieux(501), chauffe: true }))
})

// ─── Rendu ───────────────────────────────────────────────────────────────────

Deno.test('aperçus des lieux : caractéristiques lisibles, avant / après', () => {
  const c = presenterCreationLieux({
    exemples: [{
      lieu: 'Chambre 301',
      caracteristiques: [{ cle: 'Literie', type: 'liste', options: ['Double'], valeur: 'Double' }],
    }],
  })
  assertEquals((c.exemples as Record<string, unknown>[])[0].caracteristiques, { Literie: 'Double' })
  const m = presenterModificationLieux({
    exemples: [{
      lieu: 'Chambre 301',
      avant: { type: 'Chambre', caracteristiques: [{ cle: 'Lits', type: 'nombre', valeur: 2 }] },
      apres: { type: 'Bureau', caracteristiques: [] },
    }],
  })
  const e = (m.exemples as Record<string, Record<string, unknown>>[])[0]
  assertEquals(e.avant, { type: 'Chambre', caracteristiques: { Lits: '2' } })
  assertEquals(e.apres, { type: 'Bureau', caracteristiques: {} })
})

// ─── Bout en bout (faux client) ──────────────────────────────────────────────

Deno.test('creer_lieux (faux client) : site unique exigé, lieux transmis par leurs noms, aucun identifiant', async () => {
  const deux = fauxContexte({}, {})
  const r0 = await executerOutil('creer_lieux', { lieux: [L] }, deux.ctx)
  assertMatch(r0.content[0].text, /Précise le site/)
  assert(!deux.appels.some((a) => a.nom.startsWith('claude_')))

  const { ctx, appels } = fauxContexte({}, {
    claude_creer_lieux: {
      ...APERCU,
      a_creer: 1,
      exemples: [{ ...L, lieu: L.nom, caracteristiques: [{ cle: 'Literie', type: 'texte', valeur: 'Double' }] }],
    },
  })
  const r = await executerOutil('creer_lieux', {
    site: 'Bêta',
    lieux: [{ ...L, type: 'Chambre standard', valeurs: { Literie: 'Double' } }],
  }, ctx)
  assertEquals(r.isError, undefined, r.content[0].text)
  assertEquals(appels.find((a) => a.nom === 'claude_creer_lieux')!.params, {
    p_site_id: SITE_B.id,
    p_lieux: [{ ...L, type: 'Chambre standard', valeurs: { Literie: 'Double' } }],
    p_appliquer: false,
    p_code: null,
  })
  const donnees = JSON.parse(r.content[0].text)
  assertEquals(donnees.exemples[0].caracteristiques, { Literie: 'Double' })
  assertMatch(donnees.consigne, /APERÇU SEULEMENT.*code=ABCD1234/)
  for (const [cle, texte] of chaines(donnees)) assert(!UUID.test(texte), `identifiant sous « ${cle} »`)
})

Deno.test('modifier_lieux (faux client) : seules les modifications données, null gardé, sélection traduite', async () => {
  const { ctx, appels } = fauxContexte({}, { claude_modifier_lieux: { ...APERCU, exemples: [] } })
  const r = await executerOutil('modifier_lieux', {
    site: 'Alpha',
    batiment: 'Bat A',
    type_lieu: 'Chambre',
    type: 'Bureau',
    surface: null,
    pmr: true,
  }, ctx)
  assertEquals(r.isError, undefined, r.content[0].text)
  assertEquals(appels.find((a) => a.nom === 'claude_modifier_lieux')!.params, {
    p_site_id: SITE_A.id,
    p_selection: { batiment: 'Bat A', type_local: 'Chambre' },
    p_modifs: { type: 'Bureau', surface: null, pmr: true },
    p_appliquer: false,
    p_code: null,
  })
})

Deno.test('gestes sur les lieux (faux client) : lecture seule et rôle sans droit refusés avant toute résolution', async () => {
  for (
    const [tables, rpcs, motif] of [
      [{ users: { acces_ia_ecriture: false } }, {}, /lecture seule/],
      [{}, { current_role: 'lecteur' }, /Ton rôle ne permet pas/],
      [{}, { current_role: 'demandeur' }, /Ton rôle ne permet pas/],
    ] as const
  ) {
    const { ctx, appels } = fauxContexte(tables, rpcs)
    for (
      const [nom, args] of [
        ['creer_lieux', { site: 'Alpha', lieux: [L] }],
        ['modifier_lieux', { site: 'Alpha', batiment: 'Bat A', pmr: true }],
      ] as const
    ) {
      const r = await executerOutil(nom, args, ctx)
      assertEquals(r.isError, true, nom)
      assertMatch(r.content[0].text, motif, nom)
    }
    assert(!appels.some((a) => a.nom.startsWith('claude_') || a.nom === 'get_my_sites'), 'aucune résolution')
  }
})
