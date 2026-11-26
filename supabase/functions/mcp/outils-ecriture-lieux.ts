// Outils d'ÉCRITURE du connecteur Claude — lieux (plan
// connecteur-parc-lieux-bibliotheque, étape 5 ; migration 189).
//
// Même modèle que les autres gestes : une fonction SQL claude_* par outil
// (SECURITY INVOKER : RLS de la personne), aperçu joué puis annulé, code de
// confirmation, enregistrement après un oui explicite. Les lieux se créent par
// leurs NOMS (bâtiment, niveau, lieu, type) : la base réutilise le bâtiment et
// le niveau existants (casse et espaces ignorés), les crée sinon, et ignore un
// lieu déjà présent. Types de lieux EXISTANTS seulement (les créer est réservé
// à l'administrateur, dans l'application). Aucune suppression de lieu.
// Plafonds identiques en Zod et en SQL (189, localSchema).

import { z } from 'npm:zod@3.23.8'
import { appliquer, code, type Contexte, ECRITURE, geste, type Outil, PROPRIETES_CONFIRMATION, site } from './commun.ts'
import { caracteristiques } from './caracteristiques.ts'
import {
  controlerSelection,
  exigerGestesParc,
  lieuxSelection,
  PLAFONDS,
  PROPRIETE_VALEUR,
  type Selection,
  selection,
  siteUnique,
  valeur,
} from './outils-ecriture-equipements.ts'

/** Plafonds — miroir exact de 189 (claude_creer_lieux, claude_modifier_lieux, valeur_numerique_bornee). */
export const PLAFONDS_LIEUX = {
  lieux: 500,
  nom: 200,
  description: 2000,
  surface: 999999.99,
  hauteur: 99.99,
  effectif: 32767,
  ordre: 32767,
  valeurs: 40,
} as const

const nomLieu = z.string().trim().min(1).max(PLAFONDS_LIEUX.nom)
const valeurs = z.record(valeur).refine(
  (v) => Object.keys(v).length <= PLAFONDS_LIEUX.valeurs,
  `${PLAFONDS_LIEUX.valeurs} caractéristiques au plus`,
)
const surface = z.number().positive().max(PLAFONDS_LIEUX.surface)
const hauteur = z.number().positive().max(PLAFONDS_LIEUX.hauteur)
const effectif = z.number().int().min(0).max(PLAFONDS_LIEUX.effectif)

const lieuACreer = z.object({
  batiment: nomLieu,
  niveau: nomLieu,
  ordre_niveau: z.number().int().min(-PLAFONDS_LIEUX.ordre - 1).max(PLAFONDS_LIEUX.ordre).optional(),
  nom: nomLieu,
  type: z.string().trim().min(1).max(120).optional(),
  surface: surface.optional(),
  hauteur: hauteur.optional(),
  effectif: effectif.optional(),
  pmr: z.boolean().optional(),
  chauffe: z.boolean().optional(),
  description: z.string().trim().max(PLAFONDS_LIEUX.description).optional(),
  valeurs: valeurs.optional(),
}).strict().refine((l) => !l.valeurs || l.type, {
  message: 'Les caractéristiques viennent du gabarit du type de lieu : donner aussi type',
  path: ['valeurs'],
})

const PROPRIETES_LIEU = {
  type: { type: 'string', description: 'Type de lieu EXISTANT (outil lieux, champ type), ex. « Chambre standard »' },
  surface: { type: 'number', description: 'Surface en m² (> 0)' },
  hauteur: { type: 'number', description: 'Hauteur sous plafond en m (> 0, 99,99 au plus)' },
  effectif: { type: 'integer', minimum: 0, description: 'Capacité (nombre de personnes)' },
  pmr: { type: 'boolean', description: 'Accessible PMR' },
  chauffe: { type: 'boolean', description: 'Chauffé ou climatisé' },
  description: { type: 'string', description: '2000 caractères au plus' },
  valeurs: {
    type: 'object',
    additionalProperties: PROPRIETE_VALEUR,
    description: 'Caractéristiques du gabarit du type de lieu, { libellé: valeur }',
  },
}

// ─── Rendu ───────────────────────────────────────────────────────────────────

