// Premiers tests du serveur MCP : schémas des outils, rendu des lectures du
// parc (aucun identifiant hors des clés prévues, site nommé), plafonds.
// Aucun réseau : la base est remplacée par un faux client qui rend des lignes
// fixes et note chaque appel.

import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type { z } from 'npm:zod@3.23.8'
import { type Contexte, executerOutil, OUTILS } from './outils.ts'
import {
  arbreLieux,
  PLAFOND_LIEUX,
  presenterFiche,
  presenterFlotte,
  presenterModele,
  toutesLesLignes,
  trierLieux,
} from './outils-parc.ts'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const SITE_A = { id: '11111111-1111-4111-8111-111111111111', nom: 'Hôtel Alpha' }
const SITE_B = { id: '22222222-2222-4222-8222-222222222222', nom: 'Hôtel Bêta' }
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** Chaînes de la réponse, avec la clé qui les porte. */
function chaines(v: unknown, cle = ''): [string, string][] {
  if (typeof v === 'string') return [[cle, v]]
  if (Array.isArray(v)) return v.flatMap((x) => chaines(x, cle))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => chaines(x, k))
  return []
}
/** Aucun uuid, sauf sous les clés que les gestes d'écriture exigent. */
function sansIdentifiant(v: unknown, permises: string[] = []) {
  for (const [cle, texte] of chaines(v)) {
    if (permises.includes(cle)) continue
    assert(!UUID.test(texte), `identifiant montré sous « ${cle} » : ${texte}`)
  }
}

// ─── Faux client ─────────────────────────────────────────────────────────────

type Appel = { table: string; methode: string; args: unknown[] }
function fauxContexte(tables: Record<string, unknown[]>, rpcs: Record<string, unknown> = {}) {
  const appels: Appel[] = []
  const reponse = (data: unknown) => ({
    data,
    error: null,
    count: Array.isArray(data) ? data.length : null,
  })
  const constructeur = (table: string): unknown =>
    new Proxy({}, {
      get(_c, methode) {
        if (methode === 'then') {
          return (ok: (r: unknown) => unknown, ko: (e: unknown) => unknown) =>
            Promise.resolve(reponse(tables[table] ?? [])).then(ok, ko)
        }
        return (...args: unknown[]) => {
          appels.push({ table, methode: String(methode), args })
          return constructeur(table)
        }
      },
    })
  const rpcs2: Record<string, unknown> = { current_role: 'technicien', get_my_sites: [SITE_A, SITE_B], ...rpcs }
  const supabase = {
    from: (table: string) => constructeur(table),
    rpc: (nom: string, params?: unknown) => {
      appels.push({ table: `rpc:${nom}`, methode: 'rpc', args: [params] })
      const r = reponse(rpcs2[nom] ?? null)
      return { select: () => Promise.resolve(r), then: (ok: (x: unknown) => unknown) => Promise.resolve(r).then(ok) }
    },
  }
  const ctx: Contexte = { supabase: supabase as unknown as SupabaseClient, userId: ID(999) }
  return { ctx, appels }
}

async function appeler(ctx: Contexte, nom: string, args: Record<string, unknown>) {
  const r = await executerOutil(nom, args, ctx)
  return { erreur: r.isError === true, texte: r.content[0].text }
}

// ─── Schémas ─────────────────────────────────────────────────────────────────

type AvecForme = { shape: Record<string, unknown> }
function forme(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def as { schema?: z.ZodTypeAny }
  return def.schema ? forme(def.schema) : (schema as unknown as AvecForme).shape
}

Deno.test('chaque outil refuse un paramètre inconnu (Zod .strict + additionalProperties false)', () => {
  for (const o of OUTILS) {
    assertEquals(o.inputSchema.additionalProperties, false, o.name)
    const r = o.schema.safeParse({ parametre_inconnu: 1 })
    assert(!r.success, o.name)
    assert(r.error.issues.some((i) => i.code === 'unrecognized_keys'), `${o.name} : clé inconnue non signalée`)
  }
})

Deno.test('chaque outil : les paramètres annoncés à Claude sont ceux que Zod accepte', () => {
  for (const o of OUTILS) {
    const annonces = Object.keys(o.inputSchema.properties as Record<string, unknown>).sort()
    assertEquals(annonces, Object.keys(forme(o.schema)).sort(), o.name)
  }
})

