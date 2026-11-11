import { montantProjet, type ProjetMontant } from './etat'

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})

/** Formate un montant en euros (fr-FR) ; « — » si null. */
export function formatEuros(value: number | null): string {
  return value === null ? '—' : euros.format(value)
}

const eurosArrondis = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

/** Montant arrondi à l'euro (« 6 732 € ») — pour les vues d'ensemble. */
export function formatEurosArrondi(value: number): string {
  return eurosArrondis.format(value)
}

/**
 * Le montant d'un projet en texte (`montantProjet`) : la liste n'en montre
 * qu'un, celui qui reflète l'état d'avancement.
 */
export function montantPrincipal(p: ProjetMontant): string {
  return formatEuros(montantProjet(p))
}
