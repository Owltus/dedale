// Outils d'ÉCRITURE du connecteur Claude — Bibliothèque et parc existant (plan
// connecteur-parc-lieux-bibliotheque, étape 5 ; migrations 188 et 190).
//
// Même modèle que outils-ecriture-equipements.ts : chaque outil appelle UNE
// fonction SQL claude_* (SECURITY INVOKER : la RLS de la personne s'applique)
// qui vérifie le droit, les règles métier et le code de confirmation. Aperçu
// d'abord ; enregistrement avec les mêmes paramètres, appliquer=true et le code,
// après un oui explicite.
//
// Claude parle en NOMS : site, modèle, flotte, catégorie de parc, plan de
// maintenance et lieu de destination sont résolus ici parmi ce que la personne
// voit, sans ambiguïté ; la base revérifie tout. Les lieux d'une sélection sont
// résolus par la BASE (bâtiment, niveau, type de lieu, ou local_ids de l'outil
// lieux). Plafonds identiques en Zod et en SQL. Le commun (catalogue du siège)
// ne se modifie que par un administrateur ou un manager (188) ; aucune
// suppression de modèle ni de flotte ; un équipement ne se supprime que sans
// historique (190).

import { z } from 'npm:zod@3.23.8'
import {
  appliquer,
  code,
  type Contexte,
  date,
  dateFr,
  ECRITURE,
  ECRITURE_SENSIBLE,
  ErreurOutil,
  geste,
  nettoyer,
  nomSite,
  type Outil,
  PROPRIETES_CONFIRMATION,
  site,
  sitesCibles,
  uuid,
} from './commun.ts'
import { caracteristiques, gabarit } from './caracteristiques.ts'
import {
  type Caracteristique,
  choisir,
  cle,
  exigerCommun,
  exigerGestesParc,
  gabaritDemande,
  lieuxSelection,
  PLAFONDS,
  presenterModeleCree,
  PROPRIETE_CARACTERISTIQUES,
  PROPRIETE_VALEUR,
  resoudreCategorieParc,
  resoudreFlotte,
  resoudreGammes,
  type Selection,
  selection,
  siteUnique,
  valeur,
  versChamp,
} from './outils-ecriture-equipements.ts'

type Site = { id: string; nom: string }

// ─── Résolutions ─────────────────────────────────────────────────────────────

type ModeleLigne = { id: string; nom: string; site_id: string | null; categorie: { nom: string } | null }

/**
 * Un modèle de la Bibliothèque par son nom : du commun, des sites visés, ou
 * des deux (origine absente). Homonymes commun / site = ambiguïté à lever.
 */
export async function resoudreModele(
  ctx: Contexte,
  sites: Site[],
  nom: string,
  origine: 'site' | 'commun' | undefined,
  categorie?: string,
) {
  const texte = nettoyer(nom)
  if (!texte) throw new ErreurOutil('Nom de modèle vide.')
  const ids = sites.map((s) => s.id)
  let q = ctx.supabase.from('modeles_equipements').select('id, nom, site_id, categorie:categorie_id(nom)')
  if (origine === 'commun') q = q.is('site_id', null)
  else if (origine === 'site') q = q.in('site_id', ids)
  else q = q.or(ids.length ? `site_id.is.null,site_id.in.(${ids.join(',')})` : 'site_id.is.null')
  const { data, error } = await q.ilike('nom', `%${texte}%`).order('nom').limit(100)
  if (error) throw error
  let lignes = (data as unknown as ModeleLigne[]).filter((m) =>
    m.site_id === null ? origine !== 'site' : origine !== 'commun' && ids.includes(m.site_id)
  )
  if (categorie) lignes = lignes.filter((m) => cle(m.categorie?.nom ?? '').includes(cle(categorie)))
  return choisir(
    'modèle',
    nom,
    lignes,
    (m) => m.nom,
    (m) =>
      `${m.nom} (${
        [m.site_id === null ? 'Commun' : nomSite(sites, m.site_id), m.categorie?.nom].filter(Boolean).join(', ')
      })`,
  )
}

type LieuLigne = { id: string; nom: string; niveaux: { nom: string; batiments: { nom: string; site_id: string } } }

