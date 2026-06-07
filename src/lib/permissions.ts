/**
 * Droits par rôle, centralisés. Le front ne fait que REFLÉTER le rôle pour
 * l'affichage ; la sécurité réelle est portée par la RLS côté base. On garde
 * ces règles en phase avec les policies, sans les dupliquer.
 *
 * 5 rôles : admin · manager · technicien · lecteur · demandeur.
 */

export type Role = string | null | undefined

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

/** Libellé affiché d'un code de rôle (repli sur le code brut, puis « — »). */
export function roleLabel(code: Role): string {
  return code && code in ROLE_LABELS
    ? ROLE_LABELS[code as RoleCode]
    : (code ?? '—')
}

/**
 * Jeux de rôles, source unique réutilisée par les helpers ci-dessous ET par la
 * config de navigation (lib/nav.ts). Typés `readonly string[]` pour que
 * `.includes(role)` accepte un `string` (un `as const` exigerait un littéral).
 */
/** Rôles « métier » avec capacité d'ÉCRITURE (OT, gammes, équipements, docs…). */
export const ROLES_METIER: readonly string[] = [
  'admin',
  'manager',
  'technicien',
]
/**
 * Rôles métier + lecteur : périmètre de VISIBILITÉ (lecture) des écrans métier.
 * À ne pas confondre avec `ROLES_METIER` (écriture, sans lecteur).
 */
export const ROLES_METIER_LECTURE: readonly string[] = [
  ...ROLES_METIER,
  'lecteur',
]
/** Gestion administrative (utilisateurs, investissements). */
export const ROLES_ADMINISTRATIF: readonly string[] = ['admin', 'manager']
/** Super-utilisateur (gestion des sites, colonnes sensibles…). */
export const ROLES_ADMIN: readonly string[] = ['admin']

/**
 * Rôles qu'un manager peut administrer (hiérarchie), pour l'ÉDITION (canEditUser).
 * Coïncide aujourd'hui avec `CASCADE.manager` (création/invitation, dans
 * features/utilisateurs/schemas.ts) ; les deux reflètent des règles backend
 * distinctes (policy UPDATE vs trigger de création) — penser aux deux si l'une évolue.
 */
export const SUBORDINATE_ROLES = ['technicien', 'lecteur', 'demandeur']

/** Super-utilisateur (gestion des sites, colonnes sensibles…). */
export function isAdmin(role: Role): boolean {
  return role === 'admin'
}

/** Demandeur : rôle « externe » (signale des demandes) ; layout dédié (top bar). */
export function isDemandeur(role: Role): boolean {
  return role === 'demandeur'
}

/** Créer / modifier des ressources métier (OT, gammes, équipements, docs…). */
export function canManageMetier(role: Role): boolean {
  return !!role && ROLES_METIER.includes(role)
}

/** Gestion administrative (utilisateurs, investissements, prestataires).
 *  Type predicate : permet de narrower le rôle après une garde
 *  `if (!canManageAdmin(role)) return`. */
export function canManageAdmin(role: Role): role is 'admin' | 'manager' {
  return !!role && ROLES_ADMINISTRATIF.includes(role)
}

/**
 * Signaler une demande d'intervention : tout rôle actif sauf le lecteur.
 * Un rôle absent (null/undefined — ex. compte désactivé via le kill-switch,
 * `current_role()` renvoyant NULL) ne peut PAS créer : durcissement volontaire
 * (le bouton serait de toute façon rejeté par la RLS).
 */
export function canCreateDemande(role: Role): boolean {
  return !!role && role !== 'lecteur'
}

/** Résoudre une demande d'intervention : rôles métier. */
export function canResolveDemande(role: Role): boolean {
  return canManageMetier(role)
}

/** Un admin édite tout utilisateur ; un manager, ses subordonnés. */
export function canEditUser(role: Role, targetRole: Role): boolean {
  return (
    isAdmin(role) ||
    (role === 'manager' &&
      !!targetRole &&
      SUBORDINATE_ROLES.includes(targetRole))
  )
}
