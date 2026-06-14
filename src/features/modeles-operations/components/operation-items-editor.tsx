import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { modelesOperationsQueries } from '../queries'
import type { ModeleOperation } from '../queries'
import { useDeleteOperationItem } from '../mutations'
import { OperationItemFormDialog } from './operation-item-form-dialog'
import { errorMessage } from '@/lib/form'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type OperationItem =
  Database['public']['Tables']['modeles_operations_items']['Row']

// Représentation texte d'un seuil (tiret cadratin si non renseigné).
function formatSeuil(valeur: number | null): string {
  return valeur === null ? '–' : String(valeur)
}

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
      {/* Le nom du modèle vit dans le titre de la barre d'onglet (fil d'Ariane,
          défini par le panneau). Ici : le badge de périmètre + l'ajout. */}
      {(modele.site_id === null || canManage) && (
        <div className="flex flex-wrap items-center gap-2">
          {modele.site_id === null && <Badge variant="secondary">Commun</Badge>}
          {canManage && (
            <Button
              className="ml-auto"
              onClick={() => setForm({ open: true, item: null })}
            >
              <Plus /> Ajouter une opération
            </Button>
          )}
        </div>
      )}

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
          <ul className="flex flex-col gap-2">
            {rows.map((item) => (
              <li key={item.id}>
                <Card className="min-w-0">
                  <CardContent className="flex items-center gap-3 py-3">
                    <span className="text-muted-foreground w-8 shrink-0 text-sm tabular-nums">
                      {item.ordre}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.nom}</p>
                      <p className="text-muted-foreground text-xs">
                        {item.types_operations.libelle}
                        {item.unites
                          ? ` · ${item.unites.nom} (${item.unites.symbole})`
                          : ''}
                        {item.seuil_minimum !== null ||
                        item.seuil_maximum !== null
                          ? ` · seuils ${formatSeuil(item.seuil_minimum)} / ${formatSeuil(item.seuil_maximum)}`
                          : ''}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setForm({ open: true, item })}
                          aria-label="Modifier l’opération"
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToDelete(item)}
                          aria-label="Supprimer l’opération"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
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
