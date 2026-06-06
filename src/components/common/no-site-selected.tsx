import type { LucideIcon } from 'lucide-react'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'

/**
 * Écran affiché quand aucun site n'est sélectionné. Factorise la garde répétée
 * sur les pages métier : en-tête de page (titre + tagline) + invitation à
 * choisir un site. `hint` est le texte de l'EmptyState propre à la page.
 */
export function NoSiteSelected({
  title,
  description,
  hint,
  icon,
}: {
  title: string
  description: string
  hint: string
  icon: LucideIcon
}) {
  return (
    <PageContainer>
      <PageHeader title={title} description={description} />
      <EmptyState icon={icon} title="Sélectionne un site" description={hint} />
    </PageContainer>
  )
}
