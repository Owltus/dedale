import { z } from 'zod'

/** Codes de rôle applicatifs (stables, cf. table public.roles). */
export const ROLE_CODES = [
  'admin',
  'manager',
  'technicien',
  'lecteur',
  'demandeur',
] as const
export type RoleCode = (typeof ROLE_CODES)[number]

/** Libellés affichés pour chaque rôle. */
export const ROLE_LABELS: Record<RoleCode, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  technicien: 'Technicien',
  lecteur: 'Lecteur',
  demandeur: 'Demandeur',
}

/**
 * Cascade de création (alignée avec le trigger handle_new_auth_user) :
 * qui peut créer quels rôles. La source de vérité reste la base ; cette table
 * sert à filtrer le dropdown côté UI.
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
