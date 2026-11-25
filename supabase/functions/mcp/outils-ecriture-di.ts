// Outils d'ÉCRITURE du connecteur Claude — demandes d'intervention (étape 6b).
//
// Même modèle que les OT (outils-ecriture.ts) : chaque outil appelle une
// fonction SQL claude_*_demande (159), qui vérifie le droit, la RLS, le lieu
// (obligatoire, équipements DANS ce lieu) et le code de confirmation.
// Aperçu d'abord ; enregistrement avec les mêmes paramètres, appliquer=true et
// le code, après un oui explicite de la personne.

import { z } from 'npm:zod@3.23.8'
import { type Outil, date, uuid, appliquer, code, PROPRIETES_CONFIRMATION, ECRITURE, ECRITURE_SENSIBLE, geste } from './commun.ts'

const APRES_DI = 'Résume à la personne la demande telle qu’enregistrée (statut, lieu, équipements, alertes).'

const constat = z.string().trim().min(15, 'Constat de 15 caractères au moins').max(4000)
const equipements = z.array(uuid).max(20)

const PROPRIETE_CONSTAT = {
  type: 'string',
  description:
    'Constat FACTUEL, rédigé à partir des mots de la personne et validé par elle : quoi (symptôme observé), où précisément dans le lieu, depuis quand si connu, conséquence (ex. chambre inutilisable, fuite active). Ni cause supposée, ni remède. 15 à 4000 caractères.',
}

