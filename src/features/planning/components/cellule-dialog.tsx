import { useQuery } from '@tanstack/react-query'
import { OtCard } from '@/features/ordres-travail/components/ot-card'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import type { DocumentMeta } from '@/features/documents/format'
import { trierOtParUrgence } from '@/features/ordres-travail/tri'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { useSiteContext } from '@/lib/site-context'
import type { PlanningOt } from '@/features/planning/grille'
import { DialogShell } from '@/components/common/dialog-shell'

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
  // Documents rattachés aux OT du site actif, en UNE requête groupée filtrée
  // par site — pas de prop `siteId` ici (popup réutilisée par le planning ET
  // le tableau de bord) → lu directement via `useSiteContext` (cf.
  // `ordresTravailQueries.documentsParOt`).
  const { activeSiteId } = useSiteContext()
  const documentsQuery = useQuery(
    ordresTravailQueries.documentsParOt(activeSiteId),
  )
  const documentsParOt =
    documentsQuery.data ?? new Map<string, DocumentMeta[]>()
  // Le modal ne s'ouvre que pour ≥ 2 OT (1 seul → redirection directe, cf. planning.tsx) :
  // le compte est donc toujours pluriel. Description = [semaine éventuelle] + compte.
  const compte = `${String(liste.length)} ordres de travail`
  const description = [sousTitre, compte].filter(Boolean).join(' — ')

  return (
    <DialogShell
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      // `truncate` porté par un bloc interne (le titre reste sur une seule ligne).
      title={<span className="block truncate">{titre}</span>}
      description={description}
      // `lg` et non `sm` : à 384 px, TOUS les titres d'OT étaient tronqués
      // (« Relevé mensuel du c… ») — on ne pouvait pas identifier ce qu'on
      // regardait. La largeur passe toujours par `size` : un `contentClassName`
      // de largeur serait neutralisé sur desktop par le `sm:max-w-*` de
      // DialogShell.
      size="lg"
      // Corps DÉFILANT : seule la liste scrolle (`overflow-x-hidden` en ceinture).
      bodyClassName="min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto px-6 pt-1 pb-6"
    >
      {liste.map((ot) => (
        <OtCard
          key={ot.id}
          ot={ot}
          urlOf={urlOf}
          refreshMiniatures={refreshMiniatures}
          documents={documentsParOt.get(ot.id) ?? []}
          // Statut simplifié + carte dense (cohérent avec la grille, sans débordement).
          simplifierStatut
          compact
        />
      ))}
    </DialogShell>
  )
}
