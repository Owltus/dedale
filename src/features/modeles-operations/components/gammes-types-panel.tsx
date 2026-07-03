import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import { modelesOperationsQueries, type ModeleOperation } from '../queries'
import {
  useCopierModeleOperation,
  useDetacherEtSupprimerModeleOperation,
} from '../mutations'
import { GammeTypeFormDialog } from './gamme-type-form-dialog'
import { OperationItemsEditor } from './operation-items-editor'
import { CataloguePanel } from '@/features/bibliotheque/components/catalogue-panel'
import { useCurrentRole } from '@/hooks/use-current-role'
import { errorMessage, pgCode } from '@/lib/form'
import * as perm from '@/lib/permissions'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'

/**
 * Message clair pour une suppression de modèle d'opération refusée (pas de mur
 * d'erreur brut `23503`/`23001`).
 */
function deleteModeleErrorMessage(e: unknown): string {
  const code = pgCode(e)
  if (code === '42501') {
    return 'Action non autorisée : vous n’avez pas les droits pour supprimer ce modèle.'
  }
  if (code === '23503') {
    return 'Ce modèle reste lié à des gammes hors de votre périmètre : suppression impossible.'
  }
  // restrict_violation (23001) : message FR explicite de la base → tel quel.
  return errorMessage(e)
}

/**
 * Panneau « Modèles d'opérations » : catalogue PLAT (catégorie → modèle) monté
 * sur l'ossature générique `CataloguePanel`. La vue détail d'un modèle est son
 * éditeur d'opérations (`OperationItemsEditor`). Ce composant n'apporte que ses
 * libellés, son dialog de modèle, sa vue détail et son flux de suppression
 * ATOMIQUE (RPC détachement + delete, avec l'aperçu des gammes liées). La RLS
 * reste l'arbitre réel.
 */
export function GammesTypesPanel() {
  const { data: role } = useCurrentRole()
  const canEntreprise = perm.canManageAdmin(role)

  const modelesQuery = useQuery(modelesOperationsQueries.pool())
  const detachEtSupprime = useDetacherEtSupprimerModeleOperation()
  const copierModele = useCopierModeleOperation()
  const [toDelete, setToDelete] = useState<ModeleOperation | null>(null)

  // Gammes liées au modèle à supprimer : on anticipe le RESTRICT FK plutôt que de
  // heurter un mur d'erreur. La requête n'est active que pendant la confirmation.
  const liensQuery = useQuery({
    ...modelesOperationsQueries.liens(toDelete?.id ?? ''),
    enabled: toDelete !== null,
  })
  const liens = liensQuery.data ?? []
  const hasLiens = liens.length > 0

  function confirmDelete() {
    if (!toDelete) return
    // TOUJOURS via la RPC atomique : elle détache TOUTES les liaisons (y compris
    // cross-site masquées RLS) puis supprime, en re-vérifiant les droits.
    detachEtSupprime.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Modèle d’opération supprimé')
        setToDelete(null)
      },
      onError: (e: unknown) => toast.error(deleteModeleErrorMessage(e)),
    })
  }

  // Suppression d'un modèle : les gammes liées sont affichées en IMPACTS (toutes
  // actives — plus de soft-delete). La RPC les détache puis supprime, donc ce
  // n'est jamais bloquant. Le dialogue tronque lui-même la liste (5 + « et N »).
  const liensNoms = liens.map((l) => `« ${l.nom} »`)
  const deleteModeleEntityLabel = `le modèle d’opération${
    toDelete ? ` « ${toDelete.nom} »` : ''
  }`
  const deleteModeleImpactsTitle = hasLiens
    ? `Ce modèle est utilisé par ${String(liens.length)} gamme${
        liens.length > 1 ? 's' : ''
      } :`
    : undefined
  const deleteModeleWarning: ReactNode = !toDelete
    ? undefined
    : liensQuery.isError
      ? 'Vérification des gammes liées impossible. Toute liaison résiduelle sera détachée, puis le modèle et ses opérations seront supprimés définitivement.'
      : hasLiens
        ? 'Ces gammes seront détachées (sans être supprimées), puis le modèle et ses opérations seront supprimés définitivement.'
        : 'Le modèle et ses opérations seront supprimés définitivement.'

  const deleteModeleDialog = (
    <ConfirmDeleteDialog
      open={toDelete !== null}
      onOpenChange={(open) => {
        if (!open) setToDelete(null)
      }}
      entityLabel={deleteModeleEntityLabel}
      loadingImpacts={liensQuery.isLoading}
      impactsTitle={deleteModeleImpactsTitle}
      impacts={hasLiens ? liensNoms : undefined}
      warning={deleteModeleWarning}
      confirmLabel={hasLiens ? 'Détacher puis supprimer' : 'Supprimer'}
      loading={detachEtSupprime.isPending || liensQuery.isLoading}
      onConfirm={confirmDelete}
    />
  )

  return (
    <CataloguePanel<ModeleOperation>
      modelesQuery={modelesQuery}
      realtimeTable="modeles_operations"
      modelesAllKey={modelesOperationsQueries.all()}
      drillKey="gammes-types"
      categoryScope={(c) => c.est_actif && c.scope === 'operation'}
      categoryPresetScope="operation"
      copier={(args) => copierModele.mutateAsync(args)}
      exportTitre="Copier le modèle d’opération vers un site"
      exportResume={(m) => (
        <>
          Le modèle <strong>« {m.nom} »</strong> (ses opérations comprises) sera
          copié sur le site choisi.
        </>
      )}
      modeleFallbackIcon={ListChecks}
      emptyModeleIcon={ListChecks}
      sectionTitleFallback="Modèles d’opérations"
      labelNouveauModele="Nouveau modèle d’opération"
      labelModifierModele="Modifier le modèle d’opération"
      labelEmptyAddModele="Ajoute un modèle d’opération ci-dessus."
      labelEmptyNoneModele="Aucun modèle d’opération pour le moment."
      modeleSubtitle={(m) =>
        m.description?.trim() ? m.description.trim() : undefined
      }
      renderModeleForm={({ open, onOpenChange, modele, current, cats }) => (
        <GammeTypeFormDialog
          key={`${modele?.id ?? `new-${current.id}`}-${String(open)}`}
          open={open}
          onOpenChange={onOpenChange}
          modele={modele}
          categories={cats.map((c) => ({ id: c.id, nom: c.nom }))}
          canEntreprise={canEntreprise}
          // Édition : ancrer la portée sur le site PROPRE du modèle ; création : la catégorie.
          siteId={modele ? modele.site_id : current.site_id}
          lockedScope={
            modele
              ? undefined
              : {
                  portee: current.site_id === null ? 'entreprise' : 'site',
                  siteId: current.site_id,
                }
          }
          lockedCategorieId={modele ? undefined : current.id}
        />
      )}
      renderDetail={(m, canEdit) => (
        <OperationItemsEditor modele={m} canManage={canEdit} />
      )}
      onAskDeleteModele={setToDelete}
      deleteModeleDialog={deleteModeleDialog}
    />
  )
}
