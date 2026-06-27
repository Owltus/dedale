import { Link } from '@tanstack/react-router'
import { OtStatutBadge } from '@/features/ordres-travail/components/ot-statut-badge'
import type { PlanningOt } from '@/features/planning/grille'
import { formatDate } from '@/lib/date'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface CelluleDialogProps {
  /** OT de la cellule cliquée (≥ 1), ou `null` si fermé. */
  ots: PlanningOt[] | null
  /** Libellé de la semaine (« S24 — 09/06 »). */
  titreSemaine: string
  onClose: () => void
}

/**
 * Petit dialog listant les OT d'une cellule (gamme × semaine).
 * Lecture seule : un lien optionnel renvoie vers la liste des OT du module.
 */
export function CelluleDialog({
  ots,
  titreSemaine,
  onClose,
}: CelluleDialogProps) {
  const open = ots !== null && ots.length > 0
  const liste = ots ?? []
  const titreGamme = liste[0]?.nom_gamme ?? ''

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">{titreGamme}</DialogTitle>
          <DialogDescription>
            {titreSemaine}
            {liste.length > 1
              ? ` — ${String(liste.length)} ordres de travail`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-2">
          {liste.map((ot) => (
            <li
              key={ot.id}
              className="border-border flex flex-col gap-2 rounded-md border p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground">
                  Prévu le {formatDate(ot.date_prevue)}
                </span>
                <OtStatutBadge
                  statut={ot.statut}
                  origine={ot.origine}
                  datePrevue={ot.date_prevue}
                  toleranceJours={ot.tolerance_jours}
                />
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <dt className="text-muted-foreground">Prestataire</dt>
                <dd className="truncate text-right">{ot.nom_prestataire}</dd>
                <dt className="text-muted-foreground">Équipement</dt>
                <dd className="truncate text-right">
                  {ot.nom_equipement ?? '—'}
                </dd>
                <dt className="text-muted-foreground">Périodicité</dt>
                <dd className="truncate text-right">
                  {ot.libelle_periodicite}
                </dd>
              </dl>
            </li>
          ))}
        </ul>

        <Button asChild variant="outline" className="w-full">
          <Link to="/ordres-travail">Voir les ordres de travail</Link>
        </Button>
      </DialogContent>
    </Dialog>
  )
}