Deno.test('noms d’outils uniques, en français minuscule', () => {
  const noms = OUTILS.map((o) => o.name)
  assertEquals(new Set(noms).size, noms.length)
  for (const n of noms) assertMatch(n, /^[a-z_]+$/)
  for (const n of ['bibliotheque', 'flottes', 'equipements', 'lieux', 'fiche_lieu']) assert(noms.includes(n), n)
})

Deno.test('outils du parc : lecture seule, plafonds de lignes', () => {
  const plafonds: Record<string, number> = {
    bibliotheque: 50,
    flottes: 30,
    equipements: 100,
    lieux: 100,
    fiche_lieu: 50,
  }
  for (const [nom, max] of Object.entries(plafonds)) {
    const o = OUTILS.find((x) => x.name === nom)!
    assertEquals(o.annotations.readOnlyHint, true, nom)
    const base = nom === 'fiche_lieu' ? { local_id: ID(1) } : {}
    assert(o.schema.safeParse({ ...base, limite: max }).success, `${nom} limite ${max}`)
    assert(!o.schema.safeParse({ ...base, limite: max + 1 }).success, `${nom} limite ${max + 1}`)
    assert(!o.schema.safeParse({ ...base, limite: 0 }).success, `${nom} limite 0`)
  }
  assert(!OUTILS.find((x) => x.name === 'fiche_lieu')!.schema.safeParse({ local_id: 'Chambre 214' }).success)
})

// ─── Rendu ───────────────────────────────────────────────────────────────────

const GABARIT = { champs: [{ cle: 'Repère', type: 'texte', requis: true, defaut: null }] }

Deno.test('bibliotheque : modèle commun = réserve du siège, installé sur ; aucun identifiant', () => {
  const commun = presenterModele(
    { nom: 'Détecteur', description: null, est_actif: true, site_id: null, specifications: GABARIT, categorie: null },
    [SITE_A],
    ['Hôtel Alpha'],
  )
  assertEquals(commun.origine, 'Commun (réserve du siège)')
  assertEquals(commun.installe_sur, ['Hôtel Alpha'])
  const local = presenterModele(
    {
      nom: 'Détecteur',
      description: null,
      est_actif: true,
      site_id: SITE_A.id,
      specifications: GABARIT,
      categorie: null,
    },
    [SITE_A],
    undefined,
  )
  assertEquals(local.site, 'Hôtel Alpha')
  assert(!('installe_sur' in local))
  sansIdentifiant([commun, local])
})

Deno.test('flottes : répartition, plans, déploiements récents, site nommé, aucun identifiant', () => {
  const eq = (niveau: string, ordre: number, lot: string | null, jour: string) => ({
    categorie_id: ID(5),
    lot_deploiement: lot,
    created_at: `2026-11-${jour}T10:00:00Z`,
    locaux: { niveaux: { nom: niveau, ordre, batiments: { nom: 'Bât. principal' } } },
    gammes_equipements: [{ gammes: { nom: 'Contrôle annuel', est_active: true } }],
  })
  const f = presenterFlotte(
    {
      id: ID(5),
      nom: 'Détecteur',
      description: null,
      est_actif: true,
      site_id: SITE_B.id,
      specifications: null,
      valeur_principale: 'Repère',
      valeur_secondaire: null,
      parent: { nom: 'Sécurité incendie' },
      modele: { nom: 'Détecteur optique', specifications: GABARIT },
    },
    [eq('R+2', 2, ID(7), '20'), eq('R+1', 1, ID(7), '20'), eq('R+1', 1, ID(8), '24'), eq('R+1', 1, null, '01')],
    [SITE_A, SITE_B],
    false,
  )
  assertEquals(f.site, 'Hôtel Bêta')
  assertEquals(f.equipements, 4)
  assertEquals(f.repartition.map((r) => `${r.niveau}:${r.equipements}`), ['R+1:3', 'R+2:1'])
  assertEquals(f.plans_maintenance, [{ gamme: 'Contrôle annuel', active: true, equipements: 4 }])
  assertEquals(f.deploiements_recents, [
    { date: '24/11/2026 (S48)', equipements: 1 },
    { date: '20/11/2026 (S47)', equipements: 2 },
  ])
  assertEquals(f.gabarit.map((c) => c.libelle), ['Repère'])
  sansIdentifiant(f)
})

