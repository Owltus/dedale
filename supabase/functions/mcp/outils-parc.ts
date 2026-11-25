// Outils de LECTURE du parc : Bibliothèque (modèles d'équipements), flottes
// (sous-catégories de parc), équipements, lieux et fiche d'un lieu.
//
// Mêmes règles que outils.ts : client de la personne (RLS), paramètres Zod
// stricts, plafonds de lignes, noms montrés (jamais de chemin de fichier).
// Identifiants : seuls `local_id` (lieux) et `id` (équipements) sortent, parce
// que les gestes d'écriture (demandes, fiches) en ont besoin ; la consigne du
// connecteur interdit de les montrer. Bibliothèque, flottes et fiche d'un lieu
// n'en rendent aucun.

import { z } from 'npm:zod@3.23.8'
import {
  type Contexte,
  dateFr,
  enRetard,
  ErreurOutil,
  LECTURE,
  limite,
  nettoyer,
  nomSite,
  type Outil,
  page,
  site,
  sitesCibles,
  STATUT_OT,
} from './commun.ts'
import { caracteristiques, gabarit, nomEquipement } from './caracteristiques.ts'

type Site = { id: string; nom: string }

/** Lignes lues par pages de 1 000 (plafond PostgREST) jusqu'au plafond ; `tronque` si au-delà. */
export async function toutesLesLignes<T>(
  lire: (de: number, a: number) => PromiseLike<{ data: unknown; error: unknown }>,
  plafond: number,
): Promise<{ lignes: T[]; tronque: boolean }> {
  const lignes: T[] = []
  for (let de = 0; de <= plafond; de += 1000) {
    const { data, error } = await lire(de, Math.min(de + 999, plafond))
    if (error) throw error
    const lot = (data ?? []) as T[]
    lignes.push(...lot)
    if (lot.length < Math.min(1000, plafond + 1 - de)) break
  }
  return { lignes: lignes.slice(0, plafond), tronque: lignes.length > plafond }
}

const comparer = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' })
const cleNom = (t: string) => t.trim().toLowerCase()
const motif = (t: string | undefined) => {
  const n = nettoyer(t)
  return n ? `%${n}%` : undefined
}

export const PLAFOND_EQUIPEMENTS_FLOTTES = 3000
export const PLAFOND_LIEUX = 3000
const EQUIPEMENTS_PAR_LIEU = 30

const NOMS_COMPTEURS: Record<string, string> = {
  equipements: 'équipements',
  gammes: 'plans de maintenance',
  ot: 'ordres de travail',
  di: 'demandes d’intervention',
  travaux: 'travaux',
  evenements: 'événements',
  documents: 'documents',
}

// ─── Bibliothèque ────────────────────────────────────────────────────────────

type ModeleLigne = {
  nom: string
  description: string | null
  est_actif: boolean
  site_id: string | null
  specifications: unknown
  categorie: { nom: string } | null
}

export function presenterModele(m: ModeleLigne, sites: Site[], installeSur: string[] | undefined) {
  const commun = m.site_id === null
  return {
    modele: m.nom,
    categorie: m.categorie?.nom ?? null,
    origine: commun ? 'Commun (réserve du siège)' : 'Site',
    ...(commun ? {} : { site: nomSite(sites, m.site_id) }),
    description: m.description,
    actif: m.est_actif,
    gabarit: gabarit(m.specifications),
    ...(commun ? { installe_sur: installeSur ?? [] } : {}),
  }
}

