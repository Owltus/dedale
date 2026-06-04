import { useQuery } from '@tanstack/react-query'
import { relevesQueries } from '../queries'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common/error-state'

interface OtSourceDialogProps {
  otId: string | null
  /** Contexte du relevé cliqué (rappel valeur / date). */
  valeur: number | null
  date: string | null
  uniteSymbole: string | null
  onClose: () => void
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('fr-FR') : '—'
}

const LIBELLES_STATUT: Record<string, string> = {
  planifie: 'Planifié',
  en_cours: 'En cours',
  reouvert: 'Rouvert',
  cloture: 'Clôturé',
  annule: 'Annulé',
}

/**
 * Petit dialog de traçabilité : depuis un point de la courbe, on affiche
 * l'OT source du relevé (pas de navigation de route).
 */
export function OtSourceDialog({
  otId,
  valeur,
  date,
  uniteSymbole,
  onClose,
}: OtSourceDialogProps) {
  const {
    data: ot,
    isPending,
    isError,
    refetch,
  } = useQuery(relevesQueries.otSource(otId))

  return (
    <Dialog open={otId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Relevé du {formatDate(date)}</DialogTitle>
          <DialogDescription>
            {valeur !== null
              ? `Valeur mesurée : ${String(valeur)}${uniteSymbole ? ` ${uniteSymbole}` : ''}`
              : 'Ordre de travail source de ce relevé.'}
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <Skeleton className="h-40" />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : !ot ? (
          <p className="text-muted-foreground text-sm">
            L'ordre de travail source n'est plus accessible.
          </p>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{ot.nom_gamme}</span>
              <Badge variant="outline" className="shrink-0">
                {LIBELLES_STATUT[ot.statut] ?? ot.statut}
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Prestataire</dt>
              <dd>{ot.nom_prestataire}</dd>
              <dt className="text-muted-foreground">Équipement</dt>
              <dd>{ot.nom_equipement ?? '—'}</dd>
              <dt className="text-muted-foreground">Localisation</dt>
              <dd>{ot.nom_localisation ?? '—'}</dd>
              <dt className="text-muted-foreground">Périodicité</dt>
              <dd>{ot.libelle_periodicite}</dd>
              <dt className="text-muted-foreground">Date prévue</dt>
              <dd>{formatDate(ot.date_prevue)}</dd>
              <dt className="text-muted-foreground">Date de clôture</dt>
              <dd>{formatDate(ot.date_cloture)}</dd>
            </dl>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
