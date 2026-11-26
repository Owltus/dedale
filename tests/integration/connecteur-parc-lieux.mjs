// =============================================================================
// Intégration — gestes Claude sur les lieux, la Bibliothèque et le parc
// (188-190), joués dans une VRAIE base, avec un jeton de CONNECTEUR
// =============================================================================
// Lancé par `npm run base:tester` (après `npm run base:monter`), ou seul :
//   MARTIN_LOCAL_DIR=supabase-local node tests/integration/connecteur-parc-lieux.mjs
//
// Ce que prouve cette suite, pour CHACUN des neuf gestes (claude_creer_lieux,
// claude_modifier_lieux, claude_installer_modele_equipement,
// claude_modifier_modele_equipement, claude_modifier_flotte,
// claude_modifier_equipements, claude_deplacer_equipements,
// claude_rattacher_equipements_gamme, claude_supprimer_equipements) :
//   - matrice des rôles : admin, manager A et technicien A écrivent sur le
//     site A ; lecteur, demandeur et manager B refusés, rien d'écrit ;
//   - jeton de l'application et accès Claude en lecture seule refusés ;
//   - aperçu = état inchangé ; code faux ou absent refusé ; application =
//     l'attendu ; code PÉRIMÉ refusé (un équipement change entre les deux) ;
//   - commun : manager accepté, technicien refusé (création et modification) ;
//   - autre site refusé (lieux, équipements, installation, gamme du site B ou
//     du commun) ;
//   - performance : modifier 200 équipements liés à une gamme = 1 synchro (au
//     lieu de 200), avec un résultat IDENTIQUE à la voie ligne par ligne ;
//     même chose pour propager le gabarit d'une flotte et retirer 200
//     équipements d'une gamme ;
//   - suppression d'un équipement lié à une DI refusée et nommée ;
//   - claude_creer_lieux rejoué = 0 créé.
//
// Jeton de connecteur simulé comme dans connecteur-ecriture.mjs. GARDE-FOUS :
// cible.mjs refuse tout ce qui n'est pas 127.0.0.1/localhost ; terrain posé
// puis retiré par psql. Un écart est un FINDING : on ne corrige pas l'attendu
// pour passer.
// =============================================================================
import { createHmac, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ANON, API, DB, JWT_SECRET } from '../securite/cible.mjs'

const SEMIS = JSON.parse(
  readFileSync(new URL('../securite/seed-data.json', import.meta.url), 'utf8'),
)
const FICHIER_SEMIS = fileURLToPath(
  new URL('./connecteur-parc-lieux.semis.sql', import.meta.url),
)
const MDP_LOCAL = 'MartinTest!2026#aB'
const IDENTITES = [
  'admin',
  'managerA',
  'technicienA',
  'lecteurA',
  'demandeurA',
  'managerB',
]
const S = `CPL${Date.now()}`

/** @type {Map<string, string>} écarts connus épinglés (vide). */
const ECARTS_CONNUS = new Map()

const roleDe = (identite) => identite.replace(/[AB]$/, '')
const peutEcrire = (identite) =>
  identite === 'admin' ||
  (['manager', 'technicien'].includes(roleDe(identite)) &&
    identite.endsWith('A'))

// -----------------------------------------------------------------------------
// Outils
// -----------------------------------------------------------------------------

function psql(args, entree) {
  const r = spawnSync(
    'psql',
    ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', DB, ...args],
    {
      input: entree,
      encoding: 'utf8',
      env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
      maxBuffer: 64 * 1024 * 1024,
    },
  )
  if (r.status !== 0) throw new Error(`psql : ${r.stderr}`)
  return r.stdout.trim()
}
/** Requête passée par l'entrée standard : un argument de ligne de commande perd l'UTF-8 sous Windows. */
const sql = (requete) => psql([], requete)
const sqlJson = (requete) => JSON.parse(sql(requete))

/** Écrit en admin (les déclencheurs de users exigent un admin de l'application). */
const enAdmin = (requete) =>
  psql(
    ['-v', `admin=${SEMIS.users.admin}`],
    `BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true) \\gset
${requete}
COMMIT;`,
  )

function semer() {
  const sortie = psql([
    '-v',
    `siteA=${SEMIS.A.site}`,
    '-v',
    `batimentA=${SEMIS.A.batiment}`,
    '-v',
    `siteB=${SEMIS.B.site}`,
    '-v',
    `niveauB=${SEMIS.B.niveau}`,
    '-v',
    `auteur=${SEMIS.users.technicienA}`,
    '-v',
    `di=${SEMIS.A.demandes_intervention}`,
    '-v',
    `suffixe=${S}`,
    '-f',
    FICHIER_SEMIS,
  ])
  return JSON.parse(sortie.split('\n').at(-1))
}

/** Retire tout le terrain (superutilisateur : la RLS ne filtre rien). */
function menager(client) {
  psql(
    ['-v', `x=${S}`, '-v', `client=${client}`],
    `BEGIN;
SELECT set_config('cpl.x', :'x', true), set_config('cpl.client', :'client', true) \\gset
DELETE FROM auth.oauth_clients WHERE id = current_setting('cpl.client')::uuid;
CREATE TEMP TABLE cpl_eq ON COMMIT DROP AS
  SELECT e.id FROM public.equipements e
  LEFT JOIN public.categories c ON c.id = e.categorie_id
  JOIN public.locaux l ON l.id = e.local_id
  WHERE l.nom LIKE '% ' || current_setting('cpl.x') OR c.nom LIKE '% ' || current_setting('cpl.x');
DELETE FROM public.di_equipements WHERE equipement_id IN (SELECT id FROM cpl_eq);
DELETE FROM public.gammes_equipements WHERE equipement_id IN (SELECT id FROM cpl_eq);
DELETE FROM public.ordres_travail WHERE gamme_id IN (SELECT id FROM public.gammes WHERE nom LIKE '% ' || current_setting('cpl.x'));
DELETE FROM public.gammes WHERE nom LIKE '% ' || current_setting('cpl.x');
DELETE FROM public.equipements WHERE id IN (SELECT id FROM cpl_eq);
DELETE FROM public.locaux WHERE nom LIKE '% ' || current_setting('cpl.x');
DELETE FROM public.niveaux WHERE nom LIKE '% ' || current_setting('cpl.x');
DELETE FROM public.batiments WHERE nom LIKE '% ' || current_setting('cpl.x');
DELETE FROM public.categories WHERE parent_id IS NOT NULL AND (nom LIKE '% ' || current_setting('cpl.x')
  OR parent_id IN (SELECT id FROM public.categories WHERE nom LIKE '% ' || current_setting('cpl.x')));
DELETE FROM public.modeles_equipements WHERE nom LIKE '% ' || current_setting('cpl.x');
DELETE FROM public.categories WHERE nom LIKE '% ' || current_setting('cpl.x');
DELETE FROM public.types_locaux WHERE libelle LIKE '% ' || current_setting('cpl.x');
COMMIT;`,
  )
}