const bibliotheque: Outil = {
  name: 'bibliotheque',
  title: 'Bibliothèque : modèles d’équipements',
  description:
    'Modèles d’équipements de la Bibliothèque : ceux des sites de la personne et ceux du commun (réserve du siège). Pour chacun : catégorie, description, gabarit de caractéristiques (libellé, type, unité, choix, valeur par défaut, obligatoire), actif ou non ; pour un modèle commun, les sites où une copie est déjà installée. Filtre par texte, catégorie ou origine.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      site: { type: 'string', description: 'Nom (ou partie du nom) du site ; par défaut tous mes sites' },
      recherche: { type: 'string', description: 'Texte cherché dans le nom du modèle' },
      categorie: { type: 'string', description: 'Tout ou partie du nom de la catégorie' },
      origine: {
        type: 'string',
        enum: ['tous', 'site', 'commun'],
        default: 'tous',
        description: 'site = modèles installés sur le site ; commun = réserve du siège',
      },
      inclure_inactifs: { type: 'boolean', default: false },
      limite: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      page: { type: 'integer', minimum: 1, default: 1 },
    },
  },
  annotations: LECTURE,
  schema: z.object({
    site,
    recherche: z.string().max(120).optional(),
    categorie: z.string().max(120).optional(),
    origine: z.enum(['tous', 'site', 'commun']).default('tous'),
    inclure_inactifs: z.boolean().default(false),
    limite: limite(50, 20),
    page,
  }).strict(),
  run: async (
    a: {
      site?: string
      recherche?: string
      categorie?: string
      origine: 'tous' | 'site' | 'commun'
      inclure_inactifs: boolean
      limite: number
      page: number
    },
    ctx: Contexte,
  ) => {
    const sites = await sitesCibles(ctx, a.site)
    const ids = sites.map((s) => s.id)
    const filtreCategorie = motif(a.categorie)
    let q = ctx.supabase.from('modeles_equipements')
      .select(
        `nom, description, est_actif, site_id, specifications, categorie:categorie_id${
          filtreCategorie ? '!inner' : ''
        }(nom)`,
        { count: 'exact' },
      )
    if (a.origine === 'site') q = q.in('site_id', ids)
    else if (a.origine === 'commun') q = q.is('site_id', null)
    else q = q.or(ids.length ? `site_id.is.null,site_id.in.(${ids.join(',')})` : 'site_id.is.null')
    if (!a.inclure_inactifs) q = q.eq('est_actif', true)
    const texte = motif(a.recherche)
    if (texte) q = q.ilike('nom', texte)
    if (filtreCategorie) q = q.ilike('categorie.nom', filtreCategorie)
    const debut = (a.page - 1) * a.limite
    const { data, error, count } = await q.order('nom').order('id').range(debut, debut + a.limite - 1)
    if (error) throw error
    const modeles = data as unknown as ModeleLigne[]

    // « Installé » = un modèle de même nom existe déjà sur le site (règle de
    // l'import depuis le commun dans l'appli).
    const installe = new Map<string, string[]>()
    if (modeles.some((m) => m.site_id === null) && ids.length) {
      const { data: locaux, error: e2 } = await ctx.supabase.from('modeles_equipements')
        .select('nom, site_id').in('site_id', ids).limit(2000)
      if (e2) throw e2
      for (const m of locaux as { nom: string; site_id: string }[]) {
        const liste = installe.get(cleNom(m.nom)) ?? []
        const nom = nomSite(sites, m.site_id)
        if (nom && !liste.includes(nom)) liste.push(nom)
        installe.set(cleNom(m.nom), liste)
      }
    }
    return {
      total: count,
      page: a.page,
      a_savoir:
        'Un modèle commun est une réserve du siège : un site ne l’utilise qu’après en avoir installé une copie (Bibliothèque, « Importer depuis le commun », dans l’application). La copie est indépendante.',
      modeles: modeles.map((m) => presenterModele(m, sites, installe.get(cleNom(m.nom)))),
    }
  },
}

// ─── Flottes (sous-catégories de parc) ───────────────────────────────────────

type FlotteLigne = {
  id: string
  nom: string
  description: string | null
  est_actif: boolean
  site_id: string
  specifications: unknown
  valeur_principale: string | null
  valeur_secondaire: string | null
  parent: { nom: string } | null
  modele: { nom: string; specifications: unknown } | null
}
type EquipementFlotte = {
  categorie_id: string
  lot_deploiement: string | null
  created_at: string
  locaux: { niveaux: { nom: string; ordre: number; batiments: { nom: string } | null } | null } | null
  gammes_equipements: { gammes: { nom: string; est_active: boolean } | null }[]
}

const REPARTITION_MAX = 30
const LOTS_MAX = 5

