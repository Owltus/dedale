import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { modelesDiQueries, type ModeleDi } from '../queries'
import { useDeleteModeleDi } from '../mutations'
import { ModeleDiFormDialog } from './modele-di-form-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useScope } from '@/hooks/use-scope'
import { useSiteContext } from '@/lib/site-context'
import { errorMessage } from '@/lib/form'
import { scopeMatches, scopeTarget } from '@/lib/scope'
import * as perm from '@/lib/permissions'
import { useTabAddAction } from '@/components/common/tab-actions'
import { ScopeSelect } from '@/components/common/scope-select'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ListRow } from '@/components/common/list-row'
import { listStack } from '@/lib/responsive'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'

/**
 * Panneau « Modèles de DI » : liste PLATE (pas de catégories), commun + site.
 * Le sélecteur propose « Tout » / « Commun » / chaque site. Le + adopte le
 * périmètre choisi (Commun pour les rôles entreprise, un site pour les rôles
 * métier) et est désactivé sur « Tout ». La RLS arbitre le reste.
 */
export function ModelesDiPanel() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const canEntreprise = perm.canManageAdmin(role)
  const { sites, activeSiteId, activeSite } = useSiteContext()
  const query = useQuery(modelesDiQueries.pool())
  const del = useDeleteModeleDi()
  const { scope, setScope } = useScope()
  // Vignettes (images de cards) : URL signées résolues en lot, live.
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  const [form, setForm] = useState<{ open: boolean; modele: ModeleDi | null }>({
    open: false,
    modele: null,
  })
  const [toDelete, setToDelete] = useState<ModeleDi | null>(null)

  // Le + adopte le périmètre choisi : Commun (entreprise) ou un site précis.
  // Désactivé sur « Tout » ou sur Commun sans le droit entreprise.
  const targetSiteId = scopeTarget(scope)
  const canAdd =
    canManage &&
    targetSiteId !== undefined &&
    (targetSiteId !== null || canEntreprise)
  const lockedScope =
    targetSiteId === undefined
      ? null
      : {
          portee:
            targetSiteId === null ? ('entreprise' as const) : ('site' as const),
          siteId: targetSiteId,
        }

  const handleAdd = useCallback(() => setForm({ open: true, modele: null }), [])
  const scopeControl = useMemo(
    () => <ScopeSelect value={scope} onChange={setScope} />,
    [scope, setScope],
  )
  // Bouton toujours visible pour un rôle métier, mais DÉSACTIVÉ si le périmètre
  // n'est pas créable (Tout, ou Commun sans le droit) → UX stable.
  useTabAddAction(
    canManage ? handleAdd : null,
    canAdd ? 'Nouveau modèle de DI' : 'Ajout indisponible pour ce périmètre',
    {
      disabled: !canAdd,
      extra: scopeControl,
    },
  )

  // Mises à jour live entre fenêtres / comptes (Realtime).
  useRealtimeRefresh('modeles_di', modelesDiQueries.all())

  // Édition : portée verrouillée (immuable). On affiche le site réel du modèle
  // édité ; à la création c'est le site actif qui sert d'option « Site ».
  const editedSiteId =
    form.modele && form.modele.site_id !== null ? form.modele.site_id : null
  const dialogSiteId = form.modele ? editedSiteId : activeSiteId
  const dialogSiteName = form.modele
    ? (sites.find((s) => s.id === editedSiteId)?.nom ?? null)
    : (activeSite?.nom ?? null)

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
        pending={<ListRowSkeletons count={4} />}
        empty={
          <EmptyState
            icon={FileText}
            title="Aucun modèle de DI"
            description={
              canManage
                ? 'Choisis un périmètre, puis crée un modèle via le bouton + en haut à droite.'
                : 'Aucun modèle accessible.'
            }
          />
        }
      >
        {(modeles) => {
          const visible = modeles.filter((m) => scopeMatches(scope, m.site_id))
          if (visible.length === 0) {
            return (
              <EmptyState
                icon={FileText}
                title="Aucun modèle de DI ici"
                description="Aucun modèle dans ce périmètre pour le moment."
              />
            )
          }
          return (
            <div className={listStack}>
              {visible.map((modele) => {
                // Commun éditable par les rôles entreprise ; site éditable par
                // tout rôle métier ayant le site (mirror RLS).
                const canEditThis = canEntreprise || modele.site_id !== null
                const siteName =
                  sites.find((s) => s.id === modele.site_id)?.nom ?? null
                return (
                  <ListRow
                    key={modele.id}
                    media={
                      <MiniatureThumb
                        url={urlOf(modele.miniature_id)}
                        fallback={<FileText className="size-10" />}
                        alt=""
                        onError={refreshMiniatures}
                        className="size-full rounded-none"
                      />
                    }
                    title={modele.libelle}
                    subtitle={modele.constat_modele}
                    badges={
                      <>
                        {modele.site_id === null ? (
                          <Badge variant="secondary">Commun</Badge>
                        ) : (
                          siteName !== null && (
                            <Badge variant="outline">{siteName}</Badge>
                          )
                        )}
                        {!modele.est_actif && (
                          <Badge variant="outline">Masqué</Badge>
                        )}
                      </>
                    }
                    actions={
                      canManage && canEditThis ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Modifier le modèle"
                            onClick={() => setForm({ open: true, modele })}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Supprimer le modèle"
                            onClick={() => setToDelete(modele)}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      ) : undefined
                    }
                  />
                )
              })}
            </div>
          )
        }}
      </QueryState>

      {canManage && (
        <ModeleDiFormDialog
          key={`${form.modele?.id ?? `new-${scope}`}-${String(form.open)}`}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          modele={form.modele}
          canEntreprise={canEntreprise}
          siteId={dialogSiteId}
          siteName={dialogSiteName}
          lockedScope={form.modele ? undefined : (lockedScope ?? undefined)}
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
