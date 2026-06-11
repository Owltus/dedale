import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  FileText,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { gammesQueries } from '@/features/gammes/queries'
import {
  useCopierGamme,
  useDeleteGamme,
  useDeleteOperation,
} from '@/features/gammes/mutations'
import { GammeFormDialog } from '@/features/gammes/components/gamme-form-dialog'
import { OperationFormDialog } from '@/features/gammes/components/operation-form-dialog'
import { EquipementsLinkDialog } from '@/features/gammes/components/equipements-link-dialog'
import { GammeModelesSection } from '@/features/gammes/components/gamme-modeles-section'
import { equipementsQueries } from '@/features/equipements/queries'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { errorMessage } from '@/lib/form'
import { cardGrid } from '@/lib/responsive'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Database } from '@/lib/database.types'

type GammeRow = Database['public']['Tables']['gammes']['Row'] & {
  periodicites: {
    id: number
    libelle: string
    jours_periodicite: number
  } | null
  prestataires: { id: string; libelle: string } | null
}

type OperationRow = Database['public']['Tables']['operations']['Row'] & {
  types_operations: {
    id: number
    libelle: string
    necessite_seuils: boolean
  } | null
  unites: { id: number; nom: string; symbole: string } | null
}

export const Route = createFileRoute('/_app/gammes')({
  beforeLoad: ({ context }) => requireNav('/gammes', context.queryClient),
  component: GammesPage,
})

const GRID = cardGrid.default

const NATURE_LABEL: Record<GammeRow['nature'], string> = {
  controle_reglementaire: 'Réglementaire',
  maintenance_preventive: 'Maintenance',
}

function GammesPage() {
  const { activeSiteId } = useSiteContext()
  const { data: role } = useCurrentRole()
  const canEdit = perm.canManageMetier(role)

  const [selected, setSelected] = useState<GammeRow | null>(null)

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Gammes"
        description="Gammes de maintenance et de contrôle réglementaire du site."
        hint="Choisis un site actif pour gérer ses gammes."
        icon={Wrench}
      />
    )
  }

  if (selected) {
    return (
      <GammeDetail
        siteId={activeSiteId}
        gamme={selected}
        canEdit={canEdit}
        onBack={() => setSelected(null)}
      />
    )
  }

  return (
    <GammesList siteId={activeSiteId} canEdit={canEdit} onOpen={setSelected} />
  )
}

// --- Liste des gammes ---

