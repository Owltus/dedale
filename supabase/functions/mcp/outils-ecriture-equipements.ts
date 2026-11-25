// Outils d'ÉCRITURE du connecteur Claude — parc d'équipements (étape 7 du plan
// fiche-lieu-et-deploiement-equipements, migration 186).
//
// Même modèle que les OT (outils-ecriture.ts) : chaque outil appelle une
// fonction SQL claude_* qui vérifie le droit (connecteur + acces_ia_ecriture),
// la RLS, les règles métier et le code de confirmation. Aperçu d'abord ;
// enregistrement avec les mêmes paramètres, appliquer=true et le code, après un
// oui explicite de la personne.
//
// Claude parle en NOMS : site, catégorie, flotte, catégorie de parc et plans de
// maintenance sont résolus ici parmi ce que la personne voit (RLS), sans
// ambiguïté, puis la base revérifie tout. Les lieux d'un déploiement sont
// résolus par la BASE (bâtiment, niveau, type de lieu, ou identifiants de
// l'outil lieux). Plafonds identiques en Zod et en SQL.

import { z } from 'npm:zod@3.23.8'
import {
  appliquer,
  code,
  type Contexte,
  ECRITURE,
  ECRITURE_SENSIBLE,
  ErreurOutil,
  geste,
  nettoyer,
  type Outil,
  PROPRIETES_CONFIRMATION,
  site,
  sitesCibles,
  uuid,
} from './commun.ts'
import { caracteristiques, gabarit } from './caracteristiques.ts'

type Site = { id: string; nom: string }

/** Plafonds — miroir exact de 186 (normaliser_gabarit, lieux_selection_deploiement, claude_*). */
export const PLAFONDS = {
  lieux: 500,
  plans: 20,
  caracteristiques: 40,
  valeurs: 40,
  nom: 120,
  description: 2000,
  rang: 20,
} as const

const cle = (t: string) => t.trim().toLowerCase()

/**
 * UN candidat par son nom : égalité (casse et espaces ignorés), sinon un seul
 * qui le contient. Sinon erreur claire listant les candidats (15 au plus).
 */
export function choisir<T>(
  quoi: string,
  demande: string,
  candidats: T[],
  nom: (t: T) => string,
  decrire: (t: T) => string = nom,
): T {
  const d = cle(demande)
  const exacts = candidats.filter((c) => cle(nom(c)) === d)
  if (exacts.length === 1) return exacts[0]
  const proches = exacts.length ? exacts : candidats.filter((c) => cle(nom(c)).includes(d))
  if (proches.length === 1) return proches[0]
  const liste = [...new Set((proches.length ? proches : candidats).map(decrire))].sort().slice(0, 15)
  if (!proches.length) {
    throw new ErreurOutil(
      `Aucun(e) ${quoi} ne correspond à « ${demande.trim()} ». ${
        liste.length ? `Possibles : ${liste.map((x) => `« ${x} »`).join(', ')}.` : 'Il n’y en a aucun(e) de visible.'
      }`,
    )
  }
  throw new ErreurOutil(
    `« ${demande.trim()} » est ambigu : ${proches.length} ${quoi}s correspondent (${
      liste.map((x) => `« ${x} »`).join(', ')
    }). Précise lequel.`,
  )
}

/**
 * Avant toute résolution de nom : un rôle sans droit ne voit pas les
 * catégories (le demandeur), et répondrait « introuvable » au lieu de « pas le
 * droit ». Message clair seulement : la base revérifie tout (186).
 */
export async function exigerGestesParc(ctx: Contexte) {
  const [{ data: role }, { data: moi }] = await Promise.all([
    ctx.supabase.rpc('current_role'),
    ctx.supabase.from('users').select('acces_ia_ecriture').eq('id', ctx.userId).maybeSingle(),
  ])
  if ((moi as { acces_ia_ecriture?: boolean } | null)?.acces_ia_ecriture !== true) {
    throw new ErreurOutil(
      'Rien n’a été enregistré. Ton accès Claude est en lecture seule : un administrateur peut ouvrir la modification sur ta fiche utilisateur.',
    )
  }
  if (!['admin', 'manager', 'technicien'].includes(String(role))) {
    throw new ErreurOutil(
      'Rien n’a été enregistré. Ton rôle ne permet pas de créer, déployer ou retirer des équipements (réservé aux administrateurs, managers et techniciens de tes sites).',
    )
  }
}