export function presenterFlotte(f: FlotteLigne, eqs: EquipementFlotte[], sites: Site[], partiel: boolean) {
  const repartition = new Map<string, { batiment: string; niveau: string; ordre: number; equipements: number }>()
  const gammes = new Map<string, { gamme: string; active: boolean; equipements: number }>()
  const lots = new Map<string, { debut: string; equipements: number }>()
  for (const e of eqs) {
    const n = e.locaux?.niveaux
    const b = n?.batiments?.nom ?? '—'
    const cle = `${b}\u0000${n?.nom ?? '—'}`
    const r = repartition.get(cle) ?? { batiment: b, niveau: n?.nom ?? '—', ordre: n?.ordre ?? 0, equipements: 0 }
    r.equipements++
    repartition.set(cle, r)
    for (const ge of e.gammes_equipements ?? []) {
      if (!ge.gammes) continue
      const g = gammes.get(ge.gammes.nom) ?? { gamme: ge.gammes.nom, active: ge.gammes.est_active, equipements: 0 }
      g.equipements++
      gammes.set(ge.gammes.nom, g)
    }
    if (e.lot_deploiement) {
      const l = lots.get(e.lot_deploiement) ?? { debut: e.created_at, equipements: 0 }
      l.equipements++
      if (e.created_at < l.debut) l.debut = e.created_at
      lots.set(e.lot_deploiement, l)
    }
  }
  const rep = [...repartition.values()].sort((x, y) => comparer(x.batiment, y.batiment) || x.ordre - y.ordre)
  const source = f.modele ? f.modele.specifications : f.specifications
  return {
    flotte: f.nom,
    categorie: f.parent?.nom ?? null,
    site: nomSite(sites, f.site_id),
    description: f.description,
    active: f.est_actif,
    modele: f.modele?.nom ?? null,
    gabarit_source: f.modele ? 'modèle de la Bibliothèque (équipements = copies)' : 'gabarit propre à la flotte',
    gabarit: gabarit(source),
    valeur_principale: f.valeur_principale,
    valeur_secondaire: f.valeur_secondaire,
    equipements: eqs.length,
    ...(partiel ? { comptage_partiel: true } : {}),
    repartition: rep.slice(0, REPARTITION_MAX).map(({ batiment, niveau, equipements }) => ({
      batiment,
      niveau,
      equipements,
    })),
    ...(rep.length > REPARTITION_MAX ? { repartition_autres_niveaux: rep.length - REPARTITION_MAX } : {}),
    plans_maintenance: [...gammes.values()].sort((x, y) => comparer(x.gamme, y.gamme)),
    deploiements_recents: [...lots.values()]
      .sort((x, y) => (x.debut < y.debut ? 1 : -1))
      .slice(0, LOTS_MAX)
      .map((l) => ({ date: dateFr(l.debut), equipements: l.equipements })),
  }
}

