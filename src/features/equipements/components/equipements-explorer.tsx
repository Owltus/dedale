import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Folder,
  FolderTree,
  Inbox,
  Package,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { equipementsQueries } from '../queries'
import { useDeleteEquipement } from '../mutations'
import { EquipementFormDialog } from './equipement-form-dialog'
import { InstancierDialog } from './instancier-dialog'
import { ParcSousCategorieDialog } from './parc-sous-categorie-dialog'
import { EquipementDetail } from './equipement-detail'
import { modelesEquipementsQueries } from '@/features/modeles-equipements/queries'
import {
  categoriesQueries,
  type Categorie,
} from '@/features/categories/queries'
import { CategoryFormDialog } from '@/features/categories/components/category-form-dialog'
import { useDeleteCategorie } from '@/features/categories/mutations'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useEquipementsDrill } from '@/hooks/use-equipements-drill'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { deleteErrorMessage } from '@/lib/form'
import { segOfUnique } from '@/lib/slug'
import * as perm from '@/lib/permissions'
import {
  TitleBreadcrumb,
  type BreadcrumbAncestor,
} from '@/components/common/title-breadcrumb'
import { PageHeader } from '@/components/common/page-header'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ListRow } from '@/components/common/list-row'
import { listStack } from '@/lib/responsive'
import { ScopeBadges } from '@/components/common/scope-badges'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/database.types'

type Equipement = Database['public']['Views']['v_equipements_complet']['Row']

// Id sentinelle du bac « Non classé » (catégorie VIRTUELLE, hors base) : regroupe
// à la racine les équipements du site sans catégorie de site (legacy/import, ou
// rangés dans une catégorie commune non affichée ici) pour ne JAMAIS les cacher.
const NON_CLASSE_ID = '__non_classe__'

/**
 * Catégorie pour le DRILL : projection minimale (les champs lus à l'affichage +
 * `parent_id` pour l'arbre), plus un drapeau `virtual` pour le bac « Non classé ».
 * Évite de fabriquer une `Categorie` complète (fragile) pour le nœud virtuel.
 */
interface DrillCat {
  id: string
  nom: string
  parent_id: string | null
  site_id: string | null
  description: string | null
  miniature_id: string | null
  ordre: number
  /** Modèle fixé sur la sous-catégorie (les équipements en sont des copies). */
  modeleId: string | null
  virtual: boolean
}

/** Segment d'URL d'un équipement, désambiguïsé entre frères (même palier). */
function equipementSeg(e: Equipement, siblings: Equipement[]): string {
  return segOfUnique(
    { id: e.id ?? '', nom: e.nom ?? '' },
    siblings.map((s) => ({ id: s.id ?? '', nom: s.nom ?? '' })),
  )
}

/**
 * Explorateur des Équipements du SITE actif : navigation par CATÉGORIE portée par
 * l'URL (même patron que le panneau « Modèles d'équipements » de la Bibliothèque,
 * via `useEquipementsDrill`), mais pour les ÉQUIPEMENTS RÉELS — chemin CLASSIQUE :
 * - Racine : les catégories d'équipement DU SITE (+ un bac « Non classé » si des
 *   équipements n'ont pas de catégorie de site). On n'y crée QUE des catégories.
 * - Dans une catégorie : ses équipements ; on y crée un équipement (manuel) ou on
 *   le crée depuis un modèle (instanciation → équipement autonome).
 * - Sur un équipement : sa fiche détail.
 * Le commun n'apparaît jamais ici (catalogue = Bibliothèque) ; pas de sélecteur de
 * périmètre (le site actif est fixé par la sidebar).
 */
