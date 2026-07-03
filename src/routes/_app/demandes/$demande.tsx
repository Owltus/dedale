import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
import { demandesQueries } from '@/features/demandes/queries'
import { DiDetail } from '@/features/demandes/components/di-detail'
import { diTitre } from '@/features/demandes/schemas'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import * as perm from '@/lib/permissions'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_app/demandes/$demande')({
  component: DemandeDetailPage,
})

function DemandeDetailPage() {
  const { demande: slug } = Route.useParams()
  const { data: role } = useCurrentRole()
  // Résolution/réouverture : rôles ayant accès opérationnel au site (RLS arbitre).
  const canResolve = perm.canResolveDemande(role)
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Demandes d'intervention"
        description="Signalements curatifs du site."
        hint="Choisis un site pour voir ses demandes d'intervention."
        icon={ClipboardList}
      />
    )
  }

  return (
    <DemandeResolver
      siteId={activeSiteId}
      slug={slug}
      canResolve={canResolve}
    />
  )
}

function DemandeResolver({
  siteId,
  slug,
  canResolve,
}: {
  siteId: string
  slug: string
  canResolve: boolean
}) {
  const navigate = useNavigate()

  return (
    <SlugDetailRoute
      options={demandesQueries.list(siteId)}
      slug={slug}
      // Slug dérivé du titre (1re ligne du constat) + repli par id : renommer la
      // DI ouverte resynchronise l'URL au lieu d'éjecter vers « introuvable ».
      identity={(d) => ({ nom: diTitre(d.constat), id: d.id })}
      onSlugChange={(freshSlug) =>
        void navigate({
          to: '/demandes/$demande',
          params: { demande: freshSlug },
          replace: true,
        })
      }
      title="Demande d'intervention"
      onBack={() => void navigate({ to: '/demandes' })}
      notFound={{
        title: 'Demande introuvable',
        description: "Cette demande n'existe plus ou ne t'est pas accessible.",
        icon: ClipboardList,
        action: (
          <Button asChild>
            <Link to="/demandes">Retour aux demandes</Link>
          </Button>
        ),
      }}
    >
      {(demande) => <DiDetail demande={demande} canResolve={canResolve} />}
    </SlugDetailRoute>
  )
}
