import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Package, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { modelesEquipementsQueries, type ModeleEquipement } from '../queries'
import { useDeleteModeleEquipement } from '../mutations'
import { ModeleEquipementFormDialog } from './modele-equipement-form-dialog'
import { categoriesQueries } from '@/features/categories/queries'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
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

// Nombre de caractéristiques d'un modèle (clés de l'objet JSON).
function specCount(specifications: ModeleEquipement['specifications']): number {
  if (
    specifications &&
    typeof specifications === 'object' &&
    !Array.isArray(specifications)
  ) {
    return Object.keys(specifications).length
  }
  return 0
}

/** Panneau « Modèles d'équipements » : catalogue + CRUD. */
export function ModelesEquipementsPanel() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const canEntreprise = perm.canManageAdmin(role)
  const { activeSiteId, activeSite } = useSiteContext()
  const query = useQuery(modelesEquipementsQueries.catalogue(activeSiteId))
  const categoriesQuery = useQuery(categoriesQueries.list(activeSiteId))
  const del = useDeleteModeleEquipement()

  const categoriesOptions = (categoriesQuery.data ?? [])
    .filter(
      (c) => c.est_actif && (c.scope === 'equipement' || c.scope === 'mixte'),
    )
    .map((c) => ({ id: c.id, nom: c.nom }))

  const [form, setForm] = useState<{
    open: boolean
    modele: ModeleEquipement | null
  }>({ open: false, modele: null })
  const [toDelete, setToDelete] = useState<ModeleEquipement | null>(null)

  const handleAdd = useCallback(() => setForm({ open: true, modele: null }), [])
  useTabAddAction(canManage ? handleAdd : null, 'Nouveau modèle')

  // Mises à jour live entre fenêtres / comptes (Realtime).
  useRealtimeRefresh('modeles_equipements', modelesEquipementsQueries.all())

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Modèle supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <QueryState
        query={query}
        pending={<CardSkeletons count={4} />}
        empty={
          <EmptyState
            icon={Package}
            title="Aucun modèle"
            description={
              canManage
                ? 'Crée un premier modèle pour accélérer la saisie des équipements.'
                : 'Aucun modèle accessible.'
            }
          />
        }
      >
        {(modeles) => (
          <div className={cardGrid.compact}>
            {modeles.map((modele) => {
              // Un tech n'édite que les modèles de site (entreprise en lecture).
              const canEditThis = canEntreprise || modele.site_id !== null
              return (
                <Card key={modele.id} className="min-w-0">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="truncate">{modele.nom}</CardTitle>
                      <div className="flex shrink-0 gap-1">
                        {modele.site_id === null && (
                          <Badge variant="secondary">Commun</Badge>
                        )}
                        {!modele.est_actif && (
                          <Badge variant="outline">Masqué</Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
                    <span className="truncate">
                      {modele.categories?.nom ?? 'Sans catégorie'}
                    </span>
                    <span>
                      {specCount(modele.specifications)} caractéristique
                      {specCount(modele.specifications) > 1 ? 's' : ''}
                    </span>
                    {canManage && canEditThis && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setForm({ open: true, modele })}
                        >
                          <Pencil /> Modifier
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToDelete(modele)}
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
        <ModeleEquipementFormDialog
          key={form.modele?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          modele={form.modele}
          categories={categoriesOptions}
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
        title="Supprimer le modèle ?"
        description={
          toDelete
            ? `« ${toDelete.nom} » sera placé dans la corbeille (récupérable 90 jours). Les équipements déjà créés depuis ce modèle ne sont pas affectés.`
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
