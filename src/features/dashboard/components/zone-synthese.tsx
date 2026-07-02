import type { FenetreTemporelle } from '@/features/planning/use-fenetre-temporelle'
import { CadranDonutOt } from './cadran-donut-ot'
import { CadranBarresPlanning } from './cadran-barres-planning'
import { CadranSunburstGammes } from './cadran-sunburst-gammes'

interface ZoneSyntheseProps {
  siteId: string
  /**
   * Fenêtre temporelle PARTAGÉE (montée une seule fois par l'orchestrateur) :
   * transmise aux barres pour qu'elles restent synchronisées, au clavier, avec la
   * frise des reconductions (zone 2). Voir `dashboard.tsx`.
   */
  fenetre: FenetreTemporelle
}

/**
 * Zone 1 (haut de l'entonnoir) — Synthèse : trois cadrans, du général au concret —
 * donut « Ordres de travail » (reste à faire), barres empilées par semaine « Charge
 * par semaine », sunburst « Complétion des gammes ».
 *
 * Layout en flexbox À PLAT (`flex-wrap`), 3 comportements selon la place — les barres se
 * placent ENTRE les carrés si ça tient, sinon passent pleine largeur en dessous :
 *   - mobile (< 640px) : tout empilé, chaque carte PLEINE LARGEUR ;
 *   - moyen (640–1060px) : donut · sunburst CÔTE À CÔTE (chacun sa moitié, borné à 400px),
 *     et barres PLEINE LARGEUR en dessous (via `order-last` → elles passent en dernier) ;
 *   - large (≥ 1060px) : `donut │ barres │ sunburst` sur UNE ligne, barres AU MILIEU
 *     (`order-none`) remplissant l'espace restant ; les carrés reviennent à 340×340.
 * L'ordre DOM est donut, barres, sunburst → au large (order-none) les barres sont
 * naturellement au centre ; en dessous (order-last) elles descendent sous les deux carrés.
 * Au large, hauteur EXPLICITE `h-[340px]` sur les trois → le SVG des barres mesure une
 * hauteur réelle (sinon la carte restait vide). `justify-center` centre la paire de carrés
 * quand ils sont plafonnés. Aucun chevauchement possible (items flex).
 */
export function ZoneSynthese({ siteId, fenetre }: ZoneSyntheseProps) {
  return (
    <div className="flex flex-wrap justify-center gap-4">
      <CadranDonutOt siteId={siteId} />
      <CadranBarresPlanning
        siteId={siteId}
        fenetre={fenetre}
        className="order-last w-full @min-[1060px]:order-none @min-[1060px]:h-[340px] @min-[1060px]:w-auto @min-[1060px]:min-w-[340px] @min-[1060px]:flex-1"
      />
      <CadranSunburstGammes siteId={siteId} />
    </div>
  )
}
