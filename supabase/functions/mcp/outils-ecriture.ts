// Outils d'ÉCRITURE du connecteur Claude — ordres de travail (étape 6a).
//
// Chaque outil n'est qu'un passe-plat vers une fonction SQL claude_* (158) :
//   - la base vérifie le droit (connecteur + accès Claude + acces_ia_ecriture),
//     la RLS, les règles métier (triggers) et le code de confirmation ;
//   - la garde d'entrée (157) interdit au connecteur toute autre écriture ;
//   - ici : paramètres validés par Zod (champ inconnu = refus) et mise en forme.
//
// Déroulé imposé : appel SANS `appliquer` → aperçu + code ; la personne dit
// oui ; nouvel appel avec les MÊMES paramètres, `appliquer: true` et le code.

import { z } from 'npm:zod@3.23.8'
import { type Contexte, type Outil, ErreurOutil, date, dateFr } from './commun.ts'

const ECRITURE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
const ECRITURE_SENSIBLE = { ...ECRITURE, destructiveHint: true }

const uuid = z.string().uuid('Identifiant invalide')
const motif = z.string().trim().min(10, 'Motif de 10 caractères au moins').max(2000)
const appliquer = z.boolean().default(false)
const code = z.string().regex(/^[0-9A-Fa-f]{8}$/, 'Code de confirmation : 8 caractères, donné par l’aperçu').optional()

const PROPRIETES_CONFIRMATION = {
  appliquer: { type: 'boolean', default: false, description: 'false (défaut) = APERÇU, rien n’est enregistré. true = enregistrer, seulement après un oui explicite de la personne sur l’aperçu.' },
  code: { type: 'string', description: 'Code de confirmation rendu par l’aperçu (obligatoire avec appliquer=true).' },
}

const CLES_DATE = new Set(['date', 'date_prevue', 'debut', 'cloture'])

/** Remplace les dates ISO des champs connus par « JJ/MM/AAAA (Sxx) ». */
function datesEnFrancais(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(datesEnFrancais)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [
        k,
        CLES_DATE.has(k) && typeof x === 'string' ? dateFr(x) : datesEnFrancais(x),
      ]),
    )
  }
  return v
}

/** Appelle une fonction claude_* et rend un résultat prêt à montrer. */
async function geste(ctx: Contexte, fonction: string, params: Record<string, unknown>, appliquerDemande: boolean) {
  const { data, error } = await ctx.supabase.rpc(fonction, params)
  // Les messages viennent de la base (fonctions 158, triggers) : en français,
  // destinés à la personne.
  if (error) throw new ErreurOutil(`Rien n’a été enregistré. ${error.message}`)
  const resultat = datesEnFrancais(data) as Record<string, unknown>
  return {
    ...resultat,
    consigne: appliquerDemande
      ? 'C’est enregistré. Résume à la personne ce qui a changé (statut de l’OT, OT suivant, alertes).'
      : `APERÇU SEULEMENT. Montre ce récapitulatif à la personne et attends un oui explicite. Ensuite seulement, rappelle cet outil avec EXACTEMENT les mêmes paramètres, appliquer=true et code=${String(resultat.code_confirmation)}.`,
  }
}

const saisie = z.object({
  operation_id: uuid,
  action: z.enum(['fait', 'mesure', 'non_applicable', 'en_cours', 'en_attente', 'commenter']),
  valeur: z.number().finite().optional(),
  date: date.optional(),
  commentaire: z.string().trim().min(1).max(2000).optional(),
}).strict()

