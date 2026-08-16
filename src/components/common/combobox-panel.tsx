import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Panneau FLOTTANT d'un combobox maison : surimpression sous le champ, hauteur
 * bornée avec défilement interne (il n'agrandit jamais la modale qui l'accueille).
 *
 * **Pourquoi une brique de panneau, et pas un `ComboBox` complet.** Les deux
 * comboboxes de l'app ont des interactions délibérément différentes : le
 * sélecteur de modèle de demande est un BOUTON déclencheur qui ouvre une liste
 * complète, celui de lieu est un CHAMP de recherche libre qui propose des
 * suggestions filtrées. Les fondre dans une seule brique aurait demandé une
 * poignée de drapeaux booléens — le signe, dit le skill `brique-commune`, qu'il
 * fallait deux composants. Ce qui était réellement dupliqué, c'est ce panneau :
 * mêmes classes de positionnement, à deux divergences près qui n'avaient aucune
 * raison d'être (`max-h-64` contre `max-h-72`, et un fond `bg-card` là où tous
 * les panneaux Radix de l'app utilisent `bg-popover`).
 *
 * Porte `role="listbox"` : les options doivent donc être des `role="option"`, et
 * le champ qui commande le panneau `aria-expanded` + `aria-controls` pointant sur
 * son `id`.
 */
export function ComboBoxPanel({
  className,
  children,
  ...props
}: ComponentProps<'ul'>) {
  return (
    <ul
      role="listbox"
      className={cn(
        'absolute top-full right-0 left-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
        className,
      )}
      {...props}
    >
      {children}
    </ul>
  )
}
