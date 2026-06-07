/**
 * Droits par rôle, centralisés. Le front ne fait que REFLÉTER le rôle pour
 * l'affichage ; la sécurité réelle est portée par la RLS côté base. On garde
 * ces règles en phase avec les policies, sans les dupliquer.
 *
 * 5 rôles : admin · manager · technicien · lecteur · demandeur.
 */

type Role = string | null | undefined

const METIER = ['admin', 'manager', 'technicien']
const ADMINISTRATIF = ['admin', 'manager']
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

/** Créer / modifier des ressources métier (OT, gammes, équipements, docs…). */
export function canManageMetier(role: Role): boolean {
  return !!role && METIER.includes(role)
}

/** Gestion administrative (utilisateurs, investissements, prestataires).
 *  Type predicate : permet de narrower le rôle après une garde
 *  `if (!canManageAdmin(role)) return`. */
export function canManageAdmin(role: Role): role is 'admin' | 'manager' {
  return !!role && ADMINISTRATIF.includes(role)
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
