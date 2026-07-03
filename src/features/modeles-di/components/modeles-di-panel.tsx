import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Pencil, Trash2 } from 'lucide-react'
import { modelesDiQueries, type ModeleDi } from '../queries'
import { useDeleteModeleDi } from '../mutations'
import { ModeleDiFormDialog } from './modele-di-form-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useScope } from '@/hooks/use-scope'
import { useSiteContext } from '@/lib/site-context'
import { scopeMatches, scopeTarget } from '@/lib/scope'
import * as perm from '@/lib/permissions'
import { useTabAddAction } from '@/components/common/tab-actions'
import { ScopeSelect } from '@/components/common/scope-select'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ScopeBadges } from '@/components/common/scope-badges'
import { ListRow } from '@/components/common/list-row'
import type { RowAction } from '@/components/common/row-actions'
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

  const dialog = useEntityDialog<ModeleDi>()
  const suppression = useConfirmDelete<ModeleDi>({
    onDelete: (m) => del.mutateAsync(m.id),
    successMessage: 'Modèle supprimé',
  })

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

  // `openCreate` change d'identité à chaque rendu (fabrique du hook) : on le fige
  // via une réf (mise à jour en effet) pour garder `handleAdd` stable et éviter
  // les ré-enregistrements de `useTabAddAction` (cf. son contrat).
  const openCreateRef = useRef(dialog.openCreate)
  useEffect(() => {
    openCreateRef.current = dialog.openCreate
  })
  const handleAdd = useCallback(() => openCreateRef.current(), [])
  const scopeControl = useMemo(
    () => <ScopeSelect value={scope} onChange={setScope} fluid />,
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
    dialog.entity && dialog.entity.site_id !== null ? dialog.entity.site_id : null
  const dialogSiteId = dialog.entity ? editedSiteId : activeSiteId
  const dialogSiteName = dialog.entity
    ? (sites.find((s) => s.id === editedSiteId)?.nom ?? null)
    : (activeSite?.nom ?? null)

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
                const rowActions: RowAction[] = []
                if (canManage && canEditThis) {
                  rowActions.push({
                    label: 'Modifier',
                    icon: Pencil,
                    onSelect: () => dialog.openEdit(modele),
                  })
                  rowActions.push({
                    label: 'Supprimer',
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => suppression.demander(modele),
                  })
                }
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
                      <ScopeBadges
                        siteId={modele.site_id}
                        siteName={siteName}
                        masque={!modele.est_actif}
                      />
                    }
                    // Sous `sm` la colonne `badges` est masquée → on replie la
                    // portée sous le titre pour ne pas la perdre sur mobile.
                    mobileMeta={
                      <ScopeBadges
                        siteId={modele.site_id}
                        siteName={siteName}
                        masque={!modele.est_actif}
                      />
                    }
                    menuActions={rowActions.length ? rowActions : undefined}
                  />
                )
              })}
            </div>
          )
        }}
      </QueryState>

      {canManage && (
        <ModeleDiFormDialog
          key={`${dialog.entity?.id ?? `new-${scope}`}-${String(dialog.open)}`}
          open={dialog.open}
          onOpenChange={dialog.onOpenChange}
          modele={dialog.entity}
          canEntreprise={canEntreprise}
          siteId={dialogSiteId}
          siteName={dialogSiteName}
          lockedScope={dialog.entity ? undefined : (lockedScope ?? undefined)}
        />
      )}

      <ConfirmDialog
        {...suppression.dialogProps}
        title="Supprimer le modèle ?"
        description={
          suppression.toDelete
            ? `« ${suppression.toDelete.libelle} » sera supprimé définitivement.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
      />
    </div>
  )
}
