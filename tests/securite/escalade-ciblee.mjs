// =============================================================================
// Martin — VERIFICATION ADVERSE des deux ecarts — base LOCALE JETABLE
// =============================================================================
// On ne conclut pas sur un seul essai. Chaque scenario est rejoue 3 fois, et on
// verifie APRES COUP l etat reel en base (pas seulement le code HTTP) : une
// reponse 200 sur 0 ligne n est pas une reussite, et une reponse 201 dont la
// ligne n a pas les valeurs demandees non plus.
// =============================================================================
import { readFileSync } from 'node:fs'
import { API, ANON, SERVICE } from './cible.mjs'

const d = JSON.parse(
  readFileSync(new URL('./seed-data.json', import.meta.url), 'utf8'),
)
const J = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

async function jeton(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'MartinTest!2026#aB' }),
  })
  return (await r.json()).access_token
}
async function req(jwt, m, p, b) {
  const r = await fetch(`${API}/rest/v1/${p}`, {
    method: m,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: b ? JSON.stringify(b) : undefined,
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
    code: j?.code ?? null,
    msg: (j?.message ?? '').slice(0, 80),
    corps: j,
  }
}
/** Verite terrain : relue avec service_role, donc hors de portee de la RLS. */
async function verite(chemin) {
  const r = await fetch(`${API}/rest/v1/${chemin}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  })
  return await r.json()
}

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

  console.log(
    '=== A. Ecriture sur la table users : que peut-on vraiment changer ? ===\n',
  )
  const champs = [
    [
      'son propre nom',
      'demandeurA',
      d.users.demandeurA,
      { nom_complet: 'Nom change' },
    ],
    [
      'son propre telephone',
      'demandeurA',
      d.users.demandeurA,
      { telephone: '0600000000' },
    ],
    [
      'SE DESACTIVER soi-meme',
      'demandeurA',
      d.users.demandeurA,
      { est_actif: false },
    ],
    [
      'DESACTIVER un autre utilisateur',
      'technicienA',
      d.users.lecteurA,
      { est_actif: false },
    ],
    [
      'DESACTIVER un administrateur',
      'technicienA',
      d.users.admin,
      { est_actif: false },
    ],
    [
      'DESACTIVER un admin (manager)',
      'managerA',
      d.users.admin,
      { est_actif: false },
    ],
    [
      's ANONYMISER soi-meme',
      'demandeurA',
      d.users.demandeurA,
      { anonymized_at: new Date().toISOString() },
    ],
    [
      'renommer un autre utilisateur',
      'technicienA',
      d.users.lecteurA,
      { nom_complet: 'Renomme par un tiers' },
    ],
    [
      'changer le createur de son compte',
      'demandeurA',
      d.users.demandeurA,
      { created_by: d.users.demandeurA },
    ],
  ]
  for (const [titre, ident, cible, patch] of champs) {
    const avant = (await verite(`users?id=eq.${cible}&select=*`))[0]
    const r = await req(jw[ident], 'PATCH', `users?id=eq.${cible}`, patch)
    const apres = (await verite(`users?id=eq.${cible}&select=*`))[0]
    const cle = Object.keys(patch)[0]
    const change = JSON.stringify(avant?.[cle]) !== JSON.stringify(apres?.[cle])
    console.log(
      `${change ? ' ECRIT ' : '  ok   '} ${titre.padEnd(34)} ${ident.padEnd(12)} -> ${r.statut} ${r.code ?? ''}  ${cle}: ${JSON.stringify(avant?.[cle])} -> ${JSON.stringify(apres?.[cle])}`,
    )
    // On remet la valeur d origine avec service_role : la base reste utilisable
    // pour les scenarios suivants.
    if (change) {
      await fetch(`${API}/rest/v1/users?id=eq.${cible}`, {
        method: 'PATCH',
        headers: {
          apikey: SERVICE,
          Authorization: `Bearer ${SERVICE}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [cle]: avant?.[cle] ?? null }),
      })
    }
  }

  console.log(
    '\n=== B. Falsification d auteur : sur quelles tables ? (3 rejeux) ===\n',
  )
  const auteurs = [
    [
      'demandes_intervention',
      'created_by',
      () => ({
        site_id: d.sites.A,
        created_by: d.users.admin,
        statut_di_id: 1,
        constat: 'Faussement attribuee',
        date_constat: J(0),
      }),
    ],
    [
      'interventions_travaux',
      'created_by',
      () => ({
        site_id: d.sites.A,
        created_by: d.users.admin,
        statut_travaux_id: 1,
        titre: 'Faussement attribue',
        date_demande: J(0),
        verrouille: false,
      }),
    ],
    [
      'evenements',
      'created_by',
      () => ({
        site_id: d.sites.A,
        created_by: d.users.admin,
        statut_evenement_id: 1,
        titre: 'Faussement attribue',
        date_evenement: J(0),
        verrouille: false,
      }),
    ],
    [
      'investissements',
      'created_by',
      () => ({
        site_id: d.sites.A,
        created_by: d.users.admin,
        statut_capex_id: 1,
        libelle: 'Faussement attribue',
        date_demande: J(0),
      }),
    ],
    [
      'documents',
      'uploaded_by',
      () => ({
        type_document_id: 1,
        nom_original: 'faux.pdf',
        storage_path: `${d.sites.A}/faux-${Math.random().toString(16).slice(2)}.pdf`,
        hash_sha256: 'f'.repeat(64),
        taille_octets: 10,
        mime_type: 'application/pdf',
        uploaded_by: d.users.admin,
        site_id: d.sites.A,
      }),
    ],
  ]
  for (const [table, colonne, corps] of auteurs) {
    const resultats = []
    for (let i = 0; i < 3; i++) {
      const r = await req(jw.technicienA, 'POST', table, corps())
      const cree = r.statut === 201 && Array.isArray(r.corps) && r.corps[0]
      resultats.push(
        cree ? r.corps[0][colonne] : `refus ${r.statut} ${r.code ?? ''}`,
      )
      if (cree)
        await fetch(`${API}/rest/v1/${table}?id=eq.${r.corps[0].id}`, {
          method: 'DELETE',
          headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
        })
    }
    const stable = new Set(resultats).size === 1
    const falsifie = resultats[0] === d.users.admin
    console.log(
      `${falsifie ? ' FALSIF' : '  ok   '} ${stable ? '' : 'INSTABLE '}${table.padEnd(24)} ${colonne} demande=admin, obtenu=${String(resultats[0]).slice(0, 40)}`,
    )
  }

  console.log(
    '\n=== C. Le meme, depuis un demandeur (role le plus faible) ===\n',
  )
  for (const usurpe of [d.users.admin, d.users.technicienA]) {
    const r = await req(jw.demandeurA, 'POST', 'demandes_intervention', {
      site_id: d.sites.A,
      created_by: usurpe,
      statut_di_id: 1,
      constat: 'Demande usurpee',
      date_constat: J(0),
    })
    const cree = r.statut === 201 && r.corps?.[0]
    console.log(
      `${cree && r.corps[0].created_by === usurpe ? ' FALSIF' : '  ok   '} demandeur cree une DI au nom de ${usurpe.slice(0, 8)} -> ${r.statut} ${r.code ?? ''} ${r.msg}`,
    )
    if (cree)
      await fetch(
        `${API}/rest/v1/demandes_intervention?id=eq.${r.corps[0].id}`,
        {
          method: 'DELETE',
          headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
        },
      )
  }
}

main().catch((e) => {
  console.error('ECHEC:', e.message)
  process.exit(1)
})
