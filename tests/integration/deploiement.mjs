// =============================================================================
// Intégration — déploiement en masse d'équipements (184), joué dans une VRAIE base
// =============================================================================
// Lancé par `npm run base:tester` (après `npm run base:monter`), ou seul :
//   MARTIN_LOCAL_DIR=supabase-local node tests/integration/deploiement.mjs
//
// Ce que prouve cette suite : `deployer_equipements` et `annuler_deploiement`
//   - respectent la matrice des rôles (admin, manager et technicien sur LEUR
//     site ; lecteur, demandeur et site voisin refusés, rien d'écrit) ;
//   - n'écrivent rien en aperçu ;
//   - créent un équipement par lieu, avec EXACTEMENT la forme que produit le
//     front (parseChamps → `valeur ?? defaut ?? null` → serializeChamps), le
//     modèle d'origine (`copie_depuis_modele_id`) et le numéro de lot ;
//   - rattachent les gammes choisies et mettent les OT ouverts à jour
//     (opérations répétées par équipement, ADR 0013) ;
//   - ignorent (ou non) les doublons, refusent un mélange de sites, une gamme
//     du commun ou d'un autre site, une sous-catégorie hors flotte, et le
//     dépassement du plafond (500 lieux) — rien d'écrit ;
//   - annulent un lot en gardant (et signalant) les équipements qui ont un
//     historique ;
//   - laissent le déclencheur par ligne de gammes_equipements intact hors lot.
// MESURE : 200 lieux × gamme répétée — temps et nombre d'appels de
// synchronisation (pg_stat_get_xact_function_calls, track_functions = all) :
// UN appel par gamme attendu.
//
// GARDE-FOUS : cible.mjs refuse tout ce qui n'est pas 127.0.0.1/localhost. Les
// appels se font avec la clé PUBLIQUE et le vrai jeton de chaque compte ; le
// terrain est posé puis retiré par psql (base locale jetable).
// Un écart est un FINDING à rapporter : on ne corrige pas l'attendu pour passer.
// =============================================================================
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { ANON, API, DB } from '../securite/cible.mjs'

const SEMIS = JSON.parse(
  readFileSync(new URL('../securite/seed-data.json', import.meta.url), 'utf8'),
)
const FICHIER_SEMIS = fileURLToPath(
  new URL('./deploiement.semis.sql', import.meta.url),
)
/** Mot de passe des comptes de test LOCAUX — celui de tests/securite/semis.mjs. */
const MDP_LOCAL = 'MartinTest!2026#aB'
const IDENTITES = [
  'admin',
  'managerA',
  'technicienA',
  'lecteurA',
  'demandeurA',
  'managerB',
]
const SUFFIXE = `IT${Date.now()}`
/** Valeurs communes posées sur la flotte lors des déploiements testés. */
const VALEURS = { Marque: 'Bolt', Repère: { a: '3', b: '12' } }

/**
 * Écarts CONNUS, épinglés comme un `it.fails` : clé exacte du contrôle → motif.
 * Vide : aucun écart connu.
 * @type {Map<string, string>}
 */
const ECARTS_CONNUS = new Map()

const roleDe = (identite) => identite.replace(/[AB]$/, '')
/** Le site A est celui du déploiement : seuls admin, manager A, technicien A y écrivent. */
const peutDeployer = (identite) =>
  identite === 'admin' ||
  (['manager', 'technicien'].includes(roleDe(identite)) &&
    identite.endsWith('A'))

// -----------------------------------------------------------------------------
// Outils
// -----------------------------------------------------------------------------

/** psql sur la base LOCALE ; renvoie la sortie standard. */
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

const sql = (requete) => psql(['-c', requete])
const sqlJson = (requete) => JSON.parse(sql(requete))

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