/** UN lieu du site par son nom (bâtiment et niveau pour lever une ambiguïté). */
export async function resoudreLieu(
  ctx: Contexte,
  siteId: string,
  lieu: string,
  batiment?: string,
  niveau?: string,
) {
  const texte = nettoyer(lieu)
  if (!texte) throw new ErreurOutil('Nom de lieu vide.')
  const { data, error } = await ctx.supabase.from('locaux')
    .select('id, nom, niveaux!inner(nom, batiments!inner(nom, site_id))')
    .eq('niveaux.batiments.site_id', siteId).ilike('nom', `%${texte}%`).order('nom').limit(200)
  if (error) throw error
  let lignes = (data as unknown as LieuLigne[]).filter((l) => l.niveaux?.batiments?.site_id === siteId)
  if (batiment) lignes = lignes.filter((l) => cle(l.niveaux.batiments.nom).includes(cle(batiment)))
  if (niveau) lignes = lignes.filter((l) => cle(l.niveaux.nom) === cle(niveau))
  return choisir(
    'lieu',
    lieu,
    lignes,
    (l) => l.nom,
    (l) => `${l.nom} (${l.niveaux.batiments.nom}, ${l.niveaux.nom})`,
  )
}

/** Un plan de maintenance DU SITE ; retirer vise aussi les plans désactivés. */
async function resoudrePlan(ctx: Contexte, siteId: string, nom: string, action: 'ajouter' | 'retirer') {
  if (action === 'ajouter') return (await resoudreGammes(ctx, siteId, [nom]))[0]
  const { data, error } = await ctx.supabase.from('gammes').select('id, nom')
    .eq('site_id', siteId).order('nom').limit(1000)
  if (error) throw error
  return choisir('plan de maintenance', nom, data as { id: string; nom: string }[], (g) => g.nom).id
}

// ─── Sélection d'équipements : une flotte + des lieux (facultatifs) ──────────

/** Lieux facultatifs : rien = toute la flotte ; sinon bâtiment OU local_ids. */
export function controlerSelectionFacultative(a: Selection, ctx: z.RefinementCtx) {
  if (a.local_ids && a.batiment) {
    ctx.addIssue({
      code: 'custom',
      message: 'Donner soit local_ids (lieux de l’outil lieux), soit batiment, pas les deux',
      path: ['batiment'],
    })
  }
  if (!a.batiment && (a.niveau || a.type_lieu)) {
    ctx.addIssue({ code: 'custom', message: 'niveau et type_lieu vont avec batiment', path: ['niveau'] })
  }
}

/** p_selection : null = toute la flotte. */
export function selectionFacultative(a: Selection): Record<string, unknown> | null {
  return a.local_ids || a.batiment ? selection(a) : null
}

const PROPRIETES_FLOTTE = {
  flotte: { type: 'string', description: 'Nom de la flotte (outil flottes, champ flotte)' },
  categorie: { type: 'string', description: 'Catégorie de la flotte, pour lever une ambiguïté de nom' },
  site: { type: 'string', description: 'Nom du site, pour lever une ambiguïté de nom' },
}

const PROPRIETES_SELECTION = {
  batiment: { type: 'string', description: 'Nom du bâtiment (outil lieux, arbre) ; absent = toute la flotte' },
  niveau: { type: 'string', description: 'Nom du niveau dans ce bâtiment (ex. « R+2 »)' },
  type_lieu: { type: 'string', description: 'Type de lieu (ex. « Chambre »)' },
  local_ids: {
    type: 'array',
    items: { type: 'string' },
    minItems: 1,
    maxItems: PLAFONDS.lieux,
    description: 'À la place de batiment : les lieux exacts (local_id de l’outil lieux)',
  },
}

const flotteZod = {
  flotte: z.string().trim().min(1).max(120),
  categorie: z.string().trim().min(1).max(120).optional(),
  site,
}

type FlotteArgs = Selection & { flotte: string; categorie?: string; site?: string }

async function flotteVisee(ctx: Contexte, a: FlotteArgs) {
  await exigerGestesParc(ctx)
  const sites = await sitesCibles(ctx, a.site)
  return resoudreFlotte(ctx, sites, a.flotte, a.categorie)
}

// ─── Rendu ───────────────────────────────────────────────────────────────────

