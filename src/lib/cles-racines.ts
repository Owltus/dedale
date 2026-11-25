/**
 * Racines de clés de cache invalidées HORS de leur feature propriétaire.
 *
 * La fabrique de la feature (`gammesQueries.all`, `dashboardQueries.all`) reste
 * la référence : elle est DÉFINIE par la racine ci-dessous. Une autre feature
 * qui doit seulement invalider ce cache importe la racine d'ici plutôt que la
 * fabrique, sans quoi deux features s'importeraient mutuellement (cycle).
 * Même chose pour une requête rangée hors de sa feature mais gardée sous sa
 * racine (`operationsQueries.idsOperations`, sous `gammes`). N'y mettre que des
 * racines réellement utilisées à distance.
 */
export const clesRacines = {
  /** Racine des clés du Plan de maintenance (`gammesQueries.all`). */
  gammes: () => ['gammes'] as const,
  /** Racine des clés du tableau de bord (`dashboardQueries.all`). */
  tableauDeBord: () => ['dashboard'] as const,
}
