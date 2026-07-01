import { useRef } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common/error-state'
import { useColonnesAuto } from '@/features/planning/use-colonnes-auto'
import { useFenetreTemporelle } from '@/features/planning/use-fenetre-temporelle'
import { useDashboardData, useDashboardRealtime } from '../use-dashboard-data'
import { ZoneSynthese } from './zone-synthese'
import { FriseReconductions } from './frise-reconductions'
import { DernieresDemandes } from './dernieres-demandes'
import { DerniersDocuments } from './derniers-documents'
import { PremiersPas } from './premiers-pas'

interface DashboardProps {
  siteId: string
}

/**
 * Orchestrateur du tableau de bord du site actif. Assemble les zones de l'entonnoir
 * (du général au concret) :
 *   Zone 1 — Synthèse : donut OT / barres planning / sunburst gammes ;
 *   Zone 2 — Échéances : frise des reconductions de contrats ;
 *   Zone 3 — Action : listes Demandes d'intervention + Documents récents.
 * Base quasi vierge (aucun OT) → le guide « Premiers pas » REMPLACE tout le tableau.
 *
 * Deux responsabilités transverses sont portées ICI, une seule fois, pour ne pas les
 * dupliquer par cadran :
 * - **Realtime** : `useDashboardRealtime()` monte l'unique jeu d'abonnements Supabase
 *   (un canal par table) → toute modification ailleurs recalcule la page.
 * - **Fenêtre temporelle PARTAGÉE** : un seul `useColonnesAuto` (mesuré sur un
 *   conteneur pleine largeur) alimente un seul `useFenetreTemporelle` (donc un seul
 *   listener clavier). Le même `centre` est passé aux barres (zone 1) ET à la frise
 *   (zone 2) → les flèches ← → déplacent les deux de la même période, sans double bond.
 */
export function Dashboard({ siteId }: DashboardProps) {
  // Unique jeu d'abonnements realtime du tableau de bord.
  useDashboardRealtime()

  // Fenêtre temporelle partagée barres ↔ frise : mesurée sur un conteneur pleine
  // largeur (le wrapper de la frise, sans padding horizontal → `clientWidth` juste)
  // pour un `nbSemaines` responsive, montée UNE fois → un seul listener clavier.
  const mesureRef = useRef<HTMLDivElement>(null)
  const { nbSemaines } = useColonnesAuto(mesureRef)
  const fenetre = useFenetreTemporelle({ nbSemaines })

  const { ordresTravailQuery } = useDashboardData(siteId)

  if (ordresTravailQuery.isPending) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(20rem,100%),1fr))] gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (ordresTravailQuery.isError) {
    return (
      <ErrorState
        message="Impossible de charger le tableau de bord."
        onRetry={() => void ordresTravailQuery.refetch()}
      />
    )
  }

  // Base quasi vierge : le guide d'amorçage REMPLACE le tableau de bord.
  if (ordresTravailQuery.data.length === 0) {
    return <PremiersPas siteId={siteId} />
  }

  return (
    <div className="space-y-6">
      {/* Zone 1 — Synthèse (barres pilotées par la fenêtre partagée). */}
      <ZoneSynthese siteId={siteId} fenetre={fenetre} />

      {/* Zone 2 — Échéances : frise pilotée par la MÊME fenêtre. Le wrapper (pleine
          largeur, sans padding horizontal) sert de conteneur de mesure au calcul
          `useColonnesAuto` du `nbSemaines` partagé. */}
      <div ref={mesureRef}>
        <FriseReconductions siteId={siteId} fenetre={fenetre} />
      </div>

      {/* Zone 3 — Action : deux listes (1 colonne en mobile, 2 dès lg). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DernieresDemandes siteId={siteId} />
        <DerniersDocuments siteId={siteId} />
      </div>
    </div>
  )
}