/** Le gabarit « après » d'une modification de modèle ou de flotte, lisible. */
export function presenterGabaritModifie(r: Record<string, unknown>) {
  const c = r.caracteristiques as Record<string, unknown> | null | undefined
  if (!c || typeof c !== 'object') return r
  const { apres, ...reste } = c
  return { ...r, caracteristiques: { ...reste, gabarit_apres: gabarit(apres) } }
}

const CLES_DATE_EQUIPEMENT = ['date_mise_en_service', 'date_fin_garantie']

function versLisible(etat: unknown) {
  if (!etat || typeof etat !== 'object') return etat
  const o = { ...(etat as Record<string, unknown>) }
  for (const k of CLES_DATE_EQUIPEMENT) if (typeof o[k] === 'string') o[k] = dateFr(o[k] as string)
  if (Array.isArray(o.caracteristiques)) o.caracteristiques = caracteristiques({ champs: o.caracteristiques })
  return o
}

/** Aperçu d'une modification d'équipements ou de lieux : avant / après lisibles. */
export function presenterAvantApres(r: Record<string, unknown>) {
  const exemples = (r.exemples as Record<string, unknown>[] | undefined) ?? []
  return {
    ...r,
    ...(r.modifications ? { modifications: versLisible(r.modifications) } : {}),
    exemples: exemples.map((e) => ({ ...e, avant: versLisible(e.avant), apres: versLisible(e.apres) })),
  }
}

const APRES_INSTALLATION =
  'Résume à la personne le modèle installé et sa flotte. Pour poser des équipements de cette flotte dans des lieux : deployer_equipements (aperçu d’abord).'
const APRES_MODIFICATION = 'Résume à la personne ce qui a changé (et ce qui ne change pas, voir les alertes).'
const APRES_DEPLACEMENT =
  'Résume à la personne les équipements déplacés (par lieu de destination) et les plans de maintenance concernés.'
const APRES_RATTACHEMENT =
  'Résume à la personne les équipements rattachés ou retirés et les opérations ajoutées ou retirées des OT ouverts.'
const APRES_SUPPRESSION =
  'Résume à la personne les équipements supprimés (définitivement) et ceux gardés pour leur historique.'

// ─── Outils ──────────────────────────────────────────────────────────────────

const installerModele: Outil = {
  name: 'installer_modele',
  title: 'Installer un modèle du commun sur un site (et sa flotte)',
  description:
    'Installe sur UN site une copie d’un modèle du COMMUN (catalogue du siège) : la copie est indépendante (modifier le commun ne la change pas). ' +
    'Par défaut crée aussi sa FLOTTE (sous-catégorie de parc qui recopie le modèle installé) sous une catégorie de parc du site, prête à être déployée (deployer_equipements). ' +
    'Un modèle déjà installé sur le site (même nom) est refusé : réutilise-le. Avant : bibliotheque (origine commun, installe_sur) et flottes (catégories de parc). Aperçu d’abord, puis enregistrement après accord.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['modele'],
    properties: {
      modele: { type: 'string', description: 'Nom du modèle du commun (outil bibliotheque, origine commun)' },
      categorie: { type: 'string', description: 'Catégorie du modèle, pour lever une ambiguïté de nom' },
      site: { type: 'string', description: 'Nom du site où l’installer (obligatoire si la personne en a plusieurs)' },
      creer_flotte: {
        type: 'boolean',
        default: true,
        description: 'Créer aussi la flotte, copie du modèle installé (nécessaire pour le déployer)',
      },
      categorie_parc: {
        type: 'string',
        description:
          'Catégorie de parc du site où ranger la flotte (outil flottes, champ categorie) — obligatoire avec la flotte',
      },
      nom_flotte: { type: 'string', description: 'Nom de la flotte ; absent = le nom du modèle' },
      valeur_principale: {
        type: 'string',
        description:
          'Libellé de la caractéristique qui nomme chaque équipement ; de type texte, elle prend au déploiement le nom du lieu',
      },
      ...PROPRIETES_CONFIRMATION,
    },
  },
  annotations: ECRITURE,
  schema: z.object({
    modele: z.string().trim().min(1).max(PLAFONDS.nom),
    categorie: z.string().trim().min(1).max(120).optional(),
    site,
    creer_flotte: z.boolean().default(true),
    categorie_parc: z.string().trim().min(1).max(120).optional(),
    nom_flotte: z.string().trim().min(1).max(PLAFONDS.nom).optional(),
    valeur_principale: z.string().trim().min(1).max(60).optional(),
    appliquer,
    code,
  }).strict(),
  run: async (
    a: {
      modele: string
      categorie?: string
      site?: string
      creer_flotte: boolean
      categorie_parc?: string
      nom_flotte?: string
      valeur_principale?: string
      appliquer: boolean
      code?: string
    },
    ctx: Contexte,
  ) => {
    await exigerGestesParc(ctx)
    const s = await siteUnique(ctx, a.site)
    if (a.creer_flotte && !a.categorie_parc) {
      throw new ErreurOutil(
        'Pour créer la flotte, il faut la catégorie de parc où la ranger (outil flottes, champ categorie) — ou creer_flotte=false.',
      )
    }
    if (!a.creer_flotte && (a.nom_flotte || a.valeur_principale)) {
      throw new ErreurOutil('Nom de flotte et valeur principale vont avec la flotte : creer_flotte=true.')
    }
    const m = await resoudreModele(ctx, [s], a.modele, 'commun', a.categorie)
    const parc = a.creer_flotte && a.categorie_parc ? await resoudreCategorieParc(ctx, s.id, a.categorie_parc) : null
    const r = await geste(
      ctx,
      'claude_installer_modele_equipement',
      {
        p_modele_id: m.id,
        p_site_id: s.id,
        p_creer_flotte: a.creer_flotte,
        p_flotte_parent_id: parc?.id ?? null,
        p_nom_flotte: a.nom_flotte ?? null,
        p_valeur_principale: a.valeur_principale ?? null,
        p_appliquer: a.appliquer,
        p_code: a.code ?? null,
      },
      a.appliquer,
      APRES_INSTALLATION,
    )
    return presenterModeleCree(r)
  },
}

