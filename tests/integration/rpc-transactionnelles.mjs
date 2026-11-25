// =============================================================================
// Intégration — RPC transactionnelles 175-176, jouées dans une VRAIE base
// =============================================================================
// Lancé par `npm run base:tester` (après `npm run base:monter`), ou seul :
//   MARTIN_LOCAL_DIR=supabase-local node tests/integration/rpc-transactionnelles.mjs
//
// Ce que la simulation (tests *.dom.test.tsx) ne peut pas prouver : que la RLS
// et les déclencheurs de la base acceptent ou refusent réellement chaque appel,
// et qu'un échec AU MILIEU d'une RPC n'écrit rien.
//
// GARDE-FOUS
// - Cible : `tests/securite/cible.mjs`, qui refuse tout ce qui n'est pas
//   127.0.0.1/localhost (API et base). Rien ne part vers la production.
// - Chaque rôle joue avec la clé PUBLIQUE et son vrai jeton (comptes semés par
//   `tests/securite/semis.mjs`, mot de passe de test LOCAL). La clé de service
//   ne sert qu'à préparer le terrain et à constater l'état après coup.
// - Un écart entre « attendu » et « obtenu » est un FINDING à rapporter au PO :
//   on ne corrige ni la policy ni l'attendu pour faire passer le test.
//
// MATRICE ATTENDUE rôle × RPC (déduite de `src/lib/permissions.ts` et des
// policies RLS des tables écrites ; « site » = site du compte, « autre » = l'autre)
//
//                        admin   manager    technicien  lecteur  demandeur
//                                site/autre site/autre  —        site/autre
//   creer_demande        ok      ok / refus ok / refus  refus    ok / refus     canCreateDemande ; di_*_insert
//   modifier_demande     ok      ok / refus ok / refus  refus    refus (*)      canEditDemande ; di_*_update
//   enregistrer_travaux  ok      ok / refus ok / refus  refus    refus          canManageMetier ; travaux_*
//     (création et modification)
//   enregistrer_evenement ok     ok / refus ok / refus  refus    refus          canManageMetier ; evenements_*
//     (création et modification)
//   poser_devis_retenus  ok      ok / refus ok / refus  refus    refus          canManage de la page (métier) ; inv_devis_scoped
//
//   (*) demandeur : SA demande encore Ouverte = ok ; celle d'un autre, ou la
//       sienne une fois prise en charge = refus (canEditDemande, di_demandeur_update).
//
//   « ok »    = pas d'erreur ET l'écriture est constatée en base.
//   « refus » = une erreur est levée (42501 attendu) ET rien n'est écrit.
//   Obtenu « sans effet » (pas d'erreur, rien d'écrit) ≠ « refus » : la doctrine
//   175 promet un 42501 quand la ligne principale est hors périmètre.
//
// ATOMICITÉ : pour chaque RPC, un échec provoqué au milieu (liaison ou tâche
// d'un autre site, déclencheur temporaire qui casse la 2e écriture) doit laisser
// la base exactement dans son état d'avant.
// =============================================================================
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { ANON, API, DB, SERVICE } from '../securite/cible.mjs'

const SEMIS = JSON.parse(
  readFileSync(new URL('../securite/seed-data.json', import.meta.url), 'utf8'),
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
  'technicienB',
]
const SITES = ['A', 'B']
const AUJOURDHUI = new Date().toISOString().slice(0, 10)
const sansSession = {
  auth: { persistSession: false, autoRefreshToken: false },
}

const service = createClient(API, SERVICE, sansSession)

const roleDe = (identite) => identite.replace(/[AB]$/, '')
const siteDe = (identite) => (identite === 'admin' ? null : identite.at(-1))
let compteur = 0
const unique = (prefixe) => `${prefixe} IT-${Date.now()}-${++compteur}`

