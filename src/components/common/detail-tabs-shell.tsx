import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { SubTabs, type SubTabItem } from '@/components/common/sub-tabs'

/**
 * Classe de l'état vide d'un ONGLET de fiche : hauteur plancher + centrage.
 *
 * Source unique, parce que les trois fiches à onglets divergeaient — l'une en
 * `min-h-full`, les autres en `min-h-40 flex-1`. La seconde forme l'emporte :
 * elle est majoritaire (cinq emplacements contre un) et ne dépend pas d'un
 * parent de hauteur définie, là où `min-h-full` déborde si le conteneur n'en a
 * pas. (Le plan initial retenait l'inverse ; le code a tranché autrement.)
 */
export const ONGLET_ETAT_VIDE = 'min-h-40 flex-1 justify-center'

interface DetailTabsShellProps<T extends string> {
  /**
   * En-tête FIXE tout en haut (ex. `<PageHeader … />`). Optionnel : certaines
   * fiches portent leur en-tête plus haut (explorateur parent).
   */
  header?: ReactNode
  /**
   * Carte d'en-tête (ex. `<DetailHeaderCard … />`) rendue sous l'en-tête,
   * au-dessus des onglets. Optionnelle. **Ne pas lui passer de marge** : la
   * brique porte la sienne (`mb-4`) depuis qu'elle avait divergé sur sept
   * fiches — une marge ajoutée ici la doublerait.
   */
  headerCard?: ReactNode
  /** Onglets (rendus en `SubTabs` variante `segmented`). */
  items: SubTabItem<T>[]
  value: T
  onValueChange: (id: T) => void
  /** Nom ARIA de la barre d'onglets (ex. « Sections de la fiche »). */
  tabsAriaLabel: string
  /** Corps de l'onglet actif, rendu dans la zone défilante. */
  children: (onglet: T) => ReactNode
  /**
   * Surcouche rendue DANS la zone défilante (`relative`), ex.
   * `<FileDropOverlay show={dragging} />`. Optionnelle.
   */
  overlay?: ReactNode
  /** Classe du conteneur RACINE (padding / hauteur selon l'hôte). */
  className?: string
  /**
   * Classe ADDITIONNELLE de la zone défilante (ex. onglet en SPLIT :
   * `flex flex-col lg:overflow-hidden`). Optionnelle.
   */
  bodyClassName?: string
}

/**
 * Coquille d'une FICHE À ONGLETS : bloc d'en-tête FIXE (en-tête + carte
 * `DetailHeaderCard` + barre `SubTabs` segmentée) puis zone de contenu DÉFILANTE
 * `no-scrollbar` qui rend l'onglet actif. Seul le corps défile → l'en-tête et les
 * onglets restent visibles. Source unique de la géométrie partagée par les fiches
 * (gamme, prestataire…) ; l'hôte garde son chrome de page (PageContainer, top bar)
 * autour et pilote l'onglet actif (`value` / `onValueChange`).
 */
export function DetailTabsShell<T extends string>({
  header,
  headerCard,
  items,
  value,
  onValueChange,
  tabsAriaLabel,
  children,
  overlay,
  className,
  bodyClassName,
}: DetailTabsShellProps<T>) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="shrink-0">
        {header}
        {headerCard}
        <SubTabs
          ariaLabel={tabsAriaLabel}
          variant="segmented"
          value={value}
          onValueChange={onValueChange}
          items={items}
        />
      </div>

      <div
        className={cn(
          'no-scrollbar relative min-h-0 flex-1 overflow-y-auto',
          bodyClassName,
        )}
      >
        {children(value)}
        {overlay}
      </div>
    </div>
  )
}
