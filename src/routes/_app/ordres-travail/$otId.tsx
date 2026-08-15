import { createFileRoute } from '@tanstack/react-router'
import { OtDetail } from '@/features/ordres-travail/components/ot-detail'
import { PAGE_META } from '@/features/ordres-travail/page-meta'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'

/**
 * Détail d'un ordre de travail, sous-route dédiée `/ordres-travail/<id>`.
 *
 * SEULE route détail ciblée par IDENTIFIANT et non par slug, et c'est justifié :
 * un OT n'a pas de nom unique « sluggable » — plusieurs OT partagent le nom de
 * leur gamme, si bien qu'un slug lisible serait ambigu ou suffixé à chaque fois.
 *
 * `OtDetail` rend son propre `PageContainer` (en-tête fixe + corps défilant),
 * comme les fiches Travaux et Investissements.
 */
export const Route = createFileRoute('/_app/ordres-travail/$otId')({
  component: OtDetailPage,
})

function OtDetailPage() {
  const { otId } = Route.useParams()

  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, canManage }) => (
        <OtDetail otId={otId} siteId={siteId} canManage={canManage} />
      )}
    </SiteScopedRoute>
  )
}
