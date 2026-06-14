/**
 * Helpers FRONT liés à la corbeille (soft-delete).
 *
 * NB wording : la formulation « … (suppression définitive après 90 jours) » est, pour
 * l'instant, écrite en clair dans chaque dialog de confirmation. Sa centralisation (une
 * constante / un formateur unique) est volontairement reportée à la Corbeille par section
 * (T4, cf. `plan/corbeille/`) : c'est à ce moment-là que le texte changera (« récupérable
 * depuis la corbeille… ») ET qu'un helper sera réellement consommé. Pas d'abstraction tant
 * qu'elle n'a pas d'usage.
 */

/**
 * Neutralise une relation jointe EN CORBEILLE. PostgREST ne filtre pas `deleted_at`
 * sur les jointures embarquées : une entité soft-deletée apparaîtrait sinon comme un
 * « fantôme ». Renvoie la relation si elle est vivante, sinon `null`. Tolère
 * `null`/`undefined` : une relation peut être absente, ou masquée par la RLS — l'embed
 * PostgREST peut valoir `null` à l'exécution même quand la FK est `NOT NULL` (d'où un
 * paramètre explicitement nullable, qui évite tout accès `.deleted_at` sur `null`).
 */
export function relationVivante<T extends { deleted_at: string | null }>(
  rel: T | null | undefined,
): T | null {
  return rel?.deleted_at != null ? null : (rel ?? null)
}