const modifierModele: Outil = {
  name: 'modifier_modele',
  title: 'Modifier un modèle d’équipement de la Bibliothèque',
  description:
    'Corrige un modèle de la Bibliothèque : nom, description (vide = effacée), caractéristiques (la liste COMPLÈTE du gabarit voulu, qui remplace l’ancienne), actif ou archivé. Paramètre absent = inchangé. ' +
    'Un modèle du SITE : administrateur, manager ou technicien du site. Un modèle du COMMUN : administrateur ou manager seulement. ' +
    'Les copies (modèles installés, flottes recopiées, équipements) ne changent pas ; pour changer le gabarit d’une flotte et de ses équipements : modifier_flotte. Jamais de suppression de modèle. Aperçu d’abord, puis enregistrement après accord.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['modele'],
    properties: {
      modele: { type: 'string', description: 'Nom actuel du modèle (outil bibliotheque)' },
      origine: {
        type: 'string',
        enum: ['site', 'commun'],
        description: 'site = modèle d’un site ; commun = catalogue du siège (pour lever une ambiguïté)',
      },
      site: { type: 'string', description: 'Nom du site du modèle, pour lever une ambiguïté' },
      categorie: { type: 'string', description: 'Catégorie du modèle, pour lever une ambiguïté' },
      nom: { type: 'string', description: 'Nouveau nom (120 caractères au plus)' },
      description: { type: 'string', description: 'Nouvelle description ; "" = l’effacer' },
      caracteristiques: {
        ...PROPRIETE_CARACTERISTIQUES,
        description:
          'Le gabarit COMPLET après modification (caractéristiques gardées, modifiées et ajoutées ; celles absentes sont retirées)',
      },
      actif: { type: 'boolean', description: 'false = archiver (plus proposé), true = réactiver' },
      ...PROPRIETES_CONFIRMATION,
    },
  },
  annotations: ECRITURE,
  schema: z.object({
    modele: z.string().trim().min(1).max(PLAFONDS.nom),
    origine: z.enum(['site', 'commun']).optional(),
    site,
    categorie: z.string().trim().min(1).max(120).optional(),
    nom: z.string().trim().min(1).max(PLAFONDS.nom).optional(),
    description: z.string().trim().max(PLAFONDS.description).optional(),
    caracteristiques: gabaritDemande.optional(),
    actif: z.boolean().optional(),
    appliquer,
    code,
  }).strict().refine(
    (a) =>
      a.nom !== undefined || a.description !== undefined || a.caracteristiques !== undefined || a.actif !== undefined,
    { message: 'Rien à modifier : donner nom, description, caracteristiques ou actif', path: ['nom'] },
  ),
  run: async (
    a: {
      modele: string
      origine?: 'site' | 'commun'
      site?: string
      categorie?: string
      nom?: string
      description?: string
      caracteristiques?: Caracteristique[]
      actif?: boolean
      appliquer: boolean
      code?: string
    },
    ctx: Contexte,
  ) => {
    const role = await exigerGestesParc(ctx)
    if (a.origine === 'commun') exigerCommun(role)
    const sites = await sitesCibles(ctx, a.site)
    const m = await resoudreModele(ctx, sites, a.modele, a.site && !a.origine ? 'site' : a.origine, a.categorie)
    if (m.site_id === null) exigerCommun(role)
    const r = await geste(
      ctx,
      'claude_modifier_modele_equipement',
      {
        p_modele_id: m.id,
        p_nom: a.nom ?? null,
        p_description: a.description ?? null,
        p_champs: a.caracteristiques ? a.caracteristiques.map(versChamp) : null,
        p_actif: a.actif ?? null,
        p_appliquer: a.appliquer,
        p_code: a.code ?? null,
      },
      a.appliquer,
      APRES_MODIFICATION,
    )
    return presenterGabaritModifie(r)
  },
}

