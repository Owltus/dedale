import { OtCard } from '@/features/ordres-travail/components/ot-card'
import { trierOtParUrgence } from '@/features/ordres-travail/tri'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import type { PlanningOt } from '@/features/planning/grille'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface CelluleDialogProps {
  /** OT à lister (≥ 2 ; un seul OT redirige direct, cf. page planning), ou `null` si fermé. */
  ots: PlanningOt[] | null
  /** Titre principal : la sous-catégorie (clic cellule) ou la semaine (clic n° de semaine). */
  titre: string
  /** Ligne secondaire optionnelle (la semaine, pour un clic sur une cellule). */
  sousTitre?: string
  onClose: () => void
}

/**
 * Dialog listant des OT du planning — soit une cellule (sous-catégorie × semaine),
 * soit une semaine entière (clic sur le n° de semaine). N'ouvre que pour PLUSIEURS
 * OT (un seul redirige directement vers sa fiche, cf. `planning.tsx`). Coquille à
 * TROIS zones (en-tête FIXE / liste DÉFILANTE / pied FIXE, calquée sur `FormDialog`)
 * bornée à 85vh : seule la liste scrolle, le titre reste visible. Chaque OT est rendu
 * via `OtCard` en mode `compact` (la MÊME carte que la page liste, variante dense →
 * pas de débordement dans ce modal étroit). Le statut suit le coloriage de la grille
 * (`simplifierStatut`). Clic sur une carte = ouverture du détail de l'OT.
 */
export function CelluleDialog({
  ots,
  titre,
  sousTitre,
  onClose,
}: CelluleDialogProps) {
  const open = ots !== null && ots.length > 0
  const liste = trierOtParUrgence(ots ?? [])
  // Vignettes résolues UNE fois pour toute la liste du popup (un seul canal Realtime).
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  // Le modal ne s'ouvre que pour ≥ 2 OT (1 seul → redirection directe, cf. planning.tsx) :
  // le compte est donc toujours pluriel. Description = [semaine éventuelle] + compte.
  const compte = `${String(liste.length)} ordres de travail`
  const description = [sousTitre, compte].filter(Boolean).join(' — ')

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle className="truncate">{titre}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Corps DÉFILANT : seule la liste scrolle (`overflow-x-hidden` en ceinture). */}
        <div className="min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto px-6 pt-1 pb-6">
          {liste.map((ot) => (
            <OtCard
              key={ot.id}
              ot={ot}
              urlOf={urlOf}
              refreshMiniatures={refreshMiniatures}
              // Statut simplifié + carte dense (cohérent avec la grille, sans débordement).
              simplifierStatut
              compact
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
