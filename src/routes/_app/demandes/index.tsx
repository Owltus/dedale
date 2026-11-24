import { useCallback, useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'
import { ClipboardList, Plus } from 'lucide-react'
import { demandesQueries } from '@/features/demandes/queries'
import { DiFormDialog } from '@/features/demandes/components/di-form-dialog'
import { useActionsDemande } from '@/features/demandes/use-actions-demande'
import { diTitre } from '@/features/demandes/schemas'
import { LIEU_NON_PRECISE } from '@/features/demandes/lieux-par-di'
import { TitreLieu } from '@/features/demandes/components/titre-lieu'
import { statutLabel, statutTone } from '@/features/demandes/etat'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import {
  PAUSE_RECHERCHE_MS,
  useValeurApresPause,
} from '@/hooks/use-valeur-apres-pause'
import { useAuth } from '@/auth'
import { formatDateAvecSemaineIso } from '@/lib/date'
import { segAlias } from '@/lib/slug'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ListPageBody } from '@/components/common/list-page-body'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/demandes/page-meta'
import { BoutonDmbook } from '@/features/dmbook/components/bouton-dmbook'
import { useSiteContext } from '@/lib/site-context'
import { ErrorState } from '@/components/common/error-state'
import { ListRow } from '@/components/common/list-row'
import { VirtualList } from '@/components/common/virtual-list'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import {
  statutFilterOptions,
  FILTRE_NON_TERMINES,
} from '@/components/common/list-filter-bar'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'
import { StatutColonne } from '@/components/common/statut-colonne'
import { STATUT_DI_CLOTURE } from '@/features/demandes/etat'
export const Route = createFileRoute('/_app/demandes/')({
  component: DemandesPage,
})

function DemandesPage() {
  const { session } = useAuth()

  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, role }) => (
        <DemandesContent
          siteId={siteId}
          // lecteur = lecture seule ; les autres rôles peuvent créer une DI
          // (la RLS arbitre) — pas le canManage générique de la brique.
          canCreate={perm.canCreateDemande(role)}
          role={role}
          userId={session?.user.id}
        />
      )}
    </SiteScopedRoute>
  )
}

