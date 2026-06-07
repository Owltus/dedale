import { z } from 'zod'
import {
  ROLE_CODES,
  ROLE_LABELS,
  roleLabel,
  type RoleCode,
} from '@/lib/permissions'

// Codes et libellés de rôle : source unique dans lib/permissions (sens de
// dépendance correct, features → lib). Réexportés ici par commodité pour les
// consommateurs du domaine utilisateurs.
export { ROLE_CODES, ROLE_LABELS, roleLabel }
export type { RoleCode }

/**
 * Cascade de création (alignée avec le trigger handle_new_auth_user) :
 * qui peut créer quels rôles. La source de vérité reste la base ; cette table
 * sert à filtrer le dropdown côté UI.
 * NB : `manager` coïncide avec `SUBORDINATE_ROLES` de lib/permissions (édition) —
 * règles backend distinctes, à garder cohérentes si l'une évolue.
 */
export const CASCADE: Record<RoleCode, readonly RoleCode[]> = {
  admin: ['admin', 'manager', 'technicien', 'lecteur', 'demandeur'],
  manager: ['technicien', 'lecteur', 'demandeur'],
  technicien: ['lecteur', 'demandeur'],
  lecteur: [],
  demandeur: [],
}

export const inviteSchema = z.object({
  email: z
    .email('Adresse e-mail invalide')
    .trim()
    .min(1, 'L’adresse e-mail est obligatoire')
    .max(255),
  nom_complet: z
    .string()
    .trim()
    .min(1, 'Le nom complet est obligatoire')
    .max(200),
  role: z.enum(ROLE_CODES, { message: 'Choisis un rôle' }),
  site_ids: z.array(z.uuid()),
})

export type InviteFormValues = z.infer<typeof inviteSchema>

export const emptyInvite: InviteFormValues = {
  email: '',
  nom_complet: '',
  role: 'technicien',
  site_ids: [],
}

// Format téléphone aligné sur la contrainte CHECK de public.users
// (E.164 international + formats nationaux avec espaces/tirets/points).
const TELEPHONE_RE = /^\+?[0-9][0-9 .-]{4,19}$/

export const profileSchema = z.object({
  nom_complet: z
    .string()
    .trim()
    .min(1, 'Le nom complet est obligatoire')
    .max(200),
  telephone: z.union([
    z.literal(''),
    z
      .string()
      .trim()
      .regex(TELEPHONE_RE, 'Téléphone invalide (ex. +33 6 12 34 56 78)'),
  ]),
})

export type ProfileFormValues = z.infer<typeof profileSchema>
