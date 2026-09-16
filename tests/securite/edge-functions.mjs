// =============================================================================
// Martin — ATTAQUE DES EDGE FUNCTIONS — base LOCALE JETABLE uniquement
// =============================================================================
// Les trois fonctions detiennent la cle service_role : elles peuvent creer un
// compte, changer un mot de passe, changer un e-mail. Ce sont donc les seuls
// endroits de l application ou une faille donne un pouvoir illimite.
//
// Elles sont servies ici avec --no-verify-jwt : la verification de jeton par la
// PLATEFORME est desactivee exprès, pour tester ce que le CODE de la fonction
// controle lui-meme. C est le pire cas realiste — un reglage de deploiement
// different ne doit pas suffire a ouvrir la porte.
// =============================================================================
import { readFileSync } from 'node:fs'

const FN = 'http://127.0.0.1:54521/functions/v1'
const API = 'http://127.0.0.1:54521'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const d = JSON.parse(
  readFileSync(new URL('./seed-data.json', import.meta.url), 'utf8'),
)

// JWT arbitraire, signe avec le secret de DEMO de la pile locale, portant un
// role Postgres eleve : il teste si une fonction fait confiance au CONTENU du
// jeton plutot qu a une verification serveur.
const JWT_FORGE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const JWT_EXPIRE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjF9.invalide'

async function jeton(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'MartinTest!2026#aB' }),
  })
  return (await r.json()).access_token
}

