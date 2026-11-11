import { montantProjet, montantRetenu, type ProjetMontant } from './etat'

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

export interface EcartCapex {
  /** réel − proposé, ou null si l'un des deux montants manque. */
  ecart: number | null
  /** Libellé signé (« +1 200,00 € »), ou null si non calculable. */
  label: string | null
  /** Vrai en cas de DÉPASSEMENT (réel > proposé) → à signaler. */
  depassement: boolean
}

/**
 * Écart budgétaire proposé/réel d'un investissement. Seul le dépassement est
 * « signalé » ; sous le budget ou à l'équilibre reste neutre (un réel encore
 * partiel ne doit pas s'afficher comme favorable). Source unique du calcul,
 * partagée par la liste et la fiche détail.
 */
/**
 * Le montant d'un projet en texte (`montantProjet`) : la liste n'en montre
 * qu'un, celui qui reflète l'état d'avancement.
 */
export function montantPrincipal(p: ProjetMontant): string {
  return formatEuros(montantProjet(p))
}

// Écart = réel − RETENU (147) : la somme des devis retenus fait foi.
export function ecartCapex(
  p: Pick<ProjetMontant, 'depense_reelle' | 'devis'>,
): EcartCapex {
  const reference = montantRetenu(p)
  const ecart =
    reference !== null && p.depense_reelle !== null
      ? Math.round((p.depense_reelle - reference) * 100) / 100
      : null
  return {
    ecart,
    label:
      ecart === null ? null : `${ecart > 0 ? '+' : ''}${euros.format(ecart)}`,
    depassement: ecart !== null && ecart > 0,
  }
}
