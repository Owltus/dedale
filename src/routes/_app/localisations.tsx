import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { useQuery } from '@tanstack/react-query'
import {
  Building,
  Building2,
  ChevronRight,
  DoorOpen,
  Layers,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { localisationsQueries } from '@/features/localisations/queries'
import {
  useDeleteBatiment,
  useDeleteLocal,
  useDeleteNiveau,
} from '@/features/localisations/mutations'
import { BatimentFormDialog } from '@/features/localisations/components/batiment-form-dialog'
import { NiveauFormDialog } from '@/features/localisations/components/niveau-form-dialog'
import { LocalFormDialog } from '@/features/localisations/components/local-form-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { deleteErrorMessage } from '@/lib/form'
import { cardGrid } from '@/lib/responsive'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type Batiment = Database['public']['Tables']['batiments']['Row']
type Niveau = Database['public']['Tables']['niveaux']['Row']
type Local = Database['public']['Tables']['locaux']['Row']

export const Route = createFileRoute('/_app/localisations')({
  beforeLoad: ({ context }) =>
    requireNav('/localisations', context.queryClient),
  component: LocalisationsPage,
})

const GRID = cardGrid.compact

function LocalisationsPage() {
  const { activeSiteId, activeSite } = useSiteContext()
  const { data: role } = useCurrentRole()
  const canEdit = perm.canManageMetier(role)

  // Drill-down local (pas de routes) : bâtiment puis niveau sélectionnés.
  const [batiment, setBatiment] = useState<Batiment | null>(null)
  const [niveau, setNiveau] = useState<Niveau | null>(null)

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Localisations"
        description="Bâtiments, niveaux et locaux du site."
        hint="Choisis un site actif pour gérer ses localisations."
        icon={Building2}
      />
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Localisations"
        description="Bâtiments, niveaux et locaux du site."
      />

      <Breadcrumb
        siteName={activeSite?.nom ?? 'Site'}
        batiment={batiment}
        niveau={niveau}
        onSite={() => {
          setBatiment(null)
          setNiveau(null)
        }}
        onBatiment={() => setNiveau(null)}
      />

      {niveau && batiment ? (
        <LocauxView niveau={niveau} canEdit={canEdit} />
      ) : batiment ? (
        <NiveauxView
          batiment={batiment}
          canEdit={canEdit}
          onOpen={(n) => setNiveau(n)}
        />
      ) : (
        <BatimentsView
          siteId={activeSiteId}
          canEdit={canEdit}
          onOpen={(b) => setBatiment(b)}
        />
      )}
    </PageContainer>
  )
}

interface BreadcrumbProps {
  siteName: string
  batiment: Batiment | null
  niveau: Niveau | null
  onSite: () => void
  onBatiment: () => void
}

function Breadcrumb({
  siteName,
  batiment,
  niveau,
  onSite,
  onBatiment,
}: BreadcrumbProps) {
  return (
    <nav className="text-muted-foreground mb-4 flex flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={onSite}
        className="hover:text-foreground font-medium"
      >
        {siteName}
      </button>
      {batiment && (
        <>
          <ChevronRight className="size-4" />
          <button
            type="button"
            onClick={onBatiment}
            className={
              niveau ? 'hover:text-foreground' : 'text-foreground font-medium'
            }
          >
            {batiment.nom}
          </button>
        </>
      )}
      {niveau && (
        <>
          <ChevronRight className="size-4" />
          <span className="text-foreground font-medium">{niveau.nom}</span>
        </>
      )}
    </nav>
  )
}

// --- Vue Bâtiments ---