/** Rôles qui écrivent via chaque RPC, sur LEUR site (l'admin : partout). */
const ECRIVAINS = {
  creer_demande: ['manager', 'technicien', 'demandeur'],
  modifier_demande: ['manager', 'technicien'],
  'enregistrer_travaux (création)': ['manager', 'technicien'],
  'enregistrer_travaux (modification)': ['manager', 'technicien'],
  'enregistrer_evenement (création)': ['manager', 'technicien'],
  'enregistrer_evenement (modification)': ['manager', 'technicien'],
  poser_devis_retenus: ['manager', 'technicien'],
}

/**
 * Écarts CONNUS, épinglés comme un `it.fails` : clé exacte du cas
 * (`rpc · identité · site`) → motif. Un cas épinglé qui échoue comme prévu ne
 * fait pas échouer la suite ; un cas épinglé qui PASSE la fait échouer (le bug
 * est corrigé : retirer l'épinglage) ; tout autre écart la fait échouer.
 *
 * Historique : les 8 refus silencieux de poser_devis_retenus (25/11/2026) sont
 * corrigés par la migration 177 (refus explicite 42501) — épinglage retiré.
 */
/** @type {Map<string, string>} */
const ECARTS_CONNUS = new Map()

function attendu(rpc, identite, site) {
  if (identite === 'admin') return 'ok'
  return ECRIVAINS[rpc].includes(roleDe(identite)) && siteDe(identite) === site
    ? 'ok'
    : 'refus'
}

// -----------------------------------------------------------------------------
// Outils
// -----------------------------------------------------------------------------

async function connecter(identite) {
  const client = createClient(API, ANON, {
    auth: { ...sansSession.auth, storageKey: `it-${identite}` },
  })
  const { error } = await client.auth.signInWithPassword({
    email: `${identite.toLowerCase()}@martin.test`,
    password: MDP_LOCAL,
  })
  if (error) throw new Error(`Connexion ${identite} : ${error.message}`)
  return client
}

/** Lecture « vérité terrain » (clé de service : hors RLS, constat seulement). */
async function lire(table, colonnes, filtres) {
  let q = service.from(table).select(colonnes)
  for (const [col, val] of Object.entries(filtres)) q = q.eq(col, val)
  const { data, error } = await q
  if (error) throw new Error(`lecture ${table} : ${error.message}`)
  return data
}

async function ecrireService(table, verbe, valeurs, filtres = {}) {
  let q =
    verbe === 'insert'
      ? service.from(table).insert(valeurs)
      : verbe === 'update'
        ? service.from(table).update(valeurs)
        : service.from(table).delete()
  for (const [col, val] of Object.entries(filtres)) q = q.eq(col, val)
  const { data, error } = await q.select()
  if (error) throw new Error(`${verbe} ${table} : ${error.message}`)
  return data
}

/** SQL sur la base LOCALE (cible.mjs a vérifié 127.0.0.1) — préparation de panne. */
function psql(sql) {
  // SQL par l'entrée standard, pas par `-c` : sous Windows, un argument de
  // ligne de commande passe par la page de code locale et casse les accents.
  const r = spawnSync(
    'psql',
    ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-1', DB, '-f', '-'],
    {
      input: sql,
      encoding: 'utf8',
      env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
    },
  )
  if (r.status !== 0) throw new Error(`psql : ${r.stderr}`)
}

/**
 * Joue un appel et classe le résultat. `ecrit()` constate en base (clé de
 * service) si l'écriture visée a eu lieu.
 */
async function jouer(appel, ecrit) {
  const { error } = await appel()
  const aEcrit = await ecrit()
  if (error)
    return {
      obtenu: aEcrit ? 'FUITE (erreur mais écrit)' : 'refus',
      code: error.code ?? '?',
    }
  return { obtenu: aEcrit ? 'ok' : 'sans effet', code: '' }
}

// -----------------------------------------------------------------------------
// Cas par RPC : (client, identité, site visé) → résultat
// -----------------------------------------------------------------------------

const travauxDe = (site) => SEMIS[site].interventions_travaux
const evenementDe = (site) => SEMIS[site].evenements