function DemandesContent({
  siteId,
  canCreate,
  role,
  userId,
}: {
  siteId: string
  canCreate: boolean
  role: perm.Role
  userId: string | undefined
}) {
  const navigate = useNavigate()
  const { activeSite } = useSiteContext()
  const { actionsDe, dialogues } = useActionsDemande({ siteId, role, userId })
  // Rôles métier : bouton de connexion Dmbook (D19).
  const canResolve = perm.canResolveDemande(role)
  // Liste LIVE : tout INSERT/UPDATE/DELETE sur demandes_intervention (n'importe
  // quelle fenêtre, n'importe quel utilisateur du site) rafraîchit la liste sans F5.
  useRealtimeRefresh('demandes_intervention', demandesQueries.all())

  const [formOpen, setFormOpen] = useState(false)
  const [recherche, setRecherche] = useState('')
  // La base cherche 250 ms après la dernière frappe (pas une requête par lettre).
  const rechercheServeur = useValeurApresPause(
    recherche.trim(),
    PAUSE_RECHERCHE_MS,
  )
  // Filtre statut : 'all' ou l'id de statut (1 Ouvert, 2 En cours, 3 Clôturé).
  // Défaut : on masque les demandes clôturées — le filtre permet d'afficher un
  // statut précis ou « Tous les statuts ».
  const [statutFilter, setStatutFilter] = useState(FILTRE_NON_TERMINES)

  // Filtre et recherche faits PAR LA BASE (171), 50 demandes à la fois,
  // chargées au fil du défilement : jamais les 4 000+ de l'historique d'un
  // coup. La page précédente reste affichée pendant qu'une recherche se lance.
  const query = useInfiniteQuery({
    ...demandesQueries.page(siteId, statutFilter, rechercheServeur),
    placeholderData: keepPreviousData,
  })
  const { data: siteADesDemandes } = useQuery(demandesQueries.existe(siteId))
  const demandes = useMemo(
    () => query.data?.pages.flatMap((p) => p.demandes) ?? [],
    [query.data],
  )
  const lieux = useMemo(
    () => new Map(query.data?.pages.flatMap((p) => [...p.lieux]) ?? []),
    [query.data],
  )
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  const chargerLaSuite = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const newButton = canCreate ? (
    <Button onClick={() => setFormOpen(true)}>
      <Plus /> Nouvelle demande
    </Button>
  ) : undefined

  return (
    <PageContainer>
      <PageHeader
        title={PAGE_META.titre}
        description={PAGE_META.description}
        action={
          canCreate || canResolve ? (
            <div className="flex items-center gap-2">
              {/* Connexion Dmbook du site : admin / manager / technicien (D19). */}
              {canResolve && (
                <BoutonDmbook
                  siteId={siteId}
                  siteNom={activeSite?.nom ?? 'ce site'}
                />
              )}
              {canCreate && (
                <TooltipIconButton
                  icon={<Plus />}
                  label="Nouvelle demande"
                  variant="outline"
                  onClick={() => setFormOpen(true)}
                />
              )}
            </div>
          ) : undefined
        }
      />

      {query.isPending ? (
        <ListRowSkeletons />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : siteADesDemandes === false ? (
        <EmptyState
          icon={ClipboardList}
          title="Aucune demande"
          description={
            canCreate
              ? "Crée une première demande d'intervention pour signaler un problème."
              : "Aucune demande d'intervention pour ce site."
          }
          action={newButton}
        />
      ) : (
        <ListPageBody
          search={recherche}
          onSearchChange={setRecherche}
          searchPlaceholder="Rechercher (constat, local…)"
          filterValue={statutFilter}
          onFilterChange={setStatutFilter}
          options={statutFilterOptions([
            { id: 1, nom: statutLabel(1) },
            { id: 2, nom: statutLabel(2) },
            { id: 3, nom: statutLabel(3) },
          ])}
          filterLabel="Filtrer par statut"
          isEmpty={demandes.length === 0}
          emptySearchDescription="Aucune demande ne correspond à ces critères."
        >
          {/* Virtualisée ET chargée par pages : l'historique Dmbook (4 000+ DI)
                arrive 50 par 50 au fil du défilement. */}
          <VirtualList
            items={demandes}
            getKey={(d) => d.id}
            surFin={chargerLaSuite}
            renderItem={(d) => {
              const rowActions = actionsDe(d)
              const local = lieux.get(d.id) ?? null
              // Colonne de droite, comme les OT (`OtCard`) : statut + date
              // dessous. Clôturée → date de clôture ; Ouverte ou En cours →
              // date d'ouverture (le constat). Semaine ISO comme partout.
              const dateStatut =
                d.statut_di_id === STATUT_DI_CLOTURE && d.date_resolution
                  ? d.date_resolution
                  : d.date_constat
              const statutColonne = (
                <StatutColonne
                  statut={{
                    label: statutLabel(d.statut_di_id),
                    tone: statutTone(d.statut_di_id),
                  }}
                  meta={formatDateAvecSemaineIso(dateStatut)}
                />
              )
              return (
                <ListRow
                  key={d.id}
                  tone={statutTone(d.statut_di_id)}
                  media={<RowMediaIcon icon={ClipboardList} />}
                  // Ligne 1 : le lieu ; ligne 2 : le constat (ni auteur ni origine, choix PO).
                  title={<TitreLieu lieu={local} chargement={false} />}
                  titleLabel={`${local ?? LIEU_NON_PRECISE} — ${diTitre(d.constat)}`}
                  subtitle={diTitre(d.constat)}
                  onClick={() =>
                    void navigate({
                      to: '/demandes/$demande',
                      params: {
                        // Lien `slug~id` : la fiche s'ouvre par l'id, sans relire la liste.
                        demande: segAlias({
                          nom: diTitre(d.constat),
                          id: d.id,
                        }),
                      },
                    })
                  }
                  badges={statutColonne}
                  mobileBadge={statutColonne}
                  menuActions={rowActions.length ? rowActions : undefined}
                />
              )
            }}
          />
        </ListPageBody>
      )}

      {canCreate && (
        <DiFormDialog
          key={formOpen ? 'open' : 'closed'}
          open={formOpen}
          onOpenChange={setFormOpen}
          siteId={siteId}
        />
      )}

      {dialogues}
    </PageContainer>
  )
}