const flottes: Outil = {
  name: 'flottes',
  title: 'Flottes d’équipements',
  description:
    'Les flottes du parc (sous-catégories de parc, sous une catégorie) : modèle de la Bibliothèque lié ou gabarit propre, caractéristiques à saisir, valeurs principale et secondaire, nombre d’équipements, répartition par bâtiment et niveau, plans de maintenance liés à ses équipements, déploiements en masse récents (date, nombre).',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      site: { type: 'string', description: 'Nom (ou partie du nom) du site ; par défaut tous mes sites' },
      recherche: { type: 'string', description: 'Tout ou partie du nom de la flotte (ex. « détecteur »)' },
      categorie: { type: 'string', description: 'Tout ou partie du nom de la catégorie (ex. « Sécurité incendie »)' },
      inclure_inactives: { type: 'boolean', default: false },
      limite: { type: 'integer', minimum: 1, maximum: 30, default: 15 },
    },
  },
  annotations: LECTURE,
  schema: z.object({
    site,
    recherche: z.string().max(120).optional(),
    categorie: z.string().max(120).optional(),
    inclure_inactives: z.boolean().default(false),
    limite: limite(30, 15),
  }).strict(),
  run: async (
    a: { site?: string; recherche?: string; categorie?: string; inclure_inactives: boolean; limite: number },
    ctx: Contexte,
  ) => {
    const sites = await sitesCibles(ctx, a.site)
    let q = ctx.supabase.from('categories')
      .select(
        'id, nom, description, est_actif, site_id, specifications, valeur_principale, valeur_secondaire, parent:parent_id!inner(nom, parent_id), modele:modele_equipement_id(nom, specifications)',
        { count: 'exact' },
      )
      .eq('scope', 'parc').in('site_id', sites.map((s) => s.id)).is('parent.parent_id', null)
    if (!a.inclure_inactives) q = q.eq('est_actif', true)
    const texte = motif(a.recherche)
    if (texte) q = q.ilike('nom', texte)
    const cat = motif(a.categorie)
    if (cat) q = q.ilike('parent.nom', cat)
    const { data, error, count } = await q.order('nom').order('id').limit(a.limite)
    if (error) throw error
    const lignes = data as unknown as FlotteLigne[]
    const { lignes: eqs, tronque } = lignes.length
      ? await toutesLesLignes<EquipementFlotte>(
        (de, jusqua) =>
          ctx.supabase.from('equipements')
            .select(
              'categorie_id, lot_deploiement, created_at, locaux(niveaux(nom, ordre, batiments(nom))), gammes_equipements(gammes(nom, est_active))',
            )
            .in('categorie_id', lignes.map((f) => f.id)).order('id').range(de, jusqua),
        PLAFOND_EQUIPEMENTS_FLOTTES,
      )
      : { lignes: [], tronque: false }
    const parFlotte = new Map<string, EquipementFlotte[]>()
    for (const e of eqs) parFlotte.set(e.categorie_id, [...(parFlotte.get(e.categorie_id) ?? []), e])
    return {
      total: count,
      a_savoir:
        'Une flotte = une sous-catégorie de parc. Ses équipements partagent son gabarit (celui du modèle lié, sinon le sien). Le nom d’un équipement = nom de la flotte + sa valeur principale.',
      flottes: lignes
        .sort((x, y) => comparer(x.parent?.nom ?? '', y.parent?.nom ?? '') || comparer(x.nom, y.nom))
        .map((f) => presenterFlotte(f, parFlotte.get(f.id) ?? [], sites, tronque)),
    }
  },
}

// ─── Équipements ─────────────────────────────────────────────────────────────

type EquipementLigne = {
  id: string
  local_id: string
  categorie_id: string | null
  categorie_nom: string | null
  categorie_valeur_principale: string | null
  categorie_valeur_secondaire: string | null
  categorie_valeur_tertiaire: string | null
  code_inventaire: string | null
  localisation_courte: string | null
  site_id: string
  date_mise_en_service: string | null
  date_fin_garantie: string | null
  specifications: unknown
}
type CategorieEquipement = { id: string; parent: { nom: string } | null; modele: { nom: string } | null }

export function presenterEquipement(
  e: EquipementLigne,
  cat: CategorieEquipement | undefined,
  gammes: string[],
  sites: Site[],
) {
  return {
    id: e.id,
    local_id: e.local_id,
    nom: nomEquipement({
      sous_categorie: e.categorie_nom,
      specifications: e.specifications,
      valeur_principale: e.categorie_valeur_principale,
      valeur_secondaire: e.categorie_valeur_secondaire,
      valeur_tertiaire: e.categorie_valeur_tertiaire,
    }),
    flotte: e.categorie_nom,
    categorie: cat?.parent?.nom ?? null,
    modele: cat?.modele?.nom ?? null,
    code: e.code_inventaire,
    lieu: e.localisation_courte,
    caracteristiques: caracteristiques(e.specifications),
    plans_maintenance: gammes,
    mise_en_service: dateFr(e.date_mise_en_service),
    fin_garantie: dateFr(e.date_fin_garantie),
    site: nomSite(sites, e.site_id),
  }
}

