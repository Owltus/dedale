import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * En-tête de section : titre `h3` (icône atténuée + libellé) et, à droite, une
 * action OPTIONNELLE (ex. bouton « + »). Source UNIQUE de l'en-tête de section
 * répété dans les onglets de fiche (Opérations, Équipements, Ordres de travail,
 * Modèles…). L'icône est passée en COMPOSANT (`LucideIcon`) et instanciée ici →
 * taille/couleur garanties uniformes. L'hôte fournit sa propre enveloppe.
 *
 * Ce fichier a longtemps exporté aussi un composant `Section` (enveloppe
 * `<section>` + en-tête + corps) que **personne n'utilisait** : les deux
 * consommateurs ne prenaient que l'en-tête. Il a été retiré.
 */
export function SectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon
  title: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </h3>
      {action}
    </div>
  )
}
