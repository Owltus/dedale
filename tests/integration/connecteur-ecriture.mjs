// =============================================================================
// Intégration — gestes d'écriture Claude sur le parc (186), joués dans une VRAIE
// base, avec un jeton de CONNECTEUR
// =============================================================================
// Lancé par `npm run base:tester` (après `npm run base:monter`), ou seul :
//   MARTIN_LOCAL_DIR=supabase-local node tests/integration/connecteur-ecriture.mjs
//
// Ce que prouve cette suite : claude_creer_modele_equipement,
// claude_deployer_equipements et claude_annuler_deploiement
//   - respectent la matrice des rôles (admin, manager A et technicien A sur le
//     site A ; lecteur, demandeur et manager B refusés, rien d'écrit) ;
//   - refusent un jeton de l'application (sans client_id) et un accès Claude
//     en lecture seule ;
//   - n'écrivent rien en aperçu, et exigent le code de l'aperçu : code faux,
//     rejoué ou PÉRIMÉ (un équipement apparu dans la flotte entre l'aperçu et
//     l'application) refusé, rien d'écrit ;
//   - créent un modèle DU SITE au format du front ({ champs: [...] }, normalisé)
//     et sa flotte qui pointe vers lui ; refusent un doublon de nom ;
//   - résolvent les lieux par leurs noms (bâtiment, niveau, type de lieu),
//     refusent un nom ambigu ou inconnu en listant les candidats, et le
//     dépassement du plafond (500 lieux) ;
//   - annulent le N-ième déploiement le plus récent d'une flotte.
//
// Le jeton de connecteur est simulé comme dans tests/securite/connecteur-mcp.mjs :
// vrai jeton du compte, rejoué avec `client_id` (application OAuth « de
// confiance » déclarée le temps du test), signé avec le secret de la pile LOCALE.
// GARDE-FOUS : cible.mjs refuse tout ce qui n'est pas 127.0.0.1/localhost ;
// terrain posé puis retiré par psql. Un écart est un FINDING : on ne corrige
// pas l'attendu pour passer.
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
  new URL('./deploiement.semis.sql', import.meta.url),
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
const SUFFIXE = `CE${Date.now()}`
const NIVEAU_DEP = `Niveau dep ${SUFFIXE}`

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
    `niveauA=${SEMIS.A.niveau}`,
    '-v',
    `batimentA=${SEMIS.A.batiment}`,
    '-v',
    `siteB=${SEMIS.B.site}`,
    '-v',
    `niveauB=${SEMIS.B.niveau}`,
    '-v',
    `auteur=${SEMIS.users.technicienA}`,
    '-v',
    `suffixe=${SUFFIXE}`,
    '-f',
    FICHIER_SEMIS,
  ])
  return JSON.parse(sortie.split('\n').at(-1))
}

