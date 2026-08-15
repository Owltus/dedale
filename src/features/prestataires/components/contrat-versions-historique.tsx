import type { ContratRow } from '../queries'
import { statutContrat } from '../etat'
import { formatDate } from '@/lib/date'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/common/status-badge'

/**
 * Historique des versions d'un contrat (racine + avenants), en lignes compactes.
 * La chaîne est reconstruite côté front (`chaineDeVersions`). Ne rend rien s'il
 * n'y a qu'une version (contrat sans avenant).
 */
export function ContratVersionsHistorique({
  chaine,
  courantId,
}: {
  chaine: ContratRow[]
  courantId: string
}) {
  if (chaine.length <= 1) return null
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        Historique des versions
      </p>
      <ol className="space-y-1">
        {chaine.map((v, i) => {
          const statut = statutContrat(v)
          const estCourant = v.id === courantId
          return (
            <li
              key={v.id}
              className={cn(
                'flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-sm',
                estCourant && 'border-primary/40 bg-primary/5',
              )}
            >
              <span className="min-w-0 truncate">
                <span className="text-muted-foreground">v{i + 1} · </span>
                {v.reference} — {formatDate(v.date_debut)}
                {v.objet_avenant ? ` (${v.objet_avenant})` : ''}
              </span>
              <StatusBadge tone={statut.tone}>
                {estCourant ? 'Version courante' : statut.label}
              </StatusBadge>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
