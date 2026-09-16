// =============================================================================
// Preuves consolidées des migrations 114 à 118 — base LOCALE JETABLE uniquement
// =============================================================================
// Chaque cas annonce son attendu AVANT d'observer. L'oracle est explicite :
//   REFUS:<sqlstate>  le code SQLSTATE exact (42501 RLS, 23514 CHECK)
//   REFUS-0LIGNE      un refus RLS en UPDATE/DELETE : 2xx mais AUCUNE ligne
//                     touchée (la doctrine : « RLS = résultat vide »)
//   PASSE             2xx
// Tout succès d'écriture est en outre RELU au service_role (vérité terrain) :
// un 2xx sur zéro ligne n'est pas une réussite.
//
// Toutes les fixtures sont uniques (horodatées) : le script est rejouable.
// =============================================================================
import { readFileSync } from 'node:fs'
import { API, ANON, SERVICE } from './cible.mjs'

const d = JSON.parse(
  readFileSync(new URL('./seed-data.json', import.meta.url), 'utf8'),
)

const U = Date.now()
const hS = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

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

async function req(
  jwt,
  methode,
  chemin,
  corps,
  prefer = 'return=representation',
) {
  const h = {
    apikey: ANON,
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
  }
  if (prefer) h.Prefer = prefer
  const r = await fetch(`${API}/rest/v1/${chemin}`, {
    method: methode,
    headers: h,
    body: corps ? JSON.stringify(corps) : undefined,
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
    message: (j?.message ?? '').slice(0, 88),
    lignes: Array.isArray(j) ? j.length : 0,
    corps: j,
  }
}

async function svc(methode, chemin, corps) {
  const r = await fetch(`${API}/rest/v1/${chemin}`, {
    method: methode,
    headers: hS,
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const t = await r.text()
  if (!r.ok)
    throw new Error(`${methode} ${chemin} -> ${r.status} ${t.slice(0, 220)}`)
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

const J = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

let ok = 0,
  ko = 0
const echecs = []
function verdict(titre, attendu, r) {
  let reussi
  if (attendu.startsWith('REFUS:')) reussi = r.code === attendu.slice(6)
  else if (attendu === 'REFUS-0LIGNE')
    reussi = r.statut >= 200 && r.statut < 300 && r.lignes === 0
  else reussi = r.statut >= 200 && r.statut < 300
  if (reussi) ok++
  else {
    ko++
    echecs.push(
      `${titre} — attendu ${attendu}, obtenu ${r.statut} ${r.code ?? ''} ${r.message}`,
    )
  }
  console.log(
    `  ${reussi ? 'ok    ' : 'ECHEC '} [${attendu.padEnd(12)}] ${titre.padEnd(58)} -> ${r.statut} ${(r.code ?? '').padEnd(6)} ${r.lignes}L ${r.message}`,
  )
  return r
}
function terrain(titre, condition, detail = '') {
  if (condition) {
    ok++
    console.log(`  ok     [TERRAIN     ] ${titre} ${detail}`)
  } else {
    ko++
    echecs.push(`vérité terrain : ${titre}`)
    console.log(`  ECHEC  [TERRAIN     ] ${titre} ${detail}`)
  }
}

async function main() {
  const jw = {}
  for (const [k, e] of [
    ['admin', 'admin@martin.test'],
    ['managerA', 'managera@martin.test'],
    ['technicienA', 'techniciena@martin.test'],
    ['demandeurA', 'demandeura@martin.test'],
  ])
    jw[k] = await jeton(e)

  const siteA = d.sites.A
  const moi = d.users.technicienA
  const autrui = d.users.demandeurA
  const presta = (await svc('GET', 'prestataires?select=id&limit=1'))[0].id
  const racine = (await svc('GET', 'categories?select=id&limit=1'))[0].id
  const sousCat = (
    await svc('POST', 'categories', {
      nom: `Sous-categorie ${U}`,
      parent_id: racine,
      scope: 'parc',
      ordre: 1,
      est_actif: true,
      site_id: siteA,
    })
  )[0].id
  const gamme = (
    await svc('POST', 'gammes', {
      nom: `Gamme ${U}`,
      nature: 'maintenance_preventive',
      categorie_id: sousCat,
      periodicite_id: 1,
      created_by: d.users.admin,
      site_id: siteA,
      prestataire_id: presta,
    })
  )[0].id
  await svc('POST', 'operations', {
    gamme_id: gamme,
    nom: 'Controle visuel',
    type_operation_id: 1,
    ordre: 1,
  })

  let jour = 30
  const ot = (auteur) => ({
    site_id: siteA,
    prestataire_id: presta,
    origine: 'planifie',
    gamme_id: gamme,
    nom_gamme: `Gamme ${U}`,
    nature_gamme: 'maintenance_preventive',
    nom_prestataire: 'Prestataire Martin',
    libelle_periodicite: 'Annuel',
    date_prevue: J(jour++),
    created_by: auteur,
    statut: 'planifie',
  })
  const hash = (n) => n.toString(16).padStart(64, '0').slice(0, 64)

  // =========================================================================
  console.log('\n══ 114 — created_by / uploaded_by non falsifiables ══')
  console.log('\n a) déclarer un TIERS comme auteur : refus attendu (42501)')
  verdict(
    'DI au nom du demandeur (LE SCÉNARIO RÉEL)',
    'REFUS:42501',
    await req(jw.technicienA, 'POST', 'demandes_intervention', {
      site_id: siteA,
      created_by: autrui,
      statut_di_id: 1,
      constat: `Falsification ${U}`,
      date_constat: J(-1),
    }),
  )
  verdict(
    'Travaux au nom d un tiers',
    'REFUS:42501',
    await req(jw.technicienA, 'POST', 'interventions_travaux', {
      site_id: siteA,
      created_by: autrui,
      statut_travaux_id: 1,
      titre: `Falsification ${U}`,
      date_demande: J(-1),
      verrouille: false,
    }),
  )
  verdict(
    'Événement au nom d un tiers',
    'REFUS:42501',
    await req(jw.technicienA, 'POST', 'evenements', {
      site_id: siteA,
      created_by: autrui,
      statut_evenement_id: 1,
      titre: `Falsification ${U}`,
      date_evenement: J(-1),
      verrouille: false,
    }),
  )
  verdict(
    'Investissement au nom d un tiers',
    'REFUS:42501',
    await req(jw.technicienA, 'POST', 'investissements', {
      site_id: siteA,
      created_by: autrui,
      statut_capex_id: 1,
      libelle: `Falsification ${U}`,
      date_demande: J(-1),
      montant_demande: 500,
    }),
  )
  verdict(
    'Document téléversé au nom d un tiers',
    'REFUS:42501',
    await req(jw.technicienA, 'POST', 'documents', {
      type_document_id: 1,
      nom_original: `falsif-${U}.pdf`,
      storage_path: `${siteA}/falsif-${U}.pdf`,
      hash_sha256: hash(U * 7),
      taille_octets: 10,
      mime_type: 'application/pdf',
      uploaded_by: autrui,
      site_id: siteA,
    }),
  )
  verdict(
    'OT au nom d un tiers (technicien)',
    'REFUS:42501',
    await req(jw.technicienA, 'POST', 'ordres_travail', { ...ot(autrui) }),
  )
  verdict(
    'OT au nom d un tiers (manager)',
    'REFUS:42501',
    await req(jw.managerA, 'POST', 'ordres_travail', { ...ot(autrui) }),
  )

  console.log('\n b) les créations métier NORMALES doivent toutes passer')
  const di = verdict(
    'DI en son propre nom',
    'PASSE',
    await req(jw.technicienA, 'POST', 'demandes_intervention', {
      site_id: siteA,
      created_by: moi,
      statut_di_id: 1,
      constat: `Fuite au 2e etage ${U}`,
      date_constat: J(-1),
    }),
  )
  verdict(
    'Travaux en son propre nom',
    'PASSE',
    await req(jw.technicienA, 'POST', 'interventions_travaux', {
      site_id: siteA,
      created_by: moi,
      statut_travaux_id: 1,
      titre: `Reprise etancheite ${U}`,
      date_demande: J(-1),
      verrouille: false,
    }),
  )
  verdict(
    'Événement en son propre nom',
    'PASSE',
    await req(jw.technicienA, 'POST', 'evenements', {
      site_id: siteA,
      created_by: moi,
      statut_evenement_id: 1,
      titre: `Coupure electrique ${U}`,
      date_evenement: J(-1),
      verrouille: false,
    }),
  )
  verdict(
    'Investissement en son propre nom',
    'PASSE',
    await req(jw.technicienA, 'POST', 'investissements', {
      site_id: siteA,
      created_by: moi,
      statut_capex_id: 1,
      libelle: `Remplacement CTA ${U}`,
      date_demande: J(-1),
      montant_demande: 12000,
    }),
  )
  verdict(
    'Document en son propre nom',
    'PASSE',
    await req(jw.technicienA, 'POST', 'documents', {
      type_document_id: 1,
      nom_original: `rapport-${U}.pdf`,
      storage_path: `${siteA}/rapport-${U}.pdf`,
      hash_sha256: hash(U * 11),
      taille_octets: 20,
      mime_type: 'application/pdf',
      uploaded_by: moi,
      site_id: siteA,
    }),
  )
  verdict(
    'Document de BIBLIOTHÈQUE d entreprise (site_id NULL) — tolérance conservée',
    'PASSE',
    await req(jw.managerA, 'POST', 'documents', {
      type_document_id: 1,
      nom_original: `notice-siege-${U}.pdf`,
      storage_path: `commun/notice-siege-${U}.pdf`,
      hash_sha256: hash(U * 13),
      taille_octets: 30,
      mime_type: 'application/pdf',
      uploaded_by: d.users.managerA,
      site_id: null,
    }),
  )
  const otMien = verdict(
    'OT en son propre nom (technicien)',
    'PASSE',
    await req(jw.technicienA, 'POST', 'ordres_travail', ot(moi)),
  )
  verdict(
    'OT en son propre nom (manager)',
    'PASSE',
    await req(jw.managerA, 'POST', 'ordres_travail', ot(d.users.managerA)),
  )
  const diRelu = await svc(
    'GET',
    `demandes_intervention?id=eq.${di.corps?.[0]?.id}&select=created_by`,
  )
  terrain(
    'la DI créée porte bien le technicien comme auteur',
    diRelu[0]?.created_by === moi,
  )

  console.log(
    '\n c) NON-RÉGRESSION : la garde ne doit PAS fuir sur UPDATE/DELETE',
  )
  const otMgr = await req(
    jw.managerA,
    'POST',
    'ordres_travail',
    ot(d.users.managerA),
  )
  const idMgr = otMgr.corps?.[0]?.id
  verdict(
    'Le technicien MODIFIE un OT créé par le MANAGER (scission du FOR ALL)',
    'PASSE',
    await req(jw.technicienA, 'PATCH', `ordres_travail?id=eq.${idMgr}`, {
      statut: 'en_cours',
    }),
  )
  const otRelu = await svc('GET', `ordres_travail?id=eq.${idMgr}&select=statut`)
  terrain(
    'la modification est réellement enregistrée',
    otRelu[0]?.statut === 'en_cours',
  )
  verdict(
    'Le technicien LIT les OT (SELECT via ot_site_scoped_select)',
    'PASSE',
    await req(
      jw.technicienA,
      'GET',
      `ordres_travail?site_id=eq.${siteA}&select=id`,
    ),
  )
  verdict(
    'Le technicien SUPPRIME un OT créé par le MANAGER',
    'PASSE',
    await req(jw.technicienA, 'DELETE', `ordres_travail?id=eq.${idMgr}`),
  )

  // =========================================================================
  console.log('\n══ 115 — anonymized_at réservé à la RPC ══')
  verdict(
    'Un technicien se marque anonymisé',
    'REFUS:42501',
    await req(jw.technicienA, 'PATCH', `users?id=eq.${moi}`, {
      anonymized_at: new Date().toISOString(),
    }),
  )
  verdict(
    'Un manager se marque anonymisé',
    'REFUS:42501',
    await req(jw.managerA, 'PATCH', `users?id=eq.${d.users.managerA}`, {
      anonymized_at: new Date().toISOString(),
    }),
  )
  verdict(
    'Un demandeur se marque anonymisé',
    'REFUS:42501',
    await req(jw.demandeurA, 'PATCH', `users?id=eq.${autrui}`, {
      anonymized_at: new Date().toISOString(),
    }),
  )

  // Le piège annoncé : anonymize_user est SECURITY DEFINER, mais current_role()
  // lit auth.uid() — l'appelant reste l'admin, la garde doit le laisser passer.
  const emailC = `cible115.${U}@martin.test`
  const rC = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { ...hS },
    body: JSON.stringify({
      email: emailC,
      password: 'MartinTest!2026#aB',
      email_confirm: true,
      user_metadata: {
        role: 'lecteur',
        nom_complet: 'Cible RGPD',
        created_by: d.users.admin,
        site_ids: [siteA],
      },
    }),
  })
  const idC = (await rC.json()).id
  const appelRpc = async (jwt) => {
    const r = await fetch(`${API}/rest/v1/rpc/anonymize_user`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_user_id: idC }),
    })
    const t = await r.text()
    let j = null
    try {
      j = JSON.parse(t)
    } catch {
      /* ignore */
    }
    return {
      statut: r.status,
      code: j?.code ?? null,
      message: (j?.message ?? '').slice(0, 88),
      lignes: 0,
    }
  }
  verdict(
    'anonymize_user par un TECHNICIEN (doit rester refusé)',
    'REFUS:42501',
    await appelRpc(jw.technicienA),
  )
  verdict(
    'anonymize_user par un ADMIN — LE PIÈGE ANNONCÉ',
    'PASSE',
    await appelRpc(jw.admin),
  )
  const vj = await svc(
    'GET',
    `users?id=eq.${idC}&select=anonymized_at,est_actif,nom_complet`,
  )
  terrain(
    'anonymized_at RÉELLEMENT posé et compte désactivé',
    !!vj[0]?.anonymized_at && vj[0].est_actif === false,
    `(${vj[0]?.nom_complet}, anonymized_at=${vj[0]?.anonymized_at ? 'posé' : 'absent'})`,
  )
  verdict(
    'anonymize_user rejouée (idempotence préservée)',
    'PASSE',
    await appelRpc(jw.admin),
  )

  // Le cas RÉELLEMENT atteignable de l'effacement : un manager peut modifier
  // les comptes lecteur/demandeur de ses sites (users_manager_all). C'est lui,
  // et non l'utilisateur anonymisé (est_actif=false, donc current_role() NULL),
  // qui pourrait casser l'idempotence d'anonymize_user.
  //
  // À noter : une écriture de MÊME VALEUR (NULL sur NULL) n'est PAS bloquée —
  // `IS DISTINCT FROM` est faux, le garde ne se déclenche pas. C'est sans
  // conséquence (rien n'est réellement écrit), et c'est le même artefact qui
  // fait qu'escalade.mjs signale « Réactiver un compte » sur un compte déjà
  // actif. Les cas testés ici changent VRAIMENT la valeur.
  verdict(
    'Un MANAGER EFFACE anonymized_at d un compte anonymisé',
    'REFUS:42501',
    await req(jw.managerA, 'PATCH', `users?id=eq.${idC}`, {
      anonymized_at: null,
    }),
  )
  const toujours = await svc('GET', `users?id=eq.${idC}&select=anonymized_at`)
  terrain(
    'anonymized_at toujours posé (idempotence préservée)',
    !!toujours[0]?.anonymized_at,
  )

  const emailS = `sain115.${U}@martin.test`
  const rS = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { ...hS },
    body: JSON.stringify({
      email: emailS,
      password: 'MartinTest!2026#aB',
      email_confirm: true,
      user_metadata: {
        role: 'lecteur',
        nom_complet: 'Compte sain',
        created_by: d.users.admin,
        site_ids: [siteA],
      },
    }),
  })
  const idS = (await rS.json()).id
  verdict(
    'Un MANAGER POSE anonymized_at sur un compte sain',
    'REFUS:42501',
    await req(jw.managerA, 'PATCH', `users?id=eq.${idS}`, {
      anonymized_at: new Date().toISOString(),
    }),
  )
  const sain = await svc(
    'GET',
    `users?id=eq.${idS}&select=anonymized_at,est_actif`,
  )
  terrain(
    'le compte sain reste NON anonymisé et actif',
    sain[0]?.anonymized_at === null && sain[0]?.est_actif === true,
  )

  // =========================================================================
  console.log('\n══ 116 — provisionner n est pas administrer ══')
  const emailL = `lecteur116.${U}@martin.test`
  const rL = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { ...hS },
    body: JSON.stringify({
      email: emailL,
      password: 'MartinTest!2026#aB',
      email_confirm: true,
      user_metadata: {
        role: 'lecteur',
        nom_complet: 'Lecteur 116',
        created_by: d.users.admin,
        site_ids: [siteA],
      },
    }),
  })
  const idL = (await rL.json()).id
  const avant = (await svc('GET', `users?id=eq.${idL}&select=nom_complet`))[0]
  verdict(
    'Un technicien MODIFIE un compte lecteur',
    'REFUS-0LIGNE',
    await req(jw.technicienA, 'PATCH', `users?id=eq.${idL}`, {
      nom_complet: 'Renomme par le technicien',
    }),
  )
  const apres = (await svc('GET', `users?id=eq.${idL}&select=nom_complet`))[0]
  terrain(
    'nom_complet inchangé',
    apres?.nom_complet === avant?.nom_complet,
    `("${apres?.nom_complet}")`,
  )
  verdict(
    'Un technicien SUPPRIME un compte lecteur',
    'REFUS-0LIGNE',
    await req(jw.technicienA, 'DELETE', `users?id=eq.${idL}`),
  )
  terrain(
    'le compte existe toujours',
    (await svc('GET', `users?id=eq.${idL}&select=id`)).length === 1,
  )
  verdict(
    'Un technicien LIT toujours ses pairs (users_same_client_select)',
    'PASSE',
    await req(
      jw.technicienA,
      'GET',
      `users?id=eq.${idL}&select=id,nom_complet`,
    ),
  )

  // INSERT conservé. Le compte auth doit préexister (FK users_id_fkey).
  const emailV = `vierge116.${U}@martin.test`
  const rV = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { ...hS },
    body: JSON.stringify({
      email: emailV,
      password: 'MartinTest!2026#aB',
      email_confirm: true,
      user_metadata: {
        role: 'lecteur',
        nom_complet: 'Vierge',
        created_by: d.users.admin,
      },
    }),
  })
  const idV = (await rV.json()).id
  await fetch(`${API}/rest/v1/users?id=eq.${idV}`, {
    method: 'DELETE',
    headers: hS,
  })
  const idRoleLecteur = (await svc('GET', 'roles?code=eq.lecteur&select=id'))[0]
    .id
  const idRoleManager = (await svc('GET', 'roles?code=eq.manager&select=id'))[0]
    .id
  // Sans `return=representation` : le compte fraîchement provisionné n'a encore
  // AUCUN site, donc shares_site_with(id) est faux et le technicien ne peut pas
  // le relire. Demander la représentation ferait remonter ce refus de LECTURE
  // comme un 42501 d'écriture. Comportement PRÉEXISTANT, vérifié identique avec
  // l'ancienne policy FOR ALL.
  verdict(
    'Un technicien CRÉE un compte lecteur (INSERT conservé)',
    'PASSE',
    await req(
      jw.technicienA,
      'POST',
      'users',
      {
        id: idV,
        role_id: idRoleLecteur,
        nom_complet: 'Lecteur provisionne',
        est_actif: true,
        created_by: moi,
      },
      null,
    ),
  )
  terrain(
    'le compte lecteur est bien créé',
    (await svc('GET', `users?id=eq.${idV}&select=id`)).length === 1,
  )
  await fetch(`${API}/rest/v1/users?id=eq.${idV}`, {
    method: 'DELETE',
    headers: hS,
  })
  verdict(
    'Un technicien crée un compte MANAGER (doit rester refusé)',
    'REFUS:42501',
    await req(
      jw.technicienA,
      'POST',
      'users',
      {
        id: idV,
        role_id: idRoleManager,
        nom_complet: 'Manager pirate',
        est_actif: true,
        created_by: moi,
      },
      null,
    ),
  )

  // =========================================================================
  console.log('\n══ 117 — noms faits d espaces invisibles ══')
  const ZWSP = '\u200B',
    RLO = '\u202E',
    BOM = '\uFEFF'
  verdict(
    'Local dont le nom est un espace de largeur nulle (par l API)',
    'REFUS:23514',
    await req(jw.technicienA, 'POST', 'locaux', {
      niveau_id: d.A.niveau,
      nom: ZWSP,
      chauffe_climatise: false,
      accessible_pmr: false,
      specifications: {},
    }),
  )
  verdict(
    'Bâtiment au nom fait d une inversion d écriture U+202E',
    'REFUS:23514',
    await req(jw.technicienA, 'POST', 'batiments', {
      site_id: siteA,
      nom: RLO,
    }),
  )
  verdict(
    'Niveau au nom fait d une BOM + espace + ZWSP',
    'REFUS:23514',
    await req(jw.technicienA, 'POST', 'niveaux', {
      batiment_id: d.A.batiment,
      nom: `${BOM} ${ZWSP}`,
      ordre: 9,
    }),
  )
  verdict(
    'Travaux au titre invisible',
    'REFUS:23514',
    await req(jw.technicienA, 'POST', 'interventions_travaux', {
      site_id: siteA,
      created_by: moi,
      statut_travaux_id: 1,
      titre: ZWSP,
      date_demande: J(-1),
      verrouille: false,
    }),
  )
  verdict(
    'Événement au titre invisible',
    'REFUS:23514',
    await req(jw.technicienA, 'POST', 'evenements', {
      site_id: siteA,
      created_by: moi,
      statut_evenement_id: 1,
      titre: RLO,
      date_evenement: J(-1),
      verrouille: false,
    }),
  )
  verdict(
    'DI au constat invisible',
    'REFUS:23514',
    await req(jw.technicienA, 'POST', 'demandes_intervention', {
      site_id: siteA,
      created_by: moi,
      statut_di_id: 1,
      constat: ZWSP,
      date_constat: J(-1),
    }),
  )
  verdict(
    'Prestataire au libellé invisible',
    'REFUS:23514',
    await req(jw.managerA, 'POST', 'prestataires', {
      libelle: ZWSP,
      est_interne: false,
    }),
  )
  verdict(
    'NON-RÉGRESSION : local au nom légitime avec insécable et accents',
    'PASSE',
    await req(jw.technicienA, 'POST', 'locaux', {
      niveau_id: d.A.niveau,
      nom: `Local\u00A0B${U % 1000} \u2014 3\u1D49 \u00E9tage`,
      chauffe_climatise: false,
      accessible_pmr: false,
      specifications: {},
    }),
  )

  // =========================================================================
  console.log('\n══ 118 — une mesure terminée exige une valeur ══')
  const idOt = otMien.corps?.[0]?.id
  const faireOp = async (nom, type, ordre) =>
    (
      await svc('POST', 'operations_execution', {
        ordre_travail_id: idOt,
        source_type: 1,
        source_id: crypto.randomUUID(),
        nom,
        type_operation: type,
        statut: 'en_attente',
        ordre,
      })
    )[0].id

  const idM1 = await faireOp('Relevé de température', 'Mesure', 1)
  verdict(
    'Terminer une MESURE sans valeur ni index de pose',
    'REFUS:23514',
    await req(jw.technicienA, 'PATCH', `operations_execution?id=eq.${idM1}`, {
      statut: 'terminee',
      date_execution: J(0),
    }),
  )
  verdict(
    'Terminer la MÊME mesure AVEC une valeur',
    'PASSE',
    await req(jw.technicienA, 'PATCH', `operations_execution?id=eq.${idM1}`, {
      statut: 'terminee',
      date_execution: J(0),
      valeur_mesuree: 21.5,
    }),
  )
  const idM2 = await faireOp('Remplacement compteur', 'Mesure', 2)
  verdict(
    'Terminer une mesure avec un INDEX DE POSE (compteur neuf)',
    'PASSE',
    await req(jw.technicienA, 'PATCH', `operations_execution?id=eq.${idM2}`, {
      statut: 'terminee',
      date_execution: J(0),
      index_depose: 3900,
      index_pose: 4200,
    }),
  )
  const idE = await faireOp('Graissage', 'Entretien', 3)
  verdict(
    'Terminer un ENTRETIEN sans valeur (type non contraint)',
    'PASSE',
    await req(jw.technicienA, 'PATCH', `operations_execution?id=eq.${idE}`, {
      statut: 'terminee',
      date_execution: J(0),
    }),
  )

  console.log(`\n═══ ${ok} preuve(s) au vert, ${ko} échec(s) ═══`)
  for (const e of echecs) console.log('  ECHEC :', e)
  process.exitCode = ko === 0 ? 0 : 1
}

main().catch((e) => {
  console.error('ECHEC PREUVES:', e.message)
  process.exit(1)
})