function menager(client) {
  psql(
    [
      '-v',
      `suffixe=${SUFFIXE}`,
      '-v',
      `admin=${SEMIS.users.admin}`,
      '-v',
      `client=${client}`,
    ],
    `BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true),
       set_config('dep.x', :'suffixe', true), set_config('dep.client', :'client', true) \\gset
DELETE FROM auth.oauth_clients WHERE id = current_setting('dep.client')::uuid;
SET LOCAL ROLE authenticated;
DELETE FROM public.gammes_equipements WHERE gamme_id IN (SELECT id FROM public.gammes WHERE nom LIKE '% dep ' || current_setting('dep.x'));
DELETE FROM public.ordres_travail WHERE gamme_id IN (SELECT id FROM public.gammes WHERE nom LIKE '% dep ' || current_setting('dep.x'));
DELETE FROM public.gammes WHERE nom LIKE '% dep ' || current_setting('dep.x');
DELETE FROM public.equipements WHERE local_id IN (SELECT id FROM public.locaux WHERE nom LIKE 'Chambre % ' || current_setting('dep.x'));
DELETE FROM public.locaux WHERE nom LIKE 'Chambre % ' || current_setting('dep.x');
DELETE FROM public.niveaux WHERE nom = 'Niveau dep ' || current_setting('dep.x');
DELETE FROM public.categories WHERE nom LIKE '% ' || current_setting('dep.x') AND parent_id IS NOT NULL;
DELETE FROM public.modeles_equipements WHERE nom LIKE '% ' || current_setting('dep.x');
DELETE FROM public.categories WHERE nom LIKE '% dep ' || current_setting('dep.x');
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

/** État du terrain, lu en superutilisateur (hors RLS). */
function etat(t) {
  return sqlJson(`SELECT json_build_object(
    'eq', (SELECT count(*) FROM public.equipements e JOIN public.locaux l ON l.id = e.local_id
           WHERE l.nom LIKE 'Chambre % ${SUFFIXE}'),
    'lot', (SELECT count(*) FROM public.equipements e JOIN public.locaux l ON l.id = e.local_id
            WHERE l.nom LIKE 'Chambre % ${SUFFIXE}' AND e.lot_deploiement IS NOT NULL),
    'ge', (SELECT count(*) FROM public.gammes_equipements WHERE gamme_id = '${t.gamme}'),
    'opex', (SELECT count(*) FROM public.operations_execution WHERE ordre_travail_id = '${t.ot}'),
    'modeles', (SELECT count(*) FROM public.modeles_equipements WHERE nom LIKE '% ${SUFFIXE}'),
    'flottes', (SELECT count(*) FROM public.categories WHERE nom LIKE '% ${SUFFIXE}' AND parent_id IS NOT NULL))`)
}

// -----------------------------------------------------------------------------
// Déroulé
// -----------------------------------------------------------------------------

async function main() {
  const client = randomUUID()
  const emails = IDENTITES.map((i) => `'${i.toLowerCase()}@martin.test'`).join(
    ', ',
  )
  const t = semer()
  const lieu = (i) => t.lieux[i]
  const ecarts = []
  const epingles = []
  const lignes = []
  const exemples = {}
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
  const reussi = (cle, r) =>
    constater(cle, r.code ? `erreur ${r.code} ${r.message}` : null)
  const refuse = (cle, r, motif) =>
    constater(
      cle,
      !r.code
        ? 'accepté alors qu’il devait être refusé'
        : motif && !motif.test(r.message)
          ? `refus inattendu : ${r.code} ${r.message}`
          : null,
    )

  try {
    // Application OAuth « de confiance » + accès Claude en modification.
    sql(
      `INSERT INTO auth.oauth_clients (id, registration_type, redirect_uris, grant_types, client_name, client_type, token_endpoint_auth_method)
       VALUES ('${client}', 'dynamic', 'https://claude.ai/api/mcp/auth_callback', 'authorization_code', 'Sonde écriture', 'confidential', 'client_secret_basic');`,
    )
    enAdmin(
      `UPDATE public.users SET acces_ia = true, acces_ia_ecriture = true WHERE id IN (SELECT id FROM auth.users WHERE email IN (${emails}));`,
    )
    // Types de lieu sur le second niveau : 10 « Chambre standard », 5 « Chambre confort ».
    sql(`UPDATE public.locaux SET type_local_id = (SELECT id FROM public.types_locaux WHERE libelle = 'Chambre standard')
         WHERE id = ANY ('{${t.lieux.slice(115, 125).join(',')}}'::uuid[]);
         UPDATE public.locaux SET type_local_id = (SELECT id FROM public.types_locaux WHERE libelle = 'Chambre confort')
         WHERE id = ANY ('{${t.lieux.slice(125, 130).join(',')}}'::uuid[]);`)
    const bat = sql(
      `SELECT nom FROM public.batiments WHERE id = '${SEMIS.A.batiment}'`,
    )

    const j = {}
    for (const i of IDENTITES) j[i] = await jetons(i, client)
    const C = (i) => j[i].connecteur

    /** Aperçu puis application avec le code de l'aperçu. */
    async function aperçuPuisApplication(jeton, nom, params) {
      const apercu = await rpc(jeton, nom, { ...params, p_appliquer: false })
      if (apercu.code) return { apercu, app: apercu }
      const app = await rpc(jeton, nom, {
        ...params,
        p_appliquer: true,
        p_code: apercu.data.code_confirmation,
      })
      return { apercu, app }
    }

    // 1. Entrée : jeton de l'application refusé, accès en lecture seule refusé.
    {
      const avant = etat(t)
      const r = await rpc(
        j.technicienA.application,
        'claude_deployer_equipements',
        {
          p_categorie_id: t.flotte,
          p_selection: { local_ids: [lieu(2)] },
        },
      )
      refuse('jeton de l’application', r, /Réservé au connecteur/)
      enAdmin(
        `UPDATE public.users SET acces_ia_ecriture = false WHERE id = '${SEMIS.users.technicienA}';`,
      )
      const r2 = await rpc(C('technicienA'), 'claude_deployer_equipements', {
        p_categorie_id: t.flotte,
        p_selection: { local_ids: [lieu(2)] },
      })
      refuse('accès Claude en lecture seule', r2, /lecture seule/)
      const r3 = await rpc(C('technicienA'), 'claude_creer_modele_equipement', {
        p_site_id: SEMIS.A.site,
        p_nom: `Modèle RO ${SUFFIXE}`,
        p_categorie_id: t.flotte,
      })
      refuse('accès Claude en lecture seule (modèle)', r3, /lecture seule/)
      enAdmin(
        `UPDATE public.users SET acces_ia_ecriture = true WHERE id = '${SEMIS.users.technicienA}';`,
      )
      egal('entrée : rien d’écrit', etat(t), avant)
    }

    // Catégorie de modèles du site (semis) et catégorie de parc.
    const catModeles = sql(
      `SELECT id FROM public.categories WHERE nom = 'Modèles dep ${SUFFIXE}'`,
    )

    // 2. Matrice des rôles ------------------------------------------------------
    for (const [k, identite] of IDENTITES.entries()) {
      const ok = peutEcrire(identite)
      const marque = []

      // a) Modèle + flotte.
      const nomModele = `Sonde ${identite} ${SUFFIXE}`
      const paramsModele = {
        p_site_id: SEMIS.A.site,
        p_nom: nomModele,
        p_categorie_id: catModeles,
        p_description: '  Détecteur de test  ',
        p_champs: [
          { cle: ' Numéro ', type: 'texte', requis: true, defaut: null },
          {
            cle: 'Techno',
            type: 'liste',
            options: [' Optique', 'Ionique', 'Optique', ''],
            defaut: 'Optique',
            unite: 'kg',
          },
          { cle: 'Raccordé', type: 'oui-non', requis: true, defaut: true },
          { cle: 'Puissance', type: 'nombre', unite: ' W ', defaut: 3 },
          {
            cle: 'ZDM',
            type: 'double-reference',
            libelleA: 'Zone',
            libelleB: '',
            defaut: null,
          },
        ],
        p_creer_flotte: true,
        p_flotte_parent_id: t.parc,
        p_valeur_principale: 'numéro',
      }
      let avant = etat(t)
      const m = await aperçuPuisApplication(
        C(identite),
        'claude_creer_modele_equipement',
        paramsModele,
      )
      if (ok) {
        reussi(`${identite} · modèle aperçu`, m.apercu)
        reussi(`${identite} · modèle application`, m.app)
        egal(`${identite} · modèle écrit`, etat(t), {
          ...avant,
          modeles: avant.modeles + 1,
          flottes: avant.flottes + 1,
        })
        const ecrit = sqlJson(`SELECT json_build_object(
            'specs', m.specifications, 'site', m.site_id, 'desc', m.description,
            'flotte_modele', c.modele_equipement_id = m.id, 'vp', c.valeur_principale,
            'parent', c.parent_id, 'specs_flotte', c.specifications)
          FROM public.modeles_equipements m JOIN public.categories c ON c.modele_equipement_id = m.id
          WHERE m.nom = '${nomModele}'`)
        egal(`${identite} · modèle : forme du front`, ecrit, {
          specs: {
            champs: [
              { cle: 'Numéro', type: 'texte', requis: true, defaut: null },
              {
                cle: 'Techno',
                type: 'liste',
                options: ['Optique', 'Ionique'],
                requis: false,
                defaut: 'Optique',
              },
              { cle: 'Raccordé', type: 'oui-non', requis: false, defaut: true },
              {
                cle: 'Puissance',
                type: 'nombre',
                unite: 'W',
                requis: false,
                defaut: 3,
              },
              {
                cle: 'ZDM',
                type: 'double-reference',
                libelleA: 'Zone',
                requis: false,
                defaut: null,
              },
            ],
          },
          site: SEMIS.A.site,
          desc: 'Détecteur de test',
          flotte_modele: true,
          vp: 'Numéro',
          parent: t.parc,
          specs_flotte: null,
        })
        const rejoue = await rpc(
          C(identite),
          'claude_creer_modele_equipement',
          {
            ...paramsModele,
            p_appliquer: true,
            p_code: m.apercu.data?.code_confirmation,
          },
        )
        refuse(`${identite} · modèle : code rejoué`, rejoue, /existe déjà/)
        if (identite === 'technicienA') exemples.modele = m.apercu.data
      } else {
        refuse(`${identite} · modèle refusé`, m.apercu)
        egal(`${identite} · modèle refusé : rien d’écrit`, etat(t), avant)
      }
      marque.push(`modèle ${m.app.code ? `refus ${m.apercu.code}` : '✓'}`)

      // b) Déployer 2 lieux, puis annuler (rang 1).
      avant = etat(t)
      const lieux = [lieu(10 + 2 * k), lieu(11 + 2 * k)]
      const paramsDep = {
        p_categorie_id: t.flotte,
        p_selection: { local_ids: lieux },
        p_valeurs: { Marque: 'Bolt' },
        p_gamme_ids: [t.gamme],
      }
      const apercu = await rpc(
        C(identite),
        'claude_deployer_equipements',
        paramsDep,
      )
      egal(`${identite} · aperçu n’écrit rien`, etat(t), avant)
      if (ok) {
        reussi(`${identite} · déploiement aperçu`, apercu)
        egal(`${identite} · aperçu : a_creer`, apercu.data?.a_creer, 2)
        const app = await rpc(C(identite), 'claude_deployer_equipements', {
          ...paramsDep,
          p_appliquer: true,
          p_code: apercu.data?.code_confirmation,
        })
        reussi(`${identite} · déploiement application`, app)
        egal(`${identite} · déploiement écrit`, etat(t), {
          ...avant,
          eq: avant.eq + 2,
          lot: avant.lot + 2,
          ge: avant.ge + 2,
          opex: 2 * (avant.ge + 2),
        })
        const ann = await aperçuPuisApplication(
          C(identite),
          'claude_annuler_deploiement',
          {
            p_flotte_id: t.flotte,
            p_lot_rang: 1,
          },
        )
        reussi(`${identite} · annulation`, ann.app)
        egal(
          `${identite} · annulation : 2 supprimés`,
          ann.app.data?.supprimes,
          2,
        )
        egal(`${identite} · annulation rend l’état`, etat(t), avant)
        marque.push(`déployer ✓ · annuler ${ann.app.code ? '✗' : '✓'}`)
      } else {
        refuse(`${identite} · déploiement refusé`, apercu)
        const app = await rpc(C(identite), 'claude_deployer_equipements', {
          ...paramsDep,
          p_appliquer: true,
          p_code: 'ABCDEF12',
        })
        refuse(`${identite} · déploiement (application) refusé`, app)
        const ann = await rpc(C(identite), 'claude_annuler_deploiement', {
          p_flotte_id: t.flotte,
        })
        refuse(`${identite} · annulation refusée`, ann)
        egal(`${identite} · refus : rien d’écrit`, etat(t), avant)
        marque.push(`déployer refus ${apercu.code} · annuler refus ${ann.code}`)
      }
      lignes.push(
        `  ${identite.padEnd(12)} ${ok ? 'ok   ' : 'refus'}  ${marque.join(' · ')}`,
      )
    }

    // 3. Codes : faux, absent, périmé ---------------------------------------------
    {
      const params = {
        p_categorie_id: t.flotte,
        p_selection: { local_ids: [lieu(60), lieu(61)] },
      }
      const avant = etat(t)
      const apercu = await rpc(
        C('managerA'),
        'claude_deployer_equipements',
        params,
      )
      for (const [nom, code] of [
        ['code faux', 'ABCDEF12'],
        ['code absent', null],
      ]) {
        const r = await rpc(C('managerA'), 'claude_deployer_equipements', {
          ...params,
          p_appliquer: true,
          p_code: code,
        })
        refuse(`code · ${nom}`, r, /Code de confirmation/)
      }
      const autreLieu = await rpc(
        C('managerA'),
        'claude_deployer_equipements',
        {
          ...params,
          p_selection: { local_ids: [lieu(60), lieu(62)] },
          p_appliquer: true,
          p_code: apercu.data?.code_confirmation,
        },
      )
      refuse(
        'code · autres lieux que l’aperçu',
        autreLieu,
        /Code de confirmation/,
      )
      // Un équipement apparaît dans la flotte entre l'aperçu et l'application.
      sql(`INSERT INTO public.equipements (local_id, categorie_id, specifications)
           VALUES ('${lieu(200)}', '${t.flotte}', '{"champs": []}')`)
      const perime = await rpc(C('managerA'), 'claude_deployer_equipements', {
        ...params,
        p_appliquer: true,
        p_code: apercu.data?.code_confirmation,
      })
      refuse('code · périmé (équipement apparu)', perime, /périmé/)
      sql(
        `DELETE FROM public.equipements WHERE local_id = '${lieu(200)}' AND categorie_id = '${t.flotte}'`,
      )
      egal('code · rien d’écrit', etat(t), avant)
    }

    // 4. Résolution des lieux par leurs noms -------------------------------------
    {
      const dep = (selection, extra = {}) =>
        rpc(C('technicienA'), 'claude_deployer_equipements', {
          p_categorie_id: t.flotte,
          p_selection: selection,
          p_gamme_ids: [t.gamme],
          ...extra,
        })
      const avant = etat(t)
      const niveau = await dep({ batiment: bat, niveau: NIVEAU_DEP })
      reussi('noms · bâtiment + niveau', niveau)
      egal('noms · bâtiment + niveau : 115 lieux', niveau.data?.lieux, 115)
      egal('noms · sélection rendue', niveau.data?.selection, {
        batiment: bat,
        niveau: NIVEAU_DEP,
      })
      exemples.deploiement = niveau.data
      const type = await dep({
        batiment: bat.toLowerCase(),
        niveau: `dep ${SUFFIXE}`,
        type_local: 'standard',
      })
      egal(
        'noms · type de lieu (partiel, casse ignorée) : 10',
        type.data?.lieux,
        10,
      )
      const ambigu = await dep({ batiment: bat, niveau: 'Niveau' })
      refuse('noms · niveau ambigu', ambigu, /ambigu.*Niveau A.*Niveau dep/)
      const typeAmbigu = await dep({
        batiment: bat,
        niveau: NIVEAU_DEP,
        type_local: 'Chambre',
      })
      refuse('noms · type ambigu', typeAmbigu, /ambigu/)
      const inconnu = await dep({ batiment: 'Bâtiment Z' })
      refuse('noms · bâtiment inconnu', inconnu, /Aucun bâtiment.*Possibles/)
      const melange = await dep({ local_ids: [lieu(1)], batiment: bat })
      refuse('noms · liste ET bâtiment', melange, /pas les deux/)
      const plafond = await dep({
        local_ids: Array.from({ length: 501 }, () => randomUUID()),
      })
      refuse('plafond · 501 lieux', plafond, /500/)
      const siteB = await dep({ local_ids: [lieu(3), t.lieu_b] })
      refuse('un site par appel', siteB)
      egal('noms · rien d’écrit', etat(t), avant)

      // Application par les noms puis annulation.
      const app = await dep(
        { batiment: bat, niveau: NIVEAU_DEP },
        { p_appliquer: true, p_code: niveau.data?.code_confirmation },
      )
      reussi('noms · application', app)
      egal('noms · 115 créés', app.data?.equipements_crees, 115)
      const ann = await aperçuPuisApplication(
        C('technicienA'),
        'claude_annuler_deploiement',
        {
          p_flotte_id: t.flotte,
        },
      )
      egal('noms · annulés', ann.app.data?.supprimes, 115)
      egal('noms · état rendu', etat(t), avant)
    }

    // 5. Annuler le N-ième déploiement -------------------------------------------
    {
      const avant = etat(t)
      for (const lieux of [[lieu(70)], [lieu(71), lieu(72)]]) {
        const r = await aperçuPuisApplication(
          C('admin'),
          'claude_deployer_equipements',
          {
            p_categorie_id: t.flotte,
            p_selection: { local_ids: lieux },
          },
        )
        reussi('rang · déploiement', r.app)
      }
      const rang2 = await aperçuPuisApplication(
        C('admin'),
        'claude_annuler_deploiement',
        {
          p_flotte_id: t.flotte,
          p_lot_rang: 2,
        },
      )
      egal(
        'rang · le 2e plus récent (1 équipement)',
        rang2.app.data?.supprimes,
        1,
      )
      const absent = await rpc(C('admin'), 'claude_annuler_deploiement', {
        p_flotte_id: t.flotte,
        p_lot_rang: 2,
      })
      refuse('rang · n° 2 n’existe plus', absent, /que 1 déploiement/)
      const rang1 = await aperçuPuisApplication(
        C('admin'),
        'claude_annuler_deploiement',
        {
          p_flotte_id: t.flotte,
        },
      )
      egal(
        'rang · le plus récent (2 équipements)',
        rang1.app.data?.supprimes,
        2,
      )
      egal('rang · état rendu', etat(t), avant)
    }

    // 6. Modèle : refus métier, rien d'écrit -------------------------------------
    {
      const base = {
        p_site_id: SEMIS.A.site,
        p_nom: `Modèle refus ${SUFFIXE}`,
        p_categorie_id: catModeles,
        p_creer_flotte: false,
      }
      const avant = etat(t)
      for (const [nom, params, motif] of [
        [
          'modèle du commun (site absent)',
          { p_site_id: null },
          /jamais dans le commun/,
        ],
        ['site B', { p_site_id: SEMIS.B.site }, /pas dans tes sites/],
        [
          'catégorie de parc comme catégorie',
          { p_categorie_id: t.parc },
          /pas une catégorie de modèles/,
        ],
        [
          'liste sans choix',
          { p_champs: [{ cle: 'L', type: 'liste' }] },
          /choix|option/,
        ],
        [
          'nom en double',
          {
            p_champs: [
              { cle: 'A', type: 'texte' },
              { cle: 'a', type: 'texte' },
            ],
          },
          /uniques/,
        ],
        [
          'défaut hors type',
          { p_champs: [{ cle: 'N', type: 'nombre', defaut: 'x' }] },
          /défaut refusée/,
        ],
        [
          'date inexistante',
          { p_champs: [{ cle: 'D', type: 'date', defaut: '2026-02-30' }] },
          /n'existe pas/,
        ],
        [
          'clé inconnue',
          { p_champs: [{ cle: 'V', type: 'texte', valeur: 'x' }] },
          /mal formée/,
        ],
        [
          '41 caractéristiques',
          {
            p_champs: Array.from({ length: 41 }, (_, i) => ({
              cle: `C${i}`,
              type: 'texte',
            })),
          },
          /40/,
        ],
        [
          'flotte sans catégorie de parc',
          { p_creer_flotte: true },
          /catégorie de parc/,
        ],
        [
          'valeur principale inconnue',
          {
            p_creer_flotte: true,
            p_flotte_parent_id: t.parc,
            p_valeur_principale: 'Zzz',
          },
          /valeur principale/,
        ],
        [
          'doublon du modèle semé',
          { p_nom: `modèle DEP ${SUFFIXE}` },
          /existe déjà/,
        ],
      ]) {
        const r = await rpc(C('managerA'), 'claude_creer_modele_equipement', {
          ...base,
          ...params,
        })
        refuse(`modèle · ${nom}`, r, motif)
      }
      egal('modèle · refus : rien d’écrit', etat(t), avant)
    }

    console.log('=== Matrice identité × site A (via connecteur) ===')
    console.log(lignes.join('\n'))
    if (process.env.APERCU) {
      console.log(JSON.stringify(exemples, null, 2))
    }
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