/** Le site d'un geste qui en vise un seul. */
async function siteUnique(ctx: Contexte, demande: string | undefined): Promise<Site> {
  const sites = await sitesCibles(ctx, demande)
  if (sites.length === 1) return sites[0]
  throw new ErreurOutil(
    `Précise le site (un seul par appel) : ${sites.map((s) => s.nom).join(', ')}.`,
  )
}

type FlotteLigne = { id: string; nom: string; site_id: string; parent: { nom: string } | null }

/** Une flotte (sous-catégorie de parc) des sites visés, par son nom (et sa catégorie). */
export async function resoudreFlotte(ctx: Contexte, sites: Site[], nom: string, categorie?: string) {
  const texte = nettoyer(nom)
  if (!texte) throw new ErreurOutil('Nom de flotte vide.')
  const { data, error } = await ctx.supabase.from('categories')
    .select('id, nom, site_id, parent:parent_id!inner(nom)')
    .eq('scope', 'parc').not('parent_id', 'is', null).in('site_id', sites.map((s) => s.id))
    .ilike('nom', `%${texte}%`).order('nom').limit(100)
  if (error) throw error
  let lignes = (data as unknown as FlotteLigne[]).filter((f) => sites.some((s) => s.id === f.site_id))
  if (categorie) lignes = lignes.filter((f) => cle(f.parent?.nom ?? '').includes(cle(categorie)))
  const nomSite = (f: FlotteLigne) => sites.find((s) => s.id === f.site_id)?.nom ?? ''
  return choisir(
    'flotte',
    nom,
    lignes,
    (f) => f.nom,
    (f) => `${f.nom} (${[f.parent?.nom, sites.length > 1 ? nomSite(f) : null].filter(Boolean).join(', ')})`,
  )
}

/** Les plans de maintenance ACTIFS du site, par leurs noms. */
export async function resoudreGammes(ctx: Contexte, siteId: string, noms: string[]) {
  if (!noms.length) return []
  const { data, error } = await ctx.supabase.from('gammes').select('id, nom')
    .eq('site_id', siteId).eq('est_active', true).order('nom').limit(1000)
  if (error) throw error
  const gammes = data as { id: string; nom: string }[]
  const ids = noms.map((n) => choisir('plan de maintenance', n, gammes, (g) => g.nom).id)
  return [...new Set(ids)]
}

type CategorieLigne = { id: string; nom: string; site_id: string | null }

/** Catégorie de la Bibliothèque (équipement ou mixte) du commun ou du site ; celle du site d'abord. */
async function resoudreCategorieModele(ctx: Contexte, siteId: string, nom: string) {
  const { data, error } = await ctx.supabase.from('categories').select('id, nom, site_id')
    .in('scope', ['equipement', 'mixte']).eq('est_actif', true)
    .or(`site_id.is.null,site_id.eq.${siteId}`).order('nom').limit(500)
  if (error) throw error
  const lignes = data as CategorieLigne[]
  const exacts = lignes.filter((c) => cle(c.nom) === cle(nom))
  const duSite = exacts.filter((c) => c.site_id === siteId)
  if (exacts.length > 1 && duSite.length === 1) return duSite[0]
  return choisir('catégorie de modèles', nom, lignes, (c) => c.nom)
}

/** Catégorie de parc (racine) du site, où ranger la flotte. */
async function resoudreCategorieParc(ctx: Contexte, siteId: string, nom: string) {
  const { data, error } = await ctx.supabase.from('categories').select('id, nom, site_id')
    .eq('scope', 'parc').is('parent_id', null).eq('site_id', siteId).eq('est_actif', true)
    .order('nom').limit(500)
  if (error) throw error
  return choisir('catégorie de parc', nom, data as CategorieLigne[], (c) => c.nom)
}

// ─── Schémas ─────────────────────────────────────────────────────────────────

const valeur = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.object({ a: z.string().max(100), b: z.string().max(100) }).strict(),
  z.null(),
])