Deno.test('fiche_lieu : noms seulement, onglets non visibles signalés, reste non affiché compté', () => {
  const f = presenterFiche({
    lieu: { nom: 'Chambre 214', chemin_complet: 'Hôtel Alpha / Bât. / R+2 / Chambre 214', site_nom: 'Hôtel Alpha' },
    compteurs: {
      equipements: 1,
      gammes: null,
      ot: null,
      di: { ouvertes: 3, total: 5 },
      travaux: null,
      evenements: null,
      documents: null,
    },
    equipements: [{
      sous_categorie: 'Détecteur',
      categorie: 'Sécurité incendie',
      code: 'DET-214',
      specifications: { champs: [{ cle: 'Repère', type: 'texte', valeur: 'Chambre 214' }] },
      valeur_principale: 'Repère',
      valeur_secondaire: null,
      valeur_tertiaire: null,
    }],
    ot: null,
    demandes: [{ constat: 'Fuite', statut: 'Ouvert', date_constat: '2026-11-20' }],
    travaux: null,
    evenements: null,
    plans_maintenance: null,
    documents: null,
  })
  assertEquals(f.lieu.site, 'Hôtel Alpha')
  assertEquals(f.equipements[0].nom, 'Détecteur Chambre 214')
  assertEquals(f.ot_ouverts, null)
  assertEquals(f.compteurs['ordres de travail'], 'non visible pour ce rôle')
  assertMatch(f.non_visible ?? '', /ordres de travail/)
  assertEquals(f.non_affiches, { demandes: 2 })
  assertEquals(f.demandes_ouvertes[0].date_constat, '20/11/2026 (S47)')
  sansIdentifiant(f)
})

Deno.test('lieux : ordre de l’arbre (bâtiment, niveau, nom naturel) et sites jamais mélangés', () => {
  const l = (n: number, nom: string, niveau: string, ordre: number, site: string) => ({
    id: ID(n),
    nom,
    niveaux: { nom: niveau, ordre, batiments: { nom: 'Bât.', site_id: site } },
    types_locaux: null,
  })
  const tries = trierLieux([
    l(1, 'Chambre 110', 'R+1', 1, SITE_A.id),
    l(2, 'Chambre 12', 'R+1', 1, SITE_A.id),
    l(3, 'Accueil', 'RDC', 0, SITE_A.id),
    l(4, 'Chambre 1', 'R+1', 1, SITE_B.id),
  ], [SITE_A, SITE_B])
  assertEquals(tries.map((x) => x.nom), ['Accueil', 'Chambre 12', 'Chambre 110', 'Chambre 1'])
  assertEquals(arbreLieux(tries, [SITE_A, SITE_B]), [
    { batiment: 'Bât.', site: 'Hôtel Alpha', niveaux: [{ niveau: 'RDC', lieux: 1 }, { niveau: 'R+1', lieux: 2 }] },
    { batiment: 'Bât.', site: 'Hôtel Bêta', niveaux: [{ niveau: 'R+1', lieux: 1 }] },
  ])
})

// ─── Plafonds et appels ──────────────────────────────────────────────────────

Deno.test('toutesLesLignes : pages de 1 000, plafond respecté, dépassement signalé', async () => {
  const lire = (total: number) => (de: number, a: number) =>
    Promise.resolve({
      data: Array.from({ length: Math.max(0, Math.min(a, total - 1) - de + 1) }, (_, i) => de + i),
      error: null,
    })
  const peu = await toutesLesLignes(lire(1500), 3000)
  assertEquals([peu.lignes.length, peu.tronque], [1500, false])
  const pile = await toutesLesLignes(lire(3000), 3000)
  assertEquals([pile.lignes.length, pile.tronque], [3000, false])
  const trop = await toutesLesLignes(lire(10_000), PLAFOND_LIEUX)
  assertEquals([trop.lignes.length, trop.tronque], [PLAFOND_LIEUX, true])
})

Deno.test('executerOutil : paramètres refusés avant toute lecture de données', async () => {
  const { ctx, appels } = fauxContexte({})
  const r = await appeler(ctx, 'flottes', { limite: 31 })
  assert(r.erreur)
  assertMatch(r.texte, /^Paramètres refusés/)
  assertEquals(appels.filter((a) => !a.table.startsWith('rpc:current_role')).length, 0)
})

