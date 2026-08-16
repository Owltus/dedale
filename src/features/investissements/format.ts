import type { Database } from '@/lib/database.types'

type Investissement = Database['public']['Tables']['investissements']['Row']

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})

/** Formate un montant en euros (fr-FR) ; « — » si null. */
export function formatEuros(value: number | null): string {
  return value === null ? '—' : euros.format(value)
}

export interface EcartCapex {
  /** réel − prévu, ou null si l'un des deux montants manque. */
  ecart: number | null
  /** Libellé signé (« +1 200,00 € »), ou null si non calculable. */
  label: string | null
  /** Vrai en cas de DÉPASSEMENT (réel > prévu) → à signaler. */
  depassement: boolean
}

/**
 * Écart budgétaire prévu/réel d'un investissement. Seul le dépassement est
 * « signalé » ; sous le budget ou à l'équilibre reste neutre (un réel encore
 * partiel ne doit pas s'afficher comme favorable). Source unique du calcul,
 * partagée par la liste et la fiche détail.
 */
/**
 * LE montant à retenir pour un investissement, du plus engageant au moins
 * engageant : la dépense réelle s'il y en a une, sinon le budget prévu, sinon le
 * montant demandé.
 *
 * La liste n'en montre qu'un seul — celui qui reflète l'état d'avancement. Elle
 * en affichait trois, dont deux valaient « — » la plupart du temps. Le détail
 * complet reste sur la fiche.
 */
export function montantPrincipal(
  inv: Pick<
    Investissement,
    'montant_demande' | 'montant_prevu' | 'depense_reelle'
  >,
): string {
  const montant = inv.depense_reelle ?? inv.montant_prevu ?? inv.montant_demande
  return formatEuros(montant)
}

export function ecartCapex(
  inv: Pick<Investissement, 'montant_prevu' | 'depense_reelle'>,
): EcartCapex {
  const ecart =
    inv.montant_prevu !== null && inv.depense_reelle !== null
      ? inv.depense_reelle - inv.montant_prevu
      : null
  return {
    ecart,
    label:
      ecart === null ? null : `${ecart > 0 ? '+' : ''}${euros.format(ecart)}`,
    depassement: ecart !== null && ecart > 0,
  }
}