/** Deux devis par projet semé : d1 retenu, d2 non. Remis à l'état avant chaque appel. */
const devis = {}

async function remettreDevis(site) {
  await ecrireService(
    'investissements_devis',
    'update',
    { retenu: true },
    { id: devis[site].d1 },
  )
  await ecrireService(
    'investissements_devis',
    'update',
    { retenu: false },
    { id: devis[site].d2 },
  )
}

const CAS = {
  async creer_demande(client, _identite, site) {
    const constat = unique('Constat')
    const r = await jouer(
      () =>
        client.rpc('creer_demande', {
          p_site_id: SEMIS.sites[site],
          p_constat: constat,
          p_date_constat: AUJOURDHUI,
          p_local_id: SEMIS[site].local,
        }),
      async () =>
        (await lire('demandes_intervention', 'id', { constat })).length === 1,
    )
    await ecrireService('demandes_intervention', 'delete', null, { constat })
    return r
  },

  async modifier_demande(client, _identite, site) {
    const constat = unique('Constat modifié')
    const id = SEMIS[site].demandes_intervention
    return jouer(
      () =>
        client.rpc('modifier_demande', {
          p_id: id,
          p_constat: constat,
          p_liaisons: false,
        }),
      async () =>
        (await lire('demandes_intervention', 'constat', { id }))[0]?.constat ===
        constat,
    )
  },

  async 'enregistrer_travaux (création)'(client, _identite, site) {
    const titre = unique('Travaux')
    const r = await jouer(
      () =>
        client.rpc('enregistrer_travaux', {
          p_site_id: SEMIS.sites[site],
          p_fiche: { titre, date_demande: AUJOURDHUI },
          p_taches: {
            ajouter: [
              { libelle: 'Tâche 1', local_id: SEMIS[site].local, ordre: 0 },
            ],
          },
        }),
      async () => {
        const fiches = await lire('interventions_travaux', 'id', { titre })
        if (fiches.length !== 1) return false
        const taches = await lire('travaux_taches', 'id', {
          travaux_id: fiches[0].id,
        })
        return taches.length === 1
      },
    )
    await ecrireService('interventions_travaux', 'delete', null, { titre })
    return r
  },

  async 'enregistrer_travaux (modification)'(client, _identite, site) {
    const titre = unique('Travaux modifiés')
    const id = travauxDe(site)
    return jouer(
      () =>
        client.rpc('enregistrer_travaux', {
          p_id: id,
          p_fiche: { titre, date_demande: AUJOURDHUI },
        }),
      async () =>
        (await lire('interventions_travaux', 'titre', { id }))[0]?.titre ===
        titre,
    )
  },

  async 'enregistrer_evenement (création)'(client, _identite, site) {
    const titre = unique('Événement')
    const r = await jouer(
      () =>
        client.rpc('enregistrer_evenement', {
          p_site_id: SEMIS.sites[site],
          p_fiche: { titre, date_evenement: AUJOURDHUI },
          p_taches: {
            ajouter: [
              { libelle: 'Lieu 1', local_id: SEMIS[site].local, ordre: 0 },
            ],
          },
        }),
      async () => {
        const fiches = await lire('evenements', 'id', { titre })
        if (fiches.length !== 1) return false
        const lieux = await lire('evenements_lieux', 'id', {
          evenement_id: fiches[0].id,
        })
        return lieux.length === 1
      },
    )
    await ecrireService('evenements', 'delete', null, { titre })
    return r
  },

  async 'enregistrer_evenement (modification)'(client, _identite, site) {
    const titre = unique('Événement modifié')
    const id = evenementDe(site)
    return jouer(
      () =>
        client.rpc('enregistrer_evenement', {
          p_id: id,
          p_fiche: { titre, date_evenement: AUJOURDHUI },
        }),
      async () =>
        (await lire('evenements', 'titre', { id }))[0]?.titre === titre,
    )
  },

  async poser_devis_retenus(client, _identite, site) {
    await remettreDevis(site)
    const { d1, d2 } = devis[site]
    return jouer(
      () =>
        client.rpc('poser_devis_retenus', {
          p_projet_id: SEMIS[site].investissements,
          p_retenus: [d2],
        }),
      async () => {
        const lignes = await lire('investissements_devis', 'id, retenu', {
          investissement_id: SEMIS[site].investissements,
        })
        const retenu = (id) => lignes.find((l) => l.id === id)?.retenu
        return retenu(d2) === true && retenu(d1) === false
      },
    )
  },
}

