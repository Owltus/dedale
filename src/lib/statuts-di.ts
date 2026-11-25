/**
 * Codes du référentiel `statuts_di` (migration 052) : 1 Ouvert, 2 En cours,
 * 3 Clôturé. Ils vivent dans `lib/` parce que les droits centralisés
 * (`lib/permissions.ts`) en ont besoin et que `lib/` n'importe pas de feature
 * hors du socle. Le point d'entrée métier reste `features/demandes/etat.ts`,
 * qui les ré-exporte avec libellés, tons et prédicats.
 */
export const STATUT_DI_OUVERT = 1
export const STATUT_DI_EN_COURS = 2
export const STATUT_DI_CLOTURE = 3
