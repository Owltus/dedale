import type { Role } from '@/lib/permissions'
import {
  ROLES_ADMIN,
  ROLES_ADMINISTRATIF,
  ROLES_METIER,
  ROLES_METIER_LECTURE,
} from '@/lib/permissions'

/**
 * Visibilité de la navigation par rôle — SOURCE UNIQUE (module PUR, testable).
 *
 * Consommée à la fois par la sidebar (masquage des entrées) et par les gardes de
 * route (`requireNav` dans nav-guard.ts), pour qu'il n'existe qu'une seule
 * vérité. Le front PRÉSENTE : la sécurité réelle reste portée par la RLS. Le
 * masquage sidebar n'est donc pas une protection — d'où les gardes de route en
 * renfort.
 *
 * La visibilité est volontairement une « vue produit » (« tu vois ce dont tu
 * dois t'occuper »), pas un miroir strict de la RLS : elle peut être PLUS
 * restrictive (ex. Investissements réservé admin/manager même si la RLS
 * autoriserait le technicien).
 */

/** Clés de navigation = chemins des 15 écrans listés dans la sidebar. */
export type NavKey =
  | '/'
  | '/planning'
  | '/gammes'
  | '/ordres-travail'
  | '/demandes'
  | '/chantiers'
  | '/releves'
  | '/registre'
  | '/documents'
  | '/investissements'
  | '/sites'
  | '/localisations'
  | '/equipements'
  | '/prestataires'
  | '/utilisateurs'
  | '/bibliotheque'

/**
 * Rôles autorisés à VOIR chaque entrée. `'tous'` = visible par tous les rôles
 * (demandeur inclus). Le demandeur n'est dans aucun jeu métier : il ne voit donc
 * que les entrées marquées `'tous'`.
 */
const NAV_ROLES: Record<NavKey, readonly string[] | 'tous'> = {
  '/': ROLES_METIER_LECTURE, // Tableau de bord : pas le demandeur (widgets métier vides)
  '/planning': ROLES_METIER_LECTURE,
  '/gammes': ROLES_METIER_LECTURE,
  '/ordres-travail': ROLES_METIER_LECTURE,
  '/demandes': 'tous', // espace de travail du demandeur
  '/chantiers': ROLES_METIER_LECTURE,
  '/releves': ROLES_METIER_LECTURE,
  '/registre': ROLES_METIER_LECTURE,
  '/documents': ROLES_METIER_LECTURE,
  // Écran métier (cf. RLS investissements) : technicien crée/édite sur ses
  // sites, lecteur consulte. La suppression reste admin (gérée dans la page).
  '/investissements': ROLES_METIER_LECTURE,
  '/sites': ROLES_ADMIN,
  '/localisations': ROLES_METIER_LECTURE,
  '/equipements': ROLES_METIER_LECTURE,
  '/prestataires': ROLES_METIER_LECTURE,
  '/utilisateurs': ROLES_ADMINISTRATIF,
  // Bibliothèque : page unique (catalogue partagé). Visible aux rôles métier
  // (admin, manager, technicien) — l'outil des techs sur leurs sites ;
  // lecteur/demandeur exclus. L'écriture entreprise reste admin/manager (RLS).
  '/bibliotheque': ROLES_METIER,
}

/**
 * L'entrée `navKey` est-elle visible pour ce rôle ?
 *
 * Rôle non chargé (null/undefined) → `true` : on n'empêche rien tant que le rôle
 * est inconnu (évite un flash de menu vide ; la RLS protège les données de toute
 * façon). Les gardes de route, elles, résolvent le rôle avant d'appeler ceci.
 */
export function canSeeNav(navKey: NavKey, role: Role): boolean {
  if (!role) return true
  const allowed = NAV_ROLES[navKey]
  return allowed === 'tous' || allowed.includes(role)
}

/**
 * Écran d'atterrissage du rôle. Dérivé de canSeeNav pour garantir que la cible
 * est TOUJOURS visible par le rôle (évite toute boucle de redirection) : le
 * tableau de bord si le rôle y a accès, sinon les demandes (visibles par tous).
 * Le demandeur atterrit donc sur /demandes.
 */
export function landingFor(role: Role): '/' | '/demandes' {
  return canSeeNav('/', role) ? '/' : '/demandes'
}