// -----------------------------------------------------------------------------
// Atomicité : un échec au milieu ne doit RIEN laisser
// -----------------------------------------------------------------------------

async function atomicite(clients) {
  const tech = clients.technicienA
  const A = SEMIS.A
  const B = SEMIS.B
  const resultats = []
  const verifier = async (nom, appel, etatIntact) => {
    const { error } = await appel()
    const intact = await etatIntact()
    resultats.push({
      nom,
      ok: Boolean(error) && intact,
      detail: error
        ? `erreur ${error.code ?? '?'} ; état ${intact ? 'intact' : 'MODIFIÉ'}`
        : `AUCUNE erreur ; état ${intact ? 'intact' : 'MODIFIÉ'}`,
    })
  }

  // 1. creer_demande : DI insérée, lieu inséré, PUIS équipement d'un autre site.
  {
    const constat = unique('Atomicité DI')
    await verifier(
      'creer_demande — équipement d’un autre site après le lieu',
      () =>
        tech.rpc('creer_demande', {
          p_site_id: SEMIS.sites.A,
          p_constat: constat,
          p_date_constat: AUJOURDHUI,
          p_local_id: A.local,
          p_equipement_id: B.equipement,
        }),
      async () =>
        (await lire('demandes_intervention', 'id', { constat })).length === 0,
    )
  }

  // 2. modifier_demande : constat changé, lieux retirés, PUIS équipement hors site.
  {
    const id = A.demandes_intervention
    await ecrireService('di_localisations', 'delete', null, { di_id: id })
    await ecrireService('di_localisations', 'insert', {
      di_id: id,
      local_id: A.local,
    })
    const avant = (await lire('demandes_intervention', 'constat', { id }))[0]
      .constat
    await verifier(
      'modifier_demande — liaisons remises à plat puis équipement d’un autre site',
      () =>
        tech.rpc('modifier_demande', {
          p_id: id,
          p_constat: unique('Ne doit pas rester'),
          p_liaisons: true,
          p_local_id: A.local,
          p_equipement_id: B.equipement,
        }),
      async () =>
        (await lire('demandes_intervention', 'constat', { id }))[0].constat ===
          avant &&
        (await lire('di_localisations', 'local_id', { di_id: id })).length ===
          1,
    )
  }

  // 3. enregistrer_travaux (création) : fiche + 1re tâche valides, 2e tâche hors site.
  {
    const titre = unique('Atomicité travaux')
    await verifier(
      'enregistrer_travaux (création) — 2e tâche sur un lieu d’un autre site',
      () =>
        tech.rpc('enregistrer_travaux', {
          p_site_id: SEMIS.sites.A,
          p_fiche: { titre, date_demande: AUJOURDHUI },
          p_taches: {
            ajouter: [
              { libelle: 'Valide', local_id: A.local, ordre: 0 },
              { libelle: 'Hors site', local_id: B.local, ordre: 1 },
            ],
          },
        }),
      async () =>
        (await lire('interventions_travaux', 'id', { titre })).length === 0,
    )
  }

  // 4. enregistrer_travaux (modification) : fiche modifiée, tâche supprimée, PUIS ajout hors site.
  {
    const id = A.interventions_travaux
    const [tache] = await ecrireService('travaux_taches', 'insert', {
      travaux_id: id,
      libelle: 'Tâche existante',
      ordre: 0,
    })
    const avant = (await lire('interventions_travaux', 'titre', { id }))[0]
      .titre
    await verifier(
      'enregistrer_travaux (modification) — suppression puis ajout hors site',
      () =>
        tech.rpc('enregistrer_travaux', {
          p_id: id,
          p_fiche: {
            titre: unique('Ne doit pas rester'),
            date_demande: AUJOURDHUI,
          },
          p_taches: {
            supprimer: [tache.id],
            ajouter: [{ libelle: 'Hors site', local_id: B.local, ordre: 1 }],
          },
        }),
      async () =>
        (await lire('interventions_travaux', 'titre', { id }))[0].titre ===
          avant &&
        (await lire('travaux_taches', 'id', { id: tache.id })).length === 1,
    )
    await ecrireService('travaux_taches', 'delete', null, { id: tache.id })
  }

  // 5. enregistrer_evenement (création) : 2e lieu hors site.
  {
    const titre = unique('Atomicité événement')
    await verifier(
      'enregistrer_evenement (création) — 2e lieu d’un autre site',
      () =>
        tech.rpc('enregistrer_evenement', {
          p_site_id: SEMIS.sites.A,
          p_fiche: { titre, date_evenement: AUJOURDHUI },
          p_taches: {
            ajouter: [
              { libelle: 'Valide', local_id: A.local, ordre: 0 },
              { libelle: 'Hors site', local_id: B.local, ordre: 1 },
            ],
          },
        }),
      async () => (await lire('evenements', 'id', { titre })).length === 0,
    )
  }

  // 6. poser_devis_retenus : tout décoché (1re écriture), PUIS la 2e casse.
  //    Rien dans le schéma ne peut faire échouer la 2e écriture : on pose, sur
  //    CETTE base jetable, un déclencheur temporaire qui refuse un devis précis.
  {
    await remettreDevis('A')
    const [piege] = await ecrireService('investissements_devis', 'insert', {
      investissement_id: A.investissements,
      fournisseur: 'Devis piégé (test)',
      montant_ht: 1,
    })
    psql(`
      CREATE FUNCTION public.it_piege_devis() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.retenu AND NEW.id = '${piege.id}' THEN
          RAISE EXCEPTION 'échec provoqué par le test d''intégration';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER it_piege_devis BEFORE UPDATE ON public.investissements_devis
        FOR EACH ROW EXECUTE FUNCTION public.it_piege_devis();`)
    try {
      await verifier(
        'poser_devis_retenus — tout décoché puis la pose échoue',
        () =>
          tech.rpc('poser_devis_retenus', {
            p_projet_id: A.investissements,
            p_retenus: [devis.A.d2, piege.id],
          }),
        async () =>
          (await lire('investissements_devis', 'retenu', { id: devis.A.d1 }))[0]
            .retenu === true,
      )
    } finally {
      psql(
        'DROP TRIGGER IF EXISTS it_piege_devis ON public.investissements_devis; DROP FUNCTION IF EXISTS public.it_piege_devis();',
      )
      await ecrireService('investissements_devis', 'delete', null, {
        id: piege.id,
      })
    }
  }

  return resultats
}

