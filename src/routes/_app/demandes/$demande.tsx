import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { demandesQueries } from '@/features/demandes/queries'
import { PAGE_META } from '@/features/demandes/page-meta'
import { DiDetail } from '@/features/demandes/components/di-detail'
import { diTitre } from '@/features/demandes/schemas'
import * as perm from '@/lib/permissions'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_app/demandes/$demande')({
  component: DemandeDetailPage,
})

function DemandeDetailPage() {
  const { demande: slug } = Route.useParams()

  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, role }) => (
        <DemandeResolver
          siteId={siteId}
          slug={slug}
          // Résolution/réouverture : rôles ayant accès opérationnel au site
          // (la RLS arbitre) — pas le canManage générique de la brique.
          canResolve={perm.canResolveDemande(role)}
        />
      )}
    </SiteScopedRoute>
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
        description:
          "Cette demande n'existe plus ou n'est pas accessible depuis ce site.",
        icon: PAGE_META.icone,
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
