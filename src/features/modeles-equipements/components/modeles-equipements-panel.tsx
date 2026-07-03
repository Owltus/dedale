import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Package } from 'lucide-react'
import { toast } from 'sonner'
import { modelesEquipementsQueries, type ModeleEquipement } from '../queries'
import {
  useCopierModeleEquipement,
  useDeleteModeleEquipement,
} from '../mutations'
import { ModeleEquipementFormDialog } from './modele-equipement-form-dialog'
import { ModeleEquipementDetail } from './modele-equipement-detail'
import { CataloguePanel } from '@/features/bibliotheque/components/catalogue-panel'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { deleteErrorMessage } from '@/lib/form'
import * as perm from '@/lib/permissions'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'

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

/**
 * Panneau « Modèles d'équipements » : catalogue PLAT (catégorie → modèle) monté
 * sur l'ossature générique `CataloguePanel`. La vue détail d'un modèle liste ses
 * caractéristiques (`ModeleEquipementDetail`). Ce composant n'apporte que ses
 * libellés, son dialog de modèle, sa vue détail et son flux de suppression
 * (suppression simple et définitive). La RLS reste l'arbitre réel.
 */
export function ModelesEquipementsPanel() {
  const { data: role } = useCurrentRole()
  const canEntreprise = perm.canManageAdmin(role)
  const { sites } = useSiteContext()

  const modelesQuery = useQuery(modelesEquipementsQueries.pool())
  const del = useDeleteModeleEquipement()
  const copierModele = useCopierModeleEquipement()
  const [toDelete, setToDelete] = useState<ModeleEquipement | null>(null)

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Modèle supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  const deleteModeleDialog = (
    <ConfirmDeleteDialog
      open={toDelete !== null}
      onOpenChange={(open) => {
        if (!open) setToDelete(null)
      }}
      entityLabel={toDelete ? `le modèle « ${toDelete.nom} »` : 'le modèle'}
      warning="Cette suppression est définitive."
      loading={del.isPending}
      onConfirm={confirmDelete}
    />
  )

  return (
    <CataloguePanel<ModeleEquipement>
      modelesQuery={modelesQuery}
      realtimeTable="modeles_equipements"
      modelesAllKey={modelesEquipementsQueries.all()}
      drillKey="modeles-equipements"
      categoryScope={(c) =>
        c.est_actif && (c.scope === 'equipement' || c.scope === 'mixte')
      }
      categoryPresetScope="equipement"
      copier={(args) => copierModele.mutateAsync(args)}
      exportTitre="Copier le modèle vers un site"
      exportResume={(m) => (
        <>
          Le modèle <strong>« {m.nom} »</strong> (ses caractéristiques
          comprises) sera copié sur le site choisi.
        </>
      )}
      modeleFallbackIcon={Package}
      emptyModeleIcon={Package}
      sectionTitleFallback="Modèles d’équipements"
      labelNouveauModele="Nouveau modèle"
      labelModifierModele="Modifier le modèle"
      labelEmptyAddModele="Ajoute un modèle ci-dessus."
      labelEmptyNoneModele="Aucun modèle pour le moment."
      modeleSubtitle={(m) => {
        const specs = specCount(m.specifications)
        return `${String(specs)} caractéristique${specs > 1 ? 's' : ''}`
      }}
      modeleMasque={(m) => !m.est_actif}
      renderModeleForm={({ open, onOpenChange, modele, current, cats }) => (
        <ModeleEquipementFormDialog
          key={`${modele?.id ?? `new-${current.id}`}-${String(open)}`}
          open={open}
          onOpenChange={onOpenChange}
          modele={modele}
          categories={cats.map((c) => ({ id: c.id, nom: c.nom }))}
          canEntreprise={canEntreprise}
          // Édition : ancrer la portée sur le site PROPRE du modèle (une copie de
          // site peut vivre dans une catégorie commune) ; création : la catégorie.
          siteId={modele ? modele.site_id : current.site_id}
          siteName={
            modele?.site_id
              ? (sites.find((s) => s.id === modele.site_id)?.nom ?? null)
              : null
          }
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
        <ModeleEquipementDetail modele={m} canEdit={canEdit} />
      )}
      onAskDeleteModele={setToDelete}
      deleteModeleDialog={deleteModeleDialog}
    />
  )
}
