// =============================================================================
// Martin — TENTATIVES D ESCALADE DE PRIVILEGES — base LOCALE JETABLE uniquement
// =============================================================================
// Chaque scenario est une attaque menee avec la cle PUBLIQUE et un vrai JWT de
// role faible. L oracle est explicite pour chacun : on dit AVANT ce qui doit se
// produire, et on constate. Un scenario qui « reussit » est un finding.
// =============================================================================
import { readFileSync } from 'node:fs'

const API = 'http://127.0.0.1:54521'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const d = JSON.parse(
  readFileSync(new URL('./seed-data.json', import.meta.url), 'utf8'),
)

async function jeton(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'MartinTest!2026#aB' }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error(`connexion ${email}`)
  return j.access_token
}

async function req(jwt, methode, chemin, corps) {
  const r = await fetch(`${API}/rest/v1/${chemin}`, {
    method: methode,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const t = await r.text()
  let j = null
  try {
    j = JSON.parse(t)
  } catch {
    /* corps non JSON */
  }
  return {
    statut: r.status,
    code: j?.code ?? null,
    message: (j?.message ?? '').slice(0, 90),
    lignes: Array.isArray(j) ? j.length : 0,
  }
}

const J = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

async function main() {
  const jw = {}
  for (const [k, e] of [
    ['admin', 'admin@martin.test'],
    ['managerA', 'managera@martin.test'],
    ['technicienA', 'techniciena@martin.test'],
    ['lecteurA', 'lecteura@martin.test'],
    ['demandeurA', 'demandeura@martin.test'],
    ['technicienB', 'technicienb@martin.test'],
  ])
    jw[k] = await jeton(e)

  // Chaque scenario : [intitule, identite, attendu ('REFUS' | 'PERMIS'), action]
  const scenarios = [
    // --- Escalade de role ---
    [
      'Se promouvoir administrateur',
      'technicienA',
      'REFUS',
      (t) =>
        req(t, 'PATCH', `users?id=eq.${d.users.technicienA}`, { role_id: 1 }),
    ],
    [
      'Promouvoir un tiers administrateur',
      'managerA',
      'REFUS',
      (t) => req(t, 'PATCH', `users?id=eq.${d.users.lecteurA}`, { role_id: 1 }),
    ],
    [
      'Un lecteur se promeut technicien',
      'lecteurA',
      'REFUS',
      (t) => req(t, 'PATCH', `users?id=eq.${d.users.lecteurA}`, { role_id: 3 }),
    ],
    [
      'Reactiver un compte / se rendre actif',
      'demandeurA',
      'REFUS',
      (t) =>
        req(t, 'PATCH', `users?id=eq.${d.users.demandeurA}`, {
          est_actif: true,
        }),
    ],

    // --- Escalade de perimetre : s octroyer un site ---
    [
      'S octroyer l acces au site adverse',
      'technicienA',
      'REFUS',
      (t) =>
        req(t, 'POST', 'user_sites', {
          user_id: d.users.technicienA,
          site_id: d.sites.B,
        }),
    ],
    [
      'Octroyer le site adverse a un complice',
      'managerA',
      'REFUS',
      (t) =>
        req(t, 'POST', 'user_sites', {
          user_id: d.users.lecteurA,
          site_id: d.sites.B,
        }),
    ],
    [
      'Se retirer du site pour elargir le perimetre',
      'technicienA',
      'REFUS',
      (t) => req(t, 'DELETE', `user_sites?user_id=eq.${d.users.technicienA}`),
    ],

    // --- Creation de site (transverse, admin seul) ---
    [
      'Creer un site',
      'managerA',
      'REFUS',
      (t) => req(t, 'POST', 'sites', { nom: 'Site pirate' }),
    ],
    [
      'Renommer le site adverse',
      'technicienA',
      'REFUS',
      (t) => req(t, 'PATCH', `sites?id=eq.${d.sites.B}`, { nom: 'PWNED' }),
    ],

    // --- Le lecteur doit etre en LECTURE seule ---
    [
      'Un lecteur cree une demande',
      'lecteurA',
      'REFUS',
      (t) =>
        req(t, 'POST', 'demandes_intervention', {
          site_id: d.sites.A,
          created_by: d.users.lecteurA,
          statut_di_id: 1,
          constat: 'Ecriture par un lecteur',
          date_constat: J(0),
        }),
    ],
    [
      'Un lecteur modifie un travaux',
      'lecteurA',
      'REFUS',
      (t) =>
        req(
          t,
          'PATCH',
          `interventions_travaux?id=eq.${d.A.interventions_travaux}`,
          {
            titre: 'Modifie par un lecteur',
          },
        ),
    ],
    [
      'Un lecteur supprime un document',
      'lecteurA',
      'REFUS',
      (t) => req(t, 'DELETE', `documents?id=eq.${d.A.documents}`),
    ],

    // --- Le demandeur : sa demande, et rien d autre ---
    [
      'Un demandeur cree sa demande',
      'demandeurA',
      'PERMIS',
      (t) =>
        req(t, 'POST', 'demandes_intervention', {
          site_id: d.sites.A,
          created_by: d.users.demandeurA,
          statut_di_id: 1,
          constat: 'Demande legitime du demandeur',
          date_constat: J(0),
        }),
    ],
    [
      'Un demandeur modifie la demande d un autre',
      'demandeurA',
      'REFUS',
      (t) =>
        req(
          t,
          'PATCH',
          `demandes_intervention?id=eq.${d.A.demandes_intervention}`,
          {
            constat: 'Detourne par le demandeur',
          },
        ),
    ],
    [
      'Un demandeur cloture une demande',
      'demandeurA',
      'REFUS',
      (t) =>
        req(
          t,
          'PATCH',
          `demandes_intervention?id=eq.${d.A.demandes_intervention}`,
          {
            statut_di_id: 3,
          },
        ),
    ],
    [
      'Un demandeur lit les travaux',
      'demandeurA',
      'REFUS',
      (t) =>
        req(t, 'POST', 'interventions_travaux', {
          site_id: d.sites.A,
          created_by: d.users.demandeurA,
          statut_travaux_id: 1,
          titre: 'Travaux par un demandeur',
          date_demande: J(0),
          verrouille: false,
        }),
    ],

    // --- Falsification d auteur ---
    [
      'Creer une demande au nom d un autre',
      'technicienA',
      'REFUS',
      (t) =>
        req(t, 'POST', 'demandes_intervention', {
          site_id: d.sites.A,
          created_by: d.users.admin,
          statut_di_id: 1,
          constat: 'Attribuee a l administrateur',
          date_constat: J(0),
        }),
    ],
    [
      'Creer une donnee sur le site adverse',
      'technicienA',
      'REFUS',
      (t) =>
        req(t, 'POST', 'demandes_intervention', {
          site_id: d.sites.B,
          created_by: d.users.technicienA,
          statut_di_id: 1,
          constat: 'Injectee sur le site adverse',
          date_constat: J(0),
        }),
    ],

    // --- Journal d audit : il ne doit etre ni lisible ni falsifiable ---
    [
      'Lire le journal d audit',
      'technicienA',
      'REFUS',
      (t) => req(t, 'GET', 'audit_log?select=*&limit=5'),
    ],
    [
      'Effacer le journal d audit',
      'admin',
      'REFUS',
      (t) => req(t, 'DELETE', 'audit_log?id=gt.0'),
    ],
    [
      'Falsifier le journal d audit',
      'admin',
      'REFUS',
      (t) => req(t, 'PATCH', 'audit_log?id=gt.0', { action: 'EFFACE' }),
    ],

    // --- Referentiels : lecture pour tous, ecriture pour l administrateur ---
    [
      'Modifier un referentiel de statuts',
      'managerA',
      'REFUS',
      (t) => req(t, 'PATCH', 'statuts_di?id=eq.1', { nom: 'Pirate' }),
    ],
    [
      'Lire les referentiels',
      'lecteurA',
      'PERMIS',
      (t) => req(t, 'GET', 'periodicites?select=id&limit=3'),
    ],

    // --- Metier legitime : ces actions DOIVENT passer ---
    [
      'Un technicien cree un travaux sur son site',
      'technicienA',
      'PERMIS',
      (t) =>
        req(t, 'POST', 'interventions_travaux', {
          site_id: d.sites.A,
          created_by: d.users.technicienA,
          statut_travaux_id: 1,
          titre: 'Travaux legitime',
          date_demande: J(0),
          verrouille: false,
        }),
    ],
    [
      'Un technicien modifie un equipement de son site',
      'technicienA',
      'PERMIS',
      (t) =>
        req(t, 'PATCH', `equipements?id=eq.${d.A.equipement}`, {
          code_inventaire: 'EQ-A-MAJ',
        }),
    ],
  ]

  const findings = []
  console.log('=== Scenarios d escalade ===\n')
  for (const [titre, ident, attendu, action] of scenarios) {
    const r = await action(jw[ident])
    // « Reussi » = statut 2xx ET au moins une ligne touchee (ou lue).
    const reussi =
      r.statut >= 200 && r.statut < 300 && (r.lignes > 0 || r.statut === 204)
    const conforme = attendu === 'REFUS' ? !reussi : reussi
    const marque = conforme ? '  ok   ' : ' ALERTE'
    console.log(
      `${marque} [${attendu.padEnd(6)}] ${titre.padEnd(46)} ${ident.padEnd(12)} -> ${r.statut} ${r.code ?? ''} ${r.lignes} ligne(s) ${r.message}`,
    )
    if (!conforme)
      findings.push({
        titre,
        ident,
        attendu,
        obtenu: `${r.statut} ${r.code ?? ''} ${r.lignes} ligne(s)`,
      })
  }

  console.log(`\n=== ${findings.length} ecart(s) avec l attendu ===`)
  for (const f of findings)
    console.log(
      `  ${f.ident} / ${f.titre} : attendu ${f.attendu}, obtenu ${f.obtenu}`,
    )
}

main().catch((e) => {
  console.error('ECHEC:', e.message)
  process.exit(1)
})
