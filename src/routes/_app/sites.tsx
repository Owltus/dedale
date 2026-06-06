import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { sitesQueries } from '@/features/sites/queries'
import { useDeleteSite } from '@/features/sites/mutations'
import { SiteFormDialog } from '@/features/sites/components/site-form-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { errorMessage } from '@/lib/form'
import { cardGrid } from '@/lib/responsive'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type Site = Database['public']['Tables']['sites']['Row']

export const Route = createFileRoute('/_app/sites')({
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

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Site supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
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
        action={newButton}
      />

      <QueryState
        query={query}
        pending={
          <CardSkeletons count={4} height="h-28" container={cardGrid.compact} />
        }
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
        {(sites) => (
          <div className={cardGrid.compact}>
            {sites.map((site) => (
              <Card key={site.id} className="min-w-0">
                <CardHeader>
                  <CardTitle className="truncate">{site.nom}</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
                  <span className="truncate">
                    {[site.code_postal, site.ville].filter(Boolean).join(' ') ||
                      '—'}
                  </span>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setForm({ open: true, site })}
                      >
                        <Pencil /> Modifier
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setToDelete(site)}
                      >
                        <Trash2 /> Supprimer
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </QueryState>

      {isAdmin && (
        <SiteFormDialog
          key={form.site?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          site={form.site}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer le site ?"
        description={
          toDelete
            ? `« ${toDelete.nom} » sera placé dans la corbeille (récupérable 90 jours).`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </PageContainer>
  )
}
