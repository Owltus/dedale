import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ClipboardList,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  Wrench,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { gammesQueries } from '@/features/gammes/queries'
import { useDeleteOperation } from '@/features/gammes/mutations'
import { OperationFormDialog } from '@/features/gammes/components/operation-form-dialog'
import { EquipementsLinkDialog } from '@/features/gammes/components/equipements-link-dialog'
import { GammeModelesSection } from '@/features/gammes/components/gamme-modeles-section'
import { OtListeParGammes } from '@/features/ordres-travail/components/ot-liste-par-gammes'
import { equipementsQueries } from '@/features/equipements/queries'
import { deleteErrorMessage } from '@/lib/form'
import { listStack } from '@/lib/responsive'
import { SubTabs } from '@/components/common/sub-tabs'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { OperationRow } from '@/components/common/operation-row'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import type { RowAction } from '@/components/common/row-actions'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

export type GammeRow = Database['public']['Tables']['gammes']['Row'] & {
  periodicites: {
    id: number
    libelle: string
    jours_periodicite: number
  } | null
  prestataires: { id: string; libelle: string } | null
}

type GammeOperation = Database['public']['Tables']['operations']['Row'] & {
  types_operations: {
    id: number
    libelle: string
    necessite_seuils: boolean
  } | null
  unites: { id: number; nom: string; symbole: string } | null
}

type Tab = 'ordres' | 'operations' | 'equipements' | 'documents'

/**
 * CONTENU de la fiche d'une gamme de SITE (Plan de maintenance) : système à
 * onglets (Ordres de travail / Opérations / Équipements / Documents). L'EN-TÊTE
 * (fil d'Ariane + action « Modifier ») et la navigation sont portés par
 * l'explorateur parent (`GammesExplorer`) — ce composant ne rend QUE le corps de
 * la fiche, calqué sur `EquipementDetail`.
 */
export function GammeDetail({
  gamme,
  siteId,
  canEdit,
}: {
  gamme: GammeRow
  siteId: string
  canEdit: boolean
}) {
  const [tab, setTab] = useState<Tab>('ordres')

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6 lg:px-8">
      {/* Barre d'onglets FIXE (toujours visible). SEUL le contenu défile → la
          scrollbar apparaît DANS la liste (OT…), sous les onglets. */}
      <div className="shrink-0">
        <SubTabs
          ariaLabel="Sections de la gamme"
          variant="segmented"
          value={tab}
          onValueChange={setTab}
          items={[
            {
              id: 'ordres',
              label: 'Ordres de travail',
              icon: <ClipboardList className="size-4" />,
            },
            {
              id: 'operations',
              label: 'Opérations',
              icon: <ListChecks className="size-4" />,
            },
            {
              id: 'equipements',
              label: 'Équipements',
              icon: <Wrench className="size-4" />,
            },
            {
              id: 'documents',
              label: 'Documents',
              icon: <FileText className="size-4" />,
            },
          ]}
        />
      </div>

      {/* SEULE zone défilante. Padding horizontale + marge basse portées par le
          CONTENEUR (px/pb-6). `no-scrollbar` masque la barre (défilement
          conservé) en gardant la même mise en page, comme le parent. */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {tab === 'ordres' && (
          <OtListeParGammes siteId={siteId} gammeIds={[gamme.id]} />
        )}
        {tab === 'operations' && (
          <OperationsTab
            gammeId={gamme.id}
            gammeSiteId={gamme.site_id}
            canEdit={canEdit}
          />
        )}
        {tab === 'equipements' && (
          <EquipementsTab
            siteId={siteId}
            gammeId={gamme.id}
            canEdit={canEdit}
          />
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
      </div>
    </div>
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
  const [form, setForm] = useState<{
    open: boolean
    op: GammeOperation | null
  }>({ open: false, op: null })
  const [toDelete, setToDelete] = useState<GammeOperation | null>(null)

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Opération supprimée')
        setToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  // « Ajouter une opération » : icône seule + tooltip, dans l'en-tête de SA section
  // (calque exact de « Importer un modèle » de GammeModelesSection).
  const addButton = canEdit ? (
    <TooltipIconButton
      icon={<Plus />}
      label="Ajouter une opération"
      onClick={() => setForm({ open: true, op: null })}
    />
  ) : undefined

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <ListChecks className="text-muted-foreground size-4" />
            Opérations spécifiques
          </h3>
          {addButton}
        </div>

        <QueryState
          query={query}
          pending={<ListRowSkeletons dense count={3} />}
          empty={
            <EmptyState
              icon={ListChecks}
              title="Aucune opération"
              description={
                canEdit
                  ? 'Ajoute les opérations propres à cette gamme (en plus de celles des modèles liés).'
                  : 'Cette gamme ne contient pas d’opération.'
              }
            />
          }
        >
          {(operations) => (
            <div className={listStack}>
              {operations.map((op) => {
                const rowActions: RowAction[] = []
                if (canEdit) {
                  rowActions.push({
                    label: 'Modifier',
                    icon: Pencil,
                    onSelect: () => setForm({ open: true, op }),
                  })
                  rowActions.push({
                    label: 'Supprimer',
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setToDelete(op),
                  })
                }
                return (
                  <OperationRow
                    key={op.id}
                    nom={op.nom}
                    description={op.description}
                    typeLibelle={op.types_operations.libelle}
                    necessiteSeuils={op.types_operations.necessite_seuils}
                    seuilMin={op.seuil_minimum}
                    seuilMax={op.seuil_maximum}
                    uniteSymbole={op.unites?.symbole}
                    menuActions={rowActions.length ? rowActions : undefined}
                  />
                )
              })}
            </div>
          )}
        </QueryState>
      </section>

      <div className="border-t pt-4">
        <GammeModelesSection
          gammeId={gammeId}
          gammeSiteId={gammeSiteId}
          canEdit={canEdit}
        />
      </div>

      {canEdit && (
        <OperationFormDialog
          key={`op-${form.op?.id ?? 'new'}-${String(form.open)}`}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          gammeId={gammeId}
          operation={form.op}
        />
      )}

      <ConfirmDeleteDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        entityLabel={
          toDelete ? `l’opération « ${toDelete.nom} »` : 'l’opération'
        }
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
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
    <TooltipIconButton
      icon={<Plus />}
      label="Lier des équipements"
      onClick={() => setLinkOpen(true)}
    />
  ) : undefined

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Wrench className="text-muted-foreground size-4" />
          Équipements liés
        </h3>
        {linkButton}
      </div>

      <QueryState
        query={liesQuery}
        pending={<ListRowSkeletons dense count={3} />}
      >
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
            />
          ) : (
            <div className={listStack}>
              {lies.map((e) => (
                <ListRow
                  key={e.id ?? ''}
                  media={<RowMediaIcon icon={Wrench} />}
                  title={e.nom}
                  badges={
                    e.code_inventaire ? (
                      <Badge variant="secondary">{e.code_inventaire}</Badge>
                    ) : undefined
                  }
                  mobileMeta={e.code_inventaire ?? undefined}
                />
              ))}
            </div>
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
    </section>
  )
}
