import { Construction } from 'lucide-react'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'

interface PageEnPreparationProps {
  titre: string
  description: string
}

/**
 * Écran d'une section ANNONCÉE mais pas encore construite.
 *
 * Ces entrées restent volontairement dans la navigation : leur présence annonce
 * ce qui arrive (décision du commanditaire). L'écran doit donc dire clairement
 * qu'il n'y a rien à voir *encore* — une page vide, elle, se lit comme un bug.
 *
 * Deux routes la consomment (`/registre`, `/releves`), qui étaient jusqu'ici
 * identiques à deux chaînes près : le jour où le message ou l'icône change, il
 * ne change qu'ici.
 */
export function PageEnPreparation({
  titre,
  description,
}: PageEnPreparationProps) {
  return (
    <PageContainer>
      <PageHeader title={titre} description={description} />
      <EmptyState
        icon={Construction}
        title="Section en préparation"
        description="Cette section est annoncée mais pas encore disponible. Elle apparaîtra ici dès qu’elle sera prête."
      />
    </PageContainer>
  )
}