function GammesList({
  siteId,
  canEdit,
  onOpen,
}: {
  siteId: string
  canEdit: boolean
  onOpen: (g: GammeRow) => void
}) {
  const query = useQuery(gammesQueries.list(siteId))
  const del = useDeleteGamme()
  const copier = useCopierGamme()
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<{ open: boolean; gamme: GammeRow | null }>({
    open: false,
    gamme: null,
  })
  const [toDelete, setToDelete] = useState<GammeRow | null>(null)
  const [toCopy, setToCopy] = useState<GammeRow | null>(null)

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Gamme supprimée')
        setToDelete(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  function confirmCopy() {
    if (!toCopy) return
    copier.mutate(
      { sourceGammeId: toCopy.id, siteCible: siteId },
      {
        onSuccess: () => {
          toast.success('Gamme dupliquée')
          setToCopy(null)
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  const newButton = canEdit ? (
    <Button onClick={() => setForm({ open: true, gamme: null })}>
      <Plus /> Nouvelle gamme
    </Button>
  ) : undefined

  return (
    <PageContainer>
      <PageHeader
        title="Gammes"
        description="Gammes de maintenance et de contrôle réglementaire du site."
        action={newButton}
      />

      <div className="mb-4 max-w-xs">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une gamme…"
            className="pl-8"
          />
        </div>
      </div>

      <QueryState
        query={query}
        pending={<CardSkeletons count={6} height="h-36" />}
        empty={
          <EmptyState
            icon={Wrench}
            title="Aucune gamme"
            description={
              canEdit
                ? 'Crée la première gamme de ce site.'
                : 'Aucune gamme sur ce site.'
            }
            action={newButton}
          />
        }
      >
        {(gammes) => {
          const q = search.trim().toLowerCase()
          const filtered = q
            ? gammes.filter((g) => g.nom.toLowerCase().includes(q))
            : gammes
          if (filtered.length === 0) {
            return (
              <EmptyState
                icon={Search}
                title="Aucun résultat"
                description="Aucune gamme ne correspond à ta recherche."
              />
            )
          }
          return (
            <div className={GRID}>
              {filtered.map((g) => (
                <Card key={g.id} className="min-w-0">
                  <CardHeader>
                    <CardTitle className="truncate">{g.nom}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          g.nature === 'controle_reglementaire'
                            ? 'default'
                            : 'secondary'
                        }
                      >
                        {NATURE_LABEL[g.nature]}
                      </Badge>
                      <Badge variant="outline">{g.periodicites.libelle}</Badge>
                    </div>
                    {g.prestataires ? (
                      <span className="truncate">{g.prestataires.libelle}</span>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground w-fit"
                      >
                        Prestataire à renseigner
                      </Badge>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => onOpen(g)}>
                        <ChevronRight /> Détail
                      </Button>
                      {canEdit && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setForm({ open: true, gamme: g })}
                          >
                            <Pencil /> Modifier
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setToCopy(g)}
                          >
                            <Copy /> Dupliquer
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setToDelete(g)}
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
          )
        }}
      </QueryState>

      {canEdit && (
        <GammeFormDialog
          key={form.gamme?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          siteId={siteId}
          gamme={form.gamme}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer la gamme ?"
        description={
          toDelete
            ? `« ${toDelete.nom} » sera placée dans la corbeille (récupérable 90 jours).`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={toCopy !== null}
        onOpenChange={(open) => {
          if (!open) setToCopy(null)
        }}
        title="Dupliquer la gamme ?"
        description={
          toCopy
            ? `Une copie indépendante de « ${toCopy.nom} » (opérations comprises) sera créée sur ce site.`
            : undefined
        }
        confirmLabel="Dupliquer"
        loading={copier.isPending}
        onConfirm={confirmCopy}
      />
    </PageContainer>
  )
}

// --- Détail gamme (en page, onglets) ---

type Tab = 'operations' | 'equipements' | 'documents'

function GammeDetail({
  siteId,
  gamme,
  canEdit,
  onBack,
}: {
  siteId: string
  gamme: GammeRow
  canEdit: boolean
  onBack: () => void
}) {
  const [tab, setTab] = useState<Tab>('operations')
  const [editOpen, setEditOpen] = useState(false)

  return (
    <PageContainer>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
        <ArrowLeft /> Retour aux gammes
      </Button>

      <PageHeader
        title={gamme.nom}
        description={gamme.description ?? undefined}
        action={
          canEdit ? (
            <div className="flex flex-col gap-2">
              <Button onClick={() => setEditOpen(true)}>
                <Pencil /> Modifier
              </Button>
              <Button variant="outline" disabled title={CREATE_OT_HINT}>
                <ClipboardList /> Créer un OT
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge
          variant={
            gamme.nature === 'controle_reglementaire' ? 'default' : 'secondary'
          }
        >
          {NATURE_LABEL[gamme.nature]}
        </Badge>
        {gamme.periodicites && (
          <Badge variant="outline">{gamme.periodicites.libelle}</Badge>
        )}
        {gamme.prestataires ? (
          <Badge variant="outline">{gamme.prestataires.libelle}</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Prestataire à renseigner
          </Badge>
        )}
      </div>

      <div className="mb-4 flex gap-1 border-b">
        <TabButton
          active={tab === 'operations'}
          onClick={() => setTab('operations')}
        >
          <ListChecks className="size-4" /> Opérations
        </TabButton>
        <TabButton
          active={tab === 'equipements'}
          onClick={() => setTab('equipements')}
        >
          <Wrench className="size-4" /> Équipements
        </TabButton>
        <TabButton
          active={tab === 'documents'}
          onClick={() => setTab('documents')}
        >
          <FileText className="size-4" /> Documents
        </TabButton>
      </div>

      {tab === 'operations' && (
        <OperationsTab
          gammeId={gamme.id}
          gammeSiteId={gamme.site_id}
          canEdit={canEdit}
        />
      )}
      {tab === 'equipements' && (
        <EquipementsTab siteId={siteId} gammeId={gamme.id} canEdit={canEdit} />
      )}
      {tab === 'documents' && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-muted-foreground text-base">
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            À venir.
          </CardContent>
        </Card>
      )}

      {canEdit && (
        <GammeFormDialog
          key={gamme.id}
          open={editOpen}
          onOpenChange={setEditOpen}
          siteId={siteId}
          gamme={gamme}
        />
      )}
    </PageContainer>
  )
}

const CREATE_OT_HINT = 'Disponible avec le module Ordres de travail.'

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
        (active
          ? 'border-primary text-foreground'
          : 'text-muted-foreground hover:text-foreground border-transparent')
      }
    >
      {children}
    </button>
  )
}

// --- Onglet Opérations ---

function OperationsTab({
  gammeId,
  gammeSiteId,
  canEdit,
}: {
  gammeId: string
  gammeSiteId: string | null
  canEdit: boolean
}) {
  const query = useQuery(gammesQueries.operations(gammeId))
  const del = useDeleteOperation()
  const [form, setForm] = useState<{ open: boolean; op: OperationRow | null }>({
    open: false,
    op: null,
  })
  const [toDelete, setToDelete] = useState<OperationRow | null>(null)

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Opération supprimée')
        setToDelete(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  const newButton = canEdit ? (
    <Button size="sm" onClick={() => setForm({ open: true, op: null })}>
      <Plus /> Ajouter une opération
    </Button>
  ) : undefined

  return (
    <div className="flex flex-col gap-4">
      {canEdit && <div className="flex justify-end">{newButton}</div>}

      <QueryState
        query={query}
        pending={<Skeleton className="h-40" />}
        empty={
          <EmptyState
            icon={ListChecks}
            title="Aucune opération"
            description={
              canEdit
                ? 'Ajoute les opérations qui composent cette gamme.'
                : 'Cette gamme ne contient pas d’opération.'
            }
            action={newButton}
          />
        }
      >
        {(operations) => (
          <ul className="flex flex-col gap-2">
            {operations.map((op) => (
              <li
                key={op.id}
                className="bg-card flex items-start justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs tabular-nums">
                      #{op.ordre}
                    </span>
                    <span className="truncate font-medium">{op.nom}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline">
                      {op.types_operations.libelle}
                    </Badge>
                    {(op.seuil_minimum !== null ||
                      op.seuil_maximum !== null) && (
                      <span className="text-muted-foreground">
                        {formatSeuils(op)}
                      </span>
                    )}
                  </div>
                  {op.description && (
                    <p className="text-muted-foreground text-sm">
                      {op.description}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setForm({ open: true, op })}
                      aria-label="Modifier l’opération"
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setToDelete(op)}
                      aria-label="Supprimer l’opération"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      <div className="border-t pt-4">
        <GammeModelesSection
          gammeId={gammeId}
          gammeSiteId={gammeSiteId}
          canEdit={canEdit}
        />
      </div>

      {canEdit && (
        <OperationFormDialog
          key={form.op?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          gammeId={gammeId}
          operation={form.op}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer l’opération ?"
        description={
          toDelete
            ? `« ${toDelete.nom} » sera définitivement retirée.`
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

function formatSeuils(op: OperationRow): string {
  const sym = op.unites?.symbole ?? ''
  const min = op.seuil_minimum
  const max = op.seuil_maximum
  if (min !== null && max !== null)
    return `${String(min)} – ${String(max)} ${sym}`.trim()
  if (min !== null) return `≥ ${String(min)} ${sym}`.trim()
  if (max !== null) return `≤ ${String(max)} ${sym}`.trim()
  return ''
}

// --- Onglet Équipements ---

function EquipementsTab({
  siteId,
  gammeId,
  canEdit,
}: {
  siteId: string
  gammeId: string
  canEdit: boolean
}) {
  const equipementsQuery = useQuery(equipementsQueries.list(siteId))
  const liesQuery = useQuery(gammesQueries.equipementsLies(gammeId))
  const liesIds = liesQuery.data ?? []
  const [linkOpen, setLinkOpen] = useState(false)

  const lies = useMemo(() => {
    const equipements = equipementsQuery.data ?? []
    const ids = liesQuery.data ?? []
    return equipements.filter((e) => e.id !== null && ids.includes(e.id))
  }, [equipementsQuery.data, liesQuery.data])

  const linkButton = canEdit ? (
    <Button size="sm" onClick={() => setLinkOpen(true)}>
      <Plus /> Lier des équipements
    </Button>
  ) : undefined

  return (
    <div className="flex flex-col gap-4">
      {canEdit && <div className="flex justify-end">{linkButton}</div>}

      <QueryState query={liesQuery} pending={<Skeleton className="h-40" />}>
        {() =>
          lies.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="Aucun équipement lié"
              description={
                canEdit
                  ? 'Lie les équipements du site concernés par cette gamme.'
                  : 'Aucun équipement n’est lié à cette gamme.'
              }
              action={linkButton}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {lies.map((e) => (
                <li
                  key={e.id ?? ''}
                  className="bg-card flex items-center gap-3 rounded-md border p-3 text-sm"
                >
                  <Wrench className="text-muted-foreground size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {e.nom}
                  </span>
                  {e.code_inventaire && (
                    <Badge variant="secondary">{e.code_inventaire}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>

      {canEdit && (
        <EquipementsLinkDialog
          key={liesIds.join(',')}
          open={linkOpen}
          onOpenChange={setLinkOpen}
          siteId={siteId}
          gammeId={gammeId}
          current={liesIds}
        />
      )}
    </div>
  )
}
