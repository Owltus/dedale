import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { OtDetail } from '@/features/ordres-travail/components/ot-detail'
import { useCurrentRole } from '@/hooks/use-current-role'
import * as perm from '@/lib/permissions'

/**
 * Détail d'un ordre de travail, sous-route dédiée `/ordres-travail/<id>`. L'OT
 * est ciblé par son identifiant (un OT n'a pas de nom unique « sluggable » :
 * plusieurs OT partagent le nom de gamme). `OtDetail` rend son propre
 * `PageContainer` (en-tête fixe + corps défilant), comme les fiches Travaux /
 * Investissements.
 */
export const Route = createFileRoute('/_app/ordres-travail/$otId')({
  component: OtDetailPage,
})

function OtDetailPage() {
  const { otId } = Route.useParams()
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const navigate = useNavigate()

  return (
    <OtDetail
      otId={otId}
      canManage={canManage}
      onBack={() => void navigate({ to: '/ordres-travail' })}
    />
  )
}
