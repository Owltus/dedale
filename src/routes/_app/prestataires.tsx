import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileText, Pencil, Plus, Trash2, Truck } from 'lucide-react'
import { toast } from 'sonner'
import {
  contratsQueries,
  prestatairesQueries,
} from '@/features/prestataires/queries'
import {
  useDeleteContrat,
  useDeletePrestataire,
} from '@/features/prestataires/mutations'
import { etatContrat } from '@/features/prestataires/etat'
import { PrestataireFormDialog } from '@/features/prestataires/components/prestataire-form-dialog'
import { ContratFormDialog } from '@/features/prestataires/components/contrat-form-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { formatDate } from '@/lib/date'
import { errorMessage } from '@/lib/form'
import { cardGrid } from '@/lib/responsive'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { ErrorState } from '@/components/common/error-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { Database } from '@/lib/database.types'

type Prestataire = Database['public']['Tables']['prestataires']['Row']

export const Route = createFileRoute('/_app/prestataires')({
  component: PrestatairesPage,
})

function PrestatairesPage() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageAdmin(role)
  const { activeSiteId } = useSiteContext()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Prestataires"
        description="Prestataires et contrats par site."
        hint="Choisis un site pour voir ses prestataires et contrats."
        icon={Truck}
      />
    )
  }

  return (
    <PrestatairesContent
      siteId={activeSiteId}
      canManage={canManage}
      selectedId={selectedId}
      onSelect={setSelectedId}
    />
  )
}

function PrestatairesContent({
  siteId,
  canManage,
  selectedId,
  onSelect,
}: {
  siteId: string
  canManage: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const {
    data: prestataires = [],
    isPending,
    isError,
    refetch,
  } = useQuery(prestatairesQueries.list())

  const selected = prestataires.find((p) => p.id === selectedId) ?? null

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader
          title="Prestataires"
          description="Prestataires et contrats par site."
        />
        <div className={cardGrid.compact}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </PageContainer>
    )
  }

  if (isError) {
    return (
      <PageContainer>
        <PageHeader
          title="Prestataires"
          description="Prestataires et contrats par site."
        />
        <ErrorState onRetry={() => void refetch()} />
      </PageContainer>
    )
  }

  if (selected) {
    return (
      <PrestataireDetail
        prestataire={selected}
        siteId={siteId}
        canManage={canManage}
        onBack={() => onSelect(null)}
      />
    )
  }

  return (
    <PrestatairesList
      siteId={siteId}
      prestataires={prestataires}
      canManage={canManage}
      onSelect={onSelect}
    />
  )
}

