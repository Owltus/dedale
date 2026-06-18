import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CopyPlus,
  Folder,
  FolderTree,
  ListChecks,
  Pencil,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { modelesOperationsQueries, type ModeleOperation } from '../queries'
import {
  useCopierModeleOperation,
  useDetacherEtSupprimerModeleOperation,
} from '../mutations'
import { GammeTypeFormDialog } from './gamme-type-form-dialog'
import { OperationItemsEditor } from './operation-items-editor'
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
import { deleteErrorMessage, errorMessage, pgCode } from '@/lib/form'
import { segOfUnique } from '@/lib/slug'
import { SCOPE_COMMUN, scopeMatches, scopeTarget } from '@/lib/scope'
import * as perm from '@/lib/permissions'
import {
  useTabAddAction,
  useTabHeader,
  type TabHeader,
} from '@/components/common/tab-actions'
import type { PageHeaderCrumb } from '@/components/common/page-header'
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
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { ListRow } from '@/components/common/list-row'
import { Button } from '@/components/ui/button'
import { ScopeBadges } from '@/components/common/scope-badges'
import { listStack } from '@/lib/responsive'

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

interface LockedScope {
  portee: 'entreprise' | 'site'
  siteId: string | null
}

interface CategoryFormState {
  open: boolean
  categorie: Categorie | null
  preset?: {
    parent_id?: string
    scope?: 'equipement' | 'gamme' | 'mixte' | 'operation'
  }
  lockedScope: LockedScope | null
}

/**
 * Panneau « Modèles d'opérations » : catalogue PLAT (catégorie → modèle), à parité
 * EXACTE du panneau « Modèles d'équipements » (navigation par paliers via
 * `useBiblioTreeDrill`, cartes `ListRow`, CRUD catégories + modèles, périmètre
 * commun/site, export « Copier vers un site »). La vue détail d'un modèle est son
 * éditeur d'opérations (`OperationItemsEditor`). La RLS reste l'arbitre réel.
 */