const equipements: Outil = {
  name: 'equipements',
  title: 'Équipements',
  description:
    'Équipements du parc, avec leur nom (flotte + valeur principale), leur flotte, leur catégorie, leur modèle de la Bibliothèque, leurs caractéristiques (libellé : valeur), leur lieu et leurs plans de maintenance. Filtres : texte, flotte, lieu, bâtiment, niveau ; sans filtre, la liste paginée du site.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      recherche: {
        type: 'string',
        description: 'Texte cherché dans la flotte, le code d’inventaire ou la localisation',
      },
      flotte: { type: 'string', description: 'Tout ou partie du nom de la flotte (sous-catégorie de parc)' },
      lieu: { type: 'string', description: 'Tout ou partie du nom du lieu (local)' },
      batiment: { type: 'string' },
      niveau: { type: 'string', description: 'Ex. « R+2 », « RDC »' },
      site: { type: 'string' },
      limite: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
      page: { type: 'integer', minimum: 1, default: 1 },
    },
  },
  annotations: LECTURE,
  schema: z.object({
    recherche: z.string().max(120).optional(),
    flotte: z.string().max(120).optional(),
    lieu: z.string().max(120).optional(),
    batiment: z.string().max(120).optional(),
    niveau: z.string().max(60).optional(),
    site,
    limite: limite(100, 30),
    page,
  }).strict(),
  run: async (
    a: {
      recherche?: string
      flotte?: string
      lieu?: string
      batiment?: string
      niveau?: string
      site?: string
      limite: number
      page: number
    },
    ctx: Contexte,
  ) => {
    const sites = await sitesCibles(ctx, a.site)
    let q = ctx.supabase.from('v_equipements_complet')
      .select(
        'id, local_id, categorie_id, categorie_nom, categorie_valeur_principale, categorie_valeur_secondaire, categorie_valeur_tertiaire, code_inventaire, localisation_courte, site_id, date_mise_en_service, date_fin_garantie, specifications',
        { count: 'exact' },
      )
      .in('site_id', sites.map((s) => s.id))
    const texte = nettoyer(a.recherche)
    if (texte) {
      q = q.or(`categorie_nom.ilike.*${texte}*,code_inventaire.ilike.*${texte}*,localisation_complete.ilike.*${texte}*`)
    }
    for (
      const [colonne, valeur] of [
        ['categorie_nom', a.flotte],
        ['local_nom', a.lieu],
        ['batiment_nom', a.batiment],
        ['niveau_nom', a.niveau],
      ] as const
    ) {
      const m = motif(valeur)
      if (m) q = q.ilike(colonne, m)
    }
    const debut = (a.page - 1) * a.limite
    const { data, error, count } = await q.order('localisation_complete').order('categorie_nom').order('id')
      .range(debut, debut + a.limite - 1)
    if (error) throw error
    const lignes = data as unknown as EquipementLigne[]
    const catIds = [...new Set(lignes.map((e) => e.categorie_id).filter((x): x is string => !!x))]
    const [cats, liens] = await Promise.all([
      catIds.length
        ? ctx.supabase.from('categories').select('id, parent:parent_id(nom), modele:modele_equipement_id(nom)')
          .in('id', catIds)
        : Promise.resolve({ data: [], error: null }),
      lignes.length
        ? ctx.supabase.from('gammes_equipements').select('equipement_id, gammes(nom)')
          .in('equipement_id', lignes.map((e) => e.id))
        : Promise.resolve({ data: [], error: null }),
    ])
    if (cats.error) throw cats.error
    if (liens.error) throw liens.error
    const parCat = new Map((cats.data as unknown as CategorieEquipement[]).map((c) => [c.id, c]))
    const parEq = new Map<string, string[]>()
    for (const l of liens.data as unknown as { equipement_id: string; gammes: { nom: string } | null }[]) {
      if (l.gammes) parEq.set(l.equipement_id, [...(parEq.get(l.equipement_id) ?? []), l.gammes.nom])
    }
    return {
      total: count,
      page: a.page,
      equipements: lignes.map((e) =>
        presenterEquipement(
          e,
          e.categorie_id ? parCat.get(e.categorie_id) : undefined,
          (parEq.get(e.id) ?? []).sort(comparer),
          sites,
        )
      ),
    }
  },
}

// ─── Lieux ───────────────────────────────────────────────────────────────────

type LieuLeger = {
  id: string
  nom: string
  niveaux: { nom: string; ordre: number; batiments: { nom: string; site_id: string } }
  types_locaux: { libelle: string } | null
}
type LieuDetail = {
  id: string
  description: string | null
  surface_m2: number | null
  hauteur_m: number | null
  capacite_personnes: number | null
  accessible_pmr: boolean
  chauffe_climatise: boolean
  specifications: unknown
  equipements: {
    id: string
    code_inventaire: string | null
    specifications: unknown
    categorie: {
      nom: string
      valeur_principale: string | null
      valeur_secondaire: string | null
      valeur_tertiaire: string | null
    } | null
  }[]
}