async function appel(fonction, jwt, corps) {
  const headers = { apikey: ANON, 'Content-Type': 'application/json' }
  if (jwt !== null) headers.Authorization = `Bearer ${jwt}`
  try {
    const r = await fetch(`${FN}/${fonction}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(corps),
    })
    const t = await r.text()
    let j = null
    try {
      j = JSON.parse(t)
    } catch {
      /* non JSON */
    }
    return {
      statut: r.status,
      msg: (j?.error ?? j?.message ?? t).toString().slice(0, 95),
    }
  } catch (e) {
    return { statut: 0, msg: `injoignable : ${e.message.slice(0, 60)}` }
  }
}

const mail = () => `cible-${Math.random().toString(16).slice(2, 8)}@martin.test`

async function main() {
  const jw = {}
  for (const [k, e] of [
    ['admin', 'admin@martin.test'],
    ['managerA', 'managera@martin.test'],
    ['technicienA', 'techniciena@martin.test'],
    ['lecteurA', 'lecteura@martin.test'],
    ['demandeurA', 'demandeura@martin.test'],
  ])
    jw[k] = await jeton(e)

  // [intitule, fonction, jeton, corps, attendu : 'REFUS' ou 'PERMIS']
  const scenarios = [
    // --- Authentification ---
    [
      'sans en-tete Authorization',
      'invite_user',
      null,
      {
        email: mail(),
        role: 'admin',
        nom_complet: 'X',
        password: 'MartinTest!2026#aB',
      },
      'REFUS',
    ],
    [
      'avec un jeton expire',
      'invite_user',
      JWT_EXPIRE,
      {
        email: mail(),
        role: 'admin',
        nom_complet: 'X',
        password: 'MartinTest!2026#aB',
      },
      'REFUS',
    ],
    [
      'avec la cle anonyme en guise de jeton',
      'invite_user',
      ANON,
      {
        email: mail(),
        role: 'admin',
        nom_complet: 'X',
        password: 'MartinTest!2026#aB',
      },
      'REFUS',
    ],
    [
      'avec un jeton portant role=service_role',
      'invite_user',
      JWT_FORGE,
      {
        email: mail(),
        role: 'admin',
        nom_complet: 'X',
        password: 'MartinTest!2026#aB',
      },
      'REFUS',
    ],

    // --- Creation de compte : la cascade des roles ---
    [
      'un lecteur invite un lecteur',
      'invite_user',
      jw.lecteurA,
      {
        email: mail(),
        role: 'lecteur',
        nom_complet: 'X',
        password: 'MartinTest!2026#aB',
        site_ids: [d.sites.A],
      },
      'REFUS',
    ],
    [
      'un demandeur invite un demandeur',
      'invite_user',
      jw.demandeurA,
      {
        email: mail(),
        role: 'demandeur',
        nom_complet: 'X',
        password: 'MartinTest!2026#aB',
        site_ids: [d.sites.A],
      },
      'REFUS',
    ],
    [
      'un technicien invite un ADMIN',
      'invite_user',
      jw.technicienA,
      {
        email: mail(),
        role: 'admin',
        nom_complet: 'X',
        password: 'MartinTest!2026#aB',
      },
      'REFUS',
    ],
    [
      'un manager invite un ADMIN',
      'invite_user',
      jw.managerA,
      {
        email: mail(),
        role: 'admin',
        nom_complet: 'X',
        password: 'MartinTest!2026#aB',
      },
      'REFUS',
    ],
    [
      'un manager invite un MANAGER',
      'invite_user',
      jw.managerA,
      {
        email: mail(),
        role: 'manager',
        nom_complet: 'X',
        password: 'MartinTest!2026#aB',
        site_ids: [d.sites.A],
      },
      'REFUS',
    ],
    [
      'un manager invite sur le site ADVERSE',
      'invite_user',
      jw.managerA,
      {
        email: mail(),
        role: 'technicien',
        nom_complet: 'X',
        password: 'MartinTest!2026#aB',
        site_ids: [d.sites.B],
      },
      'REFUS',
    ],
    [
      'un role inexistant',
      'invite_user',
      jw.admin,
      {
        email: mail(),
        role: 'superadmin',
        nom_complet: 'X',
        password: 'MartinTest!2026#aB',
      },
      'REFUS',
    ],
    [
      'un mot de passe trop faible impose',
      'invite_user',
      jw.admin,
      {
        email: mail(),
        role: 'lecteur',
        nom_complet: 'X',
        password: '1234',
        site_ids: [d.sites.A],
      },
      'REFUS',
    ],
    [
      'un manager invite un technicien de SON site',
      'invite_user',
      jw.managerA,
      {
        email: mail(),
        role: 'technicien',
        nom_complet: 'Legitime',
        password: 'MartinTest!2026#aB',
        site_ids: [d.sites.A],
      },
      'PERMIS',
    ],

    // --- Changement de mot de passe ---
    [
      'un technicien change le mdp de l ADMIN',
      'set_user_password',
      jw.technicienA,
      { user_id: d.users.admin, password: 'MartinTest!2026#aB' },
      'REFUS',
    ],
    [
      'un lecteur change le mdp d un tiers',
      'set_user_password',
      jw.lecteurA,
      { user_id: d.users.demandeurA, password: 'MartinTest!2026#aB' },
      'REFUS',
    ],
    [
      'un manager change le mdp de l ADMIN',
      'set_user_password',
      jw.managerA,
      { user_id: d.users.admin, password: 'MartinTest!2026#aB' },
      'REFUS',
    ],
    [
      'un manager change le mdp d un tech du site ADVERSE',
      'set_user_password',
      jw.managerA,
      { user_id: d.users.technicienB, password: 'MartinTest!2026#aB' },
      'REFUS',
    ],
    [
      'un manager change SON PROPRE mdp par cette voie',
      'set_user_password',
      jw.managerA,
      { user_id: d.users.managerA, password: 'MartinTest!2026#aB' },
      'REFUS',
    ],
    [
      'sans jeton, change le mdp de l ADMIN',
      'set_user_password',
      null,
      { user_id: d.users.admin, password: 'MartinTest!2026#aB' },
      'REFUS',
    ],

    // --- Changement d e-mail : administrateur seul ---
    [
      'un manager lit l e-mail de l ADMIN',
      'update_user_email',
      jw.managerA,
      { user_id: d.users.admin },
      'REFUS',
    ],
    [
      'un technicien detourne l e-mail de l ADMIN',
      'update_user_email',
      jw.technicienA,
      { user_id: d.users.admin, email: 'pirate@martin.test' },
      'REFUS',
    ],
    [
      'un demandeur detourne l e-mail de l ADMIN',
      'update_user_email',
      jw.demandeurA,
      { user_id: d.users.admin, email: 'pirate@martin.test' },
      'REFUS',
    ],
    [
      'sans jeton, detourne l e-mail de l ADMIN',
      'update_user_email',
      null,
      { user_id: d.users.admin, email: 'pirate@martin.test' },
      'REFUS',
    ],
  ]

  const findings = []
  console.log('=== Edge Functions : scenarios d attaque ===\n')
  for (const [titre, fonction, jwt, corps, attendu] of scenarios) {
    const r = await appel(fonction, jwt, corps)
    const reussi = r.statut >= 200 && r.statut < 300
    const conforme = attendu === 'REFUS' ? !reussi : reussi
    console.log(
      `${conforme ? '  ok   ' : ' ALERTE'} [${attendu.padEnd(6)}] ${fonction.padEnd(20)} ${titre.padEnd(46)} -> ${r.statut} ${r.msg}`,
    )
    if (!conforme)
      findings.push(
        `${fonction} / ${titre} : attendu ${attendu}, obtenu ${r.statut} ${r.msg}`,
      )
  }
  console.log(`\n=== ${findings.length} ecart(s) ===`)
  for (const f of findings) console.log('  ' + f)
}

main().catch((e) => {
  console.error('ECHEC:', e.message)
  process.exit(1)
})
