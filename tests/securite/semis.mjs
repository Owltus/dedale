// =============================================================================
// Martin — SEMIS de la base LOCALE JETABLE (127.0.0.1:54521)
// =============================================================================
// Cible sure : pile Supabase locale, schema de prod, ZERO donnee de prod.
// La cle service_role ne sert QU ICI, a preparer le terrain (barriere 4 de
// Martin) ; l attaque, elle, se fera avec la cle publique et de vrais JWT.
// =============================================================================
import { writeFileSync } from 'node:fs'
import { API, SERVICE } from './cible.mjs'

const h = (k, extra = {}) => ({
  apikey: k,
  Authorization: `Bearer ${k}`,
  'Content-Type': 'application/json',
  ...extra,
})

async function ins(table, row) {
  const r = await fetch(`${API}/rest/v1/${table}`, {
    method: 'POST',
    headers: h(SERVICE, { Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${table} ${r.status} ${t.slice(0, 300)}`)
  return JSON.parse(t)[0]
}

async function creerUtilisateur(email, meta) {
  const r = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: h(SERVICE),
    body: JSON.stringify({
      email,
      password: 'MartinTest!2026#aB',
      email_confirm: true,
      user_metadata: meta,
    }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`user ${email} ${r.status} ${t.slice(0, 400)}`)
  return JSON.parse(t).id
}

const J = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

async function main() {
  // --- Deux sites : A (celui de la victime) et B (celui que l attaquant ne
  // doit JAMAIS voir). Tout ce qui suit est cree en double, un par site.
  const siteA = await ins('sites', { nom: 'Site Alpha', ville: 'Nantes' })
  const siteB = await ins('sites', { nom: 'Site Beta', ville: 'Rennes' })

  // --- Premier admin : bootstrap autorise tant qu aucun admin n existe.
  const admin = await creerUtilisateur('admin@martin.test', {
    role: 'admin',
    nom_complet: 'Admin Martin',
  })

  const u = { admin }
  for (const [cle, role, site] of [
    ['managerA', 'manager', siteA.id],
    ['technicienA', 'technicien', siteA.id],
    ['lecteurA', 'lecteur', siteA.id],
    ['demandeurA', 'demandeur', siteA.id],
    ['managerB', 'manager', siteB.id],
    ['technicienB', 'technicien', siteB.id],
  ]) {
    u[cle] = await creerUtilisateur(`${cle.toLowerCase()}@martin.test`, {
      role,
      nom_complet: `${role} ${cle.endsWith('A') ? 'Alpha' : 'Beta'}`,
      created_by: admin,
      site_ids: [site],
    })
  }

  // --- Donnees metier, en miroir sur les deux sites.
  const data = { sites: { A: siteA.id, B: siteB.id }, users: u, A: {}, B: {} }
  const categorie = await ins('categories', {
    nom: 'Categorie Martin',
    scope: 'parc',
    ordre: 1,
    est_actif: true,
  })
  const presta = await ins('prestataires', {
    libelle: 'Prestataire Martin',
    est_interne: false,
  })

  for (const [k, site, auteur] of [
    ['A', siteA.id, u.technicienA],
    ['B', siteB.id, u.technicienB],
  ]) {
    const bat = await ins('batiments', { site_id: site, nom: `Bat ${k}` })
    const niv = await ins('niveaux', {
      batiment_id: bat.id,
      nom: `Niveau ${k}`,
      ordre: 1,
    })
    const loc = await ins('locaux', {
      niveau_id: niv.id,
      nom: `Local ${k}`,
      chauffe_climatise: false,
      accessible_pmr: false,
      specifications: {},
    })
    const eq = await ins('equipements', {
      local_id: loc.id,
      categorie_id: categorie.id,
      code_inventaire: `EQ-${k}`,
      specifications: {},
    })
    const di = await ins('demandes_intervention', {
      site_id: site,
      created_by: auteur,
      statut_di_id: 1,
      constat: `Constat confidentiel du site ${k}`,
      date_constat: J(-3),
    })
    const trav = await ins('interventions_travaux', {
      site_id: site,
      created_by: auteur,
      statut_travaux_id: 1,
      titre: `Travaux ${k}`,
      date_demande: J(-5),
      verrouille: false,
    })
    const ev = await ins('evenements', {
      site_id: site,
      created_by: auteur,
      statut_evenement_id: 1,
      titre: `Evenement ${k}`,
      date_evenement: J(-2),
      verrouille: false,
    })
    const inv = await ins('investissements', {
      site_id: site,
      created_by: auteur,
      statut_capex_id: 1,
      libelle: `Investissement ${k}`,
      date_demande: J(-10),
      montant_demande: 1000,
    })
    const ctr = await ins('contrats', {
      prestataire_id: presta.id,
      type_contrat_id: 1,
      site_id: site,
      reference: `REF-${k}`,
      date_debut: J(-365),
      delai_preavis_jours: 30,
      est_archive: false,
    })
    const doc = await ins('documents', {
      type_document_id: 1,
      nom_original: `secret-${k}.pdf`,
      storage_path: `${site}/secret-${k}.pdf`,
      hash_sha256: k.charCodeAt(0).toString(16).padStart(2, '0').repeat(32),
      taille_octets: 1024,
      mime_type: 'application/pdf',
      uploaded_by: auteur,
      site_id: site,
    })
    data[k] = {
      site,
      batiment: bat.id,
      niveau: niv.id,
      local: loc.id,
      equipement: eq.id,
      demandes_intervention: di.id,
      interventions_travaux: trav.id,
      evenements: ev.id,
      investissements: inv.id,
      contrats: ctr.id,
      documents: doc.id,
    }
  }

  writeFileSync(
    new URL('./seed-data.json', import.meta.url),
    JSON.stringify(data, null, 2),
  )
  console.log('Semis termine.')
  console.log(
    `  sites: A=${siteA.id.slice(0, 8)} B=${siteB.id.slice(0, 8)} | ${Object.keys(u).length} utilisateurs`,
  )
}

main().catch((e) => {
  console.error('ECHEC SEMIS:', e.message)
  process.exit(1)
})
