import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { useQuery } from '@tanstack/react-query'
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { sitesQueries } from '@/features/sites/queries'
import { useDeleteSite } from '@/features/sites/mutations'
import { SiteFormDialog } from '@/features/sites/components/site-form-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { deleteErrorMessage } from '@/lib/form'
import { listStack } from '@/lib/responsive'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { NoSearchResults } from '@/components/common/no-search-results'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { SearchInput } from '@/components/common/search-input'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import type { Database } from '@/lib/database.types'

type Site = Database['public']['Tables']['sites']['Row']

export const Route = createFileRoute('/_app/sites')({
  beforeLoad: ({ context }) => requireNav('/sites', context.queryClient),
  component: SitesPage,
})

function SitesPage() {
  const { data: role } = useCurrentRole()
  const isAdmin = perm.isAdmin(role)
  const query = useQuery(sitesQueries.list())
  const del = useDeleteSite()
  const [form, setForm] = useState<{ open: boolean; site: Site | null }>({
    open: false,
    site: null,
  })
  const [toDelete, setToDelete] = useState<Site | null>(null)
  const [recherche, setRecherche] = useState('')

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Site supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  const newButton = isAdmin ? (
    <Button onClick={() => setForm({ open: true, site: null })}>
      <Plus /> Nouveau site
    </Button>
  ) : undefined

  return (
    <PageContainer>
      <PageHeader
        title="Sites"
        description="Les sites de l'entreprise. Chaque site est cloisonné par la sécurité."
        action={
          isAdmin ? (
            <TooltipIconButton
              icon={<Plus />}
              label="Nouveau site"
              variant="outline"
              onClick={() => setForm({ open: true, site: null })}
            />
          ) : undefined
        }
      />

      <QueryState
        query={query}
        pending={<ListRowSkeletons count={4} />}
        empty={
          <EmptyState
            icon={Building2}
            title="Aucun site"
            description={
              isAdmin
                ? 'Crée ton premier site pour commencer.'
                : 'Aucun site accessible.'
            }
            action={newButton}
          />
        }
      >
        {(sites) => {
          const q = recherche.trim().toLowerCase()
          const shown =
            q === ''
              ? sites
              : sites.filter(
                  (s) =>
                    s.nom.toLowerCase().includes(q) ||
                    (s.ville ?? '').toLowerCase().includes(q),
                )
          return (
            <div className="flex flex-col gap-4">
              <SearchInput
                value={recherche}
                onChange={setRecherche}
                placeholder="Rechercher un site…"
                className="max-w-sm"
              />
              {shown.length === 0 ? (
                <NoSearchResults description="Aucun site ne correspond à cette recherche." />
              ) : (
                <div className={listStack}>
                  {shown.map((site) => (
                    <ListRow
                      key={site.id}
                      media={<RowMediaIcon icon={Building2} />}
                      title={site.nom}
                      subtitle={
                        [site.code_postal, site.ville]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                      actions={
                        isAdmin ? (
                          <>
                            <TooltipIconButton
                              icon={<Pencil />}
                              label="Modifier le site"
                              onClick={() => setForm({ open: true, site })}
                            />
                            <TooltipIconButton
                              icon={<Trash2 className="text-destructive" />}
                              label="Supprimer le site"
                              onClick={() => setToDelete(site)}
                            />
                          </>
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )
        }}
      </QueryState>

      {isAdmin && (
        <SiteFormDialog
          key={form.site?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          site={form.site}
        />
      )}

      <ConfirmDeleteDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        entityLabel={toDelete ? `le site « ${toDelete.nom} »` : 'le site'}
        warning="Action IRRÉVERSIBLE : le site et TOUT son contenu (bâtiments, locaux, équipements, ordres de travail, demandes, contrats, investissements, documents…) seront supprimés définitivement."
        confirmPhrase={toDelete?.nom}
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </PageContainer>
  )
}
