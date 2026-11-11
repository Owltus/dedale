import {
  ID_DEMANDE,
  ID_REALISE,
  ID_REFUSE,
  ID_VALIDE,
  nomStatutCapex,
  repartitionBudget,
  type ProjetMontant,
} from '@/features/investissements/etat'
import {
  formatEuros,
  formatEurosArrondi,
} from '@/features/investissements/format'
import { cn } from '@/lib/utils'

// Couleurs du parcours (demande PO) : vert pour ce qui est accordé — plein une
// fois réalisé, teinté tant que seulement validé —, gris pour ce qui attend,
// rouge pour le refusé. Fonds TEINTÉS pour que le texte posé dessus reste
// lisible en clair comme en sombre.
const COULEUR: Record<number, string> = {
  [ID_REALISE]: 'bg-success text-success-foreground',
  [ID_VALIDE]: 'bg-success/30 text-foreground',
  [ID_DEMANDE]: 'bg-muted-foreground/25 text-foreground',
  [ID_REFUSE]: 'bg-destructive/30 text-foreground',
}

/**
 * Barre d'un budget (demande PO du 10/11/2026) : une section par statut, de
 * largeur proportionnelle à son montant, avec SEULEMENT le montant arrondi
 * écrit dedans — ni légende ni nom de statut (la couleur le dit ; survol =
 * statut et montant au centime). Deux hôtes : la description de la page d'un
 * budget (pleine largeur) et la carte de chaque année sur la page des budgets.
 */
export function BarreBudget({
  investissements,
  noms,
  className,
}: {
  investissements: readonly ProjetMontant[]
  noms: Map<number, string>
  /** Largeur/marges selon l'hôte (pleine largeur par défaut). */
  className?: string
}) {
  const parts = repartitionBudget(investissements).filter((p) => p.montant > 0)
  const total = parts.reduce((s, p) => s + p.montant, 0)
  if (total === 0) return null
  return (
    <div
      role="img"
      aria-label={parts
        .map(
          (p) =>
            `${nomStatutCapex(p.statutId, noms)} : ${formatEuros(p.montant)}`,
        )
        .join(', ')}
      className={cn(
        'flex h-6 w-full gap-0.5 overflow-hidden rounded-md',
        className,
      )}
    >
      {parts.map((p) => (
        <div
          key={p.statutId}
          title={`${nomStatutCapex(p.statutId, noms)} : ${formatEuros(p.montant)}`}
          className={cn(
            'flex min-w-fit items-center justify-center px-1.5 text-xs font-medium whitespace-nowrap',
            COULEUR[p.statutId],
          )}
          // Part proportionnelle au montant, mais jamais plus étroite que son
          // montant : sur téléphone, une petite part reste lisible.
          style={{ flex: `${String(p.montant / total)} 1 0%` }}
        >
          <span className="tabular-nums">{formatEurosArrondi(p.montant)}</span>
        </div>
      ))}
    </div>
  )
}