const modifierFlotte: Outil = {
  name: 'modifier_flotte',
  title: 'Modifier une flotte (et le gabarit de ses équipements)',
  description:
    'Corrige une flotte (sous-catégorie de parc) d’UN site : nom, description (vide = effacée), caractéristiques (la liste COMPLÈTE du gabarit voulu), valeur principale (vide = retirée). Paramètre absent = inchangé. ' +
    'Un nouveau gabarit est propagé à TOUS les équipements de la flotte, comme dans l’application : valeur gardée par nom de caractéristique, sinon défaut ; une caractéristique retirée perd ses valeurs (comptées dans l’aperçu). ' +
    'Une flotte encore liée à un modèle se modifie sur le modèle (modifier_modele). Jamais de suppression de flotte. Aperçu d’abord, puis enregistrement après accord.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['flotte'],
    properties: {
      ...PROPRIETES_FLOTTE,
      nom: { type: 'string', description: 'Nouveau nom (120 caractères au plus)' },
      description: { type: 'string', description: 'Nouvelle description ; "" = l’effacer' },
      caracteristiques: {
        ...PROPRIETE_CARACTERISTIQUES,
        description:
          'Le gabarit COMPLET après modification (outil flottes, gabarit) : celles absentes sont retirées, leurs valeurs perdues',
      },
      valeur_principale: {
        type: 'string',
        description: 'Libellé de la caractéristique qui nomme chaque équipement ; "" = la retirer',
      },
      ...PROPRIETES_CONFIRMATION,
    },
  },
  annotations: ECRITURE,
  schema: z.object({
    ...flotteZod,
    nom: z.string().trim().min(1).max(PLAFONDS.nom).optional(),
    description: z.string().trim().max(PLAFONDS.description).optional(),
    caracteristiques: gabaritDemande.optional(),
    valeur_principale: z.string().trim().max(60).optional(),
    appliquer,
    code,
  }).strict().refine(
    (a) =>
      a.nom !== undefined || a.description !== undefined || a.caracteristiques !== undefined ||
      a.valeur_principale !== undefined,
    { message: 'Rien à modifier : donner nom, description, caracteristiques ou valeur_principale', path: ['nom'] },
  ),
  run: async (
    a: FlotteArgs & {
      nom?: string
      description?: string
      caracteristiques?: Caracteristique[]
      valeur_principale?: string
      appliquer: boolean
      code?: string
    },
    ctx: Contexte,
  ) => {
    const f = await flotteVisee(ctx, a)
    const r = await geste(
      ctx,
      'claude_modifier_flotte',
      {
        p_flotte_id: f.id,
        p_nom: a.nom ?? null,
        p_description: a.description ?? null,
        p_champs: a.caracteristiques ? a.caracteristiques.map(versChamp) : null,
        p_valeur_principale: a.valeur_principale ?? null,
        p_appliquer: a.appliquer,
        p_code: a.code ?? null,
      },
      a.appliquer,
      APRES_MODIFICATION,
    )
    return presenterGabaritModifie(r)
  },
}

