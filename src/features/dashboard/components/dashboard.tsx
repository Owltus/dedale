import { useRef } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common/error-state'
import { useColonnesAuto } from '@/features/planning/use-colonnes-auto'
import { useFenetreTemporelle } from '@/features/planning/use-fenetre-temporelle'
import { cardGrid } from '@/lib/responsive'
import { cn } from '@/lib/utils'
import { useDashboardData, useDashboardRealtime } from '../use-dashboard-data'
import {
  CHROME_CARTE,
  GAP_LISTE,
  HAUTEUR_LIGNE_XS,
  useElementHeight,
  useParentClientHeight,
} from '../use-lignes-visibles'
import { ZoneSynthese } from './zone-synthese'
import { FriseReconductions } from './frise-reconductions'
import { DernieresDemandes } from './dernieres-demandes'
import { DerniersDocuments } from './derniers-documents'
import { PremiersPas } from './premiers-pas'

interface DashboardProps {
  siteId: string
}

// Géométrie propre au corps de page, pour DÉDUIRE la place de la zone 3 sans la mesurer
// (instable une fois le plancher posé) : padding bas (`pb-6` = 24) et gap entre les 3
// zones (`gap-4` = 16, deux gaps). Les constantes de LIGNE (hauteur/gap/chrome) viennent
// de `use-lignes-visibles` — source unique partagée avec les cartes.
const PB_PAGE = 24
const GAP_ZONE = 16

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

  // Bascule « FILL-OR-SCROLL ». On DÉDUIT la place de la zone 3 (sans la mesurer
  // directement, ce qui serait instable une fois le plancher appliqué) : hauteur VISIBLE du
  // corps de page (`useParentClientHeight`, base fixe) − les zones 1/2 (fixes) − les marges.
  // Par défaut (place pour ≥ ~1 ligne) : comportement normal, les cartes remplissent la
  // zone et le fit-to-height ajuste les lignes, SANS scrollbar. Seulement si la place ne
  // permet même pas ~1 ligne (`contraint`), on pose un PLANCHER de 8 lignes qui fait
  // GRANDIR le tableau → la page défile (plutôt que d'écraser les cartes à néant).
  const rootRef = useRef<HTMLDivElement>(null)
  const zone1Ref = useRef<HTMLDivElement>(null)
  const hauteurCorps = useParentClientHeight(rootRef)
  const hauteurZone1 = useElementHeight(zone1Ref)
  const hauteurZone2 = useElementHeight(mesureRef)
  const dispoZone3 =
    hauteurCorps - PB_PAGE - hauteurZone1 - hauteurZone2 - 2 * GAP_ZONE
  const lignesPossibles = Math.floor(
    (dispoZone3 - CHROME_CARTE + GAP_LISTE) / (HAUTEUR_LIGNE_XS + GAP_LISTE),
  )
  const contraint = hauteurCorps > 0 && hauteurZone1 > 0 && lignesPossibles <= 1

  if (ordresTravailQuery.isPending) {
    return (
      <div className="space-y-6">
        <div className={cardGrid.default}>
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

  // Classe des 2 cellules zone 3 (identiques). Plancher en mode contraint :
  // `md:min-h-[27rem]` = 8 lignes (8×44 + 7×8 gaps + 24 chrome = 432 px = 27 rem) ;
  // classe LITTÉRALE (Tailwind extrait les classes statiquement, pas de valeur calculée).
  const classeCellule = cn(
    'min-w-0 md:flex md:min-h-0 md:flex-1 md:flex-col',
    contraint && 'md:min-h-[27rem]',
  )

  // Layout adaptatif (aucun breakpoint viewport codé à la main) :
  //  - COMPORTEMENT NORMAL : `md:flex-1 md:min-h-0` → le tableau est borné à la fenêtre,
  //    la zone 3 (`flex-1 min-h-0`) rétrécit à la place restante et les cartes la
  //    remplissent (le fit-to-height ajuste le nombre de lignes), SANS scrollbar.
  //  - BASCULE (uniquement si la place ne permet même pas ~1 ligne, cf. `contraint`) : on
  //    pose un PLANCHER `md:min-h-[27rem]` (~8 lignes) sur les cellules → elles débordent
  //    la zone 3 (qui reste `min-h-0` pour rester MESURABLE) et le parent (`overflow-y-auto`,
  //    cf. `_app/index.tsx`) reprend la scrollbar. Ailleurs, aucun plancher → pas de scroll
  //    prématuré. Sur mobile (sans `md:`) : hauteur naturelle, empilé, le parent défile.
  //  - Zones 1 et 3 s'adaptent à la LARGEUR DISPONIBLE via des container queries
  //    (`@container`) : la zone 1 par paliers `[1 col → 2 col → auto|1fr|auto]` (carrés
  //    compacts, barres greedy, zéro vide), la zone 3 par `auto-fit`/`minmax(min(N,100%),1fr)`
  //    (`min(N,100%)` interdit tout débordement horizontal sous N px).
  return (
    <div
      ref={rootRef}
      className={cn(
        'flex flex-col gap-4 md:flex-1',
        // Normal : borné (`md:min-h-0`) + `overflow-hidden` → aucune scrollbar (même
        // sub-pixel). Contraint : les deux sont LEVÉS → le plancher des cellules fait
        // grandir le tableau au-delà de la fenêtre, et le parent (`overflow-y-auto`)
        // reprend la scrollbar de page.
        !contraint && 'md:min-h-0 md:overflow-hidden',
      )}
    >
      {/* Zone 1 — Synthèse : simple flexbox (cf. `ZoneSynthese`). `@container` fournit le
          contexte de mesure pour la bascule colonne → ligne selon la place disponible. Le
          `ref` sert à connaître sa hauteur (base du calcul de place de la zone 3). */}
      <div ref={zone1Ref} className="@container shrink-0">
        <ZoneSynthese siteId={siteId} fenetre={fenetre} />
      </div>

      {/* Zone 2 — Échéances : frise pilotée par la MÊME fenêtre. Le wrapper (pleine
          largeur, sans padding horizontal) sert de conteneur de mesure au calcul
          `useColonnesAuto` du `nbSemaines` partagé. */}
      <div ref={mesureRef} className="shrink-0">
        <FriseReconductions siteId={siteId} fenetre={fenetre} />
      </div>

      {/* Zone 3 — Action : chaîne 100 % FLEX (zéro grid, zéro hauteur en %). NORMAL : `flex-1
          min-h-0` → la zone absorbe la place restante, les cartes la remplissent et le
          fit-to-height ajuste les lignes (aucun scroll). CONTRAINT (place < ~1 ligne) : le
          `min-h-0` est LEVÉ ici ET sur le tableau, et le PLANCHER `md:min-h-[27rem]` (~8
          lignes) des cellules « remonte » alors la hauteur minimale → le tableau grandit et
          la page défile. Sous `md` : `flex-col` (2 cartes empilées). Dès `md` : `md:flex-row`
          (sans wrap → TOUJOURS 2 colonnes côte à côte via `min-w-0`), `align-items:stretch`
          donne à chaque cellule la hauteur de la zone. */}
      <div
        className={cn(
          'flex flex-1 flex-col gap-4 md:flex-row',
          !contraint && 'min-h-0',
        )}
      >
        <div className={classeCellule}>
          <DernieresDemandes siteId={siteId} />
        </div>
        <div className={classeCellule}>
          <DerniersDocuments siteId={siteId} />
        </div>
      </div>
    </div>
  )
}