export function EquipementsExplorer({ siteId }: { siteId: string }) {
  const { data: role } = useCurrentRole()
  const canEdit = perm.canManageMetier(role)
  const canEntreprise = perm.canManageAdmin(role)

  const categoriesQuery = useQuery(categoriesQueries.pool())
  const equipementsQuery = useQuery(equipementsQueries.list(siteId))
  const modelesQuery = useQuery(modelesEquipementsQueries.list(siteId))
  // Mises à jour live (équipements ET catégories) entre fenêtres / comptes.
  useRealtimeRefresh('equipements', equipementsQueries.all())
  useRealtimeRefresh('categories', categoriesQueries.all())

  const del = useDeleteEquipement()
  const delCategorie = useDeleteCategorie()
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  // Catégories de PARC du site actif (scope 'parc', taxonomie DÉDIÉE aux
  // équipements réels — séparée des catégories de modèles depuis 028), actives.
  const equipmentCats = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (c) => c.est_actif && c.scope === 'parc' && c.site_id === siteId,
      ),
    [categoriesQuery.data, siteId],
  )
  // Accès rapide à la catégorie COMPLÈTE (pour l'édition via le formulaire).
  const categoriesById = useMemo(
    () => new Map(equipmentCats.map((c) => [c.id, c])),
    [equipmentCats],
  )

  const equipements = useMemo(
    () => equipementsQuery.data ?? [],
    [equipementsQuery.data],
  )

  // Équipement « de racine » : sans catégorie OU rangé dans une catégorie non
  // visible ici (p. ex. commune) → on le regroupe dans le bac « Non classé ».
  const visibleCatIds = useMemo(
    () => new Set(equipmentCats.map((c) => c.id)),
    [equipmentCats],
  )
  const isRootEquipement = useCallback(
    (e: Equipement) =>
      e.categorie_id === null || !visibleCatIds.has(e.categorie_id),
    [visibleCatIds],
  )
  const orphans = useMemo(
    () => equipements.filter(isRootEquipement),
    [equipements, isRootEquipement],
  )

  // Catégories du drill = catégories du site (projetées) + bac « Non classé »
  // (uniquement s'il y a des orphelins → dataset propre = comme la Bibliothèque).
  const drillCats = useMemo<DrillCat[]>(() => {
    const real: DrillCat[] = equipmentCats.map((c) => ({
      id: c.id,
      nom: c.nom,
      parent_id: c.parent_id,
      site_id: c.site_id,
      description: c.description,
      miniature_id: c.miniature_id,
      ordre: c.ordre,
      modeleId: c.modele_equipement_id,
      virtual: false,
    }))
    if (orphans.length > 0) {
      real.push({
        id: NON_CLASSE_ID,
        nom: 'Non classé',
        parent_id: null,
        site_id: siteId,
        description: 'Équipements sans catégorie',
        miniature_id: null,
        // Toujours en DERNIER dans la liste des catégories racine.
        ordre: Number.MAX_SAFE_INTEGER,
        modeleId: null,
        virtual: true,
      })
    }
    return real
  }, [equipmentCats, orphans, siteId])

  const { path, current, depth, children, goTo, leafSeg, goToLeaf } =
    useEquipementsDrill(drillCats)

  // Sous-catégories du palier courant, triées (le bac « Non classé » finit dernier).
  const childCategories = useMemo(
    () =>
      [...children].sort(
        (a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom),
      ),
    [children],
  )

  // Équipements d'un palier : bac « Non classé » → orphelins ; sinon ceux qui
  // référencent la catégorie. Source unique du regroupement (listing + résolution
  // de feuille + navigation).
  const equipementsUnder = useCallback(
    (catId: string | null) =>
      catId === NON_CLASSE_ID
        ? orphans
        : catId === null
          ? []
          : equipements.filter((e) => e.categorie_id === catId),
    [equipements, orphans],
  )

  // Équipements du palier courant (uniquement dans une catégorie), triés.
  const equipementsInCurrent = useMemo(
    () =>
      current === null
        ? []
        : [...equipementsUnder(current.id)].sort((a, b) =>
            (a.nom ?? '').localeCompare(b.nom ?? ''),
          ),
    [equipementsUnder, current],
  )

  // Équipement OUVERT (vue détail, niveau FEUILLE) : résolu parmi les équipements
  // du palier courant (mêmes frères qu'à la génération → slug stable).
  const openEquipement = useMemo(() => {
    if (leafSeg === undefined || current === null) return null
    const siblings = equipementsUnder(current.id)
    return siblings.find((e) => equipementSeg(e, siblings) === leafSeg) ?? null
  }, [leafSeg, current, equipementsUnder])

  // Chaîne de catégories (racine → cat) d'un id réel : pour ouvrir un équipement
  // par son CHEMIN RÉEL, indépendant du palier courant.
  const catChain = useCallback(
    (catId: string | null): DrillCat[] => {
      const chain: DrillCat[] = []
      let id = catId
      while (id) {
        const c = drillCats.find((x) => x.id === id)
        if (!c) break
        chain.unshift(c)
        id = c.parent_id
      }
      return chain
    },
    [drillCats],
  )

  const goToEquipement = useCallback(
    (e: Equipement, opts?: { replace?: boolean }) => {
      // Orphelin → bac « Non classé » ; sinon le chemin réel de sa catégorie.
      const orphan = isRootEquipement(e)
      const chain = orphan ? catChain(NON_CLASSE_ID) : catChain(e.categorie_id)
      const siblings = equipementsUnder(orphan ? NON_CLASSE_ID : e.categorie_id)
      goToLeaf(chain, equipementSeg(e, siblings), { replace: opts?.replace })
    },
    [isRootEquipement, catChain, equipementsUnder, goToLeaf],
  )

  // Re-synchronise l'URL si l'équipement OUVERT est renommé (« Modifier » ou
  // réception realtime) : son slug change → l'URL ne le résout plus. On mémorise
  // id + segment et, s'il existe encore, on réécrit l'URL sur son chemin frais
  // (REPLACE) sans fermer le détail ; supprimé → repli propre vers la navigation.
  const lastIdRef = useRef<string | null>(null)
  const lastLeafRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (openEquipement !== null) {
      lastIdRef.current = openEquipement.id ?? null
      lastLeafRef.current = leafSeg
    }
  }, [openEquipement, leafSeg])
  useEffect(() => {
    if (leafSeg === undefined || openEquipement !== null) return
    if (leafSeg !== lastLeafRef.current) return
    const id = lastIdRef.current
    if (id === null) return
    const fresh = equipements.find((e) => e.id === id)
    if (!fresh) return
    goToEquipement(fresh, { replace: true })
  }, [leafSeg, openEquipement, equipements, goToEquipement])

  // --- Dialogs ---
  const [categoryForm, setCategoryForm] = useState<{
    open: boolean
    categorie: Categorie | null
  }>({ open: false, categorie: null })
  // Création d'une SOUS-catégorie (nom + modèle fixé) sous la catégorie `parentId`.
  const [subcatForm, setSubcatForm] = useState<{
    open: boolean
    parentId: string | null
  }>({ open: false, parentId: null })
  const [equipForm, setEquipForm] = useState<{
    open: boolean
    eq: Equipement | null
  }>({ open: false, eq: null })
  const [instancierOpen, setInstancierOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Equipement | null>(null)
  const [toDeleteCategorie, setToDeleteCategorie] = useState<DrillCat | null>(
    null,
  )

  // Une catégorie réelle de site est gérable par le rôle métier ; le bac virtuel
  // « Non classé » ne l'est jamais.
  const canManageCat = useCallback(
    (c: DrillCat) =>
      !c.virtual && canEdit && (canEntreprise || c.site_id !== null),
    [canEdit, canEntreprise],
  )

  // « Créer depuis un modèle » ne propose QUE les modèles DU SITE. Un modèle
  // commun doit d'abord être exporté vers le site depuis la Bibliothèque.
  const modeleOptions = useMemo(
    () =>
      (modelesQuery.data ?? [])
        .filter((m) => m.site_id === siteId)
        .map((m) => ({ id: m.id, nom: m.nom })),
    [modelesQuery.data, siteId],
  )

  function confirmDelete() {
    if (!toDelete?.id) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Équipement supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  function confirmDeleteCategorie() {
    if (!toDeleteCategorie) return
    delCategorie.mutate(toDeleteCategorie.id, {
      onSuccess: () => {
        toast.success('Catégorie supprimée')
        setToDeleteCategorie(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  // La base BLOQUE la suppression d'une catégorie NON VIDE (sous-catégorie ou
  // équipement rattaché). Pré-calcul pour adapter le message et désactiver.
  const toDeleteCategorieNonVide =
    toDeleteCategorie !== null &&
    (equipmentCats.some((c) => c.parent_id === toDeleteCategorie.id) ||
      equipements.some((e) => e.categorie_id === toDeleteCategorie.id))

  // Catégories racines (parent candidat à l'édition).
  const parentCandidates = useMemo(
    () => equipmentCats.filter((c) => c.parent_id === null),
    [equipmentCats],
  )

  // --- En-tête : titre de page (racine) ou fil d'Ariane (descente) + actions. ---
  const isVirtualCurrent = current?.virtual ?? false
  // Création d'une CATÉGORIE racine (à la racine) ou d'une SOUS-catégorie (dans une
  // catégorie, niveau 1 → niveau 2 ; pas au-delà : 2 niveaux max, comme les gammes).
  // Boutons d'action ICÔNE SEULE + tooltip (comme la barre de la Bibliothèque).
  const newCategoryBtn = canEdit ? (
    <TooltipIconButton
      icon={<Plus />}
      label="Nouvelle catégorie"
      variant="default"
      onClick={() => setCategoryForm({ open: true, categorie: null })}
    />
  ) : null
  const canCreateSubcat = canEdit && depth === 1 && !isVirtualCurrent
  const newSubCategoryBtn = canCreateSubcat ? (
    <TooltipIconButton
      icon={<Plus />}
      label="Nouvelle sous-catégorie"
      variant="default"
      onClick={() =>
        setSubcatForm({ open: true, parentId: current?.id ?? null })
      }
    />
  ) : null
  // Création d'équipement UNIQUEMENT dans une SOUS-catégorie (niveau ≥2) — chemin
  // strict catégorie → sous-catégorie → équipement. Au niveau 1 (une catégorie),
  // on ne crée QUE des sous-catégories ; jamais d'équipement.
  const canCreateEquipHere = canEdit && depth >= 2 && !isVirtualCurrent
  const newEquipBtn = canCreateEquipHere ? (
    <TooltipIconButton
      icon={<Plus />}
      label="Nouvel équipement"
      variant="default"
      onClick={() => {
        // Sous-catégorie AVEC modèle → l'équipement est une copie du modèle
        // (instanciation) ; sans modèle (cas legacy) → saisie libre.
        if (current?.modeleId) setInstancierOpen(true)
        else setEquipForm({ open: true, eq: null })
      }}
    />
  ) : null
  const editEquipBtn =
    canEdit && openEquipement !== null ? (
      <TooltipIconButton
        icon={<Pencil />}
        label="Modifier"
        variant="default"
        onClick={() => setEquipForm({ open: true, eq: openEquipement })}
      />
    ) : null

  let header: React.ReactNode
  if (openEquipement !== null) {
    const ancestors: BreadcrumbAncestor[] = [
      { key: 'racine', label: 'Équipements', onClick: () => goTo([]) },
      ...path.map((c, i) => ({
        key: c.id,
        label: c.nom,
        onClick: () => goTo(path.slice(0, i + 1)),
      })),
    ]
    header = (
      <DrillHeader
        breadcrumb={
          <TitleBreadcrumb
            ancestors={ancestors}
            current={openEquipement.nom ?? 'Équipement'}
          />
        }
        actions={editEquipBtn}
      />
    )
  } else if (depth > 0) {
    const ancestors: BreadcrumbAncestor[] = [
      { key: 'racine', label: 'Équipements', onClick: () => goTo([]) },
      ...path.slice(0, -1).map((c, i) => ({
        key: c.id,
        label: c.nom,
        onClick: () => goTo(path.slice(0, i + 1)),
      })),
    ]
    header = (
      <DrillHeader
        breadcrumb={
          <TitleBreadcrumb
            ancestors={ancestors}
            current={current?.nom ?? 'Catégorie'}
          />
        }
        actions={
          <>
            {newSubCategoryBtn}
            {newEquipBtn}
          </>
        }
      />
    )
  } else {
    header = (
      <PageHeader
        title="Équipements"
        description="Parc matériel du site, rangé par catégorie."
        action={newCategoryBtn ?? undefined}
      />
    )
  }

  const dialogs = (
    <>
      {canEdit && (
        <CategoryFormDialog
          key={
            (categoryForm.categorie
              ? `cat-edit-${categoryForm.categorie.id}`
              : 'cat-new') + `-${String(categoryForm.open)}`
          }
          open={categoryForm.open}
          onOpenChange={(open) => setCategoryForm((f) => ({ ...f, open }))}
          categorie={categoryForm.categorie}
          // Catégorie RACINE de parc (les sous-catégories passent par leur propre
          // dialog avec modèle fixé).
          preset={{ scope: 'parc' }}
          categories={parentCandidates}
          canEntreprise={canEntreprise}
          siteId={categoryForm.categorie ? null : siteId}
          siteName={null}
          // Création depuis cette page = catégorie DU SITE actif (portée verrouillée).
          lockedScope={
            categoryForm.categorie ? undefined : { portee: 'site', siteId }
          }
          minimal
          // Scope 'parc' imposé : jamais proposé/modifiable dans le formulaire.
          hideScope
        />
      )}

      {canEdit && (
        <EquipementFormDialog
          key={`${equipForm.eq?.id ?? `new-${current?.id ?? 'root'}`}-${String(equipForm.open)}`}
          open={equipForm.open}
          onOpenChange={(open) => setEquipForm((f) => ({ ...f, open }))}
          siteId={siteId}
          equipement={equipForm.eq}
          // Création depuis une vraie catégorie → catégorie présélectionnée.
          presetCategorieId={
            equipForm.eq || isVirtualCurrent ? undefined : (current?.id ?? null)
          }
        />
      )}

      {canEdit && (
        <ParcSousCategorieDialog
          key={`subcat-${subcatForm.parentId ?? 'none'}-${String(subcatForm.open)}`}
          open={subcatForm.open}
          onOpenChange={(open) => setSubcatForm((f) => ({ ...f, open }))}
          siteId={siteId}
          parentId={subcatForm.parentId ?? ''}
          modeles={modeleOptions}
        />
      )}

      {canEdit && (
        <InstancierDialog
          // Modèle FIXÉ par la sous-catégorie courante : pas de sélecteur, l'équipement
          // créé est une copie de ce modèle, rangé dans la sous-catégorie.
          key={`instancier-${current?.id ?? 'root'}-${current?.modeleId ?? 'none'}-${String(instancierOpen)}`}
          open={instancierOpen}
          onOpenChange={setInstancierOpen}
          siteId={siteId}
          modeleId={current?.modeleId ?? null}
          categorieId={isVirtualCurrent ? null : (current?.id ?? null)}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer l’équipement ?"
        description={
          toDelete
            ? `« ${toDelete.nom ?? ''} » sera supprimé définitivement.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={toDeleteCategorie !== null}
        onOpenChange={(open) => {
          if (!open) setToDeleteCategorie(null)
        }}
        title="Supprimer la catégorie ?"
        description={
          toDeleteCategorie
            ? toDeleteCategorieNonVide
              ? 'Cette catégorie contient des sous-catégories ou des équipements : videz-la d’abord.'
              : `« ${toDeleteCategorie.nom} » sera supprimée définitivement.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        confirmDisabled={toDeleteCategorieNonVide}
        loading={delCategorie.isPending}
        onConfirm={confirmDeleteCategorie}
      />
    </>
  )

  // VUE DÉTAIL : un équipement ouvert.
  if (openEquipement !== null) {
    return (
      <>
        {header}
        <EquipementDetail equipement={openEquipement} />
        {dialogs}
      </>
    )
  }

  const emptyHere =
    childCategories.length === 0 &&
    (current === null || equipementsInCurrent.length === 0)

  return (
    <>
      {header}

      <QueryState
        query={categoriesQuery}
        pending={<ListRowSkeletons count={4} />}
        empty={
          <EmptyState
            icon={FolderTree}
            title="Aucune catégorie"
            description={
              canEdit
                ? 'Crée une première catégorie avec le bouton « Nouvelle catégorie ».'
                : 'Aucune catégorie accessible.'
            }
          />
        }
      >
        {() => {
          if (equipementsQuery.isPending) return <ListRowSkeletons count={4} />
          if (equipementsQuery.isError) {
            return <ErrorState onRetry={() => void equipementsQuery.refetch()} />
          }
          if (emptyHere) {
            // Niveau 0 : catégories ; niveau 1 : sous-catégories ; niveau ≥2
            // (sous-catégorie) : équipements. Message adapté au palier.
            const isSubcatLevel = depth >= 2 || isVirtualCurrent
            return (
              <EmptyState
                icon={isSubcatLevel ? Package : FolderTree}
                title={
                  depth === 0
                    ? 'Aucune catégorie'
                    : depth === 1
                      ? 'Catégorie vide'
                      : 'Sous-catégorie vide'
                }
                description={
                  depth === 0
                    ? canEdit
                      ? 'Crée une première catégorie avec le bouton « Nouvelle catégorie ».'
                      : 'Aucune catégorie pour le moment.'
                    : depth === 1
                      ? canCreateSubcat
                        ? 'Crée une sous-catégorie avec le bouton « Nouvelle sous-catégorie ».'
                        : 'Aucune sous-catégorie.'
                      : canCreateEquipHere
                        ? 'Ajoute un équipement avec les boutons ci-dessus.'
                        : 'Aucun équipement dans cette sous-catégorie.'
                }
              />
            )
          }
          return (
            <div className="flex flex-col gap-6">
              {childCategories.length > 0 && (
                <div className={listStack}>
                  {childCategories.map((cat) => (
                    <ListRow
                      key={cat.id}
                      media={
                        <MiniatureThumb
                          url={cat.virtual ? null : urlOf(cat.miniature_id)}
                          fallback={
                            cat.virtual ? (
                              <Inbox className="size-10" />
                            ) : (
                              <Folder className="size-10" />
                            )
                          }
                          alt=""
                          onError={refreshMiniatures}
                          className="size-full rounded-none"
                        />
                      }
                      title={cat.nom}
                      subtitle={
                        cat.description?.trim()
                          ? cat.description.trim()
                          : undefined
                      }
                      badges={
                        cat.virtual ? undefined : (
                          <ScopeBadges siteId={cat.site_id} />
                        )
                      }
                      mobileMeta={
                        cat.virtual ? undefined : (
                          <ScopeBadges siteId={cat.site_id} />
                        )
                      }
                      hideChevron
                      onClick={() => goTo([...path, cat])}
                      actions={
                        canManageCat(cat) ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Modifier la catégorie"
                              onClick={() =>
                                setCategoryForm({
                                  open: true,
                                  categorie: categoriesById.get(cat.id) ?? null,
                                })
                              }
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Supprimer la catégorie"
                              onClick={() => setToDeleteCategorie(cat)}
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

              {equipementsInCurrent.length > 0 && (
                <div className={listStack}>
                  {equipementsInCurrent.map((eq) => (
                    <ListRow
                      key={eq.id}
                      media={
                        <MiniatureThumb
                          url={urlOf(eq.miniature_id)}
                          fallback={<Package className="size-10" />}
                          alt=""
                          onError={refreshMiniatures}
                          className="size-full rounded-none"
                        />
                      }
                      title={eq.nom ?? 'Équipement'}
                      subtitle={
                        eq.localisation_courte ?? eq.local_nom ?? undefined
                      }
                      badges={
                        eq.code_inventaire ? (
                          <Badge variant="secondary">
                            {eq.code_inventaire}
                          </Badge>
                        ) : undefined
                      }
                      mobileMeta={eq.code_inventaire ?? undefined}
                      hideChevron
                      onClick={() => goToEquipement(eq)}
                      actions={
                        canEdit ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Modifier l’équipement"
                              onClick={() => setEquipForm({ open: true, eq })}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Supprimer l’équipement"
                              onClick={() => setToDelete(eq)}
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
            </div>
          )
        }}
      </QueryState>

      {dialogs}
    </>
  )
}

/** En-tête de descente : fil d'Ariane à gauche, actions à droite. */
function DrillHeader({
  breadcrumb,
  actions,
}: {
  breadcrumb: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {breadcrumb}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