Deno.test('bibliotheque (bout en bout, faux client) : page bornée, commun installé, site nommé', async () => {
  const { ctx, appels } = fauxContexte({
    modeles_equipements: [
      { nom: 'Détecteur', description: null, est_actif: true, site_id: null, specifications: GABARIT, categorie: null },
      {
        nom: 'détecteur ',
        description: null,
        est_actif: true,
        site_id: SITE_B.id,
        specifications: GABARIT,
        categorie: null,
      },
    ],
  })
  const r = await appeler(ctx, 'bibliotheque', { limite: 50, page: 2 })
  assert(!r.erreur, r.texte)
  const j = JSON.parse(r.texte)
  assertEquals(j.modeles[0].installe_sur, ['Hôtel Bêta'])
  assertEquals(j.modeles[1].site, 'Hôtel Bêta')
  const range = appels.find((a) => a.table === 'modeles_equipements' && a.methode === 'range')
  assertEquals(range?.args, [50, 99])
  sansIdentifiant(j)
})

Deno.test('fiche_lieu (bout en bout, faux client) : RPC claude_fiche_lieu, limite transmise, lieu invisible', async () => {
  const { ctx, appels } = fauxContexte({}, {
    claude_fiche_lieu: {
      lieu: { nom: 'Chambre 214', site_nom: 'Hôtel Alpha' },
      compteurs: { equipements: 0 },
      equipements: [],
      ot: [],
      demandes: [],
      travaux: [],
      evenements: [],
      plans_maintenance: [],
      documents: [],
    },
  })
  const r = await appeler(ctx, 'fiche_lieu', { local_id: ID(3), limite: 5 })
  assert(!r.erreur, r.texte)
  assertEquals(appels.find((a) => a.table === 'rpc:claude_fiche_lieu')?.args, [{ p_local_id: ID(3), p_limite: 5 }])
  sansIdentifiant(JSON.parse(r.texte))

  const vide = fauxContexte({})
  const r2 = await appeler(vide.ctx, 'fiche_lieu', { local_id: ID(3) })
  assert(r2.erreur)
  assertMatch(r2.texte, /introuvable/)
})

Deno.test('lieux et equipements (faux client) : identifiants seulement sous id / local_id, site nommé', async () => {
  const { ctx } = fauxContexte({
    locaux: [{
      id: ID(1),
      nom: 'Chambre 214',
      niveaux: { nom: 'R+2', ordre: 2, batiments: { nom: 'Bât.', site_id: SITE_A.id } },
      types_locaux: { libelle: 'Chambre standard' },
      description: null,
      surface_m2: 18,
      hauteur_m: null,
      capacite_personnes: 2,
      accessible_pmr: true,
      chauffe_climatise: false,
      specifications: null,
      equipements: [{ id: ID(2), code_inventaire: 'D1', specifications: null, categorie: { nom: 'Détecteur' } }],
    }],
    v_equipements_complet: [{
      id: ID(2),
      local_id: ID(1),
      categorie_id: ID(4),
      categorie_nom: 'Détecteur',
      code_inventaire: 'D1',
      localisation_courte: 'R+2 / Chambre 214',
      site_id: SITE_A.id,
      specifications: null,
    }],
    categories: [{ id: ID(4), parent: { nom: 'Sécurité incendie' }, modele: { nom: 'Détecteur optique' } }],
    gammes_equipements: [{ equipement_id: ID(2), gammes: { nom: 'Contrôle annuel' } }],
  })
  const lieux = JSON.parse((await appeler(ctx, 'lieux', {})).texte)
  assertEquals(lieux.lieux[0].site, 'Hôtel Alpha')
  assertEquals(lieux.lieux[0].type, 'Chambre standard')
  assertEquals(lieux.arbre[0].niveaux, [{ niveau: 'R+2', lieux: 1 }])
  sansIdentifiant(lieux, ['local_id', 'id'])
  const eqs = JSON.parse((await appeler(ctx, 'equipements', { flotte: 'Détecteur' })).texte)
  assertEquals(eqs.equipements[0].modele, 'Détecteur optique')
  assertEquals(eqs.equipements[0].plans_maintenance, ['Contrôle annuel'])
  assertEquals(eqs.equipements[0].site, 'Hôtel Alpha')
  sansIdentifiant(eqs, ['local_id', 'id'])
})