function BatimentsView({
  siteId,
  canEdit,
  onOpen,
}: {
  siteId: string
  canEdit: boolean
  onOpen: (b: Batiment) => void
}) {
  const query = useQuery(localisationsQueries.batiments(siteId))
  const del = useDeleteBatiment()
  const [form, setForm] = useState<{
    open: boolean
    batiment: Batiment | null
  }>({ open: false, batiment: null })
  const [toDelete, setToDelete] = useState<Batiment | null>(null)

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Bâtiment supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  const newButton = canEdit ? (
    <Button onClick={() => setForm({ open: true, batiment: null })}>
      <Plus /> Nouveau bâtiment
    </Button>
  ) : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{newButton}</div>

      <QueryState
        query={query}
        pending={<CardSkeletons count={4} height="h-28" container={GRID} />}
        empty={
          <EmptyState
            icon={Building}
            title="Aucun bâtiment"
            description={
              canEdit
                ? 'Crée le premier bâtiment de ce site.'
                : 'Aucun bâtiment sur ce site.'
            }
            action={newButton}
          />
        }
      >
        {(batiments) => (
          <div className={GRID}>
            {batiments.map((b) => (
              <Card key={b.id} className="min-w-0">
                <CardHeader>
                  <CardTitle className="truncate">{b.nom}</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
                  <span className="line-clamp-2 min-h-5">
                    {b.description ?? '—'}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => onOpen(b)}>
                      <Layers /> Niveaux
                    </Button>
                    {canEdit && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setForm({ open: true, batiment: b })}
                        >
                          <Pencil /> Modifier
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToDelete(b)}
                        >
                          <Trash2 /> Supprimer
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </QueryState>

      {canEdit && (
        <BatimentFormDialog
          key={form.batiment?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          siteId={siteId}
          batiment={form.batiment}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer le bâtiment ?"
        description={
          toDelete
            ? `« ${toDelete.nom} » sera supprimé définitivement.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

// --- Vue Niveaux ---

function NiveauxView({
  batiment,
  canEdit,
  onOpen,
}: {
  batiment: Batiment
  canEdit: boolean
  onOpen: (n: Niveau) => void
}) {
  const query = useQuery(localisationsQueries.niveaux(batiment.id))
  const del = useDeleteNiveau()
  const [form, setForm] = useState<{ open: boolean; niveau: Niveau | null }>({
    open: false,
    niveau: null,
  })
  const [toDelete, setToDelete] = useState<Niveau | null>(null)

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Niveau supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  const newButton = canEdit ? (
    <Button onClick={() => setForm({ open: true, niveau: null })}>
      <Plus /> Nouveau niveau
    </Button>
  ) : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{newButton}</div>

      <QueryState
        query={query}
        pending={<CardSkeletons count={4} height="h-28" container={GRID} />}
        empty={
          <EmptyState
            icon={Layers}
            title="Aucun niveau"
            description={
              canEdit
                ? 'Crée le premier niveau de ce bâtiment.'
                : 'Aucun niveau dans ce bâtiment.'
            }
            action={newButton}
          />
        }
      >
        {(niveaux) => (
          <div className={GRID}>
            {niveaux.map((n) => (
              <Card key={n.id} className="min-w-0">
                <CardHeader>
                  <CardTitle className="truncate">{n.nom}</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
                  <span className="line-clamp-2 min-h-5">
                    {n.description ?? '—'}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => onOpen(n)}>
                      <DoorOpen /> Locaux
                    </Button>
                    {canEdit && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setForm({ open: true, niveau: n })}
                        >
                          <Pencil /> Modifier
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToDelete(n)}
                        >
                          <Trash2 /> Supprimer
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </QueryState>

      {canEdit && (
        <NiveauFormDialog
          key={form.niveau?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          batimentId={batiment.id}
          niveau={form.niveau}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer le niveau ?"
        description={
          toDelete
            ? `« ${toDelete.nom} » sera supprimé définitivement.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

// --- Vue Locaux ---

function LocauxView({ niveau, canEdit }: { niveau: Niveau; canEdit: boolean }) {
  const query = useQuery(localisationsQueries.locaux(niveau.id))
  const { data: types = [] } = useQuery(localisationsQueries.typesLocaux())
  const del = useDeleteLocal()
  const [form, setForm] = useState<{ open: boolean; local: Local | null }>({
    open: false,
    local: null,
  })
  const [toDelete, setToDelete] = useState<Local | null>(null)

  const typeLabel = (id: number | null) =>
    id === null ? null : (types.find((t) => t.id === id)?.libelle ?? null)

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Local supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  const newButton = canEdit ? (
    <Button onClick={() => setForm({ open: true, local: null })}>
      <Plus /> Nouveau local
    </Button>
  ) : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{newButton}</div>

      <QueryState
        query={query}
        pending={<CardSkeletons count={4} height="h-28" container={GRID} />}
        empty={
          <EmptyState
            icon={DoorOpen}
            title="Aucun local"
            description={
              canEdit
                ? 'Crée le premier local de ce niveau.'
                : 'Aucun local dans ce niveau.'
            }
            action={newButton}
          />
        }
      >
        {(locaux) => (
          <div className={GRID}>
            {locaux.map((l) => (
              <Card key={l.id} className="min-w-0">
                <CardHeader>
                  <CardTitle className="truncate">{l.nom}</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
                  <span className="truncate">
                    {[
                      typeLabel(l.type_local_id),
                      l.surface_m2 === null
                        ? null
                        : `${String(l.surface_m2)} m²`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </span>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setForm({ open: true, local: l })}
                      >
                        <Pencil /> Modifier
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setToDelete(l)}
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

      {canEdit && (
        <LocalFormDialog
          key={form.local?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          niveauId={niveau.id}
          local={form.local}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer le local ?"
        description={
          toDelete
            ? `« ${toDelete.nom} » sera supprimé définitivement.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
