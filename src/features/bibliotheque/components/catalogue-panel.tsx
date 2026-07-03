import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CopyPlus, Folder, FolderTree, Pencil, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  categoriesQueries,
  type Categorie,
} from '@/features/categories/queries'
import { CategoryFormDialog } from '@/features/categories/components/category-form-dialog'
import { ConfirmDeleteCategorieDialog } from '@/features/categories/components/confirm-delete-categorie-dialog'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useScope } from '@/hooks/use-scope'
import { useBiblioTreeDrill } from '@/hooks/use-biblio-tree-drill'
import { useLeafResync } from '@/hooks/use-leaf-resync'
import { useSiteContext } from '@/lib/site-context'
import { segOfUnique } from '@/lib/slug'
import { SCOPE_COMMUN, scopeMatches, scopeTarget } from '@/lib/scope'
import * as perm from '@/lib/permissions'
import {
  useTabAddAction,
  useTabHeader,
  type TabHeader,
} from '@/components/common/tab-actions'
import type { PageHeaderCrumb } from '@/components/common/page-header'
import { drillCrumbs } from '@/components/common/drill-crumbs'
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
import { ListRow } from '@/components/common/list-row'
import type { RowAction } from '@/components/common/row-actions'
import { ScopeBadges } from '@/components/common/scope-badges'
import { listStack } from '@/lib/responsive'

/**
 * Modèle minimal manipulé par le catalogue générique : les champs communs aux
 * modèles d'équipements ET d'opérations. Le reste (caractéristiques, items,
 * `est_actif`…) est l'affaire de la vue détail spécifique (`renderDetail`) ou des
 * callbacks de l'hôte (`modeleMasque`, `modeleSubtitle`).
 */
export interface CatalogueModele {
  id: string
  nom: string
  description: string | null
  site_id: string | null
  categorie_id: string
  miniature_id: string | null
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

/** État de query du pool de modèles, réduit à ce dont le catalogue a besoin. */
interface PoolQueryLike<T> {
  data?: T[]
  isPending: boolean
  isError: boolean
  refetch: () => unknown
}

export interface CataloguePanelProps<T extends CatalogueModele> {
  /** Pool des modèles (toutes portées) — l'hôte appelle `useQuery(pool())`. */
  modelesQuery: PoolQueryLike<T>
  /** Table realtime des modèles (`modeles_equipements` / `modeles_operations`). */
  realtimeTable: 'modeles_equipements' | 'modeles_operations'
  /** Clé de query à invalider en realtime (`modelesXQueries.all()`). */
  modelesAllKey: readonly unknown[]
  /** Onglet de la Bibliothèque porteur du chemin d'URL. */
  drillKey: string
  /** Filtre des catégories ouvrables (scope selon la famille de modèle). */
  categoryScope: (c: Categorie) => boolean
  /** Scope posé sur une catégorie créée depuis ce catalogue. */
  categoryPresetScope: NonNullable<CategoryFormState['preset']>['scope']
  /** RPC de copie « commun → site » d'un modèle. */
  copier: (args: {
    sourceModeleId: string
    siteCible: string
  }) => Promise<unknown>
  /** Titre du dialog « Copier vers un site ». */
  exportTitre: string
  /** Résumé (contenu emporté) du dialog de copie, pour un modèle donné. */
  exportResume: (m: T) => ReactNode
  /** Icône de repli d'une card de modèle (sans vignette). */
  modeleFallbackIcon: LucideIcon
  /** Icône de l'état vide « dans une catégorie ». */
  emptyModeleIcon: LucideIcon
  /** Titre de section par défaut (racine sans nœud courant). */
  sectionTitleFallback: string
  /** Libellé du bouton d'ajout d'un modèle. */
  labelNouveauModele: string
  /** Libellé du bouton « Modifier » (barre d'onglet en vue détail). */
  labelModifierModele: string
  /** Description d'état vide quand la création est permise. */
  labelEmptyAddModele: string
  /** Description d'état vide quand la création n'est pas permise. */
  labelEmptyNoneModele: string
  /** Sous-titre d'une card de modèle. */
  modeleSubtitle: (m: T) => string | undefined
  /** Badge « Masqué » optionnel (équipements : selon `est_actif`). */
  modeleMasque?: (m: T) => boolean
  /** Rend le dialog de création/édition de modèle (spécifique à la famille). */
  renderModeleForm: (ctx: {
    open: boolean
    onOpenChange: (open: boolean) => void
    modele: T | null
    current: Categorie
    cats: Categorie[]
  }) => ReactNode
  /** Rend la vue détail d'un modèle ouvert (caractéristiques / éditeur d'items). */
  renderDetail: (m: T, canEdit: boolean) => ReactNode
  /** Demande de suppression d'un modèle (l'hôte porte l'état + le dialog). */
  onAskDeleteModele: (m: T) => void
  /** Dialog de suppression d'un modèle (câblé par l'hôte, rendu ici). */
  deleteModeleDialog: ReactNode
}

/**
 * Ossature GÉNÉRIQUE d'un panneau catalogue PLAT de la Bibliothèque (catégorie →
 * modèle), factorisant les panneaux jumeaux « Modèles d'équipements » et
 * « Modèles d'opérations » : navigation par paliers via `useBiblioTreeDrill`,
 * cartes `ListRow`, CRUD catégories (+ `ConfirmDeleteCategorieDialog`) et modèles,
 * périmètre commun/site, export « Copier vers un site ». Les variations propres à
 * chaque famille (libellés, dialog de modèle, vue détail, flux de suppression)
 * sont injectées en props. La RLS reste l'arbitre réel.
 */
export function CataloguePanel<T extends CatalogueModele>({
  modelesQuery,
  realtimeTable,
  modelesAllKey,
  drillKey,
  categoryScope,
  categoryPresetScope,
  copier,
  exportTitre,
  exportResume,
  modeleFallbackIcon: ModeleFallbackIcon,
  emptyModeleIcon,
  sectionTitleFallback,
  labelNouveauModele,
  labelModifierModele,
  labelEmptyAddModele,
  labelEmptyNoneModele,
  modeleSubtitle,
  modeleMasque,
  renderModeleForm,
  renderDetail,
  onAskDeleteModele,
  deleteModeleDialog,
}: CataloguePanelProps<T>) {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const canEntreprise = perm.canManageAdmin(role)
  const { scope, setScope } = useScope()
  // Sites accessibles (get_my_sites) : cibles possibles d'une copie commun → site.
  const { sites } = useSiteContext()

  const categoriesQuery = useQuery(categoriesQueries.pool())
  // Mises à jour live (modèles ET catégories) entre fenêtres / comptes.
  useRealtimeRefresh(realtimeTable, modelesAllKey)
  useRealtimeRefresh('categories', categoriesQueries.all())
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
    modele: T | null
  }>({ open: false, modele: null })
  const [toDeleteCategorie, setToDeleteCategorie] = useState<Categorie | null>(
    null,
  )
  // Export d'un modèle COMMUN vers un site choisi (snapshot indépendant).
  const [exportState, setExportState] = useState<{
    open: boolean
    modele: T | null
  }>({ open: false, modele: null })