/** Range les lieux comme l'arbre de l'appli : site, bâtiment, niveau (ordre), nom. */
export function trierLieux(lieux: LieuLeger[], sites: Site[]) {
  return [...lieux].sort((x, y) =>
    comparer(nomSite(sites, x.niveaux.batiments.site_id) ?? '', nomSite(sites, y.niveaux.batiments.site_id) ?? '') ||
    comparer(x.niveaux.batiments.nom, y.niveaux.batiments.nom) || x.niveaux.ordre - y.niveaux.ordre ||
    comparer(x.niveaux.nom, y.niveaux.nom) || comparer(x.nom, y.nom)
  )
}

/** Bâtiments → niveaux → nombre de lieux, dans l'ordre de l'arbre (lieux déjà triés). */
export function arbreLieux(tries: LieuLeger[], sites: Site[]) {
  const batiments: { batiment: string; site: string | null; niveaux: { niveau: string; lieux: number }[] }[] = []
  for (const l of tries) {
    const s = nomSite(sites, l.niveaux.batiments.site_id)
    let b = batiments.at(-1)
    if (!b || b.batiment !== l.niveaux.batiments.nom || b.site !== s) {
      b = { batiment: l.niveaux.batiments.nom, site: s, niveaux: [] }
      batiments.push(b)
    }
    let n = b.niveaux.at(-1)
    if (!n || n.niveau !== l.niveaux.nom) {
      n = { niveau: l.niveaux.nom, lieux: 0 }
      b.niveaux.push(n)
    }
    n.lieux++
  }
  return batiments
}

export function presenterLieu(l: LieuLeger, d: LieuDetail | undefined, sites: Site[]) {
  const eqs = d?.equipements ?? []
  return {
    local_id: l.id,
    local: l.nom,
    niveau: l.niveaux.nom,
    batiment: l.niveaux.batiments.nom,
    site: nomSite(sites, l.niveaux.batiments.site_id),
    type: l.types_locaux?.libelle ?? null,
    description: d?.description ?? null,
    surface_m2: d?.surface_m2 ?? null,
    hauteur_m: d?.hauteur_m ?? null,
    capacite_personnes: d?.capacite_personnes ?? null,
    accessible_pmr: d?.accessible_pmr ?? null,
    chauffe_climatise: d?.chauffe_climatise ?? null,
    caracteristiques: caracteristiques(d?.specifications),
    equipements: eqs.slice(0, EQUIPEMENTS_PAR_LIEU).map((e) => ({
      id: e.id,
      nom: nomEquipement({
        sous_categorie: e.categorie?.nom ?? null,
        specifications: e.specifications,
        valeur_principale: e.categorie?.valeur_principale,
        valeur_secondaire: e.categorie?.valeur_secondaire,
        valeur_tertiaire: e.categorie?.valeur_tertiaire,
      }),
      code: e.code_inventaire,
    })),
    ...(eqs.length > EQUIPEMENTS_PAR_LIEU ? { equipements_autres: eqs.length - EQUIPEMENTS_PAR_LIEU } : {}),
  }
}