/** Clés triées : jsonb ne garde pas l'ordre des clés. */
function trieObjet(o) {
  if (o === null || typeof o !== 'object') return o
  if (Array.isArray(o)) return o.map(trieObjet)
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .map((k) => [k, trieObjet(o[k])]),
  )
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')

/** Jeton du compte : celui de l'application, et rejoué avec `client_id` (Claude). */
async function jetons(identite, clientId) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `${identite.toLowerCase()}@martin.test`,
      password: MDP_LOCAL,
    }),
  })
  const brut = (await r.json()).access_token
  if (!brut) throw new Error(`Connexion ${identite} impossible`)
  const charge = JSON.parse(
    Buffer.from(brut.split('.')[1], 'base64url').toString(),
  )
  const corps = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...charge, client_id: clientId })}`
  const signature = createHmac('sha256', JWT_SECRET)
    .update(corps)
    .digest('base64url')
  return { application: brut, connecteur: `${corps}.${signature}` }
}

/** RPC PostgREST qui ne jette pas : { data, code, message }. */
async function rpc(jeton, nom, params) {
  const r = await fetch(`${API}/rest/v1/rpc/${nom}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jeton}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })
  const corps = await r.json().catch(() => null)
  return r.ok
    ? { data: corps, code: null, message: null }
    : {
        data: null,
        code: corps?.code ?? String(r.status),
        message: corps?.message ?? '',
      }
}

