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
export interface MontantLigne {
  label: string
  valeur: string
  /** Vrai pour un dépassement de budget — la seule valeur à signaler. */
  alerte?: boolean
}

/**
 * Montants à AFFICHER pour un investissement, dans l'ordre de lecture
 * Demandé → Prévu → Réel → Écart.
 *
 * Seuls les montants RENSEIGNÉS sont retournés. La liste affichait auparavant
 * les trois lignes en permanence, dont deux valaient « — » sur la plupart des
 * investissements : trois lignes de 12 px pour ne rien dire, là où une seule
 * portait l'information. Source unique, partagée par la liste et la fiche.
 */
export function montantsLignes(
  inv: Pick<
    Investissement,
    'montant_demande' | 'montant_prevu' | 'depense_reelle'
  >,
): MontantLigne[] {
  const lignes: MontantLigne[] = []
  if (inv.montant_demande !== null)
    lignes.push({ label: 'Demandé', valeur: formatEuros(inv.montant_demande) })
  if (inv.montant_prevu !== null)
    lignes.push({ label: 'Prévu', valeur: formatEuros(inv.montant_prevu) })
  if (inv.depense_reelle !== null)
    lignes.push({ label: 'Réel', valeur: formatEuros(inv.depense_reelle) })

  const { label, depassement } = ecartCapex(inv)
  if (label !== null)
    lignes.push({ label: 'Écart', valeur: label, alerte: depassement })

  return lignes
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