const lieux: Outil = {
  name: 'lieux',
  title: 'Lieux (locaux) et leurs équipements',
  description:
    'Trouve ou parcourt les lieux : par nom (ex. « 214 », « Accueil »), ou sans recherche pour parcourir bâtiment → niveau → lieux (un résumé « arbre » donne le nombre de lieux par niveau). Filtres bâtiment, niveau, type de lieu. Chaque lieu : type, surface, hauteur, capacité, PMR, caractéristiques et équipements (identifiants compris, pour cibler une demande d’intervention). Un nom présent sur plusieurs niveaux est ambigu : faire préciser le niveau.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      recherche: { type: 'string', description: 'Tout ou partie du nom du lieu ; absent = parcourir' },
      batiment: { type: 'string', description: 'Tout ou partie du nom du bâtiment' },
      niveau: { type: 'string', description: 'Tout ou partie du nom du niveau (ex. « R+2 », « RDC »)' },
      type: { type: 'string', description: 'Tout ou partie du type de lieu (ex. « Chambre », « Sanitaire »)' },
      site: { type: 'string' },
      limite: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
      page: { type: 'integer', minimum: 1, default: 1 },
    },
  },
  annotations: LECTURE,
  schema: z.object({
    recherche: z.string().max(120).optional(),
    batiment: z.string().max(120).optional(),
    niveau: z.string().max(60).optional(),
    type: z.string().max(120).optional(),
    site,
    limite: limite(100, 30),
    page,
  }).strict(),
  run: async (
    a: {
      recherche?: string
      batiment?: string
      niveau?: string
      type?: string
      site?: string
      limite: number
      page: number
    },
    ctx: Contexte,
  ) => {
    const sites = await sitesCibles(ctx, a.site)
    const texte = motif(a.recherche)
    if (a.recherche !== undefined && !texte) throw new ErreurOutil('Recherche vide.')
    const type = motif(a.type)
    const batiment = motif(a.batiment)
    const niveau = motif(a.niveau)
    const { lignes, tronque } = await toutesLesLignes<LieuLeger>((de, jusqua) => {
      let q = ctx.supabase.from('locaux')
        .select(
          `id, nom, niveaux!inner(nom, ordre, batiments!inner(nom, site_id)), types_locaux${
            type ? '!inner' : ''
          }(libelle)`,
        )
        .in('niveaux.batiments.site_id', sites.map((s) => s.id))
      if (texte) q = q.ilike('nom', texte)
      if (niveau) q = q.ilike('niveaux.nom', niveau)
      if (batiment) q = q.ilike('niveaux.batiments.nom', batiment)
      if (type) q = q.ilike('types_locaux.libelle', type)
      return q.order('id').range(de, jusqua)
    }, PLAFOND_LIEUX)
    const tries = trierLieux(lignes, sites)
    const debut = (a.page - 1) * a.limite
    const pageLieux = tries.slice(debut, debut + a.limite)
    const { data, error } = pageLieux.length
      ? await ctx.supabase.from('locaux')
        .select(
          'id, description, surface_m2, hauteur_m, capacite_personnes, accessible_pmr, chauffe_climatise, specifications, equipements(id, code_inventaire, specifications, categorie:categorie_id(nom, valeur_principale, valeur_secondaire, valeur_tertiaire))',
        )
        .in('id', pageLieux.map((l) => l.id))
      : { data: [], error: null }
    if (error) throw error
    const details = new Map((data as unknown as LieuDetail[]).map((d) => [d.id, d]))
    return {
      total: tries.length,
      ...(tronque
        ? { plafond_atteint: `Seuls les ${PLAFOND_LIEUX} premiers lieux sont comptés : affine la recherche.` }
        : {}),
      page: a.page,
      ...(texte ? {} : { arbre: arbreLieux(tries, sites) }),
      lieux: pageLieux.map((l) => presenterLieu(l, details.get(l.id), sites)),
    }
  },
}

// ─── Fiche d'un lieu ─────────────────────────────────────────────────────────

type Compteur = number | Record<string, number> | null
type FicheBrute = {
  lieu: Record<string, unknown> & { specifications?: unknown }
  compteurs: Record<string, Compteur>
  equipements: {
    sous_categorie: string | null
    categorie: string | null
    code: string | null
    specifications: unknown
    valeur_principale: string | null
    valeur_secondaire: string | null
    valeur_tertiaire: string | null
  }[]
  ot: {
    gamme: string
    equipement: string | null
    statut: string
    origine: string
    date_prevue: string
    tolerance_jours: number
  }[] | null
  demandes: { constat: string; statut: string | null; date_constat: string | null }[]
  travaux: { titre: string; statut: string | null; date_demande: string | null; verrouille: boolean }[] | null
  evenements: { titre: string; statut: string | null; date: string | null; verrouille: boolean }[] | null
  plans_maintenance: { gamme: string; nature: string; periodicite: string | null }[] | null
  documents: { nom: string; type: string | null; ajoute_le: string | null }[] | null
}