const dateOuNull = date.nullable().optional()

const modifierEquipements: Outil = {
  name: 'modifier_equipements',
  title: 'Modifier des équipements d’une flotte',
  description:
    'Corrige en une fois les équipements d’UNE flotte, choisis par leurs lieux (bâtiment + niveau + type de lieu, ou local_ids ; absent = toute la flotte ; 500 au plus) : valeurs de caractéristiques (valeur principale comprise), dates de mise en service et de fin de garantie (null = effacer). ' +
    'Jamais le code d’inventaire, ni la flotte, ni le site. Pour déplacer : deplacer_equipements. Aperçu d’abord (exemples avant / après), puis enregistrement après accord.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['flotte'],
    properties: {
      ...PROPRIETES_FLOTTE,
      ...PROPRIETES_SELECTION,
      valeurs: {
        type: 'object',
        additionalProperties: PROPRIETE_VALEUR,
        description:
          'Caractéristiques à poser sur chaque équipement choisi, { libellé du gabarit: valeur } (null = vider)',
      },
      date_mise_en_service: { type: ['string', 'null'], description: '« AAAA-MM-JJ », ou null pour l’effacer' },
      date_fin_garantie: { type: ['string', 'null'], description: '« AAAA-MM-JJ », ou null pour l’effacer' },
      ...PROPRIETES_CONFIRMATION,
    },
  },
  annotations: ECRITURE,
  schema: z.object({
    ...flotteZod,
    ...lieuxSelection,
    valeurs: z.record(valeur).refine(
      (v) => Object.keys(v).length <= PLAFONDS.valeurs,
      `${PLAFONDS.valeurs} caractéristiques au plus`,
    ).optional(),
    date_mise_en_service: dateOuNull,
    date_fin_garantie: dateOuNull,
    appliquer,
    code,
  }).strict().superRefine((a, ctx) => {
    controlerSelectionFacultative(a, ctx)
    if (a.valeurs === undefined && a.date_mise_en_service === undefined && a.date_fin_garantie === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Rien à modifier : donner valeurs, date_mise_en_service ou date_fin_garantie',
        path: ['valeurs'],
      })
    }
  }),
  run: async (
    a: FlotteArgs & {
      valeurs?: Record<string, unknown>
      date_mise_en_service?: string | null
      date_fin_garantie?: string | null
      appliquer: boolean
      code?: string
    },
    ctx: Contexte,
  ) => {
    const f = await flotteVisee(ctx, a)
    const modifs = {
      ...(a.valeurs !== undefined ? { valeurs: a.valeurs } : {}),
      ...(a.date_mise_en_service !== undefined ? { date_mise_en_service: a.date_mise_en_service } : {}),
      ...(a.date_fin_garantie !== undefined ? { date_fin_garantie: a.date_fin_garantie } : {}),
    }
    const r = await geste(
      ctx,
      'claude_modifier_equipements',
      {
        p_flotte_id: f.id,
        p_selection: selectionFacultative(a),
        p_modifs: modifs,
        p_appliquer: a.appliquer,
        p_code: a.code ?? null,
      },
      a.appliquer,
      APRES_MODIFICATION,
    )
    return presenterAvantApres(r)
  },
}