  // Périmètre de la catégorie en cours de création/édition (pour l'option « site »
  // de la Portée, affichée des deux côtés) : à l'édition = site de la catégorie ;
  // à la création = site verrouillé par le sélecteur de périmètre.
  const categorySiteId = categoryForm.categorie
    ? categoryForm.categorie.site_id
    : (categoryForm.lockedScope?.siteId ?? null)
  const categorySiteName =
    categorySiteId === null
      ? null
      : (sites.find((s) => s.id === categorySiteId)?.nom ?? null)

  // Catégories ouvrables (actives, scope propre à la famille) — TOUTES portées
  // confondues : sert de référentiel pour résoudre le chemin d'URL quel que soit
  // le filtre de périmètre (le sélecteur ne filtre que l'AFFICHAGE).
  const cats = useMemo(
    () => (categoriesQuery.data ?? []).filter(categoryScope),
    [categoriesQuery.data, categoryScope],
  )
  // Descente d'arbre portée par l'URL (hook partagé de la Bibliothèque).
  const { path, current, depth, children, goTo, leafSeg, goToLeaf } =
    useBiblioTreeDrill(drillKey, cats)

  const modeles = useMemo(
    () => modelesQuery.data ?? [],
    [modelesQuery.data],
  )

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
  // qu'à la génération → slug stable).
  const openModele = useMemo(() => {
    if (leafSeg === undefined || current === null) return null
    const siblings = modeles.filter((m) => m.categorie_id === current.id)
    return siblings.find((m) => segOfUnique(m, siblings) === leafSeg) ?? null
  }, [leafSeg, current, modeles])
  // Ouvre un modèle : chemin RÉEL du modèle (sa catégorie) + slug désambiguïsé sur
  // ses frères. Le chemin réel (et non le `path` courant) garde l'URL cohérente
  // même après un déplacement de catégorie. Catalogue plat → chemin = [la catégorie].
  const goToModele = useCallback(
    (m: T, opts?: { replace?: boolean }) => {
      const cat = cats.find((c) => c.id === m.categorie_id)
      const siblings = modeles.filter((x) => x.categorie_id === m.categorie_id)
      goToLeaf(cat ? [cat] : [], segOfUnique(m, siblings), {
        replace: opts?.replace,
      })
    },
    [cats, modeles, goToLeaf],
  )