const lisible = (champs: unknown) => (Array.isArray(champs) ? caracteristiques({ champs }) : champs)

/** Aperçu de création : caractéristiques des exemples lisibles. */
export function presenterCreationLieux(r: Record<string, unknown>) {
  const exemples = (r.exemples as Record<string, unknown>[] | undefined) ?? []
  return { ...r, exemples: exemples.map((e) => ({ ...e, caracteristiques: lisible(e.caracteristiques) })) }
}

/** Aperçu de modification : avant / après lisibles. */
export function presenterModificationLieux(r: Record<string, unknown>) {
  const exemples = (r.exemples as Record<string, Record<string, unknown> | undefined>[] | undefined) ?? []
  const etat = (x: Record<string, unknown> | undefined) => x && { ...x, caracteristiques: lisible(x.caracteristiques) }
  return {
    ...r,
    exemples: exemples.map((e) => ({ ...e, avant: etat(e.avant), apres: etat(e.apres) })),
  }
}

const APRES_CREATION =
  'Résume à la personne ce qui a été créé (bâtiments, niveaux, lieux) et ce qui existait déjà. Pour y poser des équipements : deployer_equipements.'
const APRES_MODIFICATION = 'Résume à la personne les lieux modifiés et les valeurs perdues éventuelles.'

// ─── Outils ──────────────────────────────────────────────────────────────────

const creerLieux: Outil = {
  name: 'creer_lieux',
  title: 'Créer des lieux (et leurs bâtiments, niveaux)',
  description:
    'Crée en une fois 1 à 500 lieux d’UN site, décrits par leurs NOMS : bâtiment, niveau, nom du lieu, et facultativement type de lieu (existant), surface, hauteur, effectif, PMR, chauffé, description, caractéristiques du type. ' +
    'Bâtiment et niveau existants sont réutilisés (même nom), créés sinon ; un lieu déjà présent est ignoré et compté. Tout ou rien. ' +
    'Avant : lieux (arbre du site, types de lieu existants) ; une série (« chambres 301 à 330 ») se donne lieu par lieu. Jamais de nouveau type de lieu (réservé à l’administrateur, dans l’application). Aperçu d’abord, puis enregistrement après accord.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['lieux'],
    properties: {
      site: { type: 'string', description: 'Nom du site (obligatoire si la personne en a plusieurs)' },
      lieux: {
        type: 'array',
        minItems: 1,
        maxItems: PLAFONDS_LIEUX.lieux,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['batiment', 'niveau', 'nom'],
          properties: {
            batiment: { type: 'string', description: 'Nom du bâtiment (existant ou à créer)' },
            niveau: { type: 'string', description: 'Nom du niveau dans ce bâtiment (ex. « R+3 »)' },
            ordre_niveau: {
              type: 'integer',
              description: 'Ordre du niveau s’il est créé (0 = RDC, 1 = R+1, -1 = sous-sol) ; ignoré s’il existe',
            },
            nom: { type: 'string', description: 'Nom du lieu (ex. « Chambre 301 »)' },
            ...PROPRIETES_LIEU,
          },
        },
      },
      ...PROPRIETES_CONFIRMATION,
    },
  },
  annotations: ECRITURE,
  schema: z.object({
    site,
    lieux: z.array(lieuACreer).min(1).max(PLAFONDS_LIEUX.lieux),
    appliquer,
    code,
  }).strict(),
  run: async (
    a: { site?: string; lieux: z.infer<typeof lieuACreer>[]; appliquer: boolean; code?: string },
    ctx: Contexte,
  ) => {
    await exigerGestesParc(ctx)
    const s = await siteUnique(ctx, a.site)
    const r = await geste(
      ctx,
      'claude_creer_lieux',
      { p_site_id: s.id, p_lieux: a.lieux, p_appliquer: a.appliquer, p_code: a.code ?? null },
      a.appliquer,
      APRES_CREATION,
    )
    return presenterCreationLieux(r)
  },
}

const MODIFIABLES = [
  'nom',
  'type',
  'surface',
  'hauteur',
  'effectif',
  'pmr',
  'chauffe',
  'description',
  'valeurs',
] as const