/** Identifiant technique (uuid) présent dans un rendu ? Aucun ne doit l'être. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

// -----------------------------------------------------------------------------
// Déroulé
// -----------------------------------------------------------------------------

async function main() {
  const client = randomUUID()
  const emails = IDENTITES.map((i) => `'${i.toLowerCase()}@martin.test'`).join(
    ', ',
  )
  const t = semer()
  const lieu = (n) => t.lieux[n - 1]
  const ecarts = []
  const epingles = []
  const lignes = []
  function constater(cle, probleme) {
    if (probleme === null) return true
    const motif = ECARTS_CONNUS.get(cle)
    if (motif !== undefined) epingles.push(`${cle} : ${probleme} — ${motif}`)
    else ecarts.push(`${cle} : ${probleme}`)
    return false
  }
  const egal = (cle, obtenu, voulu) =>
    constater(
      cle,
      JSON.stringify(trieObjet(obtenu)) === JSON.stringify(trieObjet(voulu))
        ? null
        : `obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(voulu)}`,
    )
  const vrai = (cle, condition, detail) =>
    constater(cle, condition ? null : (detail ?? 'faux'))
  const reussi = (cle, r) =>
    constater(cle, r.code ? `erreur ${r.code} ${r.message}` : null)
  const refuse = (cle, r, motif) =>
    constater(
      cle,
      !r.code
        ? 'accepté alors qu’il devait être refusé'
        : // Un refus de PostgREST (signature, type) ne prouve rien sur la base.
          /^PGRST|^22P02$/.test(r.code) || (motif && !motif.test(r.message))
          ? `refus inattendu : ${r.code} ${r.message}`
          : null,
    )

  /** État du terrain, lu en superutilisateur (hors RLS) : nombres + empreintes. */
  const etat = () =>
    sqlJson(`SELECT json_build_object(
      'eq', (SELECT count(*) FROM public.equipements WHERE categorie_id = '${t.flotte}'),
      'ge', (SELECT count(*) FROM public.gammes_equipements WHERE gamme_id = '${t.gamme}'),
      'opex', (SELECT count(*) FROM public.operations_execution WHERE ordre_travail_id = '${t.ot}'),
      'locaux', (SELECT count(*) FROM public.locaux WHERE nom LIKE '% ${S}'),
      'niveaux', (SELECT count(*) FROM public.niveaux WHERE nom LIKE '% ${S}'),
      'batiments', (SELECT count(*) FROM public.batiments WHERE nom LIKE '% ${S}'),
      'modeles', (SELECT count(*) FROM public.modeles_equipements WHERE nom LIKE '% ${S}'),
      'flottes', (SELECT count(*) FROM public.categories WHERE scope = 'parc' AND parent_id IS NOT NULL
                  AND parent_id = '${t.parc}'),
      'h_eq', (SELECT md5(string_agg(concat_ws(':', e.id, e.local_id, e.specifications, e.date_mise_en_service,
                                               e.date_fin_garantie), ',' ORDER BY e.id))
               FROM public.equipements e WHERE e.categorie_id IN ('${t.flotte}', '${t.flotte_b}')),
      'h_loc', (SELECT md5(string_agg(concat_ws(':', l.id, l.nom, l.type_local_id, l.surface_m2, l.hauteur_m,
                                                l.capacite_personnes, l.accessible_pmr, l.specifications), ',' ORDER BY l.id))
                FROM public.locaux l WHERE l.nom LIKE '% ${S}'),
      'h_mod', (SELECT md5(string_agg(concat_ws(':', m.id, m.nom, m.description, m.specifications, m.est_actif), ',' ORDER BY m.id))
                FROM public.modeles_equipements m WHERE m.nom LIKE '% ${S}'),
      'h_cat', (SELECT md5(string_agg(concat_ws(':', c.id, c.nom, c.description, c.specifications, c.valeur_principale), ',' ORDER BY c.id))
                FROM public.categories c WHERE c.nom LIKE '% ${S}'))`)

  try {
    sql(
      `INSERT INTO auth.oauth_clients (id, registration_type, redirect_uris, grant_types, client_name, client_type, token_endpoint_auth_method)
       VALUES ('${client}', 'dynamic', 'https://claude.ai/api/mcp/auth_callback', 'authorization_code', 'Sonde parc-lieux', 'confidential', 'client_secret_basic');`,
    )
    enAdmin(
      `UPDATE public.users SET acces_ia = true, acces_ia_ecriture = true WHERE id IN (SELECT id FROM auth.users WHERE email IN (${emails}));`,
    )
    const batA = sql(
      `SELECT nom FROM public.batiments WHERE id = '${SEMIS.A.batiment}'`,
    )
    const TYPE = `Type cpl ${S}`
    const TYPE2 = `Autre type cpl ${S}`

    const j = {}
    for (const i of IDENTITES) j[i] = await jetons(i, client)
    const C = (i) => j[i].connecteur

    /**
     * Aperçu (état inchangé, aucun identifiant rendu), code faux et code absent
     * refusés (état inchangé), puis application avec le code de l'aperçu.
     */
    async function geste(cle, jeton, nom, params) {
      const avant = etat()
      const apercu = await rpc(jeton, nom, { ...params, p_appliquer: false })
      if (apercu.code) return { apercu, app: apercu, avant }
      egal(`${cle} · aperçu : état inchangé`, etat(), avant)
      vrai(
        `${cle} · aperçu sans identifiant`,
        !UUID.test(JSON.stringify(apercu.data)),
        JSON.stringify(apercu.data).slice(0, 300),
      )
      for (const [motif, code] of [
        ['faux', 'ABCDEF12'],
        ['absent', null],
      ]) {
        const r = await rpc(jeton, nom, {
          ...params,
          p_appliquer: true,
          p_code: code,
        })
        refuse(`${cle} · code ${motif}`, r, /Code de confirmation/)
      }
      egal(`${cle} · codes refusés : état inchangé`, etat(), avant)
      const app = await rpc(jeton, nom, {
        ...params,
        p_appliquer: true,
        p_code: apercu.data.code_confirmation,
      })
      reussi(`${cle} · application`, app)
      if (!app.code)
        vrai(
          `${cle} · application sans identifiant`,
          !UUID.test(JSON.stringify(app.data)),
        )
      return { apercu, app, avant }
    }

    /** Refus : aperçu refusé, application (code inventé) refusée, rien d'écrit. */
    async function refusTotal(cle, jeton, nom, params, motif) {
      const avant = etat()
      refuse(
        `${cle} · aperçu refusé`,
        await rpc(jeton, nom, { ...params, p_appliquer: false }),
        motif,
      )
      refuse(
        `${cle} · application refusée`,
        await rpc(jeton, nom, {
          ...params,
          p_appliquer: true,
          p_code: 'ABCDEF12',
        }),
        motif,
      )
      egal(`${cle} · refus : rien d’écrit`, etat(), avant)
    }

    // Les neuf gestes, paramétrés par identité (cibles distinctes).
    const flotteInstallee = (k) =>
      sql(
        `SELECT id FROM public.categories WHERE parent_id = '${t.parc}' AND nom = 'Commun ${k} cpl ${S}'`,
      )
    const modeleInstalle = (k) =>
      sql(
        `SELECT id FROM public.modeles_equipements WHERE site_id = '${SEMIS.A.site}' AND nom = 'Commun ${k} cpl ${S}'`,
      )
    const GESTES = [
      {
        nom: 'claude_creer_lieux',
        params: (k) => ({
          p_site_id: SEMIS.A.site,
          p_lieux: [
            {
              batiment: batA.toUpperCase(),
              niveau: `Niv ${k} ${S}`,
              ordre_niveau: k,
              nom: `L1 ${k} ${S}`,
              type: TYPE,
              surface: 10.5,
              valeurs: { Vue: 'Mer' },
            },
            {
              batiment: batA,
              niveau: `niv ${k} ${S}`,
              nom: `L2 ${k} ${S}`,
              effectif: 4,
              pmr: true,
            },
            {
              batiment: `Bât ${k} ${S}`,
              niveau: `RDC ${S}`,
              nom: `L3 ${k} ${S}`,
            },
            {
              batiment: batA,
              niveau: `Niv ${k} ${S}`,
              nom: `l1 ${k} ${S}`,
            },
          ],
        }),
        verifier: (k, g, ident) => {
          egal(`${ident} · lieux : écrit`, etat(), {
            ...g.avant,
            locaux: g.avant.locaux + 3,
            niveaux: g.avant.niveaux + 2,
            batiments: g.avant.batiments + 1,
            h_loc: etat().h_loc,
          })
          egal(
            `${ident} · lieux : aperçu`,
            {
              a: g.apercu.data?.a_creer,
              d: g.apercu.data?.en_double_dans_la_demande,
              b: g.apercu.data?.batiments_a_creer,
            },
            { a: 3, d: 1, b: [`Bât ${k} ${S}`] },
          )
          egal(
            `${ident} · lieux : forme du lieu`,
            sqlJson(`SELECT json_build_object('type', t.libelle, 'surface', l.surface_m2, 'ordre', n.ordre,
                       'specs', l.specifications, 'pmr2', (SELECT accessible_pmr FROM public.locaux WHERE nom = 'L2 ${k} ${S}'),
                       'eff2', (SELECT capacite_personnes FROM public.locaux WHERE nom = 'L2 ${k} ${S}'))
                     FROM public.locaux l JOIN public.niveaux n ON n.id = l.niveau_id
                     LEFT JOIN public.types_locaux t ON t.id = l.type_local_id
                     WHERE l.nom = 'L1 ${k} ${S}'`),
            {
              type: TYPE,
              surface: 10.5,
              ordre: k,
              pmr2: true,
              eff2: 4,
              specs: {
                champs: [
                  {
                    cle: 'Lits',
                    type: 'nombre',
                    requis: false,
                    defaut: 1,
                    valeur: 1,
                  },
                  {
                    cle: 'Vue',
                    type: 'liste',
                    options: ['Mer', 'Cour'],
                    requis: false,
                    defaut: 'Cour',
                    valeur: 'Mer',
                  },
                ],
              },
            },
          )
        },
        refus: () => ({
          p_site_id: SEMIS.A.site,
          p_lieux: [{ batiment: batA, niveau: `Niv R ${S}`, nom: `R ${S}` }],
        }),
      },
      {
        nom: 'claude_modifier_lieux',
        params: (k) => ({
          p_site_id: SEMIS.A.site,
          p_selection: { batiment: `Bât ${k} ${S}` },
          p_modifs: {
            nom: `L3bis ${k} ${S}`,
            type: TYPE2,
            surface: '20,5',
            hauteur: 2.5,
            valeurs: { Sol: 'Carrelage' },
          },
        }),
        verifier: (k, g, ident) =>
          egal(
            `${ident} · modifier lieux : écrit`,
            sqlJson(`SELECT json_build_object('type', t.libelle, 'surface', l.surface_m2, 'hauteur', l.hauteur_m,
                       'champs', (SELECT jsonb_object_agg(c->>'cle', c->'valeur') FROM jsonb_array_elements(l.specifications->'champs') c))
                     FROM public.locaux l LEFT JOIN public.types_locaux t ON t.id = l.type_local_id
                     WHERE l.nom = 'L3bis ${k} ${S}'`),
            {
              type: TYPE2,
              surface: 20.5,
              hauteur: 2.5,
              champs: { Lits: 2, Sol: 'Carrelage' },
            },
          ),
        refus: () => ({
          p_site_id: SEMIS.A.site,
          p_selection: { batiment: batA, niveau: `Niveau cpl ${S}` },
          p_modifs: { surface: 5 },
        }),
      },
      {
        nom: 'claude_installer_modele_equipement',
        params: (k) => ({
          p_modele_id: t.communs[k],
          p_site_id: SEMIS.A.site,
          p_flotte_parent_id: t.parc,
          p_valeur_principale: 'numéro',
        }),
        verifier: (k, g, ident) => {
          egal(`${ident} · installer : écrit`, etat(), {
            ...g.avant,
            modeles: g.avant.modeles + 1,
            flottes: g.avant.flottes + 1,
            h_mod: etat().h_mod,
            h_cat: etat().h_cat,
          })
          egal(
            `${ident} · installer : flotte = copie sans lien`,
            sqlJson(`SELECT json_build_object('lien', c.modele_equipement_id, 'vp', c.valeur_principale,
                       'meme_gabarit', c.specifications = m.specifications, 'desc', c.description,
                       'cat_site', (SELECT k.site_id = '${SEMIS.A.site}' FROM public.categories k WHERE k.id = m.categorie_id))
                     FROM public.modeles_equipements m
                     JOIN public.categories c ON c.nom = m.nom AND c.parent_id = '${t.parc}'
                     WHERE m.site_id = '${SEMIS.A.site}' AND m.nom = 'Commun ${k} cpl ${S}'`),
            {
              lien: null,
              vp: 'Numéro',
              meme_gabarit: true,
              desc: 'Détecteur du siège',
              cat_site: true,
            },
          )
        },
        rejouer: /déjà installé/,
        refus: (k) => ({
          p_modele_id: t.communs[k],
          p_site_id: SEMIS.A.site,
          p_flotte_parent_id: t.parc,
        }),
      },
      {
        nom: 'claude_modifier_modele_equipement',
        params: (k) => ({
          p_modele_id: modeleInstalle(k),
          p_description: 'Révisé',
          p_champs: [
            { cle: 'Numéro', type: 'texte', requis: true },
            { cle: 'Couleur', type: 'texte' },
          ],
        }),
        verifier: (k, g, ident) => {
          egal(
            `${ident} · modifier modèle : écarts`,
            g.apercu.data?.caracteristiques && {
              a: g.apercu.data.caracteristiques.ajoutees,
              r: g.apercu.data.caracteristiques.retirees,
            },
            { a: ['Couleur'], r: ['Marque', 'Pose'] },
          )
          egal(
            `${ident} · modifier modèle : écrit, flotte inchangée`,
            sqlJson(`SELECT json_build_object('desc', m.description,
                       'cles', (SELECT jsonb_agg(c->>'cle') FROM jsonb_array_elements(m.specifications->'champs') c),
                       'flotte_cles', (SELECT jsonb_agg(c->>'cle') FROM public.categories f,
                                       jsonb_array_elements(f.specifications->'champs') c WHERE f.id = '${flotteInstallee(k)}'))
                     FROM public.modeles_equipements m WHERE m.id = '${modeleInstalle(k)}'`),
            {
              desc: 'Révisé',
              cles: ['Numéro', 'Couleur'],
              flotte_cles: ['Numéro', 'Marque', 'Pose'],
            },
          )
        },
        refus: () => ({ p_modele_id: t.modele_site, p_description: 'Non' }),
      },
      {
        nom: 'claude_modifier_flotte',
        params: (k) => ({
          p_flotte_id: flotteInstallee(k),
          p_nom: `Flotte ${k} ${S}`,
          p_champs: [
            { cle: 'Numéro', type: 'texte', requis: true },
            { cle: 'Zone', type: 'texte' },
          ],
        }),
        verifier: (k, g, ident) =>
          egal(
            `${ident} · modifier flotte : écrit`,
            sqlJson(`SELECT json_build_object('vp', f.valeur_principale,
                       'cles', (SELECT jsonb_agg(c->>'cle') FROM jsonb_array_elements(f.specifications->'champs') c))
                     FROM public.categories f WHERE f.parent_id = '${t.parc}' AND f.nom = 'Flotte ${k} ${S}'`),
            { vp: 'Numéro', cles: ['Numéro', 'Zone'] },
          ),
        refus: () => ({ p_flotte_id: t.flotte, p_nom: `Refus ${S}` }),
      },
      {
        nom: 'claude_modifier_equipements',
        params: (k) => ({
          p_flotte_id: t.flotte,
          p_selection: { local_ids: [lieu(10 + 3 * k), lieu(11 + 3 * k)] },
          p_modifs: {
            valeurs: { marque: 'Bolt' },
            date_mise_en_service: '2025-01-01',
          },
        }),
        verifier: (k, g, ident) =>
          egal(
            `${ident} · modifier équipements : écrit`,
            sqlJson(`SELECT json_agg(json_build_object('m', (SELECT c->>'valeur' FROM jsonb_array_elements(e.specifications->'champs') c
                                                          WHERE c->>'cle' = 'Marque'), 'd', e.date_mise_en_service) ORDER BY e.id)
                     FROM public.equipements e WHERE e.local_id IN ('${lieu(10 + 3 * k)}', '${lieu(11 + 3 * k)}')`),
            [
              { m: 'Bolt', d: '2025-01-01' },
              { m: 'Bolt', d: '2025-01-01' },
            ],
          ),
        refus: () => ({
          p_flotte_id: t.flotte,
          p_selection: { local_ids: [lieu(20)] },
          p_modifs: { valeurs: { Marque: 'Bolt' } },
        }),
      },
      {
        nom: 'claude_deplacer_equipements',
        params: (k) => ({
          p_flotte_id: t.flotte,
          p_selection: { local_ids: [lieu(30 + k)] },
          p_vers_local_id: lieu(208 + k),
        }),
        verifier: (k, g, ident) => {
          egal(
            `${ident} · déplacer : écrit`,
            sqlJson(`SELECT json_build_object('vers', (SELECT count(*) FROM public.equipements WHERE local_id = '${lieu(208 + k)}'),
                       'de', (SELECT count(*) FROM public.equipements WHERE local_id = '${lieu(30 + k)}'))`),
            { vers: 1, de: 0 },
          )
          egal(
            `${ident} · déplacer : OT ouvert resynchronisé`,
            sql(`SELECT count(*) FROM public.operations_execution
                 WHERE ordre_travail_id = '${t.ot}' AND nom_localisation LIKE '%Salle ${String(208 + k).padStart(3, '0')}%'`),
            '2',
          )
        },
        refus: () => ({
          p_flotte_id: t.flotte,
          p_selection: { local_ids: [lieu(40)] },
          p_vers_local_id: lieu(214),
        }),
      },
      {
        nom: 'claude_rattacher_equipements_gamme',
        params: (k) => ({
          p_gamme_id: t.gamme,
          p_flotte_id: t.flotte,
          p_selection: { local_ids: [lieu(50 + 2 * k), lieu(51 + 2 * k)] },
          p_action: 'retirer',
        }),
        verifier: async (k, g, ident) => {
          egal(`${ident} · retirer : écrit`, etat(), {
            ...g.avant,
            ge: g.avant.ge - 2,
            opex: g.avant.opex - 4,
          })
          egal(
            `${ident} · retirer : aperçu chiffré`,
            g.apercu.data?.operations_retirees_ot_ouverts,
            4,
          )
          const remettre = await geste(
            `${ident} · rattacher (ajouter)`,
            C(ident),
            'claude_rattacher_equipements_gamme',
            {
              p_gamme_id: t.gamme,
              p_flotte_id: t.flotte,
              p_selection: { local_ids: [lieu(50 + 2 * k), lieu(51 + 2 * k)] },
              p_action: 'ajouter',
            },
          )
          egal(
            `${ident} · ajouter : écrit`,
            etat(),
            remettre.avant && {
              ...remettre.avant,
              ge: remettre.avant.ge + 2,
              opex: remettre.avant.opex + 4,
            },
          )
        },
        refus: () => ({
          p_gamme_id: t.gamme,
          p_flotte_id: t.flotte,
          p_selection: { local_ids: [lieu(60)] },
          p_action: 'retirer',
        }),
      },
      {
        nom: 'claude_supprimer_equipements',
        params: (k) => ({
          p_flotte_id: t.flotte,
          p_selection: { local_ids: [lieu(202 + k)] },
        }),
        verifier: (k, g, ident) =>
          egal(`${ident} · supprimer : écrit`, etat(), {
            ...g.avant,
            eq: g.avant.eq - 1,
            ge: g.avant.ge - 1,
            opex: g.avant.opex - 2,
            h_eq: etat().h_eq,
          }),
        refus: (k) => ({
          p_flotte_id: t.flotte,
          p_selection: { local_ids: [lieu(202 + k)] },
        }),
      },
    ]

    // 1. Entrée : jeton de l'application, accès Claude en lecture seule ---------
    {
      const avant = etat()
      for (const g of GESTES) {
        const r = await rpc(j.technicienA.application, g.nom, g.refus(3))
        refuse(
          `entrée · ${g.nom} · jeton de l’application`,
          r,
          /Réservé au connecteur/,
        )
      }
      enAdmin(
        `UPDATE public.users SET acces_ia_ecriture = false WHERE id = '${SEMIS.users.technicienA}';`,
      )
      for (const g of GESTES) {
        const r = await rpc(C('technicienA'), g.nom, g.refus(3))
        refuse(`entrée · ${g.nom} · lecture seule`, r, /lecture seule/)
      }
      enAdmin(
        `UPDATE public.users SET acces_ia_ecriture = true WHERE id = '${SEMIS.users.technicienA}';`,
      )
      egal('entrée : rien d’écrit', etat(), avant)
    }

    // 2. Matrice des rôles × gestes ---------------------------------------------
    for (const [k, identite] of IDENTITES.entries()) {
      const ok = peutEcrire(identite)
      const marque = []
      for (const g of GESTES) {
        const cle = `${identite} · ${g.nom.replace('claude_', '')}`
        if (ok) {
          const r = await geste(cle, C(identite), g.nom, g.params(k))
          if (!r.app.code) {
            await g.verifier(k, r, identite)
            if (g.nom === 'claude_creer_lieux') {
              const rejeu = await rpc(C(identite), g.nom, g.params(k))
              egal(
                `${cle} · rejoué : 0 à créer`,
                {
                  a: rejeu.data?.a_creer,
                  d: rejeu.data?.deja_presents,
                },
                { a: 0, d: 3 },
              )
            }
            if (g.rejouer) {
              refuse(
                `${cle} · rejoué refusé`,
                await rpc(C(identite), g.nom, g.params(k)),
                g.rejouer,
              )
            }
          }
          marque.push(r.app.code ? '✗' : '✓')
        } else {
          await refusTotal(
            cle,
            C(identite),
            g.nom,
            g.refus(k),
            identite === 'managerB'
              ? /pas dans tes sites|pas d'un de tes sites|introuvable/
              : /ton rôle ne permet pas/,
          )
          marque.push('refus')
        }
      }
      lignes.push(
        `  ${identite.padEnd(12)} ${ok ? 'ok   ' : 'refus'}  ${marque.join(' ')}`,
      )
    }

    // 3. Code périmé : un équipement change entre l'aperçu et l'application ----
    {
      const params = {
        p_flotte_id: t.flotte,
        p_selection: { local_ids: [lieu(90), lieu(91)] },
        p_modifs: { valeurs: { Marque: 'Bolt' } },
      }
      const apercu = await rpc(
        C('managerA'),
        'claude_modifier_equipements',
        params,
      )
      reussi('périmé · aperçu', apercu)
      sql(
        `UPDATE public.equipements SET date_fin_garantie = '2030-01-01' WHERE local_id = '${lieu(91)}'`,
      )
      const avant = etat()
      const r = await rpc(C('managerA'), 'claude_modifier_equipements', {
        ...params,
        p_appliquer: true,
        p_code: apercu.data?.code_confirmation,
      })
      refuse('périmé · application refusée', r, /périmé/)
      egal('périmé · rien d’écrit', etat(), avant)
    }

    // 4. Commun : manager accepté, technicien refusé ----------------------------
    {
      const creer = (identite, extra = {}) =>
        geste(
          `commun · créer · ${identite}`,
          C(identite),
          'claude_creer_modele_equipement',
          {
            p_site_id: null,
            p_nom: `Créé commun ${identite} ${S}`,
            p_categorie_id: t.cat_commun,
            p_champs: [{ cle: 'Numéro', type: 'texte' }],
            ...extra,
          },
        )
      const m = await creer('managerA')
      if (!m.app.code)
        egal(
          'commun · créé par le manager, dans le commun',
          sql(
            `SELECT site_id IS NULL FROM public.modeles_equipements WHERE nom = 'Créé commun managerA ${S}'`,
          ),
          't',
        )
      await refusTotal(
        'commun · créer · technicienA',
        C('technicienA'),
        'claude_creer_modele_equipement',
        {
          p_site_id: null,
          p_nom: `Créé commun technicienA ${S}`,
          p_categorie_id: t.cat_commun,
        },
        /réservé aux administrateurs et managers/,
      )
      refuse(
        'commun · créer avec flotte refusé',
        await rpc(C('managerA'), 'claude_creer_modele_equipement', {
          p_site_id: null,
          p_nom: `Flotte commun ${S}`,
          p_categorie_id: t.cat_commun,
          p_flotte_parent_id: t.parc,
        }),
        /flotte vit sur un site/,
      )
      await refusTotal(
        'commun · modifier · technicienA',
        C('technicienA'),
        'claude_modifier_modele_equipement',
        { p_modele_id: t.commun_edit, p_description: 'Tech' },
        /commun/,
      )
      for (const identite of ['managerA', 'admin']) {
        const r = await geste(
          `commun · modifier · ${identite}`,
          C(identite),
          'claude_modifier_modele_equipement',
          { p_modele_id: t.commun_edit, p_description: `Par ${identite}` },
        )
        if (!r.app.code)
          egal(
            `commun · modifié par ${identite}`,
            sql(
              `SELECT description FROM public.modeles_equipements WHERE id = '${t.commun_edit}'`,
            ),
            `Par ${identite}`,
          )
      }
      refuse(
        'commun · rien à modifier',
        await rpc(C('admin'), 'claude_modifier_modele_equipement', {
          p_modele_id: t.commun_edit,
          p_description: 'Par admin',
        }),
        /Rien à modifier/,
      )
    }

    // 5. Autre site, commun et refus métier --------------------------------------
    {
      const avant = etat()
      for (const [cle, nom, params, motif] of [
        [
          'lieux site B',
          'claude_creer_lieux',
          {
            p_site_id: SEMIS.B.site,
            p_lieux: [{ batiment: 'X', niveau: 'Y', nom: `Z ${S}` }],
          },
          /pas dans tes sites/,
        ],
        [
          'modifier lieux site B',
          'claude_modifier_lieux',
          {
            p_site_id: SEMIS.B.site,
            p_selection: { local_ids: [t.lieu_b] },
            p_modifs: { surface: 3 },
          },
          /pas dans tes sites/,
        ],
        [
          'lieu du site B dans une sélection du site A',
          'claude_modifier_lieux',
          {
            p_site_id: SEMIS.A.site,
            p_selection: { local_ids: [t.lieu_b, lieu(1)] },
            p_modifs: { surface: 3 },
          },
          /hors de ce site/,
        ],
        [
          'équipements flotte B',
          'claude_modifier_equipements',
          {
            p_flotte_id: t.flotte_b,
            p_selection: null,
            p_modifs: { valeurs: { Marque: 'Bolt' } },
          },
          /introuvable|pas d'un de tes sites/,
        ],
        [
          'installer sur le site B',
          'claude_installer_modele_equipement',
          {
            p_modele_id: t.communs[5],
            p_site_id: SEMIS.B.site,
            p_creer_flotte: false,
          },
          /pas dans tes sites/,
        ],
        [
          'gamme du site B',
          'claude_rattacher_equipements_gamme',
          {
            p_gamme_id: t.gamme_b,
            p_flotte_id: t.flotte,
            p_selection: { local_ids: [lieu(1)] },
          },
          /introuvable|pas du site/,
        ],
        [
          'gamme du commun',
          'claude_rattacher_equipements_gamme',
          {
            p_gamme_id: t.gamme_commun,
            p_flotte_id: t.flotte,
            p_selection: { local_ids: [lieu(1)] },
          },
          /commun/,
        ],
        [
          'déplacer vers le site B',
          'claude_deplacer_equipements',
          {
            p_flotte_id: t.flotte,
            p_selection: { local_ids: [lieu(1)] },
            p_vers_local_id: t.lieu_b,
          },
          /hors du site/,
        ],
        [
          'déplacer : doublon',
          'claude_deplacer_equipements',
          {
            p_flotte_id: t.flotte,
            p_selection: { local_ids: [lieu(70)] },
            p_vers_local_id: lieu(71),
          },
          /plusieurs équipements/,
        ],
        [
          'modifier : code d’inventaire',
          'claude_modifier_equipements',
          {
            p_flotte_id: t.flotte,
            p_selection: { local_ids: [lieu(1)] },
            p_modifs: { code_inventaire: 'X' },
          },
          /code d'inventaire/,
        ],
        [
          'modifier : obligatoire vidé',
          'claude_modifier_equipements',
          {
            p_flotte_id: t.flotte,
            p_selection: { local_ids: [lieu(1)] },
            p_modifs: { valeurs: { Numéro: null } },
          },
          /obligatoire/,
        ],
        [
          'modifier : choix hors liste',
          'claude_modifier_equipements',
          {
            p_flotte_id: t.flotte,
            p_selection: { local_ids: [lieu(1)] },
            p_modifs: { valeurs: { Marque: 'Zed' } },
          },
          /Valeur refusée.*Acme/,
        ],
        [
          'renommer plusieurs lieux',
          'claude_modifier_lieux',
          {
            p_site_id: SEMIS.A.site,
            p_selection: { local_ids: [lieu(1), lieu(2)] },
            p_modifs: { nom: 'X' },
          },
          /un seul lieu/,
        ],
        [
          'lieux : surface hors bornes',
          'claude_creer_lieux',
          {
            p_site_id: SEMIS.A.site,
            p_lieux: [
              { batiment: batA, niveau: 'N', nom: `Z ${S}`, surface: 0 },
            ],
          },
          /Surface/,
        ],
        [
          'lieux : type inconnu',
          'claude_creer_lieux',
          {
            p_site_id: SEMIS.A.site,
            p_lieux: [
              { batiment: batA, niveau: 'N', nom: `Z ${S}`, type: 'Zzz' },
            ],
          },
          /Aucun type de lieu/,
        ],
        [
          'lieux : 501',
          'claude_creer_lieux',
          {
            p_site_id: SEMIS.A.site,
            p_lieux: Array.from({ length: 501 }, (_, i) => ({
              batiment: batA,
              niveau: 'N',
              nom: `Z${i} ${S}`,
            })),
          },
          /500/,
        ],
        [
          'installer : modèle du site',
          'claude_installer_modele_equipement',
          {
            p_modele_id: t.modele_site,
            p_site_id: SEMIS.A.site,
            p_creer_flotte: false,
          },
          /propre à un site/,
        ],
      ]) {
        refuse(`refus · ${cle}`, await rpc(C('managerA'), nom, params), motif)
      }
      egal('refus : rien d’écrit', etat(), avant)
      const doublonPermis = await rpc(
        C('managerA'),
        'claude_deplacer_equipements',
        {
          p_flotte_id: t.flotte,
          p_selection: { local_ids: [lieu(70)] },
          p_vers_local_id: lieu(71),
          p_autoriser_doublon: true,
        },
      )
      egal(
        'déplacer : doublon autorisé (aperçu)',
        doublonPermis.data?.doublons?.length,
        1,
      )
    }

    // 6. Suppression d'un équipement lié à une DI : refusée et nommée -----------
    {
      const avant = etat()
      const r = await rpc(C('technicienA'), 'claude_supprimer_equipements', {
        p_flotte_id: t.flotte,
        p_selection: { local_ids: [lieu(201)] },
      })
      refuse('supprimer · DI liée refusée et nommée', r, /DI liées/)
      vrai(
        'supprimer · lieu nommé',
        /Salle 201/.test(r.message ?? ''),
        r.message,
      )
      // Mêlé à un supprimable : le supprimable part, celui à DI est gardé.
      const mele = await rpc(C('technicienA'), 'claude_supprimer_equipements', {
        p_flotte_id: t.flotte,
        p_selection: { local_ids: [lieu(201), lieu(5)] },
      })
      egal(
        'supprimer · mélange : le supprimable part, celui à DI est gardé',
        {
          a: mele.data?.a_supprimer,
          c: mele.data?.conserves_nombre,
          raisons: mele.data?.conserves?.[0]?.raisons,
        },
        { a: 1, c: 1, raisons: ['DI liées'] },
      )
      egal('supprimer · aperçus : rien d’écrit', etat(), avant)
    }

    // 7. Trente lieux en un geste, puis rejoués -----------------------------------
    {
      const lieux = Array.from({ length: 30 }, (_, i) => ({
        batiment: batA,
        niveau: `R+3 ${S}`,
        ordre_niveau: 3,
        nom: `Chambre ${301 + i} ${S}`,
        type: TYPE,
      }))
      const r = await geste(
        '30 lieux',
        C('technicienA'),
        'claude_creer_lieux',
        {
          p_site_id: SEMIS.A.site,
          p_lieux: lieux,
        },
      )
      egal('30 lieux · créés', r.app.data?.crees, {
        batiments: 0,
        niveaux: 1,
        lieux: 30,
      })
      const rejeu = await rpc(C('technicienA'), 'claude_creer_lieux', {
        p_site_id: SEMIS.A.site,
        p_lieux: lieux,
      })
      egal(
        '30 lieux · rejoué : 0 / 30',
        {
          a: rejeu.data?.a_creer,
          d: rejeu.data?.deja_presents,
        },
        { a: 0, d: 30 },
      )
      const app = await rpc(C('technicienA'), 'claude_creer_lieux', {
        p_site_id: SEMIS.A.site,
        p_lieux: lieux,
        p_appliquer: true,
        p_code: rejeu.data?.code_confirmation,
      })
      egal('30 lieux · rejoué appliqué : 0 créé', app.data?.crees?.lieux, 0)

      // Changement de type : valeurs de même nom gardées, les autres perdues.
      const t2 = await geste(
        'réalignement',
        C('admin'),
        'claude_modifier_lieux',
        {
          p_site_id: SEMIS.A.site,
          p_selection: { batiment: batA, niveau: `R+3 ${S}` },
          p_modifs: { type: TYPE2 },
        },
      )
      egal('réalignement · 30 lieux', t2.app.data?.lieux, 30)
      egal(
        'réalignement · valeurs perdues : Vue (30)',
        t2.apercu.data?.valeurs_perdues,
        [{ caracteristique: 'Vue', lieux: 30 }],
      )
      egal(
        'réalignement · Lits gardé, Sol ajouté',
        sqlJson(
          `SELECT specifications->'champs' FROM public.locaux WHERE nom = 'Chambre 301 ${S}'`,
        ).map((c) => [c.cle, c.valeur]),
        [
          ['Lits', 1],
          ['Sol', null],
        ],
      )
    }

    // 8. Flotte de 200+ équipements : fusion de l'appli, valeurs perdues ---------
    {
      await geste('pose', C('admin'), 'claude_modifier_equipements', {
        p_flotte_id: t.flotte,
        p_selection: { local_ids: [lieu(80)] },
        p_modifs: { valeurs: { Pose: '2026-01-15' } },
      })
      const r = await rpc(C('admin'), 'claude_modifier_flotte', {
        p_flotte_id: t.flotte,
        p_champs: [
          { cle: 'Numéro', type: 'texte', requis: true },
          {
            cle: 'Marque',
            type: 'liste',
            options: ['Acme', 'Bolt'],
            defaut: 'Acme',
          },
          { cle: 'Zone', type: 'texte', defaut: 'Nord' },
        ],
      })
      reussi('flotte · aperçu', r)
      egal('flotte · valeurs perdues', r.data?.valeurs_perdues, [
        { caracteristique: 'Pose', equipements: 1 },
      ])
      egal(
        'flotte · écarts',
        {
          a: r.data?.caracteristiques?.ajoutees,
          r: r.data?.caracteristiques?.retirees,
          n: r.data?.equipements_touches,
        },
        {
          a: ['Zone'],
          r: ['Pose'],
          n: Number(
            sql(
              `SELECT count(*) FROM public.equipements WHERE categorie_id = '${t.flotte}'`,
            ),
          ),
        },
      )
    }

    // 8 bis. RPC de l'appli installer_modele_equipement (jeton de l'application).
    {
      const params = {
        p_modele_commun_id: t.communs[4],
        p_site_id: SEMIS.A.site,
        p_creer_flotte: true,
        p_flotte_parent_id: t.parc,
        p_nom_flotte: `Flotte appli ${S}`,
      }
      const r = await rpc(
        j.technicienA.application,
        'installer_modele_equipement',
        params,
      )
      reussi('appli · installer', r)
      egal(
        'appli · installer : modèle et flotte rendus',
        sqlJson(`SELECT json_build_object(
          'modele', (SELECT nom FROM public.modeles_equipements WHERE id = '${r.data?.modele_id}'),
          'flotte', (SELECT nom FROM public.categories WHERE id = '${r.data?.categorie_id}' AND parent_id = '${t.parc}'
                     AND modele_equipement_id IS NULL))`),
        { modele: `Commun 4 cpl ${S}`, flotte: `Flotte appli ${S}` },
      )
      const rejeu = await rpc(
        j.technicienA.application,
        'installer_modele_equipement',
        params,
      )
      refuse('appli · homonyme refusé en clair', rejeu, /déjà installé/)
      vrai(
        'appli · homonyme : pas l’erreur brute 23505',
        rejeu.code !== '23505',
      )
      refuse(
        'appli · lecteur refusé',
        await rpc(j.lecteurA.application, 'installer_modele_equipement', {
          ...params,
          p_modele_commun_id: t.communs[3],
        }),
        /ton rôle/,
      )
    }

    // 9. Performance : une synchro par gamme, résultat identique ----------------
    {
      // Lieux ACTUELS des 200 équipements rattachés (quelques-uns ont été déplacés).
      const ids = sqlJson(
        `SELECT json_agg(local_id) FROM public.equipements WHERE id IN (SELECT jsonb_array_elements_text('${JSON.stringify(t.equipements)}'::jsonb)::uuid)`,
      )
      const sortie = psql(
        [
          '-v',
          `admin=${SEMIS.users.admin}`,
          '-v',
          `client=${client}`,
          '-v',
          `flotte=${t.flotte}`,
          '-v',
          `gamme=${t.gamme}`,
          '-v',
          `ot=${t.ot}`,
          '-v',
          `lieux=${JSON.stringify({ local_ids: ids })}`,
        ],
        `BEGIN;
SET LOCAL track_functions = 'pl';
SELECT set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated', 'client_id', :'client')::text, true),
       set_config('cpl.flotte', :'flotte', true), set_config('cpl.gamme', :'gamme', true),
       set_config('cpl.ot', :'ot', true), set_config('cpl.lieux', :'lieux', true) \\gset
CREATE FUNCTION pg_temp.appels() RETURNS bigint LANGUAGE sql AS
  $f$ SELECT coalesce(pg_stat_get_xact_function_calls('public.synchroniser_ops_gamme'::regproc), 0) $f$;
CREATE FUNCTION pg_temp.empreinte() RETURNS text LANGUAGE sql AS $f$
  SELECT md5(concat_ws('#',
    (SELECT string_agg(concat_ws(':', x.equipement_id, x.source_id, x.ordre, x.nom_equipement, x.nom_localisation, x.statut), ','
                       ORDER BY x.equipement_id, x.source_id) FROM public.operations_execution x
     WHERE x.ordre_travail_id = current_setting('cpl.ot')::uuid),
    (SELECT (to_jsonb(o) - 'updated_at')::text FROM public.ordres_travail o WHERE o.id = current_setting('cpl.ot')::uuid)))
$f$;
SELECT pg_temp.empreinte() AS initial \\gset
-- a) Lot : 200 équipements, une instruction (via la fonction Claude).
SAVEPOINT a;
SET LOCAL ROLE authenticated;
SELECT public.claude_modifier_equipements(current_setting('cpl.flotte')::uuid,
  current_setting('cpl.lieux')::jsonb, '{"valeurs": {"Numéro": "X"}}'::jsonb)->>'code_confirmation' AS code \\gset
RESET ROLE;
SELECT pg_temp.appels() AS lot_avant \\gset
SET LOCAL ROLE authenticated;
SELECT public.claude_modifier_equipements(current_setting('cpl.flotte')::uuid, current_setting('cpl.lieux')::jsonb,
  '{"valeurs": {"Numéro": "X"}}'::jsonb, true, :'code')->>'modifies' AS lot_modifies \\gset
RESET ROLE;
SELECT pg_temp.appels() AS lot_apres, pg_temp.empreinte() AS lot_empreinte,
       coalesce(current_setting('dedale.deploiement_en_cours', true), '') AS lot_indicateur \\gset
ROLLBACK TO SAVEPOINT a;
-- b) Ligne par ligne (l'appli) : même écriture, hors lot.
SELECT pg_temp.appels() AS ligne_avant \\gset
UPDATE public.equipements e SET specifications = jsonb_build_object('champs', (
    SELECT jsonb_agg(CASE WHEN c->>'cle' = 'Numéro' THEN jsonb_set(c, '{valeur}', '"X"') ELSE c END ORDER BY o)
    FROM jsonb_array_elements(e.specifications->'champs') WITH ORDINALITY AS t(c, o)))
WHERE e.categorie_id = current_setting('cpl.flotte')::uuid
  AND e.local_id IN (SELECT x::uuid FROM jsonb_array_elements_text(current_setting('cpl.lieux')::jsonb->'local_ids') x);
SELECT pg_temp.appels() AS ligne_apres, pg_temp.empreinte() AS ligne_empreinte \\gset
ROLLBACK TO SAVEPOINT a;
-- c) Gabarit de la flotte propagé à tous ses équipements.
SET LOCAL ROLE authenticated;
SELECT public.claude_modifier_flotte(current_setting('cpl.flotte')::uuid, NULL, NULL,
  '[{"cle": "Numéro", "type": "texte", "requis": true}, {"cle": "Marque", "type": "liste", "options": ["Acme", "Bolt"]}]'::jsonb)->>'code_confirmation' AS code \\gset
RESET ROLE;
SELECT pg_temp.appels() AS flotte_avant \\gset
SET LOCAL ROLE authenticated;
SELECT public.claude_modifier_flotte(current_setting('cpl.flotte')::uuid, NULL, NULL,
  '[{"cle": "Numéro", "type": "texte", "requis": true}, {"cle": "Marque", "type": "liste", "options": ["Acme", "Bolt"]}]'::jsonb,
  NULL, true, :'code')->>'equipements_touches' AS flotte_touches \\gset
RESET ROLE;
SELECT pg_temp.appels() AS flotte_apres \\gset
ROLLBACK TO SAVEPOINT a;
-- d) Retirer 200 équipements de la gamme.
SET LOCAL ROLE authenticated;
SELECT public.claude_rattacher_equipements_gamme(current_setting('cpl.gamme')::uuid,
  current_setting('cpl.flotte')::uuid, current_setting('cpl.lieux')::jsonb, 'retirer')->>'code_confirmation' AS code \\gset
RESET ROLE;
SELECT pg_temp.appels() AS retirer_avant \\gset
SET LOCAL ROLE authenticated;
SELECT public.claude_rattacher_equipements_gamme(current_setting('cpl.gamme')::uuid, current_setting('cpl.flotte')::uuid,
  current_setting('cpl.lieux')::jsonb, 'retirer', true, :'code')->>'a_retirer' AS retirer_n \\gset
RESET ROLE;
SELECT pg_temp.appels() AS retirer_apres \\gset
ROLLBACK TO SAVEPOINT a;
ROLLBACK;
SELECT json_build_object('initial', :'initial', 'lot_avant', :'lot_avant', 'lot_apres', :'lot_apres',
  'lot_modifies', :'lot_modifies', 'lot_empreinte', :'lot_empreinte', 'lot_indicateur', :'lot_indicateur',
  'ligne_avant', :'ligne_avant', 'ligne_apres', :'ligne_apres', 'ligne_empreinte', :'ligne_empreinte',
  'flotte_avant', :'flotte_avant', 'flotte_apres', :'flotte_apres', 'flotte_touches', :'flotte_touches',
  'retirer_avant', :'retirer_avant', 'retirer_apres', :'retirer_apres', 'retirer_n', :'retirer_n');`,
      )
      const m = JSON.parse(sortie.split('\n').at(-1))
      const delta = (cle) =>
        Number(m[`${cle}_apres`]) - Number(m[`${cle}_avant`])
      egal('perf · modifier 200 équipements : 1 synchro', delta('lot'), 1)
      egal('perf · ligne par ligne : 200 synchros', delta('ligne'), 200)
      egal(
        'perf · résultat identique à la voie ligne par ligne',
        m.lot_empreinte,
        m.ligne_empreinte,
      )
      vrai(
        'perf · l’écriture a bien changé les OT',
        m.lot_empreinte !== m.initial,
      )
      egal('perf · indicateur rendu à off', m.lot_indicateur, 'off')
      egal(
        'perf · 200 modifiés, 200 retirés',
        [m.lot_modifies, m.retirer_n],
        ['200', '200'],
      )
      egal('perf · propager un gabarit : 1 synchro', delta('flotte'), 1)
      egal('perf · retirer 200 équipements : 1 synchro', delta('retirer'), 1)
      lignes.push(
        `  perf : lot ${delta('lot')} synchro · ligne par ligne ${delta('ligne')} · gabarit ${delta('flotte')} · retrait ${delta('retirer')}`,
      )
    }

    console.log('=== Matrice identité × geste (via connecteur) ===')
    console.log(
      `  ${''.padEnd(12)}       ${GESTES.map((g) => g.nom.replace('claude_', '')).join(' · ')}`,
    )
    console.log(lignes.join('\n'))
    for (const cle of ECARTS_CONNUS.keys())
      if (!epingles.some((e) => e.startsWith(cle)))
        ecarts.push(`${cle} : passe désormais — retirer l'épinglage`)
    if (epingles.length) {
      console.log('\nÉpinglés (écarts connus, ne font pas échouer) :')
      for (const e of epingles) console.log(`  ⚑ ${e}`)
    }
    if (ecarts.length) {
      console.log(
        '\nÉcarts NOUVEAUX (findings à rapporter, NE PAS corriger le test) :',
      )
      for (const e of ecarts) console.log(`  ✗ ${e}`)
    }
    console.log(`\n=== ${epingles.length} épinglé(s) ===`)
    console.log(`=== ${ecarts.length} écart(s) ===`)
    if (ecarts.length) process.exitCode = 3
  } finally {
    enAdmin(
      `UPDATE public.users SET acces_ia_ecriture = false, acces_ia = false WHERE id IN (SELECT id FROM auth.users WHERE email IN (${emails}));`,
    )
    menager(client)
  }
}

main().catch((e) => {
  console.error(`ÉCHEC D’EXÉCUTION : ${e.message}`)
  process.exit(1)
})
