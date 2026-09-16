// =============================================================================
// Martin — SONDE D AUTORISATION DIFFERENTIELLE — base LOCALE JETABLE uniquement
// =============================================================================
// On joue l attaquant avec la cle PUBLIQUE et de vrais JWT, jamais service_role
// (sinon toute la RLS serait contournee et chaque test passerait faussement).
//
// ORACLE ANTI-FAUX-POSITIF : une fuite n est declaree que si les TROIS
// conditions sont reunies — statut 200, corps = tableau d objets, et l un des
// identifiants renvoyes correspond a une ligne connue du site ADVERSE. Un 200
// avec un corps vide ou un message d erreur n est pas une fuite.
// =============================================================================
import { readFileSync } from 'node:fs'

const API = 'http://127.0.0.1:54521'
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const d = JSON.parse(
  readFileSync(new URL('./seed-data.json', import.meta.url), 'utf8'),
)

const TABLES = [
  'sites',
  'batiments',
  'niveaux',
  'locaux',
  'equipements',
  'categories',
  'prestataires',
  'contrats',
  'documents',
  'demandes_intervention',
  'interventions_travaux',
  'evenements',
  'investissements',
  'gammes',
  'ordres_travail',
  'observations',
  'miniatures',
  'users',
  'user_sites',
  'audit_log',
  'security_alerts',
  'v_equipements_complet',
]

// Identifiants connus, par site : c est la verite terrain de l oracle.
const idsDe = (k) =>
  new Set(
    Object.entries(d[k])
      .filter(([c]) => c !== 'site')
      .map(([, v]) => v),
  )
const IDS = { A: idsDe('A'), B: idsDe('B') }

async function jeton(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'MartinTest!2026#aB' }),
  })
  const j = await r.json()
  if (!j.access_token)
    throw new Error(`connexion ${email} : ${JSON.stringify(j).slice(0, 200)}`)
  return j.access_token
}

async function lire(jwt, table) {
  const r = await fetch(`${API}/rest/v1/${table}?select=*&limit=200`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
  })
  const t = await r.text()
  let corps
  try {
    corps = JSON.parse(t)
  } catch {
    corps = null
  }
  return { statut: r.status, corps }
}

async function ecrire(jwt, table, id, patch) {
  const r = await fetch(`${API}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  })
  const t = await r.text()
  let corps
  try {
    corps = JSON.parse(t)
  } catch {
    corps = null
  }
  return { statut: r.status, corps, code: corps?.code }
}

/** Fuite = 200 + tableau d objets + un id appartenant au site adverse. */
function fuite(res, cible) {
  if (res.statut !== 200 || !Array.isArray(res.corps)) return null
  const trouves = res.corps
    .map((x) => x?.id)
    .filter((x) => typeof x === 'string' && IDS[cible].has(x))
  return trouves.length ? trouves : null
}

const IDENTITES = [
  ['anon', null, null],
  ['admin', 'admin@martin.test', null],
  ['managerA', 'managera@martin.test', 'A'],
  ['technicienA', 'techniciena@martin.test', 'A'],
  ['lecteurA', 'lecteura@martin.test', 'A'],
  ['demandeurA', 'demandeura@martin.test', 'A'],
  ['technicienB', 'technicienb@martin.test', 'B'],
]

async function main() {
  const findings = []
  const tableau = []

  for (const [nom, email, site] of IDENTITES) {
    const jwt = email ? await jeton(email) : ANON
    const adverse = site === 'A' ? 'B' : site === 'B' ? 'A' : null
    const ligne = {
      identite: nom,
      site: site ?? '-',
      vues: [],
      refus: 0,
      fuites: [],
    }

    for (const table of TABLES) {
      const res = await lire(jwt, table)
      if (res.statut !== 200) {
        ligne.refus++
        continue
      }
      const n = Array.isArray(res.corps) ? res.corps.length : 0
      if (n > 0) ligne.vues.push(`${table}:${n}`)
      if (adverse) {
        const f = fuite(res, adverse)
        if (f) {
          ligne.fuites.push(`${table}(${f.length})`)
          findings.push({
            gravite: 'FUITE LECTURE',
            identite: nom,
            table,
            preuve: `identifiant du site ${adverse} visible : ${f[0]}`,
          })
        }
      }
    }

    // Ecritures croisees : modifier une ligne du site adverse doit etre refuse.
    if (adverse) {
      for (const table of [
        'demandes_intervention',
        'interventions_travaux',
        'evenements',
        'investissements',
        'contrats',
        'documents',
      ]) {
        const id = d[adverse][table]
        if (!id) continue
        const patch =
          table === 'documents'
            ? { nom_original: 'PWNED.pdf' }
            : table === 'contrats'
              ? { commentaires: 'PWNED' }
              : table === 'demandes_intervention'
                ? { constat: 'PWNED' }
                : { titre: 'PWNED' }
        const res = await ecrire(jwt, table, id, patch)
        const modifie =
          res.statut === 200 && Array.isArray(res.corps) && res.corps.length > 0
        if (modifie) {
          findings.push({
            gravite: 'ECRITURE CROISEE',
            identite: nom,
            table,
            preuve: `PATCH accepte sur la ligne ${id} du site ${adverse}`,
          })
          ligne.fuites.push(`W:${table}`)
        }
      }
    }
    tableau.push(ligne)
  }

  console.log('=== Ce que chaque identite VOIT (nb de lignes par table) ===')
  for (const l of tableau) {
    console.log(
      `\n${l.identite.padEnd(12)} site=${l.site}  ${l.refus} tables refusees`,
    )
    console.log(`   ${l.vues.join('  ') || '(rien)'}`)
    if (l.fuites.length) console.log(`   *** ${l.fuites.join(' ')}`)
  }

  console.log(`\n=== ${findings.length} finding(s) confirme(s) ===`)
  for (const f of findings)
    console.log(`  [${f.gravite}] ${f.identite} / ${f.table} — ${f.preuve}`)
}

main().catch((e) => {
  console.error('ECHEC SONDE:', e.message)
  process.exit(1)
})