const deplacerEquipements: Outil = {
  name: 'deplacer_equipements',
  title: 'Déplacer des équipements d’une flotte vers d’autres lieux',
  description:
    'Change de lieu les équipements d’UNE flotte, sur le SITE de la flotte seulement (un équipement ne change ni de site ni de flotte). ' +
    'Soit tous vers UN lieu (vers_lieu par son nom, avec vers_batiment / vers_niveau si besoin, ou vers_local_id de l’outil lieux), les équipements étant choisis par leurs lieux actuels (absent = toute la flotte) ; ' +
    'soit lieu par lieu (correspondances [{ de, vers }] de local_id de l’outil lieux, 500 au plus). ' +
    'Refusé si la flotte aurait deux équipements dans un même lieu, sauf autoriser_doublon=true à la demande explicite de la personne. Aperçu d’abord, puis enregistrement après accord.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['flotte'],
    properties: {
      ...PROPRIETES_FLOTTE,
      ...PROPRIETES_SELECTION,
      vers_lieu: { type: 'string', description: 'Nom du lieu de destination (outil lieux)' },
      vers_batiment: { type: 'string', description: 'Bâtiment du lieu de destination, pour lever une ambiguïté' },
      vers_niveau: { type: 'string', description: 'Niveau du lieu de destination, pour lever une ambiguïté' },
      vers_local_id: { type: 'string', description: 'À la place de vers_lieu : le local_id de l’outil lieux' },
      correspondances: {
        type: 'array',
        minItems: 1,
        maxItems: PLAFONDS.lieux,
        description: 'Lieu par lieu, sans autre sélection : [{ de: local_id actuel, vers: local_id de destination }]',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['de', 'vers'],
          properties: { de: { type: 'string' }, vers: { type: 'string' } },
        },
      },
      autoriser_doublon: {
        type: 'boolean',
        default: false,
        description:
          'true = accepter plusieurs équipements de la flotte dans un même lieu (seulement si la personne le veut)',
      },
      ...PROPRIETES_CONFIRMATION,
    },
  },
  annotations: ECRITURE,
  schema: z.object({
    ...flotteZod,
    ...lieuxSelection,
    vers_lieu: z.string().trim().min(1).max(200).optional(),
    vers_batiment: z.string().trim().min(1).max(200).optional(),
    vers_niveau: z.string().trim().min(1).max(200).optional(),
    vers_local_id: uuid.optional(),
    correspondances: z.array(z.object({ de: uuid, vers: uuid }).strict()).min(1).max(PLAFONDS.lieux).optional(),
    autoriser_doublon: z.boolean().default(false),
    appliquer,
    code,
  }).strict().superRefine((a, ctx) => {
    controlerSelectionFacultative(a, ctx)
    const cibles = [a.vers_lieu, a.vers_local_id, a.correspondances].filter((x) => x !== undefined).length
    if (cibles !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'Donner UNE destination : vers_lieu, vers_local_id ou correspondances',
        path: ['vers_lieu'],
      })
    }
    if (!a.vers_lieu && (a.vers_batiment || a.vers_niveau)) {
      ctx.addIssue({
        code: 'custom',
        message: 'vers_batiment et vers_niveau vont avec vers_lieu',
        path: ['vers_batiment'],
      })
    }
    if (a.correspondances && (a.local_ids || a.batiment)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Avec des correspondances, les lieux de départ font la sélection : pas de batiment ni de local_ids',
        path: ['correspondances'],
      })
    }
  }),
  run: async (
    a: FlotteArgs & {
      vers_lieu?: string
      vers_batiment?: string
      vers_niveau?: string
      vers_local_id?: string
      correspondances?: { de: string; vers: string }[]
      autoriser_doublon: boolean
      appliquer: boolean
      code?: string
    },
    ctx: Contexte,
  ) => {
    const f = await flotteVisee(ctx, a)
    const vers = a.vers_lieu
      ? (await resoudreLieu(ctx, f.site_id, a.vers_lieu, a.vers_batiment, a.vers_niveau)).id
      : a.vers_local_id ?? null
    return geste(
      ctx,
      'claude_deplacer_equipements',
      {
        p_flotte_id: f.id,
        p_selection: a.correspondances ? null : selectionFacultative(a),
        p_vers_local_id: vers,
        p_correspondances: a.correspondances ?? null,
        p_autoriser_doublon: a.autoriser_doublon,
        p_appliquer: a.appliquer,
        p_code: a.code ?? null,
      },
      a.appliquer,
      APRES_DEPLACEMENT,
    )
  },
}

