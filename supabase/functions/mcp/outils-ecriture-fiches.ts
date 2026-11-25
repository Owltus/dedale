// Outils d'ÉCRITURE du connecteur Claude — travaux et événements (étape 6c).
//
// Les deux fiches ont la même forme (une fiche, des tâches facultatives, une
// clôture, un cadenas) : mêmes outils, avec `fiche` = travaux | evenement.
// Chaque outil appelle une fonction SQL claude_*_fiche / claude_*_taches (161),
// qui vérifie le droit, la RLS, le cadenas, les lieux et le code de
// confirmation. Aperçu d'abord ; enregistrement avec les mêmes paramètres,
// appliquer=true et le code, après un oui explicite de la personne.

import { z } from 'npm:zod@3.23.8'
import { type Contexte, type Outil, ErreurOutil, date, uuid, appliquer, code, PROPRIETES_CONFIRMATION, ECRITURE, ECRITURE_SENSIBLE, geste } from './commun.ts'

const APRES_FICHE = 'Résume à la personne la fiche telle qu’enregistrée (statut, cadenas, tâches, alertes).'

/** Site désigné par son nom (ou son identifiant), parmi ceux de la personne ; un seul. */
async function siteParNom(ctx: Contexte, nom: string): Promise<string> {
  const { data, error } = await ctx.supabase.rpc('get_my_sites').select('id, nom')
  if (error) throw error
  const sites = (data ?? []) as { id: string; nom: string }[]
  const n = nom.toLowerCase()
  const trouves = sites.filter((s) => s.id === nom || s.nom.toLowerCase() === n)
  const proches = trouves.length ? trouves : sites.filter((s) => s.nom.toLowerCase().includes(n))
  if (proches.length !== 1)
    throw new ErreurOutil(`Précise le site parmi : ${sites.map((s) => s.nom).join(', ') || 'aucun'}.`)
  return proches[0].id
}

const fiche = z.enum(['travaux', 'evenement'])
const PROPRIETE_FICHE = {
  type: 'string',
  enum: ['travaux', 'evenement'],
  description:
    'travaux = un chantier ou une amélioration à mener (réfection, remplacement, installation) ; evenement = un fait survenu qu’on garde en mémoire ou qu’on suit (dégât des eaux, sinistre, coupure, intervention d’urgence déjà faite). Un problème à faire réparer est d’abord une demande d’intervention (creer_demande). En cas de doute, demande.',
}
const PROPRIETE_ID = { type: 'string', description: 'Identifiant de la fiche (outil travaux ou evenements)' }

const tacheNouvelle = z.object({ libelle: z.string().trim().min(1).max(200), local_id: uuid.optional(), equipement_id: uuid.optional() }).strict()
const PROPRIETE_TACHES = {
  type: 'array',
  maxItems: 100,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['libelle'],
    properties: {
      libelle: { type: 'string', description: 'Ce qu’il y a à faire, ou l’endroit (ex. « Chambre 214 ») ; 1 à 200 caractères' },
      local_id: { type: 'string', description: 'Local de la tâche (outil lieux), facultatif' },
      equipement_id: { type: 'string', description: 'Équipement de ce local, facultatif ; jamais sans son local' },
    },
  },
}

