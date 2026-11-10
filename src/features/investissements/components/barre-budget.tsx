import {
  ID_DEMANDE,
  ID_REALISE,
  ID_REFUSE,
  ID_VALIDE,
  nomStatutCapex,
  repartitionBudget,
} from '@/features/investissements/etat'
import { formatEuros } from '@/features/investissements/format'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/database.types'

type Investissement = Database['public']['Tables']['investissements']['Row']

// Couleurs du parcours (demande PO) : vert pour ce qui est accordé — plein une
// fois réalisé, plus clair tant que seulement validé —, gris pour ce qui
// attend, rouge pour le refusé.
const COULEUR: Record<number, string> = {
  [ID_REALISE]: 'bg-success',
  [ID_VALIDE]: 'bg-success/55',
  [ID_DEMANDE]: 'bg-muted-foreground/40',
  [ID_REFUSE]: 'bg-destructive',
}

/**
 * Barre d'un budget (demande PO du 10/11/2026) : une section par statut, de
 * largeur proportionnelle à son montant, puis la légende (statut, montant — sans
 * nombre de dossiers, jugé inutile par le PO). Elle EST la description de la page d'un
 * budget (sous le titre), à la place de « N dossiers · X € demandés… ».
 */
export function BarreBudget({
  investissements,
  noms,
}: {
  investissements: Investissement[]
  noms: Map<number, string>
}) {
  const parts = repartitionBudget(investissements)
  const total = parts.reduce((s, p) => s + p.montant, 0)
  if (parts.length === 0) return null
  return (
    // Posée en DESCRIPTION de la page (sous le titre) : barre puis légende sur
    // une ligne, qui passent l'une sous l'autre quand la place manque.
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5">
      <div
        role="img"
        aria-label={parts
          .map(
            (p) =>
              `${nomStatutCapex(p.statutId, noms)} : ${formatEuros(p.montant)}`,
          )
          .join(', ')}
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted sm:w-80"
      >
        {total > 0 &&
          parts
            .filter((p) => p.montant > 0)
            .map((p) => (
              <div
                key={p.statutId}
                title={`${nomStatutCapex(p.statutId, noms)} : ${formatEuros(p.montant)}`}
                className={cn('h-full', COULEUR[p.statutId])}
                style={{ width: `${String((p.montant / total) * 100)}%` }}
              />
            ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <li key={p.statutId} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn('size-2.5 rounded-full', COULEUR[p.statutId])}
            />
            <span>{nomStatutCapex(p.statutId, noms)}</span>
            <span className="font-medium text-foreground tabular-nums">
              {formatEuros(p.montant)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