export const OUTILS_ECRITURE: Outil[] = [
  {
    name: 'saisir_operations',
    title: 'Enregistrer l’avancement d’un OT',
    description:
      'Enregistre des opérations d’UN ordre de travail : faites, mesures (valeur), non applicables, démarrées, remises en attente, ou un commentaire. ' +
      'Le statut de l’OT est déduit par Dédale (en cours, clôture automatique quand tout est fait, annulation automatique si tout est non applicable) et l’OT suivant est programmé par la base. ' +
      'Toujours relire l’OT (outil ordre_travail) juste avant, pour les identifiants des opérations. ' +
      'Une saisie = UNE opération sur UN équipement : quand l’OT répète plusieurs opérations sur plusieurs équipements, ne saisir que les opérations que la personne a dites faites, sur les équipements (ou locaux) qu’elle a cités ; jamais toutes les opérations d’un équipement par défaut. Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['ot_id', 'saisies'],
      properties: {
        ot_id: { type: 'string', description: 'Identifiant de l’OT' },
        saisies: {
          type: 'array',
          minItems: 1,
          maxItems: 200,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['operation_id', 'action'],
            properties: {
              operation_id: { type: 'string', description: 'Identifiant de l’opération (outil ordre_travail)' },
              action: {
                type: 'string',
                enum: ['fait', 'mesure', 'non_applicable', 'en_cours', 'en_attente', 'commenter'],
                description: 'fait = réalisée (opération sans mesure) ; mesure = réalisée avec sa valeur ; non_applicable = pas faite pour une raison quelconque (ne pas confondre avec « plus tard », qui reste en_attente) ; en_cours = commencée ; en_attente = remettre à faire (correction) ; commenter = seulement ajouter un commentaire',
              },
              valeur: { type: 'number', description: 'Valeur relevée, dans l’unité de l’opération (action mesure uniquement)' },
              date: { type: 'string', description: 'Jour d’intervention AAAA-MM-JJ, donné par la personne (obligatoire sauf en_attente et commenter ; jamais dans le futur)' },
              commentaire: { type: 'string', description: 'Information utile DITE par la personne (ex. « filtre très encrassé ») ; jamais inventée' },
            },
          },
        },
        ...PROPRIETES_CONFIRMATION,
      },
    },
    annotations: ECRITURE,
    schema: z.object({ ot_id: uuid, saisies: z.array(saisie).min(1).max(200), appliquer, code }).strict(),
    run: async (a: { ot_id: string; saisies: z.infer<typeof saisie>[]; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_saisir_operations', { p_ot_id: a.ot_id, p_saisies: a.saisies, p_appliquer: a.appliquer, p_code: a.code ?? null }, a.appliquer),
  },
  {
    name: 'replanifier_ot',
    title: 'Replanifier un OT',
    description: 'Change la date prévue d’un OT à faire, en cours ou rouvert (il devient « Planifié »). Date entre aujourd’hui −30 jours et +18 mois. Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['ot_id', 'date'],
      properties: { ot_id: { type: 'string' }, date: { type: 'string', description: 'Nouvelle date prévue AAAA-MM-JJ' }, ...PROPRIETES_CONFIRMATION },
    },
    annotations: ECRITURE,
    schema: z.object({ ot_id: uuid, date, appliquer, code }).strict(),
    run: async (a: { ot_id: string; date: string; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_replanifier_ot', { p_ot_id: a.ot_id, p_date: a.date, p_appliquer: a.appliquer, p_code: a.code ?? null }, a.appliquer),
  },
  {
    name: 'rouvrir_ot',
    title: 'Rouvrir un OT clôturé',
    description: 'Rouvre un OT clôturé pour corriger ou compléter ses opérations. Motif obligatoire. Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['ot_id', 'motif'],
      properties: { ot_id: { type: 'string' }, motif: { type: 'string', description: 'Pourquoi on rouvre (10 caractères au moins)' }, ...PROPRIETES_CONFIRMATION },
    },
    annotations: ECRITURE,
    schema: z.object({ ot_id: uuid, motif, appliquer, code }).strict(),
    run: async (a: { ot_id: string; motif: string; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_rouvrir_ot', { p_ot_id: a.ot_id, p_motif: a.motif, p_appliquer: a.appliquer, p_code: a.code ?? null }, a.appliquer),
  },
  {
    name: 'cloturer_ot',
    title: 'Reclôturer un OT rouvert',
    description: 'Reclôture un OT ROUVERT dont toutes les opérations sont déjà réglées. Pour un OT normal, la clôture est automatique via saisir_operations. Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['ot_id'], properties: { ot_id: { type: 'string' }, ...PROPRIETES_CONFIRMATION } },
    annotations: ECRITURE,
    schema: z.object({ ot_id: uuid, appliquer, code }).strict(),
    run: async (a: { ot_id: string; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_cloturer_ot', { p_ot_id: a.ot_id, p_appliquer: a.appliquer, p_code: a.code ?? null }, a.appliquer),
  },
  {
    name: 'annuler_ot',
    title: 'Annuler un OT',
    description: 'Annule un OT à faire, en cours ou rouvert ; la base reprogramme l’OT suivant. Motif obligatoire. Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['ot_id', 'motif'],
      properties: { ot_id: { type: 'string' }, motif: { type: 'string', description: 'Pourquoi on annule (10 caractères au moins)' }, ...PROPRIETES_CONFIRMATION },
    },
    annotations: ECRITURE_SENSIBLE,
    schema: z.object({ ot_id: uuid, motif, appliquer, code }).strict(),
    run: async (a: { ot_id: string; motif: string; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_annuler_ot', { p_ot_id: a.ot_id, p_motif: a.motif, p_appliquer: a.appliquer, p_code: a.code ?? null }, a.appliquer),
  },
  {
    name: 'reactiver_ot',
    title: 'Réactiver un OT annulé',
    description: 'Remet à faire un OT annulé (refusé si sa gamme est inactive). Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['ot_id'], properties: { ot_id: { type: 'string' }, ...PROPRIETES_CONFIRMATION } },
    annotations: ECRITURE,
    schema: z.object({ ot_id: uuid, appliquer, code }).strict(),
    run: async (a: { ot_id: string; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_reactiver_ot', { p_ot_id: a.ot_id, p_appliquer: a.appliquer, p_code: a.code ?? null }, a.appliquer),
  },
]
