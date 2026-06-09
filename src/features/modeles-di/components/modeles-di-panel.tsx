import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, MapPin, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { modelesDiQueries, type ModeleDi } from '../queries'
import { useDeleteModeleDi } from '../mutations'
import { ModeleDiFormDialog } from './modele-di-form-dialog'
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

/** Panneau « Modèles de DI » (scope site strict : exige un site actif). */
export function ModelesDiPanel() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <EmptyState
        icon={MapPin}
        title="Sélectionne un site"
        description="Les modèles de DI sont rattachés à un site : choisis un site pour les gérer."
      />
    )
  }

  return <ModelesDiListPanel siteId={activeSiteId} canManage={canManage} />
}

function ModelesDiListPanel({
  siteId,
  canManage,
}: {
  siteId: string
  canManage: boolean
}) {
  const query = useQuery(modelesDiQueries.list(siteId))
  const del = useDeleteModeleDi()
  const [form, setForm] = useState<{ open: boolean; modele: ModeleDi | null }>({
    open: false,
    modele: null,
  })
  const [toDelete, setToDelete] = useState<ModeleDi | null>(null)

  const handleAdd = useCallback(() => setForm({ open: true, modele: null }), [])
  useTabAddAction(canManage ? handleAdd : null, 'Nouveau modèle de DI')

  // Mises à jour live entre fenêtres / comptes (Realtime).
  useRealtimeRefresh('modeles_di', modelesDiQueries.all())

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
            icon={FileText}
            title="Aucun modèle de DI"
            description={
              canManage
                ? 'Crée un premier modèle pour pré-remplir les demandes.'
                : 'Aucun modèle accessible.'
            }
          />
        }
      >
        {(modeles) => (
          <div className={cardGrid.default}>
            {modeles.map((modele) => (
              <Card key={modele.id} className="min-w-0">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="truncate">{modele.libelle}</CardTitle>
                    {!modele.est_actif && (
                      <Badge variant="outline">Masqué</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
                  <span className="line-clamp-3">{modele.constat_modele}</span>
                  {canManage && (
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
            ))}
          </div>
        )}
      </QueryState>

      {canManage && (
        <ModeleDiFormDialog
          key={form.modele?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          modele={form.modele}
          siteId={siteId}
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
            ? `« ${toDelete.libelle} » sera définitivement supprimé.`
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
