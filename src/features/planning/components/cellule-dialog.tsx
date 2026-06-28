import { Link } from '@tanstack/react-router'
import { OtCard } from '@/features/ordres-travail/components/ot-card'
import { trierOtParUrgence } from '@/features/ordres-travail/tri'
import type { PlanningOt } from '@/features/planning/grille'
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
  /** Relevés du site (`ot_id → « 80 kWh »`) — même map que la page liste. */
  releveParOt: ReadonlyMap<string, string>
  /** Libellé de la semaine (« S24 — 09/06 »). */
  titreSemaine: string
  onClose: () => void
}

/**
 * Petit dialog listant les OT d'une cellule (gamme × semaine).
 * Chaque OT est rendu via `OtCard` — la MÊME carte que la page liste et la fiche
 * gamme — pour qu'une évolution de la carte se répercute ici aussi. Clic sur une
 * carte = ouverture du détail de l'OT.
 */
export function CelluleDialog({
  ots,
  releveParOt,
  titreSemaine,
  onClose,
}: CelluleDialogProps) {
  const open = ots !== null && ots.length > 0
  const liste = trierOtParUrgence(ots ?? [])
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

        <div className="flex flex-col gap-2">
          {liste.map((ot) => (
            <OtCard key={ot.id} ot={ot} releve={releveParOt.get(ot.id) ?? null} />
          ))}
        </div>

        <Button asChild variant="outline" className="w-full">
          <Link to="/ordres-travail">Voir les ordres de travail</Link>
        </Button>
      </DialogContent>
    </Dialog>
  )
}
