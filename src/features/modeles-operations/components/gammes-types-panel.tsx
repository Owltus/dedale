import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ListChecks, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { modelesOperationsQueries, type ModeleOperation } from '../queries'
import { useDeleteModeleOperation } from '../mutations'
import { GammeTypeFormDialog } from './gamme-type-form-dialog'
import { OperationItemsEditor } from './operation-items-editor'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { errorMessage } from '@/lib/form'
import * as perm from '@/lib/permissions'
import { useTabAddAction } from '@/components/common/tab-actions'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cardGrid } from '@/lib/responsive'

/** Panneau « Gammes-types » : liste des modèles d'opérations + leurs items. */
export function GammesTypesPanel() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const canEntreprise = perm.canManageAdmin(role)
  const { activeSiteId, activeSite } = useSiteContext()
  const query = useQuery(modelesOperationsQueries.list(activeSiteId))
  const del = useDeleteModeleOperation()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<{
    open: boolean
    modele: ModeleOperation | null
  }>({ open: false, modele: null })
  const [toDelete, setToDelete] = useState<ModeleOperation | null>(null)

  const selected =
    selectedId !== null
      ? (query.data?.find((m) => m.id === selectedId) ?? null)
      : null

  // En vue liste seulement : le + ajoute une gamme-type (la vue détail a son
  // propre bouton « Ajouter une opération »).
  const handleAdd = useCallback(() => setForm({ open: true, modele: null }), [])
  useTabAddAction(
    selected === null && canManage ? handleAdd : null,
    'Nouvelle gamme-type',
  )

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Gamme-type supprimée')
        setToDelete(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  if (selected) {
    // Un tech ne gère les opérations que d'une gamme-type de site.
    const canManageItems =
      canManage && (canEntreprise || selected.site_id !== null)
    return (
      <>
        <OperationItemsEditor
          modele={selected}
          canManage={canManageItems}
          onBack={() => setSelectedId(null)}
        />
        {canManage && (
          <GammeTypeFormDialog
            key={form.modele?.id ?? 'new'}
            open={form.open}
            onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
            modele={form.modele}
            canEntreprise={canEntreprise}
            siteId={activeSiteId}
            siteName={activeSite?.nom ?? null}
          />
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <QueryState
        query={query}
        pending={<CardSkeletons count={4} />}
        empty={
          <EmptyState
            icon={ListChecks}
            title="Aucune gamme-type"
            description={
              canManage
                ? 'Crée une première gamme-type pour réutiliser des jeux d’opérations.'
                : 'Aucune gamme-type accessible.'
            }
          />
        }
      >
        {(modeles) => (
          <div className={cardGrid.compact}>
            {modeles.map((modele) => {
              const canEditThis = canEntreprise || modele.site_id !== null
              return (
                <Card
                  key={modele.id}
                  className="min-w-0 cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => setSelectedId(modele.id)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="truncate">{modele.nom}</CardTitle>
                      {modele.site_id === null && (
                        <Badge variant="secondary">Commun</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
                    <span className="line-clamp-2">
                      {modele.description ?? 'Sans description.'}
                    </span>
                    {canManage && canEditThis && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setForm({ open: true, modele })
                          }}
                        >
                          <Pencil /> Modifier
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setToDelete(modele)
                          }}
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
        <GammeTypeFormDialog
          key={form.modele?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          modele={form.modele}
          canEntreprise={canEntreprise}
          siteId={activeSiteId}
          siteName={activeSite?.nom ?? null}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer la gamme-type ?"
        description={
          toDelete
            ? `« ${toDelete.nom} » et ses opérations seront supprimées. Action impossible si elle est encore liée à des gammes.`
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