export function presenterFiche(f: FicheBrute) {
  const l = f.lieu
  const ouverts = (c: Compteur) =>
    c === null ? null : typeof c === 'number' ? c : (c.ouverts ?? c.ouvertes ?? c.actives ?? null)
  const nonVisibles = Object.entries(f.compteurs).filter(([, c]) => c === null).map(([k]) => NOMS_COMPTEURS[k] ?? k)
  const reste = (cle: string, liste: unknown[] | null) => {
    const n = ouverts(f.compteurs[cle] ?? null)
    return liste !== null && n !== null && n > liste.length ? n - liste.length : 0
  }
  const autres = Object.fromEntries(
    ([
      ['equipements', 'equipements', f.equipements],
      ['ot', 'ot', f.ot],
      ['di', 'demandes', f.demandes],
      ['travaux', 'travaux', f.travaux],
      ['evenements', 'evenements', f.evenements],
      ['gammes', 'plans_maintenance', f.plans_maintenance],
      ['documents', 'documents', f.documents],
    ] as const).map(([c, nom, liste]) => [nom, reste(c, liste)]).filter(([, n]) => (n as number) > 0),
  )
  return {
    lieu: {
      nom: l.nom,
      chemin: l.chemin_complet,
      site: l.site_nom,
      batiment: l.batiment_nom,
      niveau: l.niveau_nom,
      type: l.type_local,
      description: l.description,
      surface_m2: l.surface_m2,
      hauteur_m: l.hauteur_m,
      volume_m3: l.volume_m3,
      capacite_personnes: l.capacite_personnes,
      accessible_pmr: l.accessible_pmr,
      chauffe_climatise: l.chauffe_climatise,
      caracteristiques: caracteristiques(l.specifications),
    },
    compteurs: Object.fromEntries(
      Object.entries(f.compteurs).map(([k, c]) => [NOMS_COMPTEURS[k] ?? k, c ?? 'non visible pour ce rôle']),
    ),
    ...(nonVisibles.length
      ? {
        non_visible: `Le rôle de la personne ne lui montre pas : ${
          nonVisibles.join(', ')
        }. Ne pas conclure qu’il n’y en a pas.`,
      }
      : {}),
    equipements: f.equipements.map((e) => ({
      nom: nomEquipement(e),
      categorie: e.categorie,
      code: e.code,
      caracteristiques: caracteristiques(e.specifications),
    })),
    ot_ouverts: f.ot?.map((o) => ({
      gamme: o.gamme,
      equipement: o.equipement,
      statut: STATUT_OT[o.statut] ?? o.statut,
      origine: o.origine === 'programme' ? 'Programmé' : 'Planifié',
      date_prevue: dateFr(o.date_prevue),
      en_retard: enRetard(o),
    })) ?? null,
    demandes_ouvertes: f.demandes.map((d) => ({
      constat: d.constat,
      statut: d.statut,
      date_constat: dateFr(d.date_constat),
    })),
    travaux_ouverts: f.travaux?.map((t) => ({ ...t, date_demande: dateFr(t.date_demande) })) ?? null,
    evenements_ouverts: f.evenements?.map((e) => ({ ...e, date: dateFr(e.date) })) ?? null,
    plans_maintenance_actifs: f.plans_maintenance,
    documents: f.documents?.map((d) => ({ ...d, ajoute_le: dateFr(d.ajoute_le) })) ?? null,
    ...(Object.keys(autres).length ? { non_affiches: autres } : {}),
  }
}

const ficheLieu: Outil = {
  name: 'fiche_lieu',
  title: 'Fiche d’un lieu',
  description:
    'La fiche d’un lieu, comme dans l’application : chemin, type, surface, capacité, PMR, caractéristiques, compteurs par onglet, et les éléments OUVERTS de chaque onglet (OT non terminés, DI non clôturées, travaux et événements en cours, plans de maintenance actifs), ses équipements et ses documents (noms). L’identifiant du lieu (local_id) vient de l’outil lieux.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['local_id'],
    properties: {
      local_id: { type: 'string', description: 'Identifiant du lieu (local_id de l’outil lieux)' },
      limite: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'Éléments par onglet' },
    },
  },
  annotations: LECTURE,
  schema: z.object({ local_id: z.string().uuid('Identifiant de lieu invalide'), limite: limite(50, 10) }).strict(),
  run: async (a: { local_id: string; limite: number }, ctx: Contexte) => {
    const { data, error } = await ctx.supabase.rpc('claude_fiche_lieu', {
      p_local_id: a.local_id,
      p_limite: a.limite,
    })
    if (error) throw error
    if (!data) throw new ErreurOutil('Lieu introuvable (ou hors de tes sites).')
    return presenterFiche(data as FicheBrute)
  },
}

export const OUTILS_PARC: Outil[] = [lieux, ficheLieu, equipements, flottes, bibliotheque]
