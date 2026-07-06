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
  //  - `md:flex-1 md:min-h-0` → le tableau REMPLIT son parent (une colonne flex de hauteur
  //    DÉFINIE, cf. `_app/index.tsx`) via la CHAÎNE FLEX — bornage fiable, sans hauteur en
  //    pourcentage. La zone 3 (`flex-1`, `min-h-0`) rétrécit alors à la place restante ; ses
  //    cartes Demandes/Documents la remplissent (`h-full`) jusqu'au bas de la fenêtre et le
  //    fit-to-height n'affiche QUE des lignes ENTIÈRES (pas de demi-ligne). Le parent
  //    `md:overflow-hidden` garantit zéro scrollbar. Sur mobile (sans le `md:`) le tableau
  //    garde sa hauteur naturelle et le parent défile.
  //  - Zones 1 et 3 s'adaptent à la LARGEUR DISPONIBLE via des container queries
  //    (`@container`) : la zone 1 par paliers `[1 col → 2 col → auto|1fr|auto]` (carrés
  //    compacts, barres greedy, zéro vide), la zone 3 par `auto-fit`/`minmax(min(N,100%),1fr)`
  //    (`min(N,100%)` interdit tout débordement horizontal sous N px).
  return (
    <div className="flex flex-col gap-4 md:min-h-0 md:flex-1">
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

      {/* Zone 3 — Action : chaîne 100 % FLEX (zéro grid, zéro hauteur en %). `flex-1` +
          `min-h-0` → la zone absorbe TOUTE la hauteur restante SANS plancher (bornage
          fiable hérité de la colonne flex parente de hauteur définie, cf.
          `_app/index.tsx` en `md:overflow-hidden`). Sous `md` : `flex-col` → les 2 cartes
          s'empilent à leur hauteur naturelle et le corps de page défile. Dès `md` :
          `md:flex-row` (sans wrap → TOUJOURS 2 colonnes côte à côte, elles rétrécissent
          via `min-w-0` au lieu de passer à la ligne) et `align-items:stretch` (défaut)
          donne à chaque cellule la hauteur DÉFINIE de la zone. Chaque cellule est alors
          une colonne flex bornée (`md:flex md:flex-col md:min-h-0 md:flex-1`) : la carte
          (`h-full` + `md:flex-1 md:min-h-0`) la remplit jusqu'au bas de la fenêtre, sa
          zone de liste (mesurée par `useLignesVisibles`) est enfin contrainte, et le
          fit-to-height RÉDUIT le nombre de lignes au lieu de laisser la carte déborder
          puis être rognée. `min-h-0` partout est ESSENTIEL (retire le plancher
          `min-height:auto` des items flex). */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        <div className="min-w-0 md:flex md:min-h-0 md:flex-1 md:flex-col">
          <DernieresDemandes siteId={siteId} />
        </div>
        <div className="min-w-0 md:flex md:min-h-0 md:flex-1 md:flex-col">
          <DerniersDocuments siteId={siteId} />
        </div>
      </div>
    </div>
  )
}