const TYPES = ['texte', 'nombre', 'date', 'oui-non', 'liste', 'double-reference'] as const

const caracteristique = z.object({
  libelle: z.string().trim().min(1, 'Libellé obligatoire').max(60),
  type: z.enum(TYPES),
  unite: z.string().trim().max(20).optional(),
  options: z.array(z.string().trim().min(1).max(200)).min(1).max(200).optional(),
  parts: z.tuple([z.string().trim().min(1).max(30), z.string().trim().max(30)]).optional(),
  requis: z.boolean().default(false),
  defaut: valeur.optional(),
}).strict().superRefine((c, ctx) => {
  if (c.type === 'liste' && !c.options?.length) {
    ctx.addIssue({ code: 'custom', message: 'Une liste doit donner ses choix (options)', path: ['options'] })
  }
  if (c.type === 'double-reference' && !c.parts) {
    ctx.addIssue({
      code: 'custom',
      message: 'Une double référence nomme ses deux parts (parts, ex. ["Zone", "Point"])',
      path: ['parts'],
    })
  }
})
type Caracteristique = z.infer<typeof caracteristique>

/** Caractéristique → champ au format du front (src/lib/champs.ts, serializeChamps). */
export function versChamp(c: Caracteristique) {
  return {
    cle: c.libelle,
    type: c.type,
    ...(c.type === 'nombre' && c.unite ? { unite: c.unite } : {}),
    ...(c.type === 'liste' ? { options: c.options } : {}),
    ...(c.type === 'double-reference' && c.parts
      ? { libelleA: c.parts[0], ...(c.parts[1] ? { libelleB: c.parts[1] } : {}) }
      : {}),
    requis: c.type === 'oui-non' ? false : c.requis,
    defaut: c.defaut ?? null,
  }
}

const PROPRIETE_VALEUR = {
  description:
    'Texte, nombre, oui/non (true/false), date « AAAA-MM-JJ », choix de la liste, ou { "a": "3", "b": "12" } pour une double référence',
}

const lieuxSelection = {
  local_ids: z.array(uuid).min(1).max(PLAFONDS.lieux).optional(),
  batiment: z.string().trim().min(1).max(120).optional(),
  niveau: z.string().trim().min(1).max(60).optional(),
  type_lieu: z.string().trim().min(1).max(120).optional(),
}

type Selection = { local_ids?: string[]; batiment?: string; niveau?: string; type_lieu?: string }

/** Sélection des lieux telle que la base l'attend (p_selection). */
export function selection(a: Selection): Record<string, unknown> {
  if (a.local_ids) return { local_ids: a.local_ids }
  return {
    batiment: a.batiment,
    ...(a.niveau ? { niveau: a.niveau } : {}),
    ...(a.type_lieu ? { type_local: a.type_lieu } : {}),
  }
}

function controlerSelection(a: Selection, ctx: z.RefinementCtx) {
  if (!a.local_ids === !a.batiment) {
    ctx.addIssue({
      code: 'custom',
      message: 'Donner soit local_ids (lieux de l’outil lieux), soit batiment (avec niveau et type_lieu facultatifs)',
      path: ['batiment'],
    })
  }
  if (a.local_ids && (a.niveau || a.type_lieu)) {
    ctx.addIssue({
      code: 'custom',
      message: 'niveau et type_lieu vont avec batiment, pas avec local_ids',
      path: ['niveau'],
    })
  }
}

// ─── Rendu ───────────────────────────────────────────────────────────────────

/** Aperçu du modèle : le gabarit lisible (libellé, type, unité, choix, défaut, obligatoire). */
export function presenterModeleCree(r: Record<string, unknown>) {
  const m = r.modele as Record<string, unknown> | undefined
  if (!m) return r
  const { specifications, ...reste } = m
  return { ...r, modele: { ...reste, gabarit: gabarit(specifications) } }
}

type Exemple = { lieu: string; libelle: string; specifications: unknown }

/** Aperçu d'un déploiement : chaque exemple avec son nom et ses caractéristiques lisibles. */
export function presenterDeploiement(r: Record<string, unknown>) {
  const exemples = (r.exemples as Exemple[] | undefined) ?? []
  return {
    ...r,
    exemples: exemples.map((e) => ({
      lieu: e.lieu,
      nom: e.libelle,
      caracteristiques: caracteristiques(e.specifications),
    })),
  }
}

