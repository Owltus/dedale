import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Folder,
  FolderTree,
  Inbox,
  Pencil,
  Plus,
  Trash2,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { gammesQueries } from '../queries'
import { useDeleteGamme } from '../mutations'
import { GammeFormDialog } from './gamme-form-dialog'
import { GammeDetail, type GammeRow } from './gamme-detail'
import { GammeCard } from './gamme-card'
import { SousCategorieSplit } from './sous-categorie-split'
import {
  categoriesQueries,
  type Categorie,
} from '@/features/categories/queries'
import { useDeleteCategorie } from '@/features/categories/mutations'
import { CategoryFormDialog } from '@/features/categories/components/category-form-dialog'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useGammesDrill } from '@/hooks/use-gammes-drill'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { deleteErrorMessage } from '@/lib/form'
import { segOfUnique } from '@/lib/slug'
import { listStack } from '@/lib/responsive'
import * as perm from '@/lib/permissions'
import {
  PageHeader,
  type PageHeaderCrumb,
} from '@/components/common/page-header'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ListRow } from '@/components/common/list-row'
import type { RowAction } from '@/components/common/row-actions'
import { ScopeBadges } from '@/components/common/scope-badges'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { TabActionContext } from '@/components/common/tab-actions'
import type {
  TabActionApi,
  TabAddConfig,
} from '@/components/common/tab-actions'

// Id sentinelle du bac « Non classé » (catégorie VIRTUELLE, hors base) : regroupe
// à la racine les gammes du site sans catégorie visible (legacy/import, ou rangées
// dans une catégorie non affichée ici) pour ne JAMAIS les cacher.
const NON_CLASSE_ID = '__non_classe__'

const SECTION_DESCRIPTION =
  'Gammes de maintenance et de contrôle réglementaire du site, rangées par catégorie.'

/**
 * Catégorie pour le DRILL : projection minimale (champs lus à l'affichage +
 * `parent_id` pour l'arbre), plus un drapeau `virtual` pour le bac « Non classé ».
 */
interface DrillCat {
  id: string
  nom: string
  parent_id: string | null
  site_id: string | null
  description: string | null
  miniature_id: string | null
  ordre: number
  virtual: boolean
}

/** Segment d'URL d'une gamme, désambiguïsé entre frères (même sous-catégorie). */
function gammeSeg(g: GammeRow, siblings: GammeRow[]): string {
  return segOfUnique({ id: g.id, nom: g.nom }, siblings)
}

/**
 * Corps DÉFILANT d'un palier (catégories, gamme ouverte, états vides). En mode
 * `fill`, l'explorateur pose lui-même sa zone scrollable et réintègre le padding
 * que `PageContainer` non-`fill` fournissait. Le palier SPLIT n'utilise PAS ce
 * helper : ses deux panneaux gèrent leur propre défilement.
 */
function ScrollBody({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-8">
      {children}
    </div>
  )
}

/**
 * Explorateur du Plan de maintenance du SITE actif : navigation par CATÉGORIE
 * portée par l'URL (même patron que la page Équipements via `useGammesDrill`), mais
 * pour les GAMMES RÉELLES — chemin classique :
 * - Racine : catégories de gamme (commun + site) + un bac « Non classé » si des
 *   gammes n'ont pas de catégorie visible. La gestion des catégories vit dans la
 *   Bibliothèque (ici, navigation seule).
 * - Dans une catégorie : ses sous-catégories.
 * - Dans une sous-catégorie : ses gammes ; on y crée une gamme (sous-catégorie
 *   pré-sélectionnée dans le formulaire).
 * - Sur une gamme : sa fiche détail (onglets Opérations / Équipements / Documents).
 */