export function GammesTypesPanel() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const canEntreprise = perm.canManageAdmin(role)
  const { scope, setScope } = useScope()
  // Sites accessibles (get_my_sites) : cibles possibles d'une copie commun → site.
  const { sites } = useSiteContext()

  const modelesQuery = useQuery(modelesOperationsQueries.pool())
  const categoriesQuery = useQuery(categoriesQueries.pool())
  // Mises à jour live (modèles ET catégories) entre fenêtres / comptes.
  useRealtimeRefresh('modeles_operations', modelesOperationsQueries.all())
  useRealtimeRefresh('categories', categoriesQueries.all())
  const detachEtSupprime = useDetacherEtSupprimerModeleOperation()
  const delCategorie = useDeleteCategorie()
  const copierModele = useCopierModeleOperation()
  // Vignettes des catégories (images de cards) : URL signées résolues en lot.
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({
    open: false,
    categorie: null,
    lockedScope: null,
  })
  // Périmètre de la catégorie en cours (option « site » de la Portée, affichée des
  // deux côtés) : édition = site de la catégorie ; création = site verrouillé.
  const categorySiteId = categoryForm.categorie
    ? categoryForm.categorie.site_id
    : (categoryForm.lockedScope?.siteId ?? null)
  const categorySiteName =
    categorySiteId === null
      ? null
      : (sites.find((s) => s.id === categorySiteId)?.nom ?? null)
  const [modeleForm, setModeleForm] = useState<{
    open: boolean
    modele: ModeleOperation | null
  }>({ open: false, modele: null })
  const [toDelete, setToDelete] = useState<ModeleOperation | null>(null)
  const [toDeleteCategorie, setToDeleteCategorie] = useState<Categorie | null>(
    null,
  )
  // Export d'un modèle COMMUN vers un site choisi (snapshot indépendant).
  const [exportState, setExportState] = useState<{
    open: boolean
    modele: ModeleOperation | null
  }>({ open: false, modele: null })

  // Catégories d'opération (actives, scope 'operation' STRICT — cloisonnement par
  // famille). TOUTES portées confondues : référentiel pour résoudre le chemin
  // d'URL quel que soit le filtre de périmètre (qui ne filtre que l'AFFICHAGE).
  const operationCats = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (c) => c.est_actif && c.scope === 'operation',
      ),
    [categoriesQuery.data],
  )
  // Descente d'arbre portée par l'URL (calque du panneau Modèles d'équipements).
  const { path, current, depth, children, goTo, leafSeg, goToLeaf } =
    useBiblioTreeDrill('gammes-types', operationCats)

  const modeles = useMemo(() => modelesQuery.data ?? [], [modelesQuery.data])

  // Sous-catégories du palier courant (en pratique aucune : 'operation' = 1 niveau),
  // filtrées par périmètre puis triées.
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
  // feuille de l'URL parmi les modèles de la catégorie courante.
  const openModele = useMemo(() => {
    if (leafSeg === undefined || current === null) return null
    const siblings = modeles.filter((m) => m.categorie_id === current.id)
    return siblings.find((m) => segOfUnique(m, siblings) === leafSeg) ?? null
  }, [leafSeg, current, modeles])
  // Ouvre un modèle : chemin RÉEL (sa catégorie) + slug désambiguïsé sur ses frères.
  const goToModele = useCallback(
    (m: ModeleOperation, opts?: { replace?: boolean }) => {
      const cat = operationCats.find((c) => c.id === m.categorie_id)
      const siblings = modeles.filter((x) => x.categorie_id === m.categorie_id)
      goToLeaf(cat ? [cat] : [], segOfUnique(m, siblings), {
        replace: opts?.replace,
      })
    },
    [operationCats, modeles, goToLeaf],
  )

  // Re-synchronise l'URL si le MODÈLE OUVERT est renommé/déplacé (« Modifier » ou
  // réception realtime) : calque du panneau Modèles d'équipements.
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

  // Gammes liées au modèle à supprimer : on anticipe le RESTRICT FK plutôt que de
  // heurter un mur d'erreur. La requête n'est active que pendant la confirmation.
  const liensQuery = useQuery({
    ...modelesOperationsQueries.liens(toDelete?.id ?? ''),
    enabled: toDelete !== null,
  })
  const liens = liensQuery.data ?? []
  const hasLiens = liens.length > 0

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
    (m: ModeleOperation) => canManage && (canEntreprise || m.site_id !== null),
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

  // Sélecteur de périmètre TOUJOURS présent : interactif à la racine, VERROUILLÉ
  // en descente (affiche l'ORIGINE du modèle ouvert, sinon de la catégorie).
  const scopeDisplay = useMemo(() => {
    if (current === null) {
      return <ScopeSelect value={scope} onChange={setScope} fluid />
    }
    // Vue détail : périmètre fixé par la catégorie / le modèle ouvert → vrai
    // dropdown NATIVEMENT désactivé (grisé) qui affiche l'origine.
    const origin = (openModele ?? current).site_id ?? SCOPE_COMMUN
    return <ScopeSelect value={origin} disabled fluid />
  }, [current, openModele, scope, setScope])

  const handleAddRootCategory = useCallback(() => {
    setCategoryForm({
      open: true,
      categorie: null,
      preset: { scope: 'operation' },
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
  const tabAddConfig = useMemo<{
    action: (() => void) | null
    label: string
    disabled: boolean
    extra?: ReactNode
    actions?: ReactNode
  }>(() => {
    if (openModele !== null) {
      return {
        action: null,
        label: 'Modifier le modèle d’opération',
        disabled: false,
        extra: scopeDisplay,
        actions: (
          <>
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
                label="Modifier le modèle d’opération"
                onClick={() =>
                  setModeleForm({ open: true, modele: openModele })
                }
              />
            )}
          </>
        ),
      }
    }
    if (depth === 0) {
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
      action: handleAddModele,
      label: canManageHere
        ? 'Nouveau modèle d’opération'
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
    actions: tabAddConfig.actions,
  })

  // En-tête de descente : le titre SUIT le nœud courant (catégorie ou modèle
  // ouvert), les ancêtres alimentent le fil « Bibliothèque › Modèles d'opérations
  // › … » rendu par <Tabs>. À la RACINE (depth 0) → `null` (titre de section).
  const header = useMemo<TabHeader | null>(() => {
    if (openModele !== null) {
      const breadcrumb: PageHeaderCrumb[] = path.map((c, i) => ({
        label: c.nom,
        onClick: () => goTo(path.slice(0, i + 1)),
      }))
      return {
        title: openModele.nom,
        breadcrumb,
        description: openModele.description?.trim()
          ? openModele.description.trim()
          : undefined,
      }
    }
    if (depth === 0) return null
    const breadcrumb: PageHeaderCrumb[] = path.slice(0, -1).map((c, i) => ({
      label: c.nom,
      onClick: () => goTo(path.slice(0, i + 1)),
    }))
    return {
      title: current?.nom ?? 'Modèles d’opérations',
      breadcrumb,
      description: current?.description?.trim()
        ? current.description.trim()
        : undefined,
    }
  }, [openModele, depth, path, current, goTo])
  useTabHeader(header)

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

  // Catégorie NON VIDE (sous-catégorie ou modèle rattaché) : la base bloque la
  // suppression → pré-calcul pour adapter le message et désactiver la confirmation.
  const toDeleteCategorieNonVide =
    toDeleteCategorie !== null &&
    (operationCats.some((c) => c.parent_id === toDeleteCategorie.id) ||
      modeles.some((m) => m.categorie_id === toDeleteCategorie.id))

  // Catégories sélectionnables comme PARENT à l'édition : racines d'opération
  // (modèle strict à 1 niveau).
  const parentCandidates = useMemo(
    () => operationCats.filter((c) => c.parent_id === null),
    [operationCats],
  )

  const emptyHere =
    childCategories.length === 0 && modelesInCurrent.length === 0

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

  // Dialog de création/édition de modèle, partagé navigation + détail.
  const modeleFormDialog =
    canManage && current !== null ? (
      <GammeTypeFormDialog
        key={`${modeleForm.modele?.id ?? `new-${current.id}`}-${String(modeleForm.open)}`}
        open={modeleForm.open}
        onOpenChange={(open) => setModeleForm((f) => ({ ...f, open }))}
        modele={modeleForm.modele}
        categories={operationCats.map((c) => ({ id: c.id, nom: c.nom }))}
        canEntreprise={canEntreprise}
        // Édition : ancrer la portée sur le site PROPRE du modèle ; création : la catégorie.
        siteId={modeleForm.modele ? modeleForm.modele.site_id : current.site_id}
        lockedScope={modeleForm.modele ? undefined : currentLockedScope}
        lockedCategorieId={modeleForm.modele ? undefined : current.id}
      />
    ) : null

  const exportDialog = canExport ? (
    <ExporterVersSiteDialog
      key={`export-${exportState.modele?.id ?? 'none'}`}
      open={exportState.open}
      onOpenChange={(open) => setExportState((s) => ({ ...s, open }))}
      titre="Copier le modèle d’opération vers un site"
      resume={
        exportState.modele ? (
          <>
            Le modèle <strong>« {exportState.modele.nom} »</strong> (ses
            opérations comprises) sera copié sur le site choisi.
          </>
        ) : null
      }
      onConfirm={handleExportConfirm}
    />
  ) : null

  // VUE DÉTAIL : un modèle ouvert (niveau feuille) → éditeur de ses opérations.
  if (openModele !== null) {
    const canManageItems = canEditModele(openModele)
    return (
      <>
        <OperationItemsEditor modele={openModele} canManage={canManageItems} />
        {modeleFormDialog}
        {exportDialog}
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
          if (modelesQuery.isPending) return <ListRowSkeletons count={4} />
          if (modelesQuery.isError) {
            return <ErrorState onRetry={() => void modelesQuery.refetch()} />
          }
          if (emptyHere) {
            return (
              <EmptyState
                icon={depth === 0 ? FolderTree : ListChecks}
                title={depth === 0 ? 'Aucune catégorie ici' : 'Catégorie vide'}
                description={
                  depth === 0
                    ? 'Aucune catégorie dans ce périmètre pour le moment.'
                    : canManageHere
                      ? 'Ajoute un modèle d’opération ci-dessus.'
                      : 'Aucun modèle d’opération pour le moment.'
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
                      badges={<ScopeBadges siteId={cat.site_id} />}
                      mobileMeta={<ScopeBadges siteId={cat.site_id} />}
                      hideChevron
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
                    const editable = canEditModele(modele)
                    return (
                      <ListRow
                        key={modele.id}
                        media={
                          <MiniatureThumb
                            url={urlOf(modele.miniature_id)}
                            fallback={<ListChecks className="size-10" />}
                            alt=""
                            onError={refreshMiniatures}
                            className="size-full rounded-none"
                          />
                        }
                        title={modele.nom}
                        subtitle={
                          modele.description?.trim()
                            ? modele.description.trim()
                            : undefined
                        }
                        badges={<ScopeBadges siteId={modele.site_id} />}
                        mobileMeta={<ScopeBadges siteId={modele.site_id} />}
                        hideChevron
                        onClick={() => goToModele(modele)}
                        actions={
                          editable || (canExport && modele.site_id === null) ? (
                            <>
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
                                    aria-label="Modifier le modèle d’opération"
                                    onClick={() =>
                                      setModeleForm({ open: true, modele })
                                    }
                                  >
                                    <Pencil />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Supprimer le modèle d’opération"
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

      {/* Création / édition de catégorie (racine d'opération). */}
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
          preset={categoryForm.preset ?? { scope: 'operation' }}
          categories={parentCandidates}
          canEntreprise={canEntreprise}
          siteId={categorySiteId}
          siteName={categorySiteName}
          lockedScope={
            categoryForm.categorie ? undefined : categoryForm.lockedScope
          }
          minimal
          // Portée visible en création ET modification (désactivée tant qu'imposée
          // par le contexte) → création identique à la modification.
          hidePortee={false}
        />
      )}

      {/* Création / édition de modèle (nom + catégorie + description) dans la catégorie. */}
      {modeleFormDialog}

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

      <ConfirmDeleteDialog
        open={toDeleteCategorie !== null}
        onOpenChange={(open) => {
          if (!open) setToDeleteCategorie(null)
        }}
        entityLabel={`la catégorie${
          toDeleteCategorie ? ` « ${toDeleteCategorie.nom} »` : ''
        }`}
        blocked={toDeleteCategorieNonVide}
        blockedReason="Cette catégorie contient des sous-catégories ou des modèles. Vide-la d’abord pour pouvoir la supprimer."
        loading={delCategorie.isPending}
        onConfirm={confirmDeleteCategorie}
      />

      {exportDialog}
    </div>
  )
}