/** Retire le terrain (en admin : les déclencheurs des OT et fichiers l'exigent). */
function menager() {
  psql(
    ['-v', `suffixe=${SUFFIXE}`, '-v', `admin=${SEMIS.users.admin}`],
    `BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true),
       set_config('dep.x', :'suffixe', true) \\gset
SET LOCAL ROLE authenticated;
DELETE FROM public.demandes_intervention WHERE constat LIKE '% dep ' || current_setting('dep.x');
DELETE FROM public.gammes_equipements WHERE gamme_id IN (SELECT id FROM public.gammes WHERE nom LIKE '% dep ' || current_setting('dep.x'));
DELETE FROM public.ordres_travail WHERE gamme_id IN (SELECT id FROM public.gammes WHERE nom LIKE '% dep ' || current_setting('dep.x'));
DELETE FROM public.gammes WHERE nom LIKE '% dep ' || current_setting('dep.x');
DELETE FROM public.equipements WHERE local_id IN (SELECT id FROM public.locaux WHERE nom LIKE 'Chambre % ' || current_setting('dep.x'));
DELETE FROM public.locaux WHERE nom LIKE 'Chambre % ' || current_setting('dep.x');
DELETE FROM public.niveaux WHERE nom = 'Niveau dep ' || current_setting('dep.x');
DELETE FROM public.categories WHERE nom LIKE '% dep ' || current_setting('dep.x') AND parent_id IS NOT NULL;
DELETE FROM public.modeles_equipements WHERE nom = 'Modèle dep ' || current_setting('dep.x');
DELETE FROM public.categories WHERE nom LIKE '% dep ' || current_setting('dep.x');
COMMIT;`,
  )
}

async function connecter(identite) {
  const client = createClient(API, ANON, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `dep-${identite}`,
    },
  })
  const { error } = await client.auth.signInWithPassword({
    email: `${identite.toLowerCase()}@martin.test`,
    password: MDP_LOCAL,
  })
  if (error) throw new Error(`Connexion ${identite} : ${error.message}`)
  return client
}

/** Appel RPC qui ne jette pas : { data, code, message }. */
async function appel(client, nom, params) {
  const { data, error } = await client.rpc(nom, params)
  return { data, code: error?.code ?? null, message: error?.message ?? null }
}

/** État du terrain, lu en superutilisateur (hors RLS). */
function etat(t) {
  return sqlJson(`SELECT json_build_object(
    'eq', (SELECT count(*) FROM public.equipements e JOIN public.locaux l ON l.id = e.local_id
           WHERE l.nom LIKE 'Chambre % ${SUFFIXE}'),
    'lot', (SELECT count(*) FROM public.equipements WHERE lot_deploiement IS NOT NULL),
    'ge', (SELECT count(*) FROM public.gammes_equipements WHERE gamme_id = '${t.gamme}'),
    'opex', (SELECT count(*) FROM public.operations_execution WHERE ordre_travail_id = '${t.ot}'))`)
}

/**
 * L'OT ouvert suit les équipements liés : 2 opérations par équipement lié
 * (repli : 2 lignes génériques sans équipement lié), ensembles identiques.
 */
function otCoherent(t) {
  const r = sqlJson(`SELECT json_build_object(
    'lies', (SELECT coalesce(json_agg(equipement_id ORDER BY equipement_id), '[]')
             FROM public.gammes_equipements WHERE gamme_id = '${t.gamme}'),
    'total', (SELECT count(*) FROM public.operations_execution WHERE ordre_travail_id = '${t.ot}'),
    'eqs', (SELECT coalesce(json_agg(DISTINCT equipement_id ORDER BY equipement_id), '[]')
            FROM public.operations_execution WHERE ordre_travail_id = '${t.ot}' AND equipement_id IS NOT NULL))`)
  const attendu = 2 * Math.max(r.lies.length, 1)
  if (r.total !== attendu)
    return `OT : ${r.total} opération(s), ${attendu} attendue(s)`
  if (JSON.stringify(r.eqs) !== JSON.stringify(r.lies))
    return 'OT : équipements des opérations ≠ équipements liés'
  return null
}

