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
import { ImportCsvDialog } from './import-csv-dialog'
import { ImporterDuCommunDialog } from '@/components/common/importer-du-commun-dialog'
import { CataloguePanel } from '@/features/bibliotheque/components/catalogue-panel'
import { parseChamps } from '@/lib/champs'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { deleteErrorMessage } from '@/lib/form'
import * as perm from '@/lib/permissions'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'

// Nombre de caractéristiques d'un modèle. Le JSONB a la forme
// `{ champs: [...] }` : compter ses CLÉS renvoyait toujours 1 (une seule clé,
// `champs`) quel que soit le nombre réel de caractéristiques.
function specCount(specifications: ModeleEquipement['specifications']): number {
  return parseChamps(specifications).length
}

/** « 4 caractéristiques » — sous-titre partagé cards / liste d'import. */
function modeleSpecsLabel(m: ModeleEquipement): string {
  const n = specCount(m.specifications)
  return `${String(n)} caractéristique${n > 1 ? 's' : ''}`
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
      modeleSubtitle={modeleSpecsLabel}
      modeleMasque={(m) => !m.est_actif}
      renderImportCommun={({ open, onOpenChange, siteCible, modeles }) => {
        // Candidats = catalogue commun ACTIF dont aucun homonyme n'est déjà
        // installé sur le site (on ne propose jamais d'y créer un doublon).
        const surLeSite = new Set(
          modeles
            .filter((m) => m.site_id === siteCible)
            .map((m) => m.nom.trim().toLowerCase()),
        )
        const communs = modeles.filter((m) => m.site_id === null && m.est_actif)
        const candidats = communs.filter(
          (m) => !surLeSite.has(m.nom.trim().toLowerCase()),
        )
        return (
          <ImporterDuCommunDialog
            key={`commun-${siteCible}-${String(open)}`}
            open={open}
            onOpenChange={onOpenChange}
            titre="Importer des modèles d’équipements"
            siteNom={sites.find((s) => s.id === siteCible)?.nom ?? null}
            elements={candidats.map((m) => ({
              id: m.id,
              nom: m.nom,
              description: m.description,
              badge: (
                <span className="text-xs text-muted-foreground">
                  {modeleSpecsLabel(m)}
                </span>
              ),
            }))}
            nbDejaInstalles={communs.length - candidats.length}
            importer={(id) =>
              copierModele.mutateAsync({
                sourceModeleId: id,
                siteCible,
              })
            }
            motSingulier="modèle"
            motPluriel="modèles"
            loading={modelesQuery.isPending}
          />
        )
      }}
      renderImportCsv={({ open, onOpenChange, current, modeles }) => (
        <ImportCsvDialog
          key={`import-${current.id}-${String(open)}`}
          open={open}
          onOpenChange={onOpenChange}
          categorie={{
            id: current.id,
            nom: current.nom,
            site_id: current.site_id,
          }}
          existants={modeles}
        />
      )}
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
