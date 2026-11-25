import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { demandesQueries } from '@/features/demandes/queries'
import { PAGE_META } from '@/features/demandes/page-meta'
import { DiDetail } from '@/features/demandes/components/di-detail'
import { diTitre } from '@/features/demandes/schemas'
import * as perm from '@/lib/permissions'
import { SlugDetailRoute } from '@/components/common/slug-detail-route'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'

// Via `getRouteApi` pour ne PAS inverser la dépendance features → routes.
const Route = getRouteApi('/_app/demandes/$demande')

export function DemandeEcran() {
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
  // Aperçu du tableau de bord (30 DI déjà en cache) : venir d'une de ses cartes
  // ouvre la fiche immédiatement, pendant que la liste complète se charge.
  const { data: apercu } = useQuery({
    ...demandesQueries.apercu(siteId),
    enabled: false,
  })
  // Mémoïsé par React Compiler : la resynchronisation d'URL est un ÉVÉNEMENT, pas
  // un effet de chaque rendu (contrat de `useSlugResolved`).
  const onSlugChange = (freshSlug: string) =>
    void navigate({
      to: '/demandes/$demande',
      params: { demande: freshSlug },
      replace: true,
    })

  return (
    <SlugDetailRoute
      options={demandesQueries.list(siteId)}
      slug={slug}
      // Slug dérivé du titre (1re ligne du constat) + repli par id : renommer la
      // DI ouverte resynchronise l'URL au lieu d'éjecter vers « introuvable ».
      identity={(d) => ({ nom: diTitre(d.constat), id: d.id })}
      onSlugChange={onSlugChange}
      apercu={apercu}
      // Lien `slug~id` : lecture directe de LA demande, jamais des 4 000+.
      parIdCourt={(court) => demandesQueries.parIdCourt(siteId, court)}
      title="Demande d'intervention"
      onBack={() => void navigate({ to: '/demandes' })}
      notFound={{
        title: "Cette demande n'existe plus",
        description:
          "Le lien est peut-être périmé, la demande a été supprimée, ou elle n'est pas accessible depuis ce site.",
        icon: PAGE_META.icone,
      }}
    >
      {(demande) => <DiDetail demande={demande} canResolve={canResolve} />}
    </SlugDetailRoute>
  )
}
