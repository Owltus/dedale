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
 * Zone 1 (haut de l'entonnoir) — Synthèse : trois cadrans côte à côte, du général
 * au concret — donut « Ordres de travail » (reste à faire), barres empilées par
 * semaine « Charge par semaine », sunburst « Complétion des gammes ».
 *
 * Grille `auto-fit` : chaque cadran se masque proprement quand il n'a rien à
 * montrer (le donut se rend `null` si aucun OT à faire, le sunburst `null` si aucune
 * gamme). `auto-fit` collapse alors la piste vide → les cadrans restants se
 * réharmonisent pour occuper toute la largeur, sans trou. Mobile-first : sous
 * ~20rem, les cadrans s'empilent (une colonne).
 */
export function ZoneSynthese({ siteId, fenetre }: ZoneSyntheseProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
      <CadranDonutOt siteId={siteId} />
      <CadranBarresPlanning siteId={siteId} fenetre={fenetre} />
      <CadranSunburstGammes siteId={siteId} />
    </div>
  )
}
