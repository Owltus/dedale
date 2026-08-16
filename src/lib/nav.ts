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

/** Clés de navigation = chemins des 16 écrans listés dans la sidebar. */
export type NavKey =
  | '/'
  | '/planning'
  | '/gammes'
  | '/ordres-travail'
  | '/demandes'
  | '/travaux'
  | '/evenements'
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
  '/travaux': ROLES_METIER_LECTURE,
  // Journal de l'équipe technique : le demandeur en est exclu (il a les
  // demandes d'intervention pour signaler). Lecteur consulte (migration 077).
  '/evenements': ROLES_METIER_LECTURE,
  '/releves': ROLES_METIER_LECTURE,
  '/registre': ROLES_METIER_LECTURE,
  '/documents': ROLES_METIER_LECTURE,
  // Écran métier (cf. RLS investissements) : manager/technicien créent, éditent
  // ET SUPPRIMENT sur leurs sites (migration 053, `canDelete={canManage}` dans la
  // page) ; lecteur consulte. Ce commentaire a longtemps annoncé « suppression
  // admin seul », ce que le code n'a jamais fait — vérifier la RLS, pas la doctrine.
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

/**
 * Libellé de chaque entrée de navigation — SOURCE UNIQUE, au même titre que
 * `NAV_ROLES` juste au-dessus.
 *
 * Il vivait dans `app-sidebar.tsx`, mêlé aux icônes : hors d'atteinte de tout ce
 * qui n'est pas un composant. Le titre d'onglet du navigateur a besoin des mêmes
 * libellés — les recopier aurait créé deux vérités destinées à diverger dès le
 * premier renommage (« Gammes » s'affiche déjà « Plan de maintenance »).
 */
export const NAV_LABELS: Record<NavKey, string> = {
  '/': 'Tableau de bord',
  '/planning': 'Planning',
  // La SECTION s'affiche « Plan de maintenance » ; la fiche unitaire et la base
  // restent « gamme » (décision produit, affichage seul).
  '/gammes': 'Plan de maintenance',
  '/ordres-travail': 'Ordres de travail',
  '/demandes': "Demandes d'intervention",
  '/travaux': 'Travaux',
  '/evenements': 'Événements',
  '/releves': 'Relevés',
  '/registre': 'Registre de sécurité',
  '/documents': 'Documents',
  '/investissements': 'Investissements',
  '/sites': 'Sites',
  '/localisations': 'Localisations',
  '/equipements': 'Équipements',
  '/prestataires': 'Prestataires',
  '/utilisateurs': 'Utilisateurs',
  '/bibliotheque': 'Bibliothèque',
}

/**
 * Section de navigation à laquelle appartient un chemin, ou `null` s'il n'est
 * dans aucune (`/profil`, `/login`…).
 *
 * Une fiche de détail appartient à la section de sa liste : `/travaux/le-copieur`
 * → « Travaux ». On retient donc le préfixe le PLUS LONG qui correspond, sans
 * quoi `/` (racine, préfixe de tout) l'emporterait sur chaque page ; la racine
 * est d'ailleurs traitée à part, en correspondance exacte.
 */
export function sectionDeChemin(pathname: string): string | null {
  if (pathname === '/') return NAV_LABELS['/']
  const cle = (Object.keys(NAV_LABELS) as NavKey[])
    .filter((k) => k !== '/')
    .filter((k) => pathname === k || pathname.startsWith(`${k}/`))
    .sort((a, b) => b.length - a.length)[0]
  return cle ? NAV_LABELS[cle] : null
}
