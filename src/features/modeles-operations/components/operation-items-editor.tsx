import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ListChecks, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { modelesOperationsQueries } from '../queries'
import type { ModeleOperation } from '../queries'
import { useDeleteOperationItem } from '../mutations'
import { OperationItemFormDialog } from './operation-item-form-dialog'
import { errorMessage } from '@/lib/form'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ListRow } from '@/components/common/list-row'
import { OperationRow } from '@/components/common/operation-row'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { listStack } from '@/lib/responsive'
import type { Database } from '@/lib/database.types'

type OperationItem =
  Database['public']['Tables']['modeles_operations_items']['Row']

interface OperationItemsEditorProps {
  modele: ModeleOperation
  canManage: boolean
}

/** Détail d'un modèle d’opération : la liste ordonnée de ses opérations + leur CRUD. */
export function OperationItemsEditor({
  modele,
  canManage,
}: OperationItemsEditorProps) {
  const query = useQuery(modelesOperationsQueries.items(modele.id))
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  const del = useDeleteOperationItem()
  const [form, setForm] = useState<{
    open: boolean
    item: OperationItem | null
  }>({ open: false, item: null })
  const [toDelete, setToDelete] = useState<OperationItem | null>(null)

  const items = query.data ?? []
  const nextOrdre =
    items.reduce((max, item) => Math.max(max, item.ordre), 0) + 1

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

  return (
    <div className="flex flex-col gap-4">
      {/* En-tête : carte du modèle (image + nom + description), comme le détail
          d'un modèle d'équipement ou d'une gamme. Les actions modèle (Modifier /
          Copier) vivent dans la barre d'onglet. */}
      <ListRow
        media={
          <MiniatureThumb
            url={urlOf(modele.miniature_id)}
            fallback={<ListChecks className="size-10" />}
            alt=""
            onError={refreshMiniatures}
            className="size-full rounded-none"
          />
        }
        title={modele.nom}
        subtitle={
          modele.description?.trim() ? modele.description.trim() : undefined
        }
        badges={
          <Badge variant={modele.site_id === null ? 'secondary' : 'outline'}>
            {modele.site_id === null ? 'Commun' : 'Site'}
          </Badge>
        }
      />

      {/* Section Opérations : liste + ajout via modal (calque de la section
          Caractéristiques du détail d'un modèle d'équipement). */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <ListChecks className="text-muted-foreground size-4" />
          Opérations
        </h3>
        {canManage && (
          <TooltipIconButton
            icon={<Plus />}
            label="Ajouter une opération"
            onClick={() => setForm({ open: true, item: null })}
          />
        )}
      </div>

      <QueryState
        query={query}
        pending={
          <CardSkeletons count={3} container="flex flex-col gap-2" height="h-14" />
        }
        empty={
          <EmptyState
            icon={Plus}
            title="Aucune opération"
            description={
              canManage
                ? 'Ajoute les opérations qui composeront ce modèle d’opération.'
                : 'Ce modèle d’opération ne contient aucune opération.'
            }
          />
        }
      >
        {(rows) => (
          <div className={listStack}>
            {rows.map((item) => (
              <OperationRow
                key={item.id}
                nom={item.nom}
                description={item.description}
                typeLibelle={item.types_operations.libelle}
                necessiteSeuils={item.types_operations.necessite_seuils}
                seuilMin={item.seuil_minimum}
                seuilMax={item.seuil_maximum}
                uniteSymbole={item.unites?.symbole}
                actions={
                  canManage ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setForm({ open: true, item })}
                        aria-label="Modifier l’opération"
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setToDelete(item)}
                        aria-label="Supprimer l’opération"
                      >
                        <Trash2 />
                      </Button>
                    </>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </QueryState>

      {canManage && (
        <OperationItemFormDialog
          // Discriminant `open` : le dialog reste monté, donc on force un
          // remontage à chaque ouverture pour relire les valeurs initiales (nom,
          // type, et surtout `defaultOrdre`/nextOrdre frais) — sinon ajouter
          // plusieurs opérations à la suite réaffiche la saisie + un ordre périmé.
          key={`${form.item?.id ?? 'new'}-${String(form.open)}`}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          modeleId={modele.id}
          item={form.item}
          defaultOrdre={nextOrdre}
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
            ? `« ${toDelete.nom} » sera retirée du modèle d’opération.`
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
