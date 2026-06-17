import { useState } from 'react'
import type { ReactNode } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { FileText, Pencil, Plus, Trash2, Truck } from 'lucide-react'
import { toast } from 'sonner'
import {
  contratsQueries,
  prestatairesQueries,
} from '@/features/prestataires/queries'
import { useDeleteContrat } from '@/features/prestataires/mutations'
import { etatContrat } from '@/features/prestataires/etat'
import { PrestataireFormDialog } from '@/features/prestataires/components/prestataire-form-dialog'
import { ContratFormDialog } from '@/features/prestataires/components/contrat-form-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { formatDate } from '@/lib/date'
import { deleteErrorMessage } from '@/lib/form'
import { listStack } from '@/lib/responsive'
import { segOfUnique } from '@/lib/slug'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type Prestataire = Database['public']['Tables']['prestataires']['Row']
type ContratRow = Database['public']['Tables']['contrats']['Row'] & {
  types_contrats: { id: number; libelle: string } | null
}

export const Route = createFileRoute('/_app/prestataires/$prestataire')({
  component: PrestataireDetailPage,
})

function PrestataireDetailPage() {
  const { prestataire: slug } = Route.useParams()
  const navigate = useNavigate()
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageAdmin(role)
  const { activeSiteId } = useSiteContext()
  const {
    data: prestataires,
    isPending,
    isError,
    refetch,
  } = useQuery(prestatairesQueries.list())

  const goBack = () => void navigate({ to: '/prestataires' })

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

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader title="Prestataire" onBack={goBack} />
        <ListRowSkeletons count={3} />
      </PageContainer>
    )
  }

  if (isError) {
    return (
      <PageContainer>
        <PageHeader title="Prestataire" onBack={goBack} />
        <ErrorState onRetry={() => void refetch()} />
      </PageContainer>
    )
  }

  // Résolution slug -> prestataire avec le MÊME ensemble de frères qu'à la
  // génération du lien (symétrie segOfUnique).
  const sibs = prestataires.map((p) => ({ nom: p.libelle, id: p.id }))
  const prestataire =
    prestataires.find(
      (p) => segOfUnique({ nom: p.libelle, id: p.id }, sibs) === slug,
    ) ?? null

  if (!prestataire) {
    return (
      <PageContainer>
        <PageHeader title="Prestataire introuvable" onBack={goBack} />
        <EmptyState
          icon={Truck}
          title="Prestataire introuvable"
          description="Ce prestataire n'existe pas ou n'est pas accessible."
        />
      </PageContainer>
    )
  }

  return (
    <PrestataireDetail
      prestataire={prestataire}
      siteId={activeSiteId}
      canManage={canManage}
      onBack={goBack}
    />
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
      <PageHeader
        title={prestataire.libelle}
        description={prestataire.metier ?? undefined}
        onBack={onBack}
        titleBadges={
          <Badge variant={prestataire.est_interne ? 'default' : 'secondary'}>
            {prestataire.est_interne ? 'Interne' : 'Externe'}
          </Badge>
        }
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
      onError: (e) => toast.error(deleteErrorMessage(e)),
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
        pending={<ListRowSkeletons count={2} />}
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
          <div className={listStack}>
            {(contrats as ContratRow[]).map((c) => {
              const etat = etatContrat(c.date_debut, c.date_fin)
              return (
                <ListRow
                  key={c.id}
                  media={<RowMediaIcon icon={FileText} />}
                  title={c.reference}
                  subtitle={`Du ${formatDate(c.date_debut)} au ${formatDate(c.date_fin)}${c.objet_avenant ? ` — avenant : ${c.objet_avenant}` : ''}`}
                  badges={
                    <>
                      <Badge variant={etat.variant}>{etat.label}</Badge>
                      {c.types_contrats && (
                        <Badge variant="outline">
                          {c.types_contrats.libelle}
                        </Badge>
                      )}
                    </>
                  }
                  mobileMeta={etat.label}
                  actions={
                    canManage ? (
                      <>
                        <TooltipIconButton
                          icon={<Pencil />}
                          label="Modifier le contrat"
                          onClick={() => setForm({ open: true, contrat: c })}
                        />
                        <TooltipIconButton
                          icon={<Trash2 className="text-destructive" />}
                          label="Supprimer le contrat"
                          onClick={() => setToDelete(c)}
                        />
                      </>
                    ) : undefined
                  }
                />
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

      <ConfirmDeleteDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        entityLabel={
          toDelete ? `le contrat « ${toDelete.reference} »` : 'le contrat'
        }
        warning="Cette suppression est définitive."
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </section>
  )
}
