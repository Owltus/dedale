import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CopyPlus,
  Folder,
  FolderTree,
  Package,
  Pencil,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { modelesEquipementsQueries, type ModeleEquipement } from '../queries'
import {
  useCopierModeleEquipement,
  useDeleteModeleEquipement,
} from '../mutations'
import { ModeleEquipementFormDialog } from './modele-equipement-form-dialog'
import { ModeleEquipementDetail } from './modele-equipement-detail'
import {
  categoriesQueries,
  type Categorie,
} from '@/features/categories/queries'
import { CategoryFormDialog } from '@/features/categories/components/category-form-dialog'
import { useDeleteCategorie } from '@/features/categories/mutations'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useScope } from '@/hooks/use-scope'
import { useBiblioTreeDrill } from '@/hooks/use-biblio-tree-drill'
import { useSiteContext } from '@/lib/site-context'
import { errorMessage } from '@/lib/form'
import { segOfUnique } from '@/lib/slug'
import { SCOPE_COMMUN, scopeMatches, scopeTarget } from '@/lib/scope'
import * as perm from '@/lib/permissions'
import { useTabAddAction, useTabTitle } from '@/components/common/tab-actions'
import {
  TitleBreadcrumb,
  type BreadcrumbAncestor,
} from '@/components/common/title-breadcrumb'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ScopeSelect } from '@/components/common/scope-select'
import {
  ExporterVersSiteDialog,
  type ExportOutcome,
} from '@/components/common/exporter-vers-site-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ListRow } from '@/components/common/list-row'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { listStack } from '@/lib/responsive'

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

interface LockedScope {
  portee: 'entreprise' | 'site'
  siteId: string | null
}

interface CategoryFormState {
  open: boolean
  categorie: Categorie | null
  preset?: { parent_id?: string; scope?: 'equipement' | 'gamme' | 'mixte' }
  lockedScope: LockedScope | null
}

/**
 * Panneau « Modèles d'équipements » : catalogue PLAT (catégorie → modèle), la
 * navigation vit dans l'URL via le hook partagé `useBiblioTreeDrill`.
 * - Racine : les catégories d'équipement.
 * - Dans une catégorie : ses modèles (créés ici) ; le fil d'Ariane porte le chemin.
 * - Sur un modèle : une page de détail listant ses caractéristiques.
 * Le périmètre (Commun / site) est porté par le sélecteur ; tout est créable en
 * commun ET sur les sites accessibles (la RLS arbitre).
 */