export const OUTILS_ECRITURE_FICHES: Outil[] = [
  {
    name: 'creer_fiche',
    title: 'Consigner un travaux ou un événement',
    description:
      'Crée un travaux ou un événement « Ouvert », éventuellement avec un lieu principal (local, et équipement de ce local) et des tâches (une par endroit ou par étape). ' +
      'Avant : vérifier les fiches non terminées sur ce lieu (l’aperçu les signale en « doublons »). Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['fiche', 'titre'],
      properties: {
        fiche: PROPRIETE_FICHE,
        titre: { type: 'string', description: 'Court et parlant, où + quoi (ex. « Ch. 413 – Traces d’humidité au plafond ») ; 3 à 200 caractères' },
        description: { type: 'string', description: 'Faits rapportés par la personne : quoi, où, depuis quand, conséquence. Rien d’inventé. Max 2000 (travaux) ou 5000 (événement)' },
        date: { type: 'string', description: 'Date de déclaration (travaux) ou du constat (événement), AAAA-MM-JJ ; défaut aujourd’hui ; jamais future' },
        local_id: { type: 'string', description: 'Lieu principal (outil lieux), facultatif' },
        equipement_id: { type: 'string', description: 'Équipement principal, dans ce local' },
        taches: PROPRIETE_TACHES,
        site: { type: 'string', description: 'Nom du site (outil mes_sites), seulement si la fiche n’a pas de lieu et que la personne a plusieurs sites' },
        ...PROPRIETES_CONFIRMATION,
      },
    },
    annotations: ECRITURE,
    schema: z.object({
      fiche, titre: z.string().trim().min(3).max(200), description: z.string().max(5000).optional(), date: date.optional(),
      local_id: uuid.optional(), equipement_id: uuid.optional(), taches: z.array(tacheNouvelle).max(100).default([]),
      site: z.string().min(1).max(120).optional(), appliquer, code,
    }).strict(),
    run: async (a: { fiche: string; titre: string; description?: string; date?: string; local_id?: string; equipement_id?: string; taches: unknown[]; site?: string; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_creer_fiche', {
        p_type: a.fiche, p_titre: a.titre, p_description: a.description ?? null, p_date: a.date ?? null,
        p_local_id: a.local_id ?? null, p_equipement_id: a.equipement_id ?? null, p_taches: a.taches,
        p_site_id: a.site ? await siteParNom(ctx, a.site) : null, p_appliquer: a.appliquer, p_code: a.code ?? null,
      }, a.appliquer, APRES_FICHE),
  },
  {
    name: 'modifier_fiche',
    title: 'Corriger un travaux ou un événement',
    description:
      'Corrige le titre, la description ou le lieu principal d’une fiche non verrouillée. Si le local change, donner aussi l’équipement de ce local, ou sans_equipement=true. Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['fiche', 'fiche_id'],
      properties: {
        fiche: PROPRIETE_FICHE,
        fiche_id: PROPRIETE_ID,
        titre: { type: 'string', description: 'Nouveau titre (3 à 200 caractères)' },
        description: { type: 'string', description: 'Nouvelle description COMPLÈTE (remplace l’ancienne ; vide pour l’effacer)' },
        local_id: { type: 'string', description: 'Nouveau lieu principal (outil lieux)' },
        equipement_id: { type: 'string', description: 'Équipement principal, dans le local de la fiche' },
        sans_equipement: { type: 'boolean', description: 'true pour retirer l’équipement principal' },
        ...PROPRIETES_CONFIRMATION,
      },
    },
    annotations: ECRITURE_SENSIBLE,
    schema: z.object({
      fiche, fiche_id: uuid, titre: z.string().trim().min(3).max(200).optional(), description: z.string().max(5000).optional(),
      local_id: uuid.optional(), equipement_id: uuid.optional(), sans_equipement: z.boolean().optional(), appliquer, code,
    }).strict(),
    run: (a: { fiche: string; fiche_id: string; titre?: string; description?: string; local_id?: string; equipement_id?: string; sans_equipement?: boolean; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_modifier_fiche', {
        p_type: a.fiche, p_id: a.fiche_id, p_titre: a.titre ?? null, p_description: a.description ?? null,
        p_local_id: a.local_id ?? null, p_equipement_id: a.equipement_id ?? null, p_sans_equipement: a.sans_equipement ?? null,
        p_appliquer: a.appliquer, p_code: a.code ?? null,
      }, a.appliquer, APRES_FICHE),
  },
  {
    name: 'ajouter_taches',
    title: 'Ajouter des tâches à une fiche',
    description:
      'Ajoute des tâches « En attente » à un travaux ou un événement non verrouillé et non terminé (100 tâches au plus par fiche). Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['fiche', 'fiche_id', 'taches'],
      properties: { fiche: PROPRIETE_FICHE, fiche_id: PROPRIETE_ID, taches: { ...PROPRIETE_TACHES, minItems: 1 }, ...PROPRIETES_CONFIRMATION },
    },
    annotations: ECRITURE,
    schema: z.object({ fiche, fiche_id: uuid, taches: z.array(tacheNouvelle).min(1).max(100), appliquer, code }).strict(),
    run: (a: { fiche: string; fiche_id: string; taches: unknown[]; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_ajouter_taches', { p_type: a.fiche, p_id: a.fiche_id, p_taches: a.taches, p_appliquer: a.appliquer, p_code: a.code ?? null }, a.appliquer, APRES_FICHE),
  },
  {
    name: 'avancer_taches',
    title: 'Faire avancer les tâches d’une fiche',
    description:
      'Enregistre l’avancement de tâches d’un travaux ou d’un événement : statut, date, commentaire, libellé. Le statut de la fiche en découle (En cours dès qu’une tâche bouge ; quand toutes sont terminées, la fiche passe terminée/clôturée et se verrouille : « clôture à confirmer », à confirmer ensuite avec cloturer_fiche). ' +
      'Demande le jour où chaque tâche a été faite et passe-le dans date ; sans date, une tâche terminée prend la date du jour (l’aperçu le montre : fais-le valider). Un commentaire s’ajoute à la suite du précédent. Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['fiche', 'fiche_id', 'saisies'],
      properties: {
        fiche: PROPRIETE_FICHE,
        fiche_id: PROPRIETE_ID,
        saisies: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['tache_id'],
            properties: {
              tache_id: { type: 'string', description: 'Identifiant de la tâche (outil travaux ou evenements)' },
              statut: { type: 'string', enum: ['en_attente', 'en_cours', 'realise', 'non_realise', 'non_applicable'], description: 'realise = fait ; non_realise = prévu mais pas fait ; non_applicable = ne s’applique pas ; en_attente = pas commencé' },
              date: { type: 'string', description: 'Jour où la tâche a été faite, AAAA-MM-JJ, jamais future' },
              commentaire: { type: 'string', description: 'Dit par la personne, max 2000 ; s’ajoute à la suite du commentaire existant (vide = l’effacer)' },
              libelle: { type: 'string', description: 'Nouveau libellé (1 à 200)' },
            },
          },
        },
        ...PROPRIETES_CONFIRMATION,
      },
    },
    annotations: ECRITURE_SENSIBLE,
    schema: z.object({
      fiche, fiche_id: uuid,
      saisies: z.array(z.object({
        tache_id: uuid, statut: z.enum(['en_attente', 'en_cours', 'realise', 'non_realise', 'non_applicable']).optional(),
        date: date.optional(), commentaire: z.string().max(2000).optional(), libelle: z.string().trim().min(1).max(200).optional(),
      }).strict()).min(1).max(100),
      appliquer, code,
    }).strict(),
    run: (a: { fiche: string; fiche_id: string; saisies: unknown[]; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_avancer_taches', { p_type: a.fiche, p_id: a.fiche_id, p_saisies: a.saisies, p_appliquer: a.appliquer, p_code: a.code ?? null }, a.appliquer, APRES_FICHE),
  },
  {
    name: 'prendre_en_charge_fiche',
    title: 'Prendre en charge une fiche sans tâches',
    description: 'Passe un travaux ou un événement SANS tâches de « Ouvert » à « En cours ». Avec des tâches, le statut suit les tâches (avancer_taches). Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['fiche', 'fiche_id'], properties: { fiche: PROPRIETE_FICHE, fiche_id: PROPRIETE_ID, ...PROPRIETES_CONFIRMATION } },
    annotations: ECRITURE,
    schema: z.object({ fiche, fiche_id: uuid, appliquer, code }).strict(),
    run: (a: { fiche: string; fiche_id: string; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_prendre_en_charge_fiche', { p_type: a.fiche, p_id: a.fiche_id, p_appliquer: a.appliquer, p_code: a.code ?? null }, a.appliquer, APRES_FICHE),
  },
  {
    name: 'cloturer_fiche',
    title: 'Clôturer un travaux ou un événement',
    description:
      'Clôture une fiche SANS tâches, ou confirme une « clôture à confirmer » (toutes les tâches terminées). Demander ce qui a été fait (compte-rendu, facultatif, jamais inventé) et le jour de fin. La fiche se verrouille. ' +
      'Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['fiche', 'fiche_id'],
      properties: {
        fiche: PROPRIETE_FICHE,
        fiche_id: PROPRIETE_ID,
        compte_rendu: { type: 'string', description: 'Ce qui a été fait, dit par la personne ; 5 à 5000 caractères ; facultatif' },
        date: { type: 'string', description: 'Jour de fin AAAA-MM-JJ (défaut aujourd’hui ; jamais futur ni avant la date de la fiche)' },
        ...PROPRIETES_CONFIRMATION,
      },
    },
    annotations: ECRITURE_SENSIBLE,
    schema: z.object({ fiche, fiche_id: uuid, compte_rendu: z.string().trim().min(5).max(5000).optional(), date: date.optional(), appliquer, code }).strict(),
    run: (a: { fiche: string; fiche_id: string; compte_rendu?: string; date?: string; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_cloturer_fiche', {
        p_type: a.fiche, p_id: a.fiche_id, p_compte_rendu: a.compte_rendu ?? null, p_date: a.date ?? null,
        p_appliquer: a.appliquer, p_code: a.code ?? null,
      }, a.appliquer, APRES_FICHE),
  },
  {
    name: 'rouvrir_fiche',
    title: 'Rouvrir un travaux ou un événement',
    description:
      'Rouvre une fiche terminée/clôturée NON verrouillée (verrouillée : quelqu’un doit d’abord retirer le cadenas dans l’application). Motif obligatoire, ajouté daté à la fin de la description avec le compte-rendu effacé. ' +
      'Si la fiche a des tâches, dire lesquelles reprendre (elles repassent « En attente »). Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['fiche', 'fiche_id', 'motif'],
      properties: {
        fiche: PROPRIETE_FICHE,
        fiche_id: PROPRIETE_ID,
        motif: { type: 'string', description: 'Ce qui ne va pas, factuellement, et quand (10 à 1000 caractères)' },
        taches_a_reprendre: { type: 'array', items: { type: 'string' }, maxItems: 100, description: 'Tâches à refaire (obligatoire si la fiche a des tâches)' },
        ...PROPRIETES_CONFIRMATION,
      },
    },
    annotations: ECRITURE_SENSIBLE,
    schema: z.object({ fiche, fiche_id: uuid, motif: z.string().trim().min(10).max(1000), taches_a_reprendre: z.array(uuid).max(100).optional(), appliquer, code }).strict(),
    run: (a: { fiche: string; fiche_id: string; motif: string; taches_a_reprendre?: string[]; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_rouvrir_fiche', {
        p_type: a.fiche, p_id: a.fiche_id, p_motif: a.motif, p_taches_a_reprendre: a.taches_a_reprendre ?? null,
        p_appliquer: a.appliquer, p_code: a.code ?? null,
      }, a.appliquer, APRES_FICHE),
  },
]