  // Re-synchronise l'URL si le MODÈLE OUVERT est renommé/déplacé (« Modifier » ou
  // réception realtime) : son slug change → l'URL ne le résout plus → on réécrit
  // le chemin frais (REPLACE) sans fermer le détail ; supprimé → repli.
  useLeafResync({
    leafSeg,
    openItem: openModele,
    items: modeles,
    goToItem: goToModele,
  })

  // Bouton « Copier vers un site » : seulement sur un modèle COMMUN et si
  // l'utilisateur a au moins un site accessible (la RPC reste l'arbitre réel).
  const canExport = canManage && sites.length > 0
  async function handleExportConfirm(
    siteCible: string,
  ): Promise<ExportOutcome> {
    const modele = exportState.modele
    if (!modele) return { ton: 'echec', message: 'Aucun modèle à copier.' }
    await copier({ sourceModeleId: modele.id, siteCible })
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
    (m: T) => canManage && (canEntreprise || m.site_id !== null),
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

  // Sélecteur de périmètre TOUJOURS présent dans la barre d'onglet : interactif à
  // la racine, puis VERROUILLÉ une fois entré dans une catégorie / un modèle — il
  // affiche alors l'ORIGINE (Commun ou le site) du modèle ouvert, sinon de la
  // catégorie courante, sans pouvoir l'ouvrir.
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
      preset: { scope: categoryPresetScope },
      lockedScope: rootLockedScope,
    })
  }, [rootLockedScope, categoryPresetScope])

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
      // Vue détail d'un modèle : pas de création (+ masqué), juste « Copier » (si
      // commun) et « Modifier » dans la barre d'onglet.
      return {
        action: null,
        label: labelModifierModele,
        disabled: false,
        extra: scopeDisplay,
        actions: (
          <>
            {canExport && openModele.site_id === null && (
              <TooltipIconButton
                icon={<CopyPlus />}
                label="Copier vers un site"
                variant="outline"
                onClick={() =>
                  setExportState({ open: true, modele: openModele })
                }
              />
            )}
            {canEditModele(openModele) && (
              <TooltipIconButton
                icon={<Pencil />}
                label={labelModifierModele}
                variant="outline"
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
        ? labelNouveauModele
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
    labelModifierModele,
    labelNouveauModele,
  ])
  useTabAddAction(tabAddConfig.action, tabAddConfig.label, {
    disabled: tabAddConfig.disabled,
    extra: tabAddConfig.extra,
    actions: tabAddConfig.actions,
  })

  // En-tête de descente : le titre SUIT le nœud courant (catégorie ou modèle
  // ouvert) et les ancêtres cliquables alimentent le fil « Bibliothèque › … ›… »
  // rendu par <Tabs>. À la RACINE (depth 0) → `null` (titre de section).
  const header = useMemo<TabHeader | null>(() => {
    if (openModele !== null) {
      const breadcrumb: PageHeaderCrumb[] = drillCrumbs(path, goTo)
      return {
        title: openModele.nom,
        breadcrumb,
        description: openModele.description?.trim()
          ? openModele.description.trim()
          : undefined,
      }
    }
    if (depth === 0) return null
    const breadcrumb: PageHeaderCrumb[] = drillCrumbs(path.slice(0, -1), goTo)
    return {
      title: current?.nom ?? sectionTitleFallback,
      breadcrumb,
      description: current?.description?.trim()
        ? current.description.trim()
        : undefined,
    }
  }, [openModele, depth, path, current, goTo, sectionTitleFallback])
  useTabHeader(header)

  // Catégories sélectionnables comme PARENT à l'édition : racines de la famille
  // (modèle strict à 2 niveaux max ; un niveau de plus serait refusé par la base).
  const parentCandidates = useMemo(
    () => cats.filter((c) => c.parent_id === null),
    [cats],
  )

  const emptyHere =
    childCategories.length === 0 && modelesInCurrent.length === 0

  // Dialog de modèle (création/édition), partagé navigation + détail.
  const modeleFormDialog =
    canManage && current !== null
      ? renderModeleForm({
          open: modeleForm.open,
          onOpenChange: (open) => setModeleForm((f) => ({ ...f, open })),
          modele: modeleForm.modele,
          current,
          cats,
        })
      : null

  const exportDialog = canExport ? (
    <ExporterVersSiteDialog
      key={`export-${exportState.modele?.id ?? 'none'}`}
      open={exportState.open}
      onOpenChange={(open) => setExportState((s) => ({ ...s, open }))}
      titre={exportTitre}
      resume={exportState.modele ? exportResume(exportState.modele) : null}
      onConfirm={handleExportConfirm}
    />
  ) : null

  // VUE DÉTAIL : un modèle ouvert (niveau feuille).
  if (openModele !== null) {
    return (
      <>
        {renderDetail(openModele, canEditModele(openModele))}
        {modeleFormDialog}
        {exportDialog}
        {deleteModeleDialog}
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
                icon={depth === 0 ? FolderTree : emptyModeleIcon}
                title={depth === 0 ? 'Aucune catégorie ici' : 'Catégorie vide'}
                description={
                  depth === 0
                    ? 'Aucune catégorie dans ce périmètre pour le moment.'
                    : canManageHere
                      ? labelEmptyAddModele
                      : labelEmptyNoneModele
                }
              />
            )
          }
          return (
            <div className="flex flex-col gap-6">
              {childCategories.length > 0 && (
                <div className={listStack}>
                  {childCategories.map((cat) => {
                    const rowActions: RowAction[] = []
                    if (canManageCat(cat)) {
                      rowActions.push({
                        label: 'Modifier',
                        icon: Pencil,
                        onSelect: () => handleEditCategory(cat),
                      })
                      rowActions.push({
                        label: 'Supprimer',
                        icon: Trash2,
                        destructive: true,
                        onSelect: () => setToDeleteCategorie(cat),
                      })
                    }
                    return (
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
                        badges={<ScopeBadges siteId={cat.site_id} />}
                        mobileMeta={<ScopeBadges siteId={cat.site_id} />}
                        // Descendre d'un palier (PUSH) : on ajoute la catégorie au
                        // chemin courant.
                        onClick={() => goTo([...path, cat])}
                        menuActions={rowActions.length ? rowActions : undefined}
                      />
                    )
                  })}
                </div>
              )}

              {current !== null && modelesInCurrent.length > 0 && (
                <div className={listStack}>
                  {modelesInCurrent.map((modele) => {
                    const editable = canEditModele(modele)
                    const rowActions: RowAction[] = []
                    // Copie commun → site : uniquement sur un modèle COMMUN.
                    if (canExport && modele.site_id === null)
                      rowActions.push({
                        label: 'Copier vers un site',
                        icon: CopyPlus,
                        onSelect: () => setExportState({ open: true, modele }),
                      })
                    if (editable) {
                      rowActions.push({
                        label: 'Modifier',
                        icon: Pencil,
                        onSelect: () => setModeleForm({ open: true, modele }),
                      })
                      rowActions.push({
                        label: 'Supprimer',
                        icon: Trash2,
                        destructive: true,
                        onSelect: () => onAskDeleteModele(modele),
                      })
                    }
                    return (
                      <ListRow
                        key={modele.id}
                        media={
                          <MiniatureThumb
                            url={urlOf(modele.miniature_id)}
                            fallback={<ModeleFallbackIcon className="size-10" />}
                            alt=""
                            onError={refreshMiniatures}
                            className="size-full rounded-none"
                          />
                        }
                        title={modele.nom}
                        subtitle={modeleSubtitle(modele)}
                        badges={
                          <ScopeBadges
                            siteId={modele.site_id}
                            masque={modeleMasque?.(modele)}
                          />
                        }
                        mobileMeta={
                          <ScopeBadges
                            siteId={modele.site_id}
                            masque={modeleMasque?.(modele)}
                          />
                        }
                        // Ouvrir la page de détail du modèle.
                        onClick={() => goToModele(modele)}
                        menuActions={rowActions.length ? rowActions : undefined}
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
          preset={categoryForm.preset ?? { scope: categoryPresetScope }}
          categories={parentCandidates}
          canEntreprise={canEntreprise}
          siteId={categorySiteId}
          siteName={categorySiteName}
          lockedScope={
            categoryForm.categorie ? undefined : categoryForm.lockedScope
          }
          minimal
          // Portée visible en création ET modification (désactivée tant qu'imposée
          // par le contexte) → modal de création identique au modal de modification.
          hidePortee={false}
        />
      )}

      {/* Création / édition de modèle dans la catégorie. */}
      {modeleFormDialog}

      {deleteModeleDialog}

      <ConfirmDeleteCategorieDialog
        categorie={toDeleteCategorie}
        onClose={() => setToDeleteCategorie(null)}
        enfants={{
          sousCategories: cats.some(
            (c) => c.parent_id === toDeleteCategorie?.id,
          ),
          contenus: modeles.some(
            (m) => m.categorie_id === toDeleteCategorie?.id,
          ),
          labelContenu: 'modèles',
        }}
      />

      {exportDialog}
    </div>
  )
}