/** Reproduction du front : parseChamps → valeur ?? defaut ?? null → valeurs → principal. */
function formeFront(gabarit, valeurs, principal, nomLieu) {
  const CLES = [
    'cle',
    'type',
    'unite',
    'options',
    'libelleA',
    'libelleB',
    'requis',
    'defaut',
  ]
  const champs = gabarit.champs.map((c) => {
    const o = {}
    for (const k of CLES) if (k in c) o[k] = c[k]
    o.valeur = c.valeur ?? c.defaut ?? null
    return o
  })
  for (const [cle, v] of Object.entries(valeurs ?? {}))
    champs.find((c) => c.cle === cle).valeur = v
  if (principal && !(principal in (valeurs ?? {}))) {
    const c = champs.find((x) => x.cle === principal && x.type === 'texte')
    if (c) c.valeur = nomLieu
  }
  return { champs }
}

function trieObjet(o) {
  if (o === null || typeof o !== 'object') return o
  if (Array.isArray(o)) return o.map(trieObjet)
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .map((k) => [k, trieObjet(o[k])]),
  )
}
const memeForme = (a, b) =>
  JSON.stringify(trieObjet(a)) === JSON.stringify(trieObjet(b))

/** Contrôle la forme des équipements créés ; renvoie la liste des écarts. */
function controlerForme(ids, t, { modele }) {
  const lignes = sqlJson(`SELECT coalesce(json_agg(json_build_object(
      'id', e.id, 'nom', l.nom, 'specs', e.specifications, 'categorie', e.categorie_id,
      'modele', e.copie_depuis_modele_id, 'miniature', e.miniature_id, 'lot', e.lot_deploiement,
      'code', e.code_inventaire)), '[]')
    FROM public.equipements e JOIN public.locaux l ON l.id = e.local_id
    WHERE e.id = ANY ('{${ids.join(',')}}'::uuid[])`)
  const ecarts = []
  if (lignes.length !== ids.length)
    ecarts.push(`${lignes.length} équipement(s) relus sur ${ids.length}`)
  for (const e of lignes) {
    const voulu = formeFront(t.gabarit, VALEURS, 'Numéro', e.nom)
    if (!memeForme(e.specs, voulu))
      ecarts.push(
        `forme ${e.nom} : ${JSON.stringify(e.specs)} ≠ ${JSON.stringify(voulu)}`,
      )
    if (e.categorie !== (modele ? t.flotte_modele : t.flotte))
      ecarts.push(`${e.nom} : catégorie`)
    if (e.modele !== (modele ? t.modele : null))
      ecarts.push(`${e.nom} : copie_depuis_modele_id = ${e.modele}`)
    if (!e.lot) ecarts.push(`${e.nom} : sans lot`)
    if (!e.code) ecarts.push(`${e.nom} : sans code_inventaire`)
  }
  return ecarts
}

// -----------------------------------------------------------------------------
// Déroulé
// -----------------------------------------------------------------------------