const APRES_MODELE =
  'Résume à la personne le modèle et la flotte créés. Pour poser des équipements de cette flotte dans des lieux : deployer_equipements (aperçu d’abord).'
const APRES_DEPLOIEMENT =
  'Résume à la personne ce qui a été créé (nombre par bâtiment et niveau, plans de maintenance, opérations ajoutées aux OT ouverts). Si elle se ravise, propose annuler_deploiement (rang 1 = ce déploiement).'
const APRES_ANNULATION = 'Résume à la personne ce qui a été supprimé et ce qui a été gardé (avec les raisons).'

// ─── Outils ──────────────────────────────────────────────────────────────────

export const OUTILS_ECRITURE_EQUIPEMENTS: Outil[] = [
  {
    name: 'creer_modele_equipement',
    title: 'Créer un modèle d’équipement (et sa flotte)',
    description:
      'Crée un modèle d’équipement DU SITE dans la Bibliothèque (jamais dans le commun) : nom, catégorie de la Bibliothèque, description, caractéristiques à renseigner sur chaque équipement (gabarit). ' +
      'Par défaut crée aussi sa FLOTTE (sous-catégorie de parc liée au modèle) sous une catégorie de parc du site, prête à être déployée (deployer_equipements). ' +
      'Avant : lire la Bibliothèque (outil bibliotheque) — si le commun a déjà ce modèle, proposer de l’installer depuis l’application plutôt que d’en créer un — et les flottes (outil flottes). Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['nom', 'categorie'],
      properties: {
        site: { type: 'string', description: 'Nom du site (obligatoire si la personne en a plusieurs)' },
        nom: { type: 'string', description: 'Nom du modèle, et de sa flotte (ex. « Détecteur optique DO-200 »)' },
        categorie: {
          type: 'string',
          description: 'Catégorie de la Bibliothèque (outil bibliotheque, champ categorie), ex. « Sécurité incendie »',
        },
        description: { type: 'string', description: 'Facultative, 2000 caractères au plus' },
        caracteristiques: {
          type: 'array',
          maxItems: PLAFONDS.caracteristiques,
          description:
            'Gabarit : ce qu’on renseigne sur chaque équipement. Mêmes noms que le gabarit lu par bibliotheque.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['libelle', 'type'],
            properties: {
              libelle: {
                type: 'string',
                description: 'Nom de la caractéristique (60 caractères au plus), ex. « Numéro »',
              },
              type: { type: 'string', enum: [...TYPES] },
              unite: { type: 'string', description: 'Pour un nombre (ex. « kW »)' },
              options: { type: 'array', items: { type: 'string' }, description: 'Choix d’une liste (obligatoires)' },
              parts: {
                type: 'array',
                items: { type: 'string' },
                minItems: 2,
                maxItems: 2,
                description: 'Double référence : libellés des deux parts, ex. ["Zone", "Point"] (le 2e peut être vide)',
              },
              requis: { type: 'boolean', default: false, description: 'Obligatoire à la saisie' },
              defaut: PROPRIETE_VALEUR,
            },
          },
        },
        creer_flotte: {
          type: 'boolean',
          default: true,
          description: 'Créer aussi la flotte liée au modèle (nécessaire pour la déployer)',
        },
        categorie_parc: {
          type: 'string',
          description:
            'Catégorie de parc où ranger la flotte (outil flottes, champ categorie) — obligatoire avec la flotte',
        },
        valeur_principale: {
          type: 'string',
          description:
            'Libellé de la caractéristique qui nomme chaque équipement (« Détecteur » + valeur) ; de type texte, elle prend au déploiement le nom du lieu (« Détecteur Chambre 214 »)',
        },
        ...PROPRIETES_CONFIRMATION,
      },
    },
    annotations: ECRITURE,
    schema: z.object({
      site,
      nom: z.string().trim().min(1).max(PLAFONDS.nom),
      categorie: z.string().trim().min(1).max(120),
      description: z.string().trim().max(PLAFONDS.description).optional(),
      caracteristiques: z.array(caracteristique).max(PLAFONDS.caracteristiques).default([])
        .refine((cs) => new Set(cs.map((c) => cle(c.libelle))).size === cs.length, 'Libellés en double'),
      creer_flotte: z.boolean().default(true),
      categorie_parc: z.string().trim().min(1).max(120).optional(),
      valeur_principale: z.string().trim().min(1).max(60).optional(),
      appliquer,
      code,
    }).strict(),
    run: async (
      a: {
        site?: string
        nom: string
        categorie: string
        description?: string
        caracteristiques: Caracteristique[]
        creer_flotte: boolean
        categorie_parc?: string
        valeur_principale?: string
        appliquer: boolean
        code?: string
      },
      ctx: Contexte,
    ) => {
      await exigerGestesParc(ctx)
      const s = await siteUnique(ctx, a.site)
      const cat = await resoudreCategorieModele(ctx, s.id, a.categorie)
      if (a.creer_flotte && !a.categorie_parc) {
        throw new ErreurOutil(
          'Pour créer la flotte, il faut la catégorie de parc où la ranger (outil flottes, champ categorie) — ou creer_flotte=false.',
        )
      }
      const parc = a.creer_flotte && a.categorie_parc ? await resoudreCategorieParc(ctx, s.id, a.categorie_parc) : null
      const r = await geste(
        ctx,
        'claude_creer_modele_equipement',
        {
          p_site_id: s.id,
          p_nom: a.nom,
          p_categorie_id: cat.id,
          p_description: a.description ?? null,
          p_champs: a.caracteristiques.map(versChamp),
          p_creer_flotte: a.creer_flotte,
          p_flotte_parent_id: parc?.id ?? null,
          p_valeur_principale: a.valeur_principale ?? null,
          p_appliquer: a.appliquer,
          p_code: a.code ?? null,
        },
        a.appliquer,
        APRES_MODELE,
      )
      return presenterModeleCree(r)
    },
  },
  {
    name: 'deployer_equipements',
    title: 'Déployer une flotte d’équipements dans des lieux',
    description:
      'Pose UN équipement d’une flotte dans chaque lieu choisi, en une fois (ex. « un détecteur dans chaque chambre du R+2 »), rattaché aux plans de maintenance choisis (leurs OT ouverts sont mis à jour). UN site par appel (celui de la flotte), 500 lieux au plus. ' +
      'Les lieux : soit un bâtiment (avec niveau et type de lieu facultatifs), par leurs noms — Dédale les résout et refuse un nom ambigu —, soit les local_ids de l’outil lieux. ' +
      'Un lieu qui a déjà un équipement de la flotte est un doublon, ignoré par défaut. La valeur principale de type texte prend le nom du lieu. ' +
      'Avant : outils flottes (flotte, gabarit), lieux (arbre), plan_maintenance. Aperçu TOUJOURS montré avant, puis enregistrement après un oui explicite. Se défait avec annuler_deploiement.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['flotte'],
      properties: {
        flotte: { type: 'string', description: 'Nom de la flotte (outil flottes, champ flotte)' },
        categorie: { type: 'string', description: 'Catégorie de la flotte, pour lever une ambiguïté de nom' },
        site: { type: 'string', description: 'Nom du site, pour lever une ambiguïté de nom' },
        batiment: { type: 'string', description: 'Nom du bâtiment (outil lieux, arbre)' },
        niveau: {
          type: 'string',
          description: 'Nom du niveau dans ce bâtiment (ex. « R+2 ») ; absent = tout le bâtiment',
        },
        type_lieu: { type: 'string', description: 'Type de lieu (ex. « Chambre ») ; absent = tous les lieux' },
        local_ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: PLAFONDS.lieux,
          description: 'À la place de batiment : les lieux exacts (local_id de l’outil lieux)',
        },
        valeurs: {
          type: 'object',
          additionalProperties: PROPRIETE_VALEUR,
          description:
            'Caractéristiques communes à tous les équipements posés, { libellé du gabarit: valeur } (sinon les valeurs par défaut)',
        },
        plans_maintenance: {
          type: 'array',
          items: { type: 'string' },
          maxItems: PLAFONDS.plans,
          description: 'Noms des plans de maintenance du site à rattacher (outil plan_maintenance)',
        },
        ignorer_doublons: {
          type: 'boolean',
          default: true,
          description: 'true (défaut) = ne rien poser dans un lieu qui a déjà un équipement de la flotte',
        },
        ...PROPRIETES_CONFIRMATION,
      },
    },
    annotations: ECRITURE_SENSIBLE,
    schema: z.object({
      flotte: z.string().trim().min(1).max(120),
      categorie: z.string().trim().min(1).max(120).optional(),
      site,
      ...lieuxSelection,
      valeurs: z.record(valeur).refine(
        (v) => Object.keys(v).length <= PLAFONDS.valeurs,
        `${PLAFONDS.valeurs} caractéristiques au plus`,
      ).optional(),
      plans_maintenance: z.array(z.string().trim().min(1).max(200)).max(PLAFONDS.plans).default([]),
      ignorer_doublons: z.boolean().default(true),
      appliquer,
      code,
    }).strict().superRefine(controlerSelection),
    run: async (
      a: Selection & {
        flotte: string
        categorie?: string
        site?: string
        valeurs?: Record<string, unknown>
        plans_maintenance: string[]
        ignorer_doublons: boolean
        appliquer: boolean
        code?: string
      },
      ctx: Contexte,
    ) => {
      await exigerGestesParc(ctx)
      const sites = await sitesCibles(ctx, a.site)
      const f = await resoudreFlotte(ctx, sites, a.flotte, a.categorie)
      const gammes = await resoudreGammes(ctx, f.site_id, a.plans_maintenance)
      const r = await geste(
        ctx,
        'claude_deployer_equipements',
        {
          p_categorie_id: f.id,
          p_selection: selection(a),
          p_valeurs: a.valeurs ?? null,
          p_gamme_ids: gammes,
          p_ignorer_doublons: a.ignorer_doublons,
          p_appliquer: a.appliquer,
          p_code: a.code ?? null,
        },
        a.appliquer,
        APRES_DEPLOIEMENT,
      )
      return presenterDeploiement(r)
    },
  },
  {
    name: 'annuler_deploiement',
    title: 'Annuler un déploiement d’équipements',
    description:
      'Défait un déploiement en masse récent d’une flotte : supprime les équipements qu’il a posés et qui n’ont encore aucun historique (opérations saisies, documents, DI, travaux, événements, observations) ; ceux qui en ont un sont gardés et listés. ' +
      'rang 1 = le déploiement le plus récent de la flotte (outil flottes, deploiements_recents, dans l’ordre). C’est la SEULE suppression d’équipements ouverte à Claude. Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['flotte'],
      properties: {
        flotte: { type: 'string', description: 'Nom de la flotte (outil flottes)' },
        categorie: { type: 'string', description: 'Catégorie de la flotte, pour lever une ambiguïté de nom' },
        site: { type: 'string', description: 'Nom du site, pour lever une ambiguïté de nom' },
        rang: {
          type: 'integer',
          minimum: 1,
          maximum: PLAFONDS.rang,
          default: 1,
          description: '1 = le plus récent, 2 = le précédent…',
        },
        ...PROPRIETES_CONFIRMATION,
      },
    },
    annotations: ECRITURE_SENSIBLE,
    schema: z.object({
      flotte: z.string().trim().min(1).max(120),
      categorie: z.string().trim().min(1).max(120).optional(),
      site,
      rang: z.number().int().min(1).max(PLAFONDS.rang).default(1),
      appliquer,
      code,
    }).strict(),
    run: async (
      a: { flotte: string; categorie?: string; site?: string; rang: number; appliquer: boolean; code?: string },
      ctx: Contexte,
    ) => {
      await exigerGestesParc(ctx)
      const sites = await sitesCibles(ctx, a.site)
      const f = await resoudreFlotte(ctx, sites, a.flotte, a.categorie)
      return geste(
        ctx,
        'claude_annuler_deploiement',
        { p_flotte_id: f.id, p_lot_rang: a.rang, p_appliquer: a.appliquer, p_code: a.code ?? null },
        a.appliquer,
        APRES_ANNULATION,
      )
    },
  },
]