export function GammesExplorer({ siteId }: { siteId: string }) {
  const { data: role } = useCurrentRole()
  const canEdit = perm.canManageMetier(role)
  // Pour l'affichage de l'option « Commun » du formulaire de catégorie (masquée
  // ici via hidePortee, mais la prop reste requise).
  const canEntreprise = perm.canManageAdmin(role)

  const categoriesQuery = useQuery(categoriesQueries.pool())
  const gammesQuery = useQuery(gammesQueries.list(siteId))
  useRealtimeRefresh('gammes', gammesQueries.all())
  useRealtimeRefresh('categories', categoriesQueries.all())

  const del = useDeleteGamme()
  const delCategorie = useDeleteCategorie()
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  // Action « ajouter » de la top bar, PILOTÉE par l'onglet actif de la fiche
  // gamme (GammeDetail → useTabAddAction) : Lier équipements / Rattacher document
  // selon l'onglet. Remplace l'ancien bouton « Créer OT » désactivé.
  const [gammeAddConfig, setGammeAddConfig] = useState<TabAddConfig | null>(
    null,
  )
  const [gammeActionApi] = useState<TabActionApi>(() => ({
    setAction: setGammeAddConfig,
  }))

  // Catégories de GAMME visibles : scope 'gamme'/'mixte' (jamais 'parc'/'equipement'
  // seul), actives, du commun (site_id null) OU du site actif — cohérent avec le
  // périmètre des sous-catégories sélectionnables (cf. gammesQueries.sousCategories).
  const gammeCats = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (c) =>
          c.est_actif &&
          (c.scope === 'gamme' || c.scope === 'mixte') &&
          (c.site_id === null || c.site_id === siteId),
      ),
    [categoriesQuery.data, siteId],
  )
  // Accès rapide à la catégorie COMPLÈTE (pour l'édition via le formulaire) ; le
  // drill ne manipule qu'une projection `DrillCat`.
  const categoriesById = useMemo(
    () => new Map(gammeCats.map((c) => [c.id, c])),
    [gammeCats],
  )

  const gammes = useMemo<GammeRow[]>(
    () => gammesQuery.data ?? [],
    [gammesQuery.data],
  )

  // Gamme « de racine » : sans catégorie OU rangée dans une catégorie non visible
  // ici → regroupée dans le bac « Non classé ».
  const visibleCatIds = useMemo(
    () => new Set(gammeCats.map((c) => c.id)),
    [gammeCats],
  )
  // `categorie_id` est NOT NULL : une gamme « orpheline » est une gamme rangée dans
  // une catégorie NON visible ici (inactive, autre périmètre, scope ≠ gamme/mixte).
  const isRootGamme = useCallback(
    (g: GammeRow) => !visibleCatIds.has(g.categorie_id),
    [visibleCatIds],
  )
  const orphans = useMemo(
    () => gammes.filter(isRootGamme),
    [gammes, isRootGamme],
  )

  // Catégories du drill = catégories projetées + bac « Non classé » (s'il y a des
  // orphelines).
  const drillCats = useMemo<DrillCat[]>(() => {
    const real: DrillCat[] = gammeCats.map((c) => ({
      id: c.id,
      nom: c.nom,
      parent_id: c.parent_id,
      site_id: c.site_id,
      description: c.description,
      miniature_id: c.miniature_id,
      ordre: c.ordre,
      virtual: false,
    }))
    if (orphans.length > 0) {
      real.push({
        id: NON_CLASSE_ID,
        nom: 'Non classé',
        parent_id: null,
        site_id: siteId,
        description: 'Gammes sans catégorie',
        miniature_id: null,
        ordre: Number.MAX_SAFE_INTEGER,
        virtual: true,
      })
    }
    return real
  }, [gammeCats, orphans, siteId])

  const { path, current, depth, children, goTo, leafSeg, goToLeaf } =
    useGammesDrill(drillCats)

  // Sous-catégories du palier courant, triées (le bac « Non classé » finit dernier).
  const childCategories = useMemo(
    () =>
      [...children].sort(
        (a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom),
      ),
    [children],
  )

  // Gammes d'un palier : bac « Non classé » → orphelines ; sinon celles qui
  // référencent la catégorie. Source unique du regroupement (listing + résolution
  // de feuille + navigation).
  const gammesUnder = useCallback(
    (catId: string | null) =>
      catId === NON_CLASSE_ID
        ? orphans
        : catId === null
          ? []
          : gammes.filter((g) => g.categorie_id === catId),
    [gammes, orphans],
  )

  const gammesInCurrent = useMemo(
    () =>
      current === null
        ? []
        : [...gammesUnder(current.id)].sort((a, b) =>
            a.nom.localeCompare(b.nom),
          ),
    [gammesUnder, current],
  )

  // Gamme OUVERTE (vue détail, niveau FEUILLE) : résolue parmi les gammes du palier
  // courant (mêmes frères qu'à la génération → slug stable).
  const openGamme = useMemo(() => {
    if (leafSeg === undefined || current === null) return null
    const siblings = gammesUnder(current.id)
    return siblings.find((g) => gammeSeg(g, siblings) === leafSeg) ?? null
  }, [leafSeg, current, gammesUnder])

  // Chaîne de catégories (racine → cat) d'un id réel : pour ouvrir une gamme par son
  // CHEMIN RÉEL, indépendant du palier courant.
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

  const goToGamme = useCallback(
    (g: GammeRow, opts?: { replace?: boolean }) => {
      const orphan = isRootGamme(g)
      const chain = orphan ? catChain(NON_CLASSE_ID) : catChain(g.categorie_id)
      const siblings = gammesUnder(orphan ? NON_CLASSE_ID : g.categorie_id)
      goToLeaf(chain, gammeSeg(g, siblings), { replace: opts?.replace })
    },
    [isRootGamme, catChain, gammesUnder, goToLeaf],
  )

  // Re-synchronise l'URL si la gamme OUVERTE est renommée (« Modifier » ou réception
  // realtime) : son slug change → l'URL ne la résout plus. On mémorise id + segment
  // et, si elle existe encore, on réécrit l'URL sur son chemin frais (REPLACE) sans
  // fermer le détail ; supprimée → repli propre vers la navigation.
  const lastIdRef = useRef<string | null>(null)
  const lastLeafRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (openGamme !== null) {
      lastIdRef.current = openGamme.id
      lastLeafRef.current = leafSeg
    }
  }, [openGamme, leafSeg])
  useLayoutEffect(() => {
    if (leafSeg === undefined || openGamme !== null) return
    if (leafSeg !== lastLeafRef.current) return
    const id = lastIdRef.current
    if (id === null) return
    const fresh = gammes.find((g) => g.id === id)
    if (!fresh) return
    goToGamme(fresh, { replace: true })
  }, [leafSeg, openGamme, gammes, goToGamme])

  // --- Dialogs ---
  const [gammeForm, setGammeForm] = useState<{
    open: boolean
    gamme: GammeRow | null
  }>({ open: false, gamme: null })
  const [toDelete, setToDelete] = useState<GammeRow | null>(null)
  const [categoryForm, setCategoryForm] = useState<{
    open: boolean
    categorie: Categorie | null
    preset?: { scope: 'gamme'; parent_id?: string }
    lockedScope: { portee: 'site'; siteId: string } | null
  }>({ open: false, categorie: null, lockedScope: null })
  const [toDeleteCategorie, setToDeleteCategorie] = useState<DrillCat | null>(
    null,
  )

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Gamme supprimée')
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
  // gamme rattachée). Pré-calcul pour adapter le message et désactiver.
  const toDeleteCategorieNonVide =
    toDeleteCategorie !== null &&
    (gammeCats.some((c) => c.parent_id === toDeleteCategorie.id) ||
      gammes.some((g) => g.categorie_id === toDeleteCategorie.id))

  // Catégorie de SITE uniquement gérable ici (le commun, issu de la Bibliothèque,
  // reste navigable mais non modifiable) ; jamais le bac virtuel « Non classé ».
  const canManageCat = (c: DrillCat) =>
    canEdit && !c.virtual && c.site_id !== null

  // Racines de gamme DU SITE (parent candidat à l'édition ; masqué en mode minimal).
  const parentCandidates = useMemo(
    () => gammeCats.filter((c) => c.parent_id === null && c.site_id === siteId),
    [gammeCats, siteId],
  )

  // Création d'une catégorie RACINE / SOUS-catégorie PROPRE AU SITE (scope gamme,
  // portée site verrouillée) — le commun se gère en Bibliothèque.
  const handleAddRootCategory = () =>
    setCategoryForm({
      open: true,
      categorie: null,
      preset: { scope: 'gamme' },
      lockedScope: { portee: 'site', siteId },
    })
  const handleAddSubCategory = () => {
    if (!current || current.virtual) return
    setCategoryForm({
      open: true,
      categorie: null,
      preset: { scope: 'gamme', parent_id: current.id },
      lockedScope: { portee: 'site', siteId },
    })
  }
  const handleEditCategory = (c: Categorie) =>
    setCategoryForm({ open: true, categorie: c, lockedScope: null })

  // Création d'une gamme : uniquement DANS une sous-catégorie (niveau ≥2, non
  // virtuelle) — chemin strict catégorie → sous-catégorie → gamme. La sous-catégorie
  // courante est pré-sélectionnée dans le formulaire.
  const newCategoryBtn = canEdit ? (
    <TooltipIconButton
      icon={<Plus />}
      label="Nouvelle catégorie"
      variant="outline"
      onClick={handleAddRootCategory}
    />
  ) : null
  const canCreateSubcat = canEdit && depth === 1 && !(current?.virtual ?? false)
  const newSubCategoryBtn = canCreateSubcat ? (
    <TooltipIconButton
      icon={<Plus />}
      label="Nouvelle sous-catégorie"
      variant="outline"
      onClick={handleAddSubCategory}
    />
  ) : null
  const canCreateGammeHere =
    canEdit && depth >= 2 && !(current?.virtual ?? false)
  const newGammeBtn = canCreateGammeHere ? (
    <TooltipIconButton
      icon={<Plus />}
      label="Nouvelle gamme"
      variant="outline"
      onClick={() => setGammeForm({ open: true, gamme: null })}
    />
  ) : null

  // --- En-tête : titre (racine) ou fil d'Ariane (descente) + actions. ---
  // Description affichée dans la topbar : celle DU NŒUD courant (catégorie,
  // sous-catégorie ou gamme) quand elle existe, sinon repli sur la description
  // générale de la section → la ligne n'est jamais vide ni muette.
  const nodeDescription = (d: string | null | undefined) =>
    d?.trim() ? d.trim() : SECTION_DESCRIPTION
  let header: React.ReactNode
  if (openGamme !== null) {
    const ancestors: PageHeaderCrumb[] = [
      { label: 'Plan de maintenance', onClick: () => goTo([]) },
      ...path.map((c, i) => ({
        label: c.nom,
        onClick: () => goTo(path.slice(0, i + 1)),
      })),
    ]
    // Top bar : « Modifier » + bouton d'ajout DYNAMIQUE selon l'onglet actif
    // (Lier équipements / Rattacher document), enregistré par GammeDetail via
    // useTabAddAction. Plus de bouton « Créer OT » désactivé.
    const modifierBtn = canEdit ? (
      <TooltipIconButton
        icon={<Pencil />}
        label="Modifier la gamme"
        variant="outline"
        onClick={() => setGammeForm({ open: true, gamme: openGamme })}
      />
    ) : null
    // Supprimer : miroir de l'action de la carte de liste (même mutation delete,
    // même confirmation), réservé canEdit.
    const supprimerBtn = canEdit ? (
      <TooltipIconButton
        icon={<Trash2 className="text-destructive" />}
        label="Supprimer la gamme"
        variant="outline"
        onClick={() => setToDelete(openGamme)}
      />
    ) : null
    const AddIcon = gammeAddConfig?.icon ?? Plus
    const addBtn =
      gammeAddConfig?.action != null ? (
        <TooltipIconButton
          icon={<AddIcon />}
          label={gammeAddConfig.label}
          variant="outline"
          onClick={gammeAddConfig.action}
        />
      ) : null
    const gammeActions = modifierBtn ?? supprimerBtn ?? addBtn
    header = (
      <PageHeader
        breadcrumb={ancestors}
        title={openGamme.nom}
        description={nodeDescription(openGamme.description)}
        action={
          gammeActions ? (
            <>
              {modifierBtn}
              {supprimerBtn}
              {addBtn}
            </>
          ) : undefined
        }
      />
    )
  } else if (depth > 0) {
    const ancestors: PageHeaderCrumb[] = [
      { label: 'Plan de maintenance', onClick: () => goTo([]) },
      ...path.slice(0, -1).map((c, i) => ({
        label: c.nom,
        onClick: () => goTo(path.slice(0, i + 1)),
      })),
    ]
    header = (
      <PageHeader
        breadcrumb={ancestors}
        title={current?.nom ?? 'Catégorie'}
        description={nodeDescription(current?.description)}
        action={
          depth >= 2
            ? (newGammeBtn ?? undefined)
            : (newSubCategoryBtn ?? undefined)
        }
      />
    )
  } else {
    header = (
      <PageHeader
        title="Plan de maintenance"
        description={SECTION_DESCRIPTION}
        action={newCategoryBtn ?? undefined}
      />
    )
  }

  const dialogs = (
    <>
      {canEdit && (
        <GammeFormDialog
          key={`gamme-${gammeForm.gamme?.id ?? 'new'}-${String(gammeForm.open)}`}
          open={gammeForm.open}
          onOpenChange={(open) => setGammeForm((f) => ({ ...f, open }))}
          siteId={siteId}
          gamme={gammeForm.gamme}
          // À la création depuis une sous-catégorie : la pré-sélectionner.
          presetCategorieId={
            gammeForm.gamme || current?.virtual ? undefined : current?.id
          }
        />
      )}

      {canEdit && (
        <CategoryFormDialog
          // `open` dans la key : remontage à chaque ouverture pour que
          // `initialValues` relise le preset/lockedScope courant (sinon scope par
          // défaut au lieu de `gamme`).
          key={
            (categoryForm.categorie
              ? `cat-edit-${categoryForm.categorie.id}`
              : `cat-new-${categoryForm.preset?.parent_id ?? 'root'}`) +
            `-${String(categoryForm.open)}`
          }
          open={categoryForm.open}
          onOpenChange={(open) => setCategoryForm((f) => ({ ...f, open }))}
          categorie={categoryForm.categorie}
          preset={categoryForm.preset}
          categories={parentCandidates}
          canEntreprise={canEntreprise}
          siteId={siteId}
          siteName={null}
          lockedScope={
            categoryForm.categorie ? undefined : categoryForm.lockedScope
          }
          minimal
          // Scope toujours `gamme` et portée toujours « site » ici → champs masqués.
          hideScope
          hidePortee
        />
      )}

      <ConfirmDeleteDialog
        open={toDeleteCategorie !== null}
        onOpenChange={(open) => {
          if (!open) setToDeleteCategorie(null)
        }}
        entityLabel={
          toDeleteCategorie
            ? `la catégorie « ${toDeleteCategorie.nom} »`
            : 'la catégorie'
        }
        blocked={toDeleteCategorieNonVide}
        blockedReason="Cette catégorie contient des sous-catégories ou des gammes. Vide-la d’abord pour pouvoir la supprimer."
        warning="Cette suppression est définitive."
        loading={delCategorie.isPending}
        onConfirm={confirmDeleteCategorie}
      />

      <ConfirmDeleteDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        entityLabel={toDelete ? `la gamme « ${toDelete.nom} »` : 'la gamme'}
        warning="Cette suppression est définitive. Les opérations de la gamme sont retirées."
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </>
  )

  // VUE DÉTAIL : une gamme ouverte. Le Provider permet à l'onglet actif
  // (GammeDetail) d'enregistrer son action « ajouter », rendue dans la top bar.
  if (openGamme !== null) {
    return (
      <TabActionContext.Provider value={gammeActionApi}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-4 pt-6 sm:px-6 lg:px-8">{header}</div>
          <GammeDetail gamme={openGamme} siteId={siteId} canEdit={canEdit} />
        </div>
        {dialogs}
      </TabActionContext.Provider>
    )
  }

  const emptyHere =
    childCategories.length === 0 &&
    (current === null || gammesInCurrent.length === 0)

  // Palier « sous-catégorie » : on y affiche les gammes ; dès qu'il y en a,
  // l'écran passe en SPLIT 50/50 (gammes en haut, OT liés en bas).
  const isSubcatLevel = depth >= 2 || (current?.virtual ?? false)

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-4 pt-6 sm:px-6 lg:px-8">{header}</div>

        <QueryState
          query={categoriesQuery}
          pending={
            <ScrollBody>
              <ListRowSkeletons count={4} />
            </ScrollBody>
          }
        >
          {() => {
            if (gammesQuery.isPending)
              return (
                <ScrollBody>
                  <ListRowSkeletons count={4} />
                </ScrollBody>
              )
            if (gammesQuery.isError) {
              return (
                <ScrollBody>
                  <ErrorState onRetry={() => void gammesQuery.refetch()} />
                </ScrollBody>
              )
            }
            if (emptyHere) {
              return (
                <ScrollBody>
                  <EmptyState
                    icon={isSubcatLevel ? Wrench : FolderTree}
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
                          ? 'Crée une première catégorie avec le bouton « Nouvelle catégorie », ou réutilise le catalogue commun de la Bibliothèque.'
                          : 'Aucune catégorie pour le moment.'
                        : depth === 1
                          ? canCreateSubcat
                            ? 'Crée une sous-catégorie avec le bouton « Nouvelle sous-catégorie ».'
                            : 'Aucune sous-catégorie.'
                          : canCreateGammeHere
                            ? 'Crée une gamme avec le bouton « Nouvelle gamme ».'
                            : 'Aucune gamme dans cette sous-catégorie.'
                    }
                  />
                </ScrollBody>
              )
            }
            const lists = (
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
                        onClick={() => goTo([...path, cat])}
                        menuActions={
                          canManageCat(cat)
                            ? ([
                                {
                                  label: 'Modifier',
                                  icon: Pencil,
                                  onSelect: () => {
                                    const full = categoriesById.get(cat.id)
                                    if (full) handleEditCategory(full)
                                  },
                                },
                                {
                                  label: 'Supprimer',
                                  icon: Trash2,
                                  destructive: true,
                                  onSelect: () => setToDeleteCategorie(cat),
                                },
                              ] satisfies RowAction[])
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}

                {gammesInCurrent.length > 0 && (
                  <div className={listStack}>
                    {gammesInCurrent.map((g) => {
                      const rowActions: RowAction[] = []
                      if (canEdit) {
                        rowActions.push({
                          label: 'Modifier',
                          icon: Pencil,
                          onSelect: () =>
                            setGammeForm({ open: true, gamme: g }),
                        })
                        rowActions.push({
                          label: 'Supprimer',
                          icon: Trash2,
                          destructive: true,
                          onSelect: () => setToDelete(g),
                        })
                      }
                      return (
                        <GammeCard
                          key={g.id}
                          gamme={g}
                          urlOf={urlOf}
                          refreshMiniatures={refreshMiniatures}
                          onClick={() => goToGamme(g)}
                          menuActions={
                            rowActions.length ? rowActions : undefined
                          }
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )
            if (isSubcatLevel && gammesInCurrent.length > 0) {
              // < lg : un seul flux scrollable (gammes puis OT empilés,
              // mobile-first) ; >= lg : SPLIT 50/50 à double défilement (le
              // wrapper passe en overflow-hidden). `no-scrollbar` masque la
              // barre du wrapper en mobile (défilement conservé).
              return (
                <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-6 sm:px-6 lg:overflow-hidden lg:px-8">
                  <SousCategorieSplit
                    siteId={siteId}
                    gammeIds={gammesInCurrent.map((g) => g.id)}
                  >
                    {lists}
                  </SousCategorieSplit>
                </div>
              )
            }
            return <ScrollBody>{lists}</ScrollBody>
          }}
        </QueryState>
      </div>

      {dialogs}
    </>
  )
}
