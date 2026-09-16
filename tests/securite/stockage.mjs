// Martin — attaque du stockage : un utilisateur du site A peut-il telecharger
// un document du site B ? Oracle : seul un 200 avec le CONTENU du fichier
// adverse est une fuite ; un 400/403/404 ne l est pas.
import { readFileSync } from 'node:fs'
import { API, ANON, SERVICE } from './cible.mjs'
const d = JSON.parse(readFileSync('./seed-data.json', 'utf8'))
const PDF = Buffer.from('%PDF-1.4\n% contenu confidentiel\n%%EOF\n')
async function jeton(e) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: e, password: 'MartinTest!2026#aB' }),
  })
  return (await r.json()).access_token
}
// Depot des deux fichiers avec service_role (preparation du terrain seulement).
for (const k of ['A', 'B']) {
  const r = await fetch(
    `${API}/storage/v1/object/documents/${d.sites[k]}/secret-${k}.pdf`,
    {
      method: 'POST',
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      },
      body: PDF,
    },
  )
  console.log(`depot site ${k} -> ${r.status}`)
}
const tests = [
  ['anonyme', null, 'B'],
  ['anonyme', null, 'A'],
  ['technicienA', 'techniciena@martin.test', 'B'],
  ['technicienA', 'techniciena@martin.test', 'A'],
  ['lecteurA', 'lecteura@martin.test', 'B'],
  ['demandeurA', 'demandeura@martin.test', 'B'],
  ['technicienB', 'technicienb@martin.test', 'A'],
  ['admin', 'admin@martin.test', 'B'],
]
console.log('\n=== Telechargement direct d un objet ===')
for (const [nom, email, cible] of tests) {
  const jwt = email ? await jeton(email) : ANON
  const chemin = `${d.sites[cible]}/secret-${cible}.pdf`
  const r = await fetch(`${API}/storage/v1/object/documents/${chemin}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
  })
  const corps = await r.text()
  const fuite = r.status === 200 && corps.includes('confidentiel')
  console.log(
    `${fuite ? ' FUITE ' : '  ok   '} ${nom.padEnd(12)} -> objet du site ${cible} : ${r.status}`,
  )
}
console.log('\n=== URL signee (la voie que l application utilise) ===')
for (const [nom, email, cible] of tests) {
  const jwt = email ? await jeton(email) : ANON
  const chemin = `${d.sites[cible]}/secret-${cible}.pdf`
  const r = await fetch(`${API}/storage/v1/object/sign/documents/${chemin}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 60 }),
  })
  const j = await r.json().catch(() => null)
  let fuite = false
  if (r.status === 200 && j?.signedURL) {
    const g = await fetch(`${API}/storage/v1${j.signedURL}`)
    const t = await g.text()
    fuite = g.status === 200 && t.includes('confidentiel')
  }
  console.log(
    `${fuite ? ' FUITE ' : '  ok   '} ${nom.padEnd(12)} -> signature pour le site ${cible} : ${r.status}`,
  )
}
console.log('\n=== Listage du bucket ===')
for (const [nom, email] of [
  ['anonyme', null],
  ['technicienA', 'techniciena@martin.test'],
  ['demandeurA', 'demandeura@martin.test'],
]) {
  const jwt = email ? await jeton(email) : ANON
  const r = await fetch(`${API}/storage/v1/object/list/documents`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: '', limit: 100 }),
  })
  const j = await r.json().catch(() => [])
  console.log(
    `  ${nom.padEnd(12)} -> ${r.status}, ${Array.isArray(j) ? j.length : 0} entree(s) visible(s)`,
  )
}