// -----------------------------------------------------------------------------
// Déroulé
// -----------------------------------------------------------------------------

async function main() {
  // Terrain : deux devis par projet semé.
  for (const site of SITES) {
    const lignes = await ecrireService('investissements_devis', 'insert', [
      {
        investissement_id: SEMIS[site].investissements,
        fournisseur: 'Fournisseur 1',
        montant_ht: 100,
        retenu: true,
      },
      {
        investissement_id: SEMIS[site].investissements,
        fournisseur: 'Fournisseur 2',
        montant_ht: 200,
        retenu: false,
      },
    ])
    devis[site] = { d1: lignes[0].id, d2: lignes[1].id }
  }

  const clients = {}
  for (const identite of IDENTITES)
    clients[identite] = await connecter(identite)

  const ecarts = []
  const epingles = []
  const lignesMatrice = []
  for (const rpc of Object.keys(CAS)) {
    lignesMatrice.push(`\n${rpc}`)
    for (const identite of IDENTITES) {
      const cellules = []
      for (const site of SITES) {
        const att = attendu(rpc, identite, site)
        const r = await CAS[rpc](clients[identite], identite, site)
        const bon = r.obtenu === att
        const cle = `${rpc} · ${identite} · ${site}`
        const motif = ECARTS_CONNUS.get(cle)
        const constat = `attendu « ${att} », obtenu « ${r.obtenu} »${r.code ? ` (${r.code})` : ''}`
        if (motif !== undefined && !bon)
          epingles.push(`${cle} : ${constat} — ${motif}`)
        else if (motif !== undefined)
          ecarts.push(
            `${cle} : passe désormais — bug corrigé : retirer l'épinglage`,
          )
        else if (!bon) ecarts.push(`${cle} : ${constat}`)
        const marque = motif !== undefined && !bon ? '⚑' : bon ? '✓' : '✗'
        cellules.push(
          `${site}: ${marque} ${r.obtenu}${r.code ? ` ${r.code}` : ''}`.padEnd(
            30,
          ),
        )
      }
      lignesMatrice.push(`  ${identite.padEnd(12)} ${cellules.join(' ')}`)
    }
  }

  // Cas propres au demandeur (sa demande à lui).
  const demandeur = clients.demandeurA
  const [sienne] = await ecrireService('demandes_intervention', 'insert', {
    site_id: SEMIS.sites.A,
    created_by: SEMIS.users.demandeurA,
    constat: unique('DI du demandeur'),
    date_constat: AUJOURDHUI,
  })
  const casDemandeur = async (nom, att) => {
    const constat = unique('Constat demandeur')
    const r = await jouer(
      () =>
        demandeur.rpc('modifier_demande', {
          p_id: sienne.id,
          p_constat: constat,
          p_liaisons: false,
        }),
      async () =>
        (await lire('demandes_intervention', 'constat', { id: sienne.id }))[0]
          ?.constat === constat,
    )
    const bon = r.obtenu === att
    if (!bon)
      ecarts.push(
        `modifier_demande · ${nom} : attendu « ${att} », obtenu « ${r.obtenu} »`,
      )
    lignesMatrice.push(`  ${bon ? '✓' : '✗'} ${nom} : ${r.obtenu} ${r.code}`)
  }
  lignesMatrice.push('\nmodifier_demande — demandeurA sur SA demande')
  await casDemandeur('sa DI Ouverte', 'ok')
  await ecrireService(
    'demandes_intervention',
    'update',
    { statut_di_id: 2 },
    { id: sienne.id },
  )
  await casDemandeur('sa DI prise en charge', 'refus')
  await ecrireService('demandes_intervention', 'delete', null, {
    id: sienne.id,
  })

  console.log(
    '=== Matrice rôle × RPC (✓ = conforme à l’attendu, ⚑ = écart connu épinglé) ===',
  )
  console.log(lignesMatrice.join('\n'))

  console.log('\n=== Atomicité (échec au milieu → rien d’écrit) ===')
  for (const a of await atomicite(clients)) {
    console.log(`  ${a.ok ? '✓' : '✗'} ${a.nom} : ${a.detail}`)
    if (!a.ok) ecarts.push(`ATOMICITÉ · ${a.nom} : ${a.detail}`)
  }

  // Ménage du terrain (la base est jetable, mais un second passage doit rester juste).
  for (const site of SITES)
    await ecrireService('investissements_devis', 'delete', null, {
      investissement_id: SEMIS[site].investissements,
    })

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
  // Code 3 : la suite a tourné jusqu'au bout mais trouve des écarts (1 = panne).
  if (ecarts.length) process.exitCode = 3
}

main().catch((e) => {
  console.error(`ÉCHEC D’EXÉCUTION : ${e.message}`)
  process.exit(1)
})