export const OUTILS_ECRITURE_DI: Outil[] = [
  {
    name: 'creer_demande',
    title: 'Créer une demande d’intervention',
    description:
      'Crée une demande d’intervention (DI) « Ouvert » sur UN lieu précis (local trouvé avec l’outil lieux), avec le ou les équipements concernés de ce lieu. ' +
      'Une DI = un problème à un endroit : plusieurs endroits ou plusieurs problèmes = plusieurs DI. ' +
      'Avant : vérifier les DI déjà ouvertes sur ce lieu (l’aperçu les signale aussi en « doublons ») et les problèmes courants du site (outil problemes_courants). Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['local_id', 'constat'],
      properties: {
        local_id: { type: 'string', description: 'Identifiant du local (outil lieux) — obligatoire' },
        constat: PROPRIETE_CONSTAT,
        equipement_ids: { type: 'array', items: { type: 'string' }, maxItems: 20, description: 'Équipements concernés, tous situés dans ce local (outil lieux) ; vide si aucun' },
        date_constat: { type: 'string', description: 'Jour où le problème a été constaté, AAAA-MM-JJ (défaut : aujourd’hui ; jamais dans le futur)' },
        ...PROPRIETES_CONFIRMATION,
      },
    },
    annotations: ECRITURE,
    schema: z.object({ local_id: uuid, constat, equipement_ids: equipements.default([]), date_constat: date.optional(), appliquer, code }).strict(),
    run: (a: { local_id: string; constat: string; equipement_ids: string[]; date_constat?: string; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_creer_demande', {
        p_local_id: a.local_id, p_constat: a.constat, p_equipement_ids: a.equipement_ids,
        p_date_constat: a.date_constat ?? null, p_appliquer: a.appliquer, p_code: a.code ?? null,
      }, a.appliquer, APRES_DI),
  },
  {
    name: 'modifier_demande',
    title: 'Corriger une demande d’intervention',
    description:
      'Corrige le constat, le lieu ou les équipements d’une DI non clôturée (pour une DI clôturée : rouvrir_demande). Si le lieu change, donner aussi les équipements du nouveau lieu (liste vide s’il n’y en a pas). ' +
      'Un demandeur ne peut corriger que le constat de sa propre DI encore « Ouvert ». Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['demande_id'],
      properties: {
        demande_id: { type: 'string', description: 'Identifiant de la DI (outil demandes)' },
        constat: { ...PROPRIETE_CONSTAT, description: 'Nouveau constat COMPLET (remplace l’ancien). ' + PROPRIETE_CONSTAT.description },
        local_id: { type: 'string', description: 'Nouveau local (outil lieux)' },
        equipement_ids: { type: 'array', items: { type: 'string' }, maxItems: 20, description: 'Nouvelle liste complète des équipements, tous dans le lieu de la DI' },
        ...PROPRIETES_CONFIRMATION,
      },
    },
    annotations: ECRITURE_SENSIBLE,
    schema: z.object({ demande_id: uuid, constat: constat.optional(), local_id: uuid.optional(), equipement_ids: equipements.optional(), appliquer, code }).strict(),
    run: (a: { demande_id: string; constat?: string; local_id?: string; equipement_ids?: string[]; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_modifier_demande', {
        p_di_id: a.demande_id, p_constat: a.constat ?? null, p_local_id: a.local_id ?? null,
        p_equipement_ids: a.equipement_ids ?? null, p_appliquer: a.appliquer, p_code: a.code ?? null,
      }, a.appliquer, APRES_DI),
  },
  {
    name: 'prendre_en_charge_demande',
    title: 'Prendre en charge une demande',
    description: 'Passe une DI « Ouvert » à « En cours » (quelqu’un s’en occupe). Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['demande_id'], properties: { demande_id: { type: 'string' }, ...PROPRIETES_CONFIRMATION } },
    annotations: ECRITURE,
    schema: z.object({ demande_id: uuid, appliquer, code }).strict(),
    run: (a: { demande_id: string; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_prendre_en_charge_demande', { p_di_id: a.demande_id, p_appliquer: a.appliquer, p_code: a.code ?? null }, a.appliquer, APRES_DI),
  },
  {
    name: 'cloturer_demande',
    title: 'Clôturer une demande',
    description:
      'Clôture une DI (« Ouvert » ou « En cours ») quand le problème est réglé. Demander ce qui a été fait pour la note de résolution (facultative, jamais inventée) et le jour de l’intervention. ' +
      'Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['demande_id'],
      properties: {
        demande_id: { type: 'string' },
        note: { type: 'string', description: 'Ce qui a été fait, dit par la personne (ex. « siphon démonté et nettoyé ») ; 5 à 2000 caractères ; facultative' },
        date: { type: 'string', description: 'Jour de l’intervention AAAA-MM-JJ (défaut : aujourd’hui ; jamais futur ni avant le constat)' },
        ...PROPRIETES_CONFIRMATION,
      },
    },
    annotations: ECRITURE_SENSIBLE,
    schema: z.object({ demande_id: uuid, note: z.string().trim().min(5).max(2000).optional(), date: date.optional(), appliquer, code }).strict(),
    run: (a: { demande_id: string; note?: string; date?: string; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_cloturer_demande', {
        p_di_id: a.demande_id, p_note: a.note ?? null, p_date: a.date ?? null, p_appliquer: a.appliquer, p_code: a.code ?? null,
      }, a.appliquer, APRES_DI),
  },
  {
    name: 'rouvrir_demande',
    title: 'Rouvrir une demande clôturée',
    description:
      'Repasse une DI clôturée à « Ouvert » quand le problème revient ou n’était pas réglé. Motif obligatoire : il est ajouté, daté, à la fin du constat pour que le technicien le voie. Aperçu d’abord, puis enregistrement après accord.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['demande_id', 'motif'],
      properties: {
        demande_id: { type: 'string' },
        motif: { type: 'string', description: 'Ce qui ne va pas, factuellement, et quand (10 à 1000 caractères)' },
        ...PROPRIETES_CONFIRMATION,
      },
    },
    annotations: ECRITURE_SENSIBLE,
    schema: z.object({ demande_id: uuid, motif: z.string().trim().min(10).max(1000), appliquer, code }).strict(),
    run: (a: { demande_id: string; motif: string; appliquer: boolean; code?: string }, ctx) =>
      geste(ctx, 'claude_rouvrir_demande', { p_di_id: a.demande_id, p_motif: a.motif, p_appliquer: a.appliquer, p_code: a.code ?? null }, a.appliquer, APRES_DI),
  },
]
