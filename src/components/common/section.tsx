import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * En-tête de section : titre `h3` (icône atténuée + libellé) et, à droite, une
 * action OPTIONNELLE (ex. bouton « + »). Source UNIQUE de l'en-tête de section
 * répété dans les onglets de fiche (Opérations, Équipements, Ordres de travail,
 * Modèles…). L'icône est passée en COMPOSANT (`LucideIcon`) et instanciée ici →
 * taille/couleur garanties uniformes. À utiliser seul quand l'hôte gère déjà sa
 * propre enveloppe ; sinon préférer `Section`.
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
        <Icon className="text-muted-foreground size-4" />
        {title}
      </h3>
      {action}
    </div>
  )
}

/**
 * Section d'onglet/fiche : enveloppe `<section>` + `SectionHeader` + corps.
 * Gabarit homogène (`flex flex-col gap-3`) partagé par les onglets de la fiche
 * gamme (Ordres de travail / Opérations / Équipements) et les fiches Bibliothèque.
 */
export function Section({
  icon,
  title,
  action,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <SectionHeader icon={icon} title={title} action={action} />
      {children}
    </section>
  )
}