export function ModelesEquipementsPanel() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const canEntreprise = perm.canManageAdmin(role)
  const { scope, setScope } = useScope()
  // Sites accessibles (get_my_sites) : cibles possibles d'une copie commun → site.
  const { sites } = useSiteContext()

  const modelesQuery = useQuery(modelesEquipementsQueries.pool())
  const categoriesQuery = useQuery(categoriesQueries.pool())
  // Mises à jour live (modèles ET catégories) entre fenêtres / comptes.
  useRealtimeRefresh('modeles_equipements', modelesEquipementsQueries.all())
  useRealtimeRefresh('categories', categoriesQueries.all())
  const del = useDeleteModeleEquipement()
  const delCategorie = useDeleteCategorie()
  const copierModele = useCopierModeleEquipement()
  // Vignettes des catégories (images de cards) : URL signées résolues en lot,
  // rafraîchies en live (le hook s'abonne au pool de miniatures).
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({
    open: false,
    categorie: null,
    lockedScope: null,
  })
  const [modeleForm, setModeleForm] = useState<{
    open: boolean
    modele: ModeleEquipement | null
  }>({ open: false, modele: null })
  const [toDelete, setToDelete] = useState<ModeleEquipement | null>(null)
  const [toDeleteCategorie, setToDeleteCategorie] = useState<Categorie | null>(
    null,
  )
  // Export d'un modèle COMMUN vers un site choisi (snapshot indépendant).
  const [exportState, setExportState] = useState<{
    open: boolean
    modele: ModeleEquipement | null
  }>({ open: false, modele: null })

  // Catégories d'équipement (actives, scope equipement/mixte) — TOUTES portées
  // confondues : sert de référentiel pour résoudre le chemin d'URL quel que soit
  // le filtre de périmètre (le sélecteur ne filtre que l'AFFICHAGE).
  const equipmentCats = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (c) => c.est_actif && (c.scope === 'equipement' || c.scope === 'mixte'),
      ),
    [categoriesQuery.data],
  )
  // Descente d'arbre portée par l'URL (calque du patron Gammes via le hook partagé).
  const { path, current, depth, children, goTo, leafSeg, goToLeaf } =
    useBiblioTreeDrill('modeles-equipements', equipmentCats)

  const modeles = useMemo(() => modelesQuery.data ?? [], [modelesQuery.data])

  // Sous-catégories du palier courant, filtrées par périmètre puis triées.
  const childCategories = useMemo(
    () =>
      children
        .filter((c) => scopeMatches(scope, c.site_id))
        .sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom)),
    [children, scope],
  )
  // Modèles rangés DANS la catégorie courante (visibles dès qu'on est descendu).
  const modelesInCurrent = useMemo(
    () =>
      current === null
        ? []
        : modeles
            .filter(
              (m) =>
                m.categorie_id === current.id && scopeMatches(scope, m.site_id),
            )
            .sort((a, b) => a.nom.localeCompare(b.nom)),
    [current, modeles, scope],
  )

  // Modèle OUVERT (vue détail, niveau FEUILLE) : résolu depuis le segment de
  // feuille de l'URL parmi les modèles de la catégorie courante (mêmes frères
  // qu'à la génération → slug stable). À l'image d'une gamme ouverte.
  const openModele = useMemo(() => {
    if (leafSeg === undefined || current === null) return null
    const siblings = modeles.filter((m) => m.categorie_id === current.id)
    return siblings.find((m) => segOfUnique(m, siblings) === leafSeg) ?? null
  }, [leafSeg, current, modeles])
  // Ouvre un modèle : chemin RÉEL du modèle (sa catégorie) + slug désambiguïsé sur
  // ses frères. Le chemin réel (et non le `path` courant) garde l'URL cohérente
  // même après un déplacement de catégorie. Catalogue plat → chemin = [la catégorie].
  const goToModele = useCallback(
    (m: ModeleEquipement, opts?: { replace?: boolean }) => {
      const cat = equipmentCats.find((c) => c.id === m.categorie_id)
      const siblings = modeles.filter((x) => x.categorie_id === m.categorie_id)
      goToLeaf(cat ? [cat] : [], segOfUnique(m, siblings), {
        replace: opts?.replace,
      })
    },
    [equipmentCats, modeles, goToLeaf],
  )

  // Re-synchronise l'URL si le MODÈLE OUVERT est renommé/déplacé (« Modifier » ou
  // réception realtime) : son slug change → l'URL ne le résout plus (openModele
  // null). On mémorise id + segment et, s'il existe encore, on réécrit l'URL sur
  // son chemin frais (REPLACE) sans fermer le détail ; supprimé → repli propre vers
  // la navigation. Calque du patron Plan de maintenance.
  const lastModeleIdRef = useRef<string | null>(null)
  const lastLeafSegRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (openModele !== null) {
      lastModeleIdRef.current = openModele.id
      lastLeafSegRef.current = leafSeg
    }
  }, [openModele, leafSeg])
  useEffect(() => {
    if (leafSeg === undefined || openModele !== null) return
    if (leafSeg !== lastLeafSegRef.current) return
    const id = lastModeleIdRef.current
    if (id === null) return
    const fresh = modeles.find((m) => m.id === id)
    if (!fresh) return
    goToModele(fresh, { replace: true })
  }, [leafSeg, openModele, modeles, goToModele])

  // Bouton « Copier vers un site » : seulement sur un modèle COMMUN et si
  // l'utilisateur a au moins un site accessible (la RPC reste l'arbitre réel).
  const canExport = canManage && sites.length > 0
  async function handleExportConfirm(
    siteCible: string,
  ): Promise<ExportOutcome> {
    const modele = exportState.modele
    if (!modele) return { ton: 'echec', message: 'Aucun modèle à copier.' }
    await copierModele.mutateAsync({ sourceModeleId: modele.id, siteCible })
    const nomSite = sites.find((s) => s.id === siteCible)?.nom
    const surSite = nomSite ? `le site « ${nomSite} »` : 'le site'
    return {
      ton: 'succes',
      message: `« ${modele.nom} » copié sur ${surSite}. La copie apparaît dans sa catégorie (badge Site), visible sous le périmètre « Tout » (ou ${surSite}).`,
    }
  }

  // Gestion d'une catégorie / d'un modèle selon le rôle + la portée de l'élément
  // (commun → entreprise, site → métier). La base reste l'arbitre réel.
  const canManageCat = useCallback(
    (c: Categorie) => canManage && (canEntreprise || c.site_id !== null),
    [canManage, canEntreprise],
  )
  const canEditModele = useCallback(
    (m: ModeleEquipement) => canManage && (canEntreprise || m.site_id !== null),
    [canManage, canEntreprise],
  )

  // Création de CATÉGORIE racine : adopte le périmètre du sélecteur. Désactivée
  // sur « Tout », ou sur Commun sans le droit entreprise.
  const targetSiteId = scopeTarget(scope)
  const canAddCategory =
    canManage &&
    targetSiteId !== undefined &&
    (targetSiteId !== null || canEntreprise)
  const rootLockedScope = useMemo<LockedScope | null>(
    () =>
      targetSiteId === undefined
        ? null
        : {
            portee: targetSiteId === null ? 'entreprise' : 'site',
            siteId: targetSiteId,
          },
    [targetSiteId],
  )

  // Création d'un modèle DANS la catégorie courante : portée héritée de la
  // catégorie ; droit = rôle métier (+ entreprise si commun).
  const canManageHere =
    current !== null && canManage && (current.site_id !== null || canEntreprise)
  const currentLockedScope = useMemo<LockedScope | null>(
    () =>
      current === null
        ? null
        : {
            portee: current.site_id === null ? 'entreprise' : 'site',
            siteId: current.site_id,
          },
    [current],
  )

  // Sélecteur de périmètre TOUJOURS présent dans la barre d'onglet : interactif à
  // la racine, puis VERROUILLÉ une fois entré dans une catégorie / un modèle — il
  // affiche alors l'ORIGINE (Commun ou le site) du modèle ouvert, sinon de la
  // catégorie courante, sans pouvoir l'ouvrir. (Depuis les migrations 009/010, une
  // copie « commun → site » vit dans une vraie catégorie de site → origine fiable.)
  const scopeDisplay = useMemo(() => {
    if (current === null) {
      return <ScopeSelect value={scope} onChange={setScope} />
    }
    const origin = (openModele ?? current).site_id ?? SCOPE_COMMUN
    return <ScopeSelect value={origin} disabled />
  }, [current, openModele, scope, setScope])

  const handleAddRootCategory = useCallback(() => {
    setCategoryForm({
      open: true,
      categorie: null,
      preset: { scope: 'equipement' },
      lockedScope: rootLockedScope,
    })
  }, [rootLockedScope])

  const handleAddModele = useCallback(
    () => setModeleForm({ open: true, modele: null }),
    [],
  )

  function handleEditCategory(categorie: Categorie) {
    setCategoryForm({ open: true, categorie, lockedScope: null })
  }

  // BARRE D'ONGLET = unique point d'entrée des actions, selon la vue :
  //   • racine (depth 0)       → + « Nouvelle catégorie » (+ sélecteur de périmètre) ;
  //   • catégorie ouverte      → + « Nouveau modèle » (rangé dans cette catégorie) ;
  //   • modèle ouvert (détail) → « Modifier » / « Copier » (pas de création).
  // Pas de sous-catégories : le catalogue d'équipement est plat (catégorie → modèle).
  const tabAddConfig = useMemo<{
    action: (() => void) | null
    label: string
    disabled: boolean
    extra?: ReactNode
  }>(() => {
    if (openModele !== null) {
      // Vue détail d'un modèle : pas de création (+ masqué), juste « Copier » (si
      // commun) et « Modifier » (nom + description) dans la barre d'onglet.
      return {
        action: null,
        label: 'Modifier le modèle',
        disabled: false,
        extra: (
          <div className="flex flex-wrap items-center gap-2">
            {scopeDisplay}
            {canExport && openModele.site_id === null && (
              <TooltipIconButton
                icon={<CopyPlus />}
                label="Copier vers un site"
                onClick={() =>
                  setExportState({ open: true, modele: openModele })
                }
              />
            )}
            {canEditModele(openModele) && (
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier le modèle"
                onClick={() =>
                  setModeleForm({ open: true, modele: openModele })
                }
              />
            )}
          </div>
        ),
      }
    }
    if (depth === 0) {
      // Bouton TOUJOURS présent (comme les autres onglets), désactivé hors d'un
      // périmètre créable (« Tout » sélectionné, ou Commun sans droit entreprise).
      return {
        action: handleAddRootCategory,
        label: canAddCategory
          ? 'Nouvelle catégorie'
          : 'Création indisponible pour ce périmètre',
        disabled: !canAddCategory,
        extra: scopeDisplay,
      }
    }
    return {
      // Idem : bouton présent mais désactivé si la création n'est pas permise ici.
      action: handleAddModele,
      label: canManageHere
        ? 'Nouveau modèle'
        : 'Création indisponible pour ce périmètre',
      disabled: !canManageHere,
      extra: scopeDisplay,
    }
  }, [
    depth,
    canAddCategory,
    canManageHere,
    handleAddRootCategory,
    handleAddModele,
    scopeDisplay,
    openModele,
    canExport,
    canEditModele,
  ])
  useTabAddAction(tabAddConfig.action, tabAddConfig.label, {
    disabled: tabAddConfig.disabled,
    extra: tabAddConfig.extra,
  })

  // FIL D'ARIANE = TITRE de la barre d'onglet, uniquement quand on a descendu.
  // À la RACINE (depth 0) → `null` : la barre affiche « Bibliothèque » en grand
  // titre via le repli de <Tabs>. Les ancêtres cliquables remontent d'un palier.
  const titleNode = useMemo<ReactNode>(() => {
    // Modèle ouvert : le fil d'Ariane porte TOUT le chemin de catégories (cliquable),
    // le modèle devient le segment courant — comme une gamme ouverte.
    if (openModele !== null) {
      const ancestors: BreadcrumbAncestor[] = path.map((c, i) => ({
        key: c.id,
        label: c.nom,
        onClick: () => goTo(path.slice(0, i + 1)),
      }))
      return <TitleBreadcrumb ancestors={ancestors} current={openModele.nom} />
    }
    if (depth === 0) return null
    const ancestors: BreadcrumbAncestor[] = path.slice(0, -1).map((c, i) => ({
      key: c.id,
      label: c.nom,
      onClick: () => goTo(path.slice(0, i + 1)),
    }))
    return (
      <TitleBreadcrumb
        ancestors={ancestors}
        current={current?.nom ?? 'Modèles d’équipements'}
      />
    )
  }, [openModele, depth, path, current, goTo])
  useTabTitle(titleNode)

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

  function confirmDeleteCategorie() {
    if (!toDeleteCategorie) return
    delCategorie.mutate(toDeleteCategorie.id, {
      onSuccess: () => {
        toast.success('Catégorie supprimée')
        setToDeleteCategorie(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  // La base BLOQUE la suppression d'une catégorie NON VIDE (sous-catégorie ou
  // modèle rattaché). On le pré-calcule depuis le cache pour adapter le message
  // et désactiver la confirmation — la base reste l'arbitre réel.
  const toDeleteCategorieNonVide =
    toDeleteCategorie !== null &&
    (equipmentCats.some((c) => c.parent_id === toDeleteCategorie.id) ||
      modeles.some((m) => m.categorie_id === toDeleteCategorie.id))

  // Catégories sélectionnables comme PARENT à l'édition : racines d'équipement
  // (modèle strict à 2 niveaux ; un niveau 3 serait refusé par la base).
  const parentCandidates = useMemo(
    () => equipmentCats.filter((c) => c.parent_id === null),
    [equipmentCats],
  )

  const emptyHere =
    childCategories.length === 0 && modelesInCurrent.length === 0

  // Dialogs partagés entre la vue navigation et la vue détail d'un modèle.
  const modeleFormDialog =
    canManage && current !== null ? (
      <ModeleEquipementFormDialog
        key={`${modeleForm.modele?.id ?? `new-${current.id}`}-${String(modeleForm.open)}`}
        open={modeleForm.open}
        onOpenChange={(open) => setModeleForm((f) => ({ ...f, open }))}
        modele={modeleForm.modele}
        categories={equipmentCats.map((c) => ({ id: c.id, nom: c.nom }))}
        canEntreprise={canEntreprise}
        // Édition : ancrer la portée sur le site PROPRE du modèle (une copie de
        // site peut vivre dans une catégorie commune) ; création : la catégorie.
        siteId={modeleForm.modele ? modeleForm.modele.site_id : current.site_id}
        siteName={
          modeleForm.modele?.site_id
            ? (sites.find((s) => s.id === modeleForm.modele?.site_id)?.nom ??
              null)
            : null
        }
        lockedScope={modeleForm.modele ? undefined : currentLockedScope}
        lockedCategorieId={modeleForm.modele ? undefined : current.id}
        // Création : nom + description (minimal). Édition : + état / catégorie /
        // portée. Les CARACTÉRISTIQUES se gèrent sur la page de détail (un modal
        // par champ), plus jamais dans ce formulaire.
        minimal={!modeleForm.modele}
      />
    ) : null

  const exportDialog = canExport ? (
    <ExporterVersSiteDialog
      key={`export-${exportState.modele?.id ?? 'none'}`}
      open={exportState.open}
      onOpenChange={(open) => setExportState((s) => ({ ...s, open }))}
      titre="Copier le modèle vers un site"
      resume={
        exportState.modele ? (
          <>
            Le modèle <strong>« {exportState.modele.nom} »</strong> (ses
            caractéristiques comprises) sera copié sur le site choisi.
          </>
        ) : null
      }
      onConfirm={handleExportConfirm}
    />
  ) : null

  // VUE DÉTAIL : un modèle ouvert (niveau feuille) → page de ses caractéristiques.
  if (openModele !== null) {
    return (
      <>
        <ModeleEquipementDetail
          modele={openModele}
          canEdit={canEditModele(openModele)}
        />
        {modeleFormDialog}
        {exportDialog}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <QueryState
        query={categoriesQuery}
        pending={<ListRowSkeletons count={4} />}
        empty={
          <EmptyState
            icon={FolderTree}
            title="Aucune catégorie"
            description={
              canAddCategory
                ? 'Crée une première catégorie avec le bouton + en haut à droite.'
                : 'Aucune catégorie accessible.'
            }
          />
        }
      >
        {() => {
          // La requête des modèles alimente listes et compteurs : on surface son
          // état ici, sinon une erreur serait avalée et un « vide » clignoterait.
          if (modelesQuery.isPending) return <ListRowSkeletons count={4} />
          if (modelesQuery.isError) {
            return <ErrorState onRetry={() => void modelesQuery.refetch()} />
          }
          if (emptyHere) {
            return (
              <EmptyState
                icon={depth === 0 ? FolderTree : Package}
                title={depth === 0 ? 'Aucune catégorie ici' : 'Catégorie vide'}
                description={
                  depth === 0
                    ? 'Aucune catégorie dans ce périmètre pour le moment.'
                    : canManageHere
                      ? 'Ajoute un modèle ci-dessus.'
                      : 'Aucun modèle pour le moment.'
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
                          url={urlOf(cat.miniature_id)}
                          fallback={<Folder className="size-10" />}
                          // Image décorative : le titre porte déjà le nom accessible.
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
                        cat.site_id === null ? (
                          <Badge variant="secondary">Commun</Badge>
                        ) : (
                          <Badge variant="outline">Site</Badge>
                        )
                      }
                      hideChevron
                      // Descendre d'un palier (PUSH) : on ajoute la catégorie au
                      // chemin courant.
                      onClick={() => goTo([...path, cat])}
                      actions={
                        canManageCat(cat) ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Modifier la catégorie"
                              onClick={() => handleEditCategory(cat)}
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

              {current !== null && modelesInCurrent.length > 0 && (
                <div className={listStack}>
                  {modelesInCurrent.map((modele) => {
                    const specs = specCount(modele.specifications)
                    const editable = canEditModele(modele)
                    return (
                      <ListRow
                        key={modele.id}
                        media={
                          <MiniatureThumb
                            url={urlOf(modele.miniature_id)}
                            fallback={<Package className="size-10" />}
                            alt=""
                            onError={refreshMiniatures}
                            className="size-full rounded-none"
                          />
                        }
                        title={modele.nom}
                        subtitle={`${String(specs)} caractéristique${specs > 1 ? 's' : ''}`}
                        badges={
                          <>
                            <Badge
                              variant={
                                modele.site_id === null
                                  ? 'secondary'
                                  : 'outline'
                              }
                            >
                              {modele.site_id === null ? 'Commun' : 'Site'}
                            </Badge>
                            {!modele.est_actif && (
                              <Badge variant="outline">Masqué</Badge>
                            )}
                          </>
                        }
                        hideChevron
                        // Ouvrir la page de détail du modèle (caractéristiques).
                        onClick={() => goToModele(modele)}
                        actions={
                          editable || (canExport && modele.site_id === null) ? (
                            <>
                              {/* Copie commun → site : uniquement sur un modèle COMMUN. */}
                              {canExport && modele.site_id === null && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Copier vers un site"
                                  onClick={() =>
                                    setExportState({ open: true, modele })
                                  }
                                >
                                  <CopyPlus />
                                </Button>
                              )}
                              {editable && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Modifier le modèle"
                                    onClick={() =>
                                      setModeleForm({ open: true, modele })
                                    }
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
                              )}
                            </>
                          ) : undefined
                        }
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        }}
      </QueryState>

      {/* Création / édition de catégorie (racine ou sous-catégorie). */}
      {canManage && (
        <CategoryFormDialog
          key={
            (categoryForm.categorie
              ? `cat-edit-${categoryForm.categorie.id}`
              : `cat-new-${categoryForm.preset?.parent_id ?? 'root'}-${scope}`) +
            `-${String(categoryForm.open)}`
          }
          open={categoryForm.open}
          onOpenChange={(open) => setCategoryForm((f) => ({ ...f, open }))}
          categorie={categoryForm.categorie}
          preset={categoryForm.preset ?? { scope: 'equipement' }}
          categories={parentCandidates}
          canEntreprise={canEntreprise}
          siteId={categoryForm.lockedScope?.siteId ?? null}
          siteName={null}
          lockedScope={
            categoryForm.categorie ? undefined : categoryForm.lockedScope
          }
          minimal
        />
      )}

      {/* Création / édition de modèle (nom + description) dans la catégorie. */}
      {modeleFormDialog}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer le modèle ?"
        description={
          toDelete
            ? `« ${toDelete.nom} » sera placé dans la corbeille (récupérable 90 jours).`
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
              ? 'Cette catégorie contient des sous-catégories ou des modèles : videz-la d’abord.'
              : `« ${toDeleteCategorie.nom} » sera placée dans la corbeille (récupérable 90 jours).`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        confirmDisabled={toDeleteCategorieNonVide}
        loading={delCategorie.isPending}
        onConfirm={confirmDeleteCategorie}
      />

      {exportDialog}
    </div>
  )
}
