import type { ReactNode } from 'react'
import {
  PageHeader,
  type PageHeaderCrumb,
} from '@/components/common/page-header'

interface DrillPageHeaderProps {
  /** Titre de la page à la RACINE (ex. « Localisations »). */
  titreRacine: string
  /**
   * Ancêtres cliquables, **racine incluse** (typiquement le retour de
   * `drillCrumbs`). Vide ou absent = on est à la racine : aucun fil n'est rendu
   * et le titre vaut `titreRacine`.
   */
  ancetres?: PageHeaderCrumb[]
  /** Titre du nœud courant. Ignoré à la racine. */
  titre?: string
  /**
   * Description affichée à toutes les profondeurs, pour que la zone ne soit
   * jamais vide. Constante par section (Localisations, Équipements) ou portée
   * par le nœud (Plan de maintenance) — c'est à l'appelant de choisir.
   */
  description?: string
  /** Action du palier courant (bouton d'ajout, édition…). */
  action?: ReactNode
}

/**
 * En-tête d'un EXPLORATEUR À PALIERS : le titre suit le nœud où l'on se trouve,
 * et la racine n'est cliquable que lorsqu'on en est descendu.
 *
 * La règle est toujours la même — **à la racine, pas de fil ; ailleurs, le fil
 * s'ouvre par la racine et le nœud courant devient le titre** — mais elle était
 * réécrite à la main dans les trois explorateurs (Localisations, Équipements,
 * Plan de maintenance) et clonée dans deux panneaux de la Bibliothèque, sous la
 * forme d'une cascade `if / else if / else` d'une quarantaine de lignes chacune.
 * Cinq copies d'une même règle finissent par diverger : c'est déjà arrivé aux
 * descriptions, qui ne coïncident plus avec leur `PAGE_META` sur deux pages.
 *
 * Ce qui reste à l'appelant est ce qui varie légitimement : le titre du nœud,
 * ses ancêtres, sa description et l'action du palier.
 *
 * **Ne s'applique PAS aux panneaux de la Bibliothèque** (`catalogue-panel`,
 * `gammes-biblio-panel`), qui appliquent la même règle mais produisent un OBJET
 * `TabHeader` consommé par `<Tabs>` via `useTabHeader`, et non du JSX. Les y
 * forcer obligerait la brique à rendre autre chose qu'un en-tête : la
 * ressemblance est de surface, la nature diffère.
 */
export function DrillPageHeader({
  titreRacine,
  ancetres,
  titre,
  description,
  action,
}: DrillPageHeaderProps) {
  const aDescendu = ancetres !== undefined && ancetres.length > 0

  return (
    <PageHeader
      breadcrumb={aDescendu ? ancetres : undefined}
      title={aDescendu ? (titre ?? titreRacine) : titreRacine}
      description={description}
      action={action}
    />
  )
}
