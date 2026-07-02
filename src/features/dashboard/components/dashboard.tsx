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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

  // Layout INTRINSÈQUEMENT adaptatif (aucun breakpoint viewport codé à la main) :
  //  - `md:min-h-full` → « fill-or-scroll » : le tableau de bord remplit AU MOINS la
  //    hauteur du body (la zone 3 en `flex-1` absorbe le vide → pas de trou en bas) mais
  //    peut GRANDIR au-delà quand la fenêtre est trop basse → le body (`overflow-y-auto`)
  //    prend alors la scrollbar. C'est le seul cas où une scrollbar réapparaît.
  //  - Zones 1 et 3 s'adaptent à la LARGEUR DISPONIBLE via des container queries
  //    (`@container`) : la zone 1 par paliers `[1 col → 2 col → auto|1fr|auto]` (carrés
  //    compacts, barres greedy, zéro vide), la zone 3 par `auto-fit`/`minmax(min(N,100%),1fr)`
  //    (`min(N,100%)` interdit tout débordement horizontal sous N px).
  return (
    <div className="flex flex-col gap-4 md:min-h-full">
      {/* Zone 1 — Synthèse : simple flexbox (cf. `ZoneSynthese`). `@container` fournit le
          contexte de mesure pour la bascule colonne → ligne selon la place disponible. */}
      <div className="@container shrink-0">
        <ZoneSynthese siteId={siteId} fenetre={fenetre} />
      </div>

      {/* Zone 2 — Échéances : frise pilotée par la MÊME fenêtre. Le wrapper (pleine
          largeur, sans padding horizontal) sert de conteneur de mesure au calcul
          `useColonnesAuto` du `nbSemaines` partagé. */}
      <div ref={mesureRef} className="shrink-0">
        <FriseReconductions siteId={siteId} fenetre={fenetre} />
      </div>

      {/* Zone 3 — Action : grille intrinsèque `auto-fit` (2 colonnes dès ~300px de
          place par carte, sinon empilées). `flex-1` + `content-stretch` → elle absorbe
          la hauteur restante et étire les cartes (fit-to-height : plus de lignes quand il
          y a la place). `md:min-h-[340px]` = MÊME taille de référence que les cadrans :
          chaque carte de la page fait au moins cette taille, un plancher qui ne « mord »
          que quand la place manque (sinon la page défile, cf. `md:min-h-full`). */}
      <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] content-stretch gap-4 md:min-h-[340px]">
        <div className="min-w-0">
          <DernieresDemandes siteId={siteId} />
        </div>
        <div className="min-w-0">
          <DerniersDocuments siteId={siteId} />
        </div>
      </div>
    </div>
  )
}
