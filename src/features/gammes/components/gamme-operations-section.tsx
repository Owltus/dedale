import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ListChecks, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { gammesQueries, type GammeOperation } from '../queries'
import { useDeleteOperation } from '../mutations'
import { OperationFormDialog } from './operation-form-dialog'
import { deleteErrorMessage } from '@/lib/form'
import { listStack } from '@/lib/responsive'
import { SplitPane } from '@/components/common/split-panes'
import { SectionHeader } from '@/components/common/section'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { OperationRow } from '@/components/common/operation-row'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import type { RowAction } from '@/components/common/row-actions'

/**
 * Section « Opérations spécifiques » d'une gamme : la liste des opérations propres
 * à la gamme (en plus de celles héritées des modèles liés) avec ajout / édition /
 * suppression. Brique PARTAGÉE par :
 *  - la fiche d'une gamme de SITE (`GammeDetail`, onglet Opérations) — `variant`
 *    `split`, 1er panneau d'un `SplitPanes` (en-tête `SectionHeader` fixe + corps
 *    défilant) ;
 *  - le détail d'une gamme-TEMPLATE de la Bibliothèque (`GammesBiblioPanel`) —
 *    `variant` `panel`, moitié haute d'un `grid-rows-2`, état vide plus explicite.
 * Le realtime des opérations reste porté par l'HÔTE (seule la Bibliothèque s'y
 * abonne aujourd'hui) : la brique ne s'y abonne pas. La RLS arbitre l'écriture.
 */
export function GammeOperationsSection({
  gammeId,
  canEdit,
  variant,
}: {
  gammeId: string
  canEdit: boolean
  /** Enveloppe de mise en page (cf. description du composant). */
  variant: 'split' | 'panel'
}) {
  const query = useQuery(gammesQueries.operations(gammeId))
  const del = useDeleteOperation()
  const [form, setForm] = useState<{ open: boolean; op: GammeOperation | null }>(
    { open: false, op: null },
  )
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

  const liste = (
    <QueryState
      query={query}
      pending={<ListRowSkeletons dense count={3} />}
      empty={
        variant === 'split' ? (
          <EmptyState
            icon={ListChecks}
            title="Aucune opération"
            className="min-h-full justify-center"
          />
        ) : (
          <EmptyState
            icon={ListChecks}
            title="Aucune opération spécifique"
            description={
              canEdit
                ? 'Ajoute les opérations propres à cette gamme (en plus de celles des modèles liés).'
                : 'Aucune opération spécifique pour cette gamme.'
            }
          />
        )
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
  )

  const dialogs = (
    <>
      {canEdit && (
        <OperationFormDialog
          // `open` dans la key (calque des autres dialogs) : le dialog reste monté
          // → sans ce discriminant, champs/erreurs resteraient stale à la
          // réouverture (ou doublon entre édition et nouvelle opération).
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
    </>
  )

  if (variant === 'split') {
    return (
      <>
        <SplitPane
          header={
            <SectionHeader
              icon={ListChecks}
              title="Opérations spécifiques"
              action={addButton}
            />
          }
        >
          {liste}
        </SplitPane>
        {dialogs}
      </>
    )
  }

  return (
    <>
      <section className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <ListChecks className="text-muted-foreground size-4" />
            Opérations spécifiques
          </h3>
          {addButton}
        </div>
        {liste}
      </section>
      {dialogs}
    </>
  )
}