const rattacherPlan: Outil = {
  name: 'rattacher_plan',
  title: 'Rattacher des équipements à un plan de maintenance (ou les en retirer)',
  description:
    'Ajoute (action « ajouter ») ou retire (« retirer ») les équipements d’UNE flotte, choisis par leurs lieux (absent = toute la flotte ; 500 au plus), d’UN plan de maintenance DU SITE de la flotte (jamais du commun : il s’installe d’abord depuis l’application). ' +
    'Ajouter : les équipements entrent dans les OT ouverts du plan. Retirer : ils quittent les OT ouverts, les opérations déjà faites restent. Déjà rattachés / non rattachés sont écartés. Aperçu d’abord, puis enregistrement après accord.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['plan_maintenance', 'action', 'flotte'],
    properties: {
      plan_maintenance: { type: 'string', description: 'Nom du plan de maintenance du site (outil plan_maintenance)' },
      action: { type: 'string', enum: ['ajouter', 'retirer'] },
      ...PROPRIETES_FLOTTE,
      ...PROPRIETES_SELECTION,
      ...PROPRIETES_CONFIRMATION,
    },
  },
  annotations: ECRITURE,
  schema: z.object({
    plan_maintenance: z.string().trim().min(1).max(200),
    action: z.enum(['ajouter', 'retirer']),
    ...flotteZod,
    ...lieuxSelection,
    appliquer,
    code,
  }).strict().superRefine(controlerSelectionFacultative),
  run: async (
    a: FlotteArgs & {
      plan_maintenance: string
      action: 'ajouter' | 'retirer'
      appliquer: boolean
      code?: string
    },
    ctx: Contexte,
  ) => {
    const f = await flotteVisee(ctx, a)
    const g = await resoudrePlan(ctx, f.site_id, a.plan_maintenance, a.action)
    return geste(
      ctx,
      'claude_rattacher_equipements_gamme',
      {
        p_gamme_id: g,
        p_flotte_id: f.id,
        p_selection: selectionFacultative(a),
        p_action: a.action,
        p_appliquer: a.appliquer,
        p_code: a.code ?? null,
      },
      a.appliquer,
      APRES_RATTACHEMENT,
    )
  },
}

const supprimerEquipements: Outil = {
  name: 'supprimer_equipements',
  title: 'Supprimer des équipements sans historique',
  description:
    'Supprime DÉFINITIVEMENT les équipements d’UNE flotte, choisis par leurs lieux (500 au plus), qui n’ont AUCUN historique (OT exécutés, documents, DI, travaux, événements, observations) ; ceux qui en ont un sont toujours gardés et nommés. Ils sont d’abord retirés de leurs plans de maintenance. ' +
    'Toute la flotte seulement avec toute_la_flotte=true. Pour défaire un déploiement récent, préférer annuler_deploiement. Jamais de suppression de lieu, de modèle ni de flotte. Aperçu TOUJOURS montré avant, puis enregistrement après un oui explicite.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['flotte'],
    properties: {
      ...PROPRIETES_FLOTTE,
      ...PROPRIETES_SELECTION,
      toute_la_flotte: {
        type: 'boolean',
        default: false,
        description: 'true = viser toute la flotte (sans bâtiment ni local_ids), seulement si la personne le demande',
      },
      ...PROPRIETES_CONFIRMATION,
    },
  },
  annotations: ECRITURE_SENSIBLE,
  schema: z.object({
    ...flotteZod,
    ...lieuxSelection,
    toute_la_flotte: z.boolean().default(false),
    appliquer,
    code,
  }).strict().superRefine((a, ctx) => {
    controlerSelectionFacultative(a, ctx)
    const choisis = Boolean(a.local_ids || a.batiment)
    if (choisis === a.toute_la_flotte) {
      ctx.addIssue({
        code: 'custom',
        message: 'Donner soit des lieux (batiment ou local_ids), soit toute_la_flotte=true',
        path: ['toute_la_flotte'],
      })
    }
  }),
  run: async (a: FlotteArgs & { toute_la_flotte: boolean; appliquer: boolean; code?: string }, ctx: Contexte) => {
    const f = await flotteVisee(ctx, a)
    return geste(
      ctx,
      'claude_supprimer_equipements',
      {
        p_flotte_id: f.id,
        p_selection: selectionFacultative(a),
        p_appliquer: a.appliquer,
        p_code: a.code ?? null,
      },
      a.appliquer,
      APRES_SUPPRESSION,
    )
  },
}

export const OUTILS_ECRITURE_PARC: Outil[] = [
  installerModele,
  modifierModele,
  modifierFlotte,
  modifierEquipements,
  deplacerEquipements,
  rattacherPlan,
  supprimerEquipements,
]