const modifierLieux: Outil = {
  name: 'modifier_lieux',
  title: 'Modifier des lieux',
  description:
    'Corrige en une fois des lieux d’UN site, choisis par bâtiment (+ niveau, + type de lieu) ou par leurs local_ids (outil lieux), 500 au plus : type de lieu existant (null = retiré ; son gabarit remplace l’ancien en gardant les valeurs de même nom), surface, hauteur, effectif (null = effacé), PMR, chauffé, description (null = effacée), caractéristiques, et nom (un seul lieu à la fois). ' +
    'Paramètre absent = inchangé. Jamais de suppression ni de déplacement de lieu. Aperçu d’abord (exemples avant / après, valeurs perdues), puis enregistrement après accord.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      site: { type: 'string', description: 'Nom du site (obligatoire si la personne en a plusieurs)' },
      batiment: { type: 'string', description: 'Nom du bâtiment (outil lieux, arbre)' },
      niveau: { type: 'string', description: 'Nom du niveau dans ce bâtiment ; absent = tout le bâtiment' },
      type_lieu: { type: 'string', description: 'Type de lieu actuel à viser ; absent = tous les lieux' },
      local_ids: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: PLAFONDS.lieux,
        description: 'À la place de batiment : les lieux exacts (local_id de l’outil lieux)',
      },
      nom: { type: 'string', description: 'Nouveau nom (un seul lieu choisi)' },
      ...PROPRIETES_LIEU,
      type: { type: ['string', 'null'], description: 'Nouveau type de lieu EXISTANT ; null = le retirer' },
      surface: { type: ['number', 'null'], description: 'Surface en m² ; null = effacer' },
      hauteur: { type: ['number', 'null'], description: 'Hauteur en m ; null = effacer' },
      effectif: { type: ['integer', 'null'], minimum: 0, description: 'Capacité ; null = effacer' },
      description: { type: ['string', 'null'], description: 'Nouvelle description ; null = l’effacer' },
      ...PROPRIETES_CONFIRMATION,
    },
  },
  annotations: ECRITURE,
  schema: z.object({
    site,
    ...lieuxSelection,
    nom: nomLieu.optional(),
    type: z.string().trim().min(1).max(120).nullable().optional(),
    surface: surface.nullable().optional(),
    hauteur: hauteur.nullable().optional(),
    effectif: effectif.nullable().optional(),
    pmr: z.boolean().optional(),
    chauffe: z.boolean().optional(),
    description: z.string().trim().max(PLAFONDS_LIEUX.description).nullable().optional(),
    valeurs: valeurs.optional(),
    appliquer,
    code,
  }).strict().superRefine((a, ctx) => {
    controlerSelection(a, ctx)
    if (!MODIFIABLES.some((k) => a[k] !== undefined)) {
      ctx.addIssue({ code: 'custom', message: `Rien à modifier : donner ${MODIFIABLES.join(', ')}`, path: ['nom'] })
    }
    if (a.nom !== undefined && (a.batiment || (a.local_ids?.length ?? 0) > 1)) {
      ctx.addIssue({ code: 'custom', message: 'Renommer : un seul lieu à la fois (un seul local_id)', path: ['nom'] })
    }
  }),
  run: async (
    a: Selection & Partial<Record<(typeof MODIFIABLES)[number], unknown>> & {
      site?: string
      appliquer: boolean
      code?: string
    },
    ctx: Contexte,
  ) => {
    await exigerGestesParc(ctx)
    const s = await siteUnique(ctx, a.site)
    const modifs = Object.fromEntries(MODIFIABLES.filter((k) => a[k] !== undefined).map((k) => [k, a[k]]))
    const r = await geste(
      ctx,
      'claude_modifier_lieux',
      {
        p_site_id: s.id,
        p_selection: selection(a),
        p_modifs: modifs,
        p_appliquer: a.appliquer,
        p_code: a.code ?? null,
      },
      a.appliquer,
      APRES_MODIFICATION,
    )
    return presenterModificationLieux(r)
  },
}

export const OUTILS_ECRITURE_LIEUX: Outil[] = [creerLieux, modifierLieux]