async function main() {
  const t = semer()
  const lieu = (i) => t.lieux[i]
  const ecarts = []
  const epingles = []
  const lignes = []
  /** Enregistre un contrôle : `probleme` null = conforme. */
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
      JSON.stringify(obtenu) === JSON.stringify(voulu)
        ? null
        : `obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(voulu)}`,
    )

  try {
    const clients = {}
    for (const identite of IDENTITES)
      clients[identite] = await connecter(identite)
    const deployer = (identite, params) =>
      appel(clients[identite], 'deployer_equipements', {
        p_categorie_id: t.flotte,
        p_gamme_ids: [t.gamme],
        p_valeurs: VALEURS,
        ...params,
      })

    // 1. Matrice des rôles : aperçu, application, annulation ------------------
    for (const [k, identite] of IDENTITES.entries()) {
      const lieux = [lieu(10 + 2 * k), lieu(11 + 2 * k)]
      const ok = peutDeployer(identite)
      const marque = []
      const avant = etat(t)

      const apercu = await deployer(identite, { p_local_ids: lieux })
      const ap = ok
        ? constater(
            `${identite} · aperçu`,
            apercu.code
              ? `erreur ${apercu.code} ${apercu.message}`
              : apercu.data.a_creer !== 2 || apercu.data.lot !== null
                ? `a_creer=${apercu.data.a_creer}, lot=${apercu.data.lot}`
                : null,
          )
        : constater(
            `${identite} · aperçu`,
            apercu.code === '42501'
              ? null
              : `refus 42501 attendu, obtenu ${apercu.code ?? 'succès'}`,
          )
      egal(`${identite} · aperçu n'écrit rien`, etat(t), avant)
      marque.push(`aperçu ${ap ? '✓' : '✗'}`)

      const app = await deployer(identite, {
        p_local_ids: lieux,
        p_appliquer: true,
      })
      if (ok) {
        const d = app.data
        const bon = constater(
          `${identite} · application`,
          app.code
            ? `erreur ${app.code} ${app.message}`
            : d.a_creer !== 2 || d.equipement_ids.length !== 2 || !d.lot
              ? `a_creer=${d.a_creer}, ids=${d.equipement_ids.length}, lot=${d.lot}`
              : null,
        )
        const apres = etat(t)
        egal(`${identite} · application écrit`, apres, {
          ...avant,
          eq: avant.eq + 2,
          lot: avant.lot + 2,
          ge: avant.ge + 2,
          opex: 2 * (avant.ge + 2),
        })
        constater(`${identite} · OT ouvert`, otCoherent(t))
        egal(
          `${identite} · opérations ajoutées`,
          d?.gammes?.[0]?.operations_ajoutees_ot_ouverts,
          2 * (avant.ge + 2) - avant.opex,
        )
        for (const e of bon ? controlerForme(d.equipement_ids, t, {}) : [])
          constater(`${identite} · forme`, e)
        marque.push(`application ${bon ? '✓' : '✗'}`)

        if (bon) {
          const annul = await appel(clients[identite], 'annuler_deploiement', {
            p_lot: d.lot,
            p_appliquer: true,
          })
          const ann = constater(
            `${identite} · annulation`,
            annul.code
              ? `erreur ${annul.code} ${annul.message}`
              : annul.data.supprimes !== 2
                ? `supprimes=${annul.data.supprimes}`
                : null,
          )
          egal(`${identite} · annulation rend l'état`, etat(t), avant)
          constater(`${identite} · OT après annulation`, otCoherent(t))
          marque.push(`annulation ${ann ? '✓' : '✗'}`)
        }
      } else {
        const ref = constater(
          `${identite} · application`,
          app.code === '42501'
            ? null
            : `refus 42501 attendu, obtenu ${app.code ?? 'succès'}`,
        )
        egal(`${identite} · refus n'écrit rien`, etat(t), avant)
        marque.push(`application ${ref ? '✓ refus' : '✗'}`)
      }
      lignes.push(
        `  ${identite.padEnd(12)} ${ok ? 'ok   ' : 'refus'}  ${marque.join(' · ')}`,
      )
    }

    // 2. Annulation refusée aux autres rôles sur un lot du site A -------------
    const lotAdmin = await deployer('admin', {
      p_local_ids: [lieu(30)],
      p_appliquer: true,
    })
    for (const identite of ['lecteurA', 'demandeurA', 'managerB']) {
      const avant = etat(t)
      for (const appliquer of [false, true]) {
        const r = await appel(clients[identite], 'annuler_deploiement', {
          p_lot: lotAdmin.data?.lot,
          p_appliquer: appliquer,
        })
        constater(
          `${identite} · annulation (${appliquer ? 'application' : 'aperçu'})`,
          r.code === '42501'
            ? null
            : `refus 42501 attendu, obtenu ${r.code ?? 'succès'}`,
        )
      }
      egal(`${identite} · annulation refusée n'écrit rien`, etat(t), avant)
    }
    await appel(clients.admin, 'annuler_deploiement', {
      p_lot: lotAdmin.data?.lot,
      p_appliquer: true,
    })

    // 3. Sous-catégorie liée à un modèle : copie_depuis_modele_id -------------
    {
      const r = await deployer('technicienA', {
        p_categorie_id: t.flotte_modele,
        p_local_ids: [lieu(40), lieu(41)],
        p_appliquer: true,
      })
      if (
        constater(
          'modèle · application',
          r.code ? `erreur ${r.code} ${r.message}` : null,
        )
      ) {
        egal(
          'modèle · nom du modèle',
          r.data.sous_categorie.modele,
          `Modèle dep ${SUFFIXE}`,
        )
        for (const e of controlerForme(r.data.equipement_ids, t, {
          modele: true,
        }))
          constater('modèle · forme', e)
        await appel(clients.technicienA, 'annuler_deploiement', {
          p_lot: r.data.lot,
          p_appliquer: true,
        })
      }
    }

    // 4. Doublons -------------------------------------------------------------
    {
      const lieux = [lieu(0), lieu(1)]
      const ignores = await deployer('managerA', { p_local_ids: lieux })
      egal('doublons · ignorés : a_creer', ignores.data?.a_creer, 1)
      egal(
        'doublons · ignorés : signalés',
        ignores.data?.doublons?.map((d) => d.local_id),
        [lieu(0)],
      )
      const avant = etat(t)
      const crees = await deployer('managerA', {
        p_local_ids: lieux,
        p_ignorer_doublons: false,
        p_appliquer: true,
      })
      egal('doublons · non ignorés : a_creer', crees.data?.a_creer, 2)
      egal('doublons · non ignorés : écrits', etat(t).eq, avant.eq + 2)
      await appel(clients.managerA, 'annuler_deploiement', {
        p_lot: crees.data?.lot,
        p_appliquer: true,
      })
    }

    // 5. Refus métier : rien d'écrit -------------------------------------------
    const refus = [
      ['mélange de sites', { p_local_ids: [lieu(2), t.lieu_b] }],
      [
        'gamme du commun',
        { p_local_ids: [lieu(2)], p_gamme_ids: [t.gamme_commun] },
      ],
      [
        "gamme d'un autre site",
        { p_local_ids: [lieu(2)], p_gamme_ids: [t.gamme_b] },
      ],
      [
        "sous-catégorie d'un autre site",
        { p_local_ids: [lieu(2)], p_categorie_id: t.flotte_b },
      ],
      [
        'catégorie racine (pas une flotte)',
        { p_local_ids: [lieu(2)], p_categorie_id: t.parc },
      ],
      [
        'caractéristique inconnue',
        { p_local_ids: [lieu(2)], p_valeurs: { Inconnue: 'x' } },
      ],
      [
        'valeur hors liste',
        { p_local_ids: [lieu(2)], p_valeurs: { Marque: 'Zed' } },
      ],
      [
        'plafond 500 lieux',
        { p_local_ids: Array.from({ length: 501 }, () => randomUUID()) },
      ],
    ]
    for (const [nom, params] of refus) {
      const avant = etat(t)
      const r = await deployer('admin', { ...params, p_appliquer: true })
      constater(
        `refus · ${nom}`,
        r.code ? null : 'accepté alors qu’il devait être refusé',
      )
      if (
        nom === 'plafond 500 lieux' &&
        r.message &&
        !r.message.includes('500')
      )
        constater('refus · plafond : message', r.message)
      egal(`refus · ${nom} : rien d'écrit`, etat(t), avant)
    }

    // 6. Annulation : l'historique protège ------------------------------------
    {
      const lieux = [100, 101, 102, 103, 104].map(lieu)
      const d = (
        await deployer('technicienA', { p_local_ids: lieux, p_appliquer: true })
      ).data
      const [e1, e2] = sqlJson(`SELECT json_agg(e.id ORDER BY l.nom)
        FROM public.equipements e JOIN public.locaux l ON l.id = e.local_id
        WHERE e.lot_deploiement = '${d.lot}'`)
      // e1 : une DI liée ; e2 : une opération saisie (commentaire) sur l'OT ouvert.
      sql(`WITH di AS (
          INSERT INTO public.demandes_intervention (site_id, created_by, constat, date_constat)
          VALUES ('${SEMIS.A.site}', '${SEMIS.users.technicienA}', 'Fuite dep ${SUFFIXE}', CURRENT_DATE)
          RETURNING id)
        INSERT INTO public.di_equipements (di_id, equipement_id) SELECT id, '${e1}' FROM di`)
      sql(`UPDATE public.operations_execution SET commentaires = 'Vu'
        WHERE id = (SELECT id FROM public.operations_execution
                    WHERE ordre_travail_id = '${t.ot}' AND equipement_id = '${e2}' LIMIT 1)`)
      const avant = etat(t)
      const apercu = await appel(clients.technicienA, 'annuler_deploiement', {
        p_lot: d.lot,
      })
      egal(
        'annulation · aperçu',
        apercu.data && {
          total: apercu.data.total,
          a_supprimer: apercu.data.a_supprimer,
          conserves: apercu.data.conserves
            .map((c) => [c.id, c.raisons])
            .sort((a, b) => a[0].localeCompare(b[0])),
          retirees: apercu.data.gammes[0]?.operations_retirees_ot_ouverts,
        },
        {
          total: 5,
          a_supprimer: 3,
          conserves: [
            [e1, ['DI liées']],
            [e2, ['OT exécutés']],
          ].sort((a, b) => a[0].localeCompare(b[0])),
          retirees: 6,
        },
      )
      egal("annulation · aperçu n'écrit rien", etat(t), avant)
      const app = await appel(clients.technicienA, 'annuler_deploiement', {
        p_lot: d.lot,
        p_appliquer: true,
      })
      egal('annulation · supprimés', app.data?.supprimes, 3)
      egal('annulation · état', etat(t), {
        ...avant,
        eq: avant.eq - 3,
        lot: avant.lot - 3,
        ge: avant.ge - 3,
        opex: avant.opex - 6,
      })
      constater('annulation · OT ouvert', otCoherent(t))
      egal(
        'annulation · restent du lot',
        sqlJson(
          `SELECT json_agg(id ORDER BY id) FROM public.equipements WHERE lot_deploiement = '${d.lot}'`,
        ),
        [e1, e2].sort(),
      )
      // Nettoyage des deux conservés (hors du chemin testé).
      sql(
        `DELETE FROM public.demandes_intervention WHERE constat = 'Fuite dep ${SUFFIXE}'`,
      )
      sql(
        `UPDATE public.operations_execution SET commentaires = NULL WHERE ordre_travail_id = '${t.ot}'`,
      )
      await appel(clients.technicienA, 'annuler_deploiement', {
        p_lot: d.lot,
        p_appliquer: true,
      })
      egal('annulation · lot vidé', etat(t).lot, 0)
    }

    // 7. Hors lot : le déclencheur par ligne et le garde du lot ---------------
    {
      const tech = clients.technicienA
      const avant = etat(t)
      const lien = await tech
        .from('gammes_equipements')
        .insert({ gamme_id: t.gamme, equipement_id: t.doublon })
      constater('hors lot · lier', lien.error ? lien.error.message : null)
      egal(
        'hors lot · OT synchronisé à la ligne',
        etat(t).opex,
        2 * (avant.ge + 1),
      )
      constater('hors lot · OT ouvert', otCoherent(t))
      await tech
        .from('gammes_equipements')
        .delete()
        .eq('gamme_id', t.gamme)
        .eq('equipement_id', t.doublon)
      egal('hors lot · délier rend l’état', etat(t), avant)
      const pose = await tech.from('equipements').insert({
        local_id: lieu(5),
        categorie_id: t.flotte,
        specifications: { champs: [] },
        lot_deploiement: randomUUID(),
      })
      constater(
        'hors lot · lot posé à la main refusé',
        pose.error?.code === '42501'
          ? null
          : `refus attendu, obtenu ${pose.error?.code ?? 'succès'}`,
      )
    }

    // 8. MESURE : 200 lieux × gamme répétée -----------------------------------
    const ids200 = t.lieux.slice(25, 225)
    const mesure = (avecLot) =>
      sql(`BEGIN;
SET LOCAL track_functions = 'all';
SELECT set_config('dep.t0', clock_timestamp()::text, true);
SELECT set_config('request.jwt.claims', json_build_object('sub', '${SEMIS.users.technicienA}', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
${
  avecLot
    ? `SELECT public.deployer_equipements('${t.flotte}', '{${ids200.join(',')}}'::uuid[], NULL, ARRAY['${t.gamme}'::uuid], true, true);`
    : `INSERT INTO public.equipements (local_id, categorie_id, specifications)
         SELECT unnest('{${ids200.join(',')}}'::uuid[]), '${t.flotte}', '{"champs": []}';
       INSERT INTO public.gammes_equipements (gamme_id, equipement_id)
         SELECT '${t.gamme}', e.id FROM public.equipements e
         WHERE e.local_id = ANY ('{${ids200.join(',')}}'::uuid[]) AND e.categorie_id = '${t.flotte}';`
}
RESET ROLE;
SELECT json_build_object(
  'ms', round(extract(epoch FROM clock_timestamp() - current_setting('dep.t0')::timestamptz) * 1000),
  'synchro', pg_stat_get_xact_function_calls('public.synchroniser_ops_gamme'::regproc),
  'rafraichir', pg_stat_get_xact_function_calls('public.rafraichir_snapshots_ot_ouverts'::regproc),
  'opex', (SELECT count(*) FROM public.operations_execution WHERE ordre_travail_id = '${t.ot}'));
ROLLBACK;`)
        .split('\n')
        .at(-1)
    const lot = JSON.parse(mesure(true))
    const sansLot = JSON.parse(mesure(false))
    egal('mesure · synchros avec lot', [lot.synchro, lot.rafraichir], [1, 1])
    egal('mesure · OT à 400 opérations', lot.opex, 400)
    egal('mesure · même résultat sans lot', sansLot.opex, lot.opex)
    egal('mesure · rien de gardé', etat(t).lot, 0)

    // Chemin réel (PostgREST) : application puis annulation, chronométrées.
    let debut = performance.now()
    const reel = await deployer('technicienA', {
      p_local_ids: ids200,
      p_valeurs: null,
      p_appliquer: true,
    })
    const msDeployer = Math.round(performance.now() - debut)
    egal('mesure · 200 créés (RPC)', reel.data?.equipement_ids?.length, 200)
    debut = performance.now()
    const annul = await appel(clients.technicienA, 'annuler_deploiement', {
      p_lot: reel.data?.lot,
      p_appliquer: true,
    })
    const msAnnuler = Math.round(performance.now() - debut)
    egal('mesure · 200 supprimés (RPC)', annul.data?.supprimes, 200)
    constater('mesure · OT après annulation', otCoherent(t))

    console.log('=== Matrice identité × site A (déployer puis annuler) ===')
    console.log(lignes.join('\n'))
    console.log(
      `\nMesure 200 lieux × gamme répétée (2 opérations, 1 OT ouvert) :\n` +
        `  avec lot  : ${lot.ms} ms en base, ${lot.synchro} synchro(s) de gamme, ${lot.rafraichir} rafraîchissement(s)\n` +
        `  sans lot  : ${sansLot.ms} ms en base, ${sansLot.synchro} synchro(s), ${sansLot.rafraichir} rafraîchissement(s) (déclencheur par ligne)\n` +
        `  RPC réelle : déployer ${msDeployer} ms, annuler ${msAnnuler} ms`,
    )
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
    menager()
  }
}

main().catch((e) => {
  console.error(`ÉCHEC D’EXÉCUTION : ${e.message}`)
  process.exit(1)
})