function PrestatairesList({
  siteId,
  prestataires,
  canManage,
  onSelect,
}: {
  siteId: string
  prestataires: Prestataire[]
  canManage: boolean
  onSelect: (id: string) => void
}) {
  const { data: counts } = useQuery(contratsQueries.countsBySite(siteId))
  const del = useDeletePrestataire()
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<{
    open: boolean
    prestataire: Prestataire | null
  }>({ open: false, prestataire: null })
  const [toDelete, setToDelete] = useState<Prestataire | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return prestataires
    return prestataires.filter((p) => p.libelle.toLowerCase().includes(q))
  }, [prestataires, search])

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Prestataire supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  const newButton = canManage ? (
    <Button onClick={() => setForm({ open: true, prestataire: null })}>
      <Plus /> Nouveau prestataire
    </Button>
  ) : undefined

  return (
    <PageContainer>
      <PageHeader
        title="Prestataires"
        description="Prestataires (externes et régie interne) et leurs contrats."
        action={newButton}
      />

      <div className="mb-4 max-w-sm">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un prestataire…"
          aria-label="Rechercher un prestataire"
        />
      </div>

      {prestataires.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Aucun prestataire"
          description={
            canManage
              ? 'Crée ton premier prestataire pour commencer.'
              : 'Aucun prestataire accessible.'
          }
          action={newButton}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Aucun résultat"
          description="Aucun prestataire ne correspond à ta recherche."
        />
      ) : (
        <div className={cardGrid.compact}>
          {filtered.map((p) => {
            const nbContrats = counts?.get(p.id) ?? 0
            return (
              <Card
                key={p.id}
                className="min-w-0 cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => onSelect(p.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="truncate">{p.libelle}</CardTitle>
                    <Badge variant={p.est_interne ? 'default' : 'secondary'}>
                      {p.est_interne ? 'Interne' : 'Externe'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
                  <span className="truncate">
                    {p.email ?? p.ville ?? p.metier ?? '—'}
                  </span>
                  <span>
                    {nbContrats} contrat{nbContrats > 1 ? 's' : ''}
                  </span>
                  {canManage && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setForm({ open: true, prestataire: p })
                        }}
                      >
                        <Pencil /> Modifier
                      </Button>
                      {!p.est_interne && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setToDelete(p)
                          }}
                        >
                          <Trash2 /> Supprimer
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {canManage && (
        <PrestataireFormDialog
          key={form.prestataire?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          prestataire={form.prestataire}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer le prestataire ?"
        description={
          toDelete
            ? `« ${toDelete.libelle} » sera placé dans la corbeille (récupérable 90 jours).`
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

function PrestataireDetail({
  prestataire,
  siteId,
  canManage,
  onBack,
}: {
  prestataire: Prestataire
  siteId: string
  canManage: boolean
  onBack: () => void
}) {
  const [editPrestataire, setEditPrestataire] = useState(false)

  return (
    <PageContainer>
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> Retour
        </Button>
      </div>

      <PageHeader
        title={prestataire.libelle}
        description={prestataire.metier ?? undefined}
        action={
          canManage ? (
            <Button variant="outline" onClick={() => setEditPrestataire(true)}>
              <Pencil /> Modifier
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-6">
        <CardContent className="text-muted-foreground grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4 text-sm">
          <Info label="Type">
            <Badge variant={prestataire.est_interne ? 'default' : 'secondary'}>
              {prestataire.est_interne ? 'Interne' : 'Externe'}
            </Badge>
          </Info>
          <Info label="Email">{prestataire.email ?? '—'}</Info>
          <Info label="Téléphone">{prestataire.telephone ?? '—'}</Info>
          <Info label="SIRET">{prestataire.siret ?? '—'}</Info>
          <Info label="Adresse">
            {[
              prestataire.adresse,
              [prestataire.code_postal, prestataire.ville]
                .filter(Boolean)
                .join(' '),
            ]
              .filter(Boolean)
              .join(', ') || '—'}
          </Info>
          {prestataire.commentaires && (
            <Info label="Commentaires">{prestataire.commentaires}</Info>
          )}
        </CardContent>
      </Card>

      <ContratsSection
        siteId={siteId}
        prestataireId={prestataire.id}
        canManage={canManage}
      />

      {canManage && (
        <PrestataireFormDialog
          key={prestataire.id}
          open={editPrestataire}
          onOpenChange={setEditPrestataire}
          prestataire={prestataire}
        />
      )}
    </PageContainer>
  )
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-foreground text-xs font-medium">{label}</span>
      <span>{children}</span>
    </div>
  )
}

type ContratRow = Database['public']['Tables']['contrats']['Row'] & {
  types_contrats: { id: number; libelle: string } | null
}

function ContratsSection({
  siteId,
  prestataireId,
  canManage,
}: {
  siteId: string
  prestataireId: string
  canManage: boolean
}) {
  const query = useQuery(contratsQueries.list(siteId, prestataireId))
  const del = useDeleteContrat()
  const [form, setForm] = useState<{
    open: boolean
    contrat: ContratRow | null
  }>({ open: false, contrat: null })
  const [toDelete, setToDelete] = useState<ContratRow | null>(null)

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Contrat supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  const newButton = canManage ? (
    <Button size="sm" onClick={() => setForm({ open: true, contrat: null })}>
      <Plus /> Nouveau contrat
    </Button>
  ) : undefined

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Contrats</h2>
        {newButton}
      </div>

      <QueryState
        query={query}
        pending={
          <CardSkeletons
            count={2}
            height="h-20"
            container="flex flex-col gap-3"
          />
        }
        empty={
          <EmptyState
            icon={FileText}
            title="Aucun contrat"
            description={
              canManage
                ? 'Ajoute un contrat pour ce prestataire sur le site actif.'
                : 'Aucun contrat sur le site actif.'
            }
            action={newButton}
          />
        }
      >
        {(contrats) => (
          <div className="flex flex-col gap-3">
            {(contrats as ContratRow[]).map((c) => {
              const etat = etatContrat(c.date_debut, c.date_fin)
              return (
                <Card key={c.id} className="min-w-0">
                  <CardContent className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.reference}</span>
                        <Badge variant={etat.variant}>{etat.label}</Badge>
                        {c.types_contrats && (
                          <Badge variant="outline">
                            {c.types_contrats.libelle}
                          </Badge>
                        )}
                      </div>
                      <span className="text-muted-foreground text-sm">
                        Du {formatDate(c.date_debut)} au{' '}
                        {formatDate(c.date_fin)}
                      </span>
                      {c.objet_avenant && (
                        <span className="text-muted-foreground text-sm">
                          Avenant : {c.objet_avenant}
                        </span>
                      )}
                      {c.commentaires && (
                        <span className="text-muted-foreground text-sm">
                          {c.commentaires}
                        </span>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setForm({ open: true, contrat: c })}
                        >
                          <Pencil /> Modifier
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToDelete(c)}
                        >
                          <Trash2 /> Supprimer
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </QueryState>

      {canManage && (
        <ContratFormDialog
          key={form.contrat?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          siteId={siteId}
          prestataireId={prestataireId}
          contrat={form.contrat}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer le contrat ?"
        description={
          toDelete
            ? `Le contrat « ${toDelete.reference} » sera définitivement supprimé.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </section>
  )
}
