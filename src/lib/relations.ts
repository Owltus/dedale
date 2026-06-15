/**
 * Neutralise une relation jointe pointant vers une entité SUPPRIMÉE. PostgREST ne
 * filtre pas `deleted_at` sur les jointures embarquées : une entité supprimée
 * apparaîtrait sinon comme un « fantôme ». Renvoie la relation si elle est vivante,
 * sinon `null`. Tolère `null`/`undefined` : une relation peut être absente, ou masquée
 * par la RLS — l'embed PostgREST peut valoir `null` à l'exécution même quand la FK est
 * `NOT NULL` (d'où un paramètre explicitement nullable, qui évite tout accès sur `null`).
 */
export function relationVivante<T extends { deleted_at: string | null }>(
  rel: T | null | undefined,
): T | null {
  return rel?.deleted_at != null ? null : (rel ?? null)
}
