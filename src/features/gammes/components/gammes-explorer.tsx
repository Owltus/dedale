import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { FolderTree, Pencil, Plus, Trash2, Wrench } from 'lucide-react'
import { gammesQueries } from '../queries'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import { OT_QUERY_KEYS } from '@/features/ordres-travail/query-keys'
import type { OtTriable } from '@/features/ordres-travail/tri'
import {
  statutAffichageAgrege,
  type GammeStatutInput,
} from '../statut-affichage'
import { useDeleteGamme } from '../mutations'
import { GammeFormDialog } from './gamme-form-dialog'
import { GammeDetail, type GammeRow } from './gamme-detail'
import { GammeCard } from './gamme-card'
import { SousCategorieSplit } from './sous-categorie-split'
import {
  categoriesQueries,
  type Categorie,
} from '@/features/categories/queries'
import { CategoryFormDialog } from '@/features/categories/components/category-form-dialog'
import { ConfirmDeleteCategorieDialog } from '@/features/categories/components/confirm-delete-categorie-dialog'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { CategorieCard } from '@/features/categories/components/categorie-card'
import { SousCategorieCard } from '@/features/categories/components/sous-categorie-card'
import { useGammesDrill } from '@/hooks/use-gammes-drill'
import {
  useCatalogueDrill,
  type CatalogueDrillCat,
  NON_CLASSE_ID,
} from '@/hooks/use-catalogue-drill'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { listStack } from '@/lib/responsive'
import * as perm from '@/lib/permissions'
import {
  PageHeader,
  type PageHeaderCrumb,
} from '@/components/common/page-header'
import { drillCrumbs } from '@/components/common/drill-crumbs'
import { FillHeader, ScrollBody } from '@/components/common/page-container'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { actionsEditionSuppression } from '@/components/common/row-actions'
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

// API typée de la route SPLAT : pour lire `?open=<gammeId>` (ouverture directe d'une
// gamme depuis une autre page) sans inverser la dépendance features → routes.
const gammesRoute = getRouteApi('/_app/gammes/$')

const SECTION_DESCRIPTION =
  'Gammes de maintenance et de contrôle réglementaire du site, rangées par catégorie.'

// Accès stables (identité constante) alimentant `useCatalogueDrill` : id, nom et
// catégorie d'une gamme (`categorie_id` est NOT NULL).
const gammeId = (g: GammeRow) => g.id
const gammeNom = (g: GammeRow) => g.nom
const gammeCategorieId = (g: GammeRow) => g.categorie_id

/**
 * Explorateur du Plan de maintenance du SITE actif : navigation par CATÉGORIE
 * portée par l'URL (même patron que la page Équipements via `useCatalogueDrill`),
 * mais pour les GAMMES RÉELLES — chemin classique :
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
  // drill ne manipule qu'une projection `CatalogueDrillCat`.
  const categoriesById = useMemo(
    () => new Map(gammeCats.map((c) => [c.id, c])),
    [gammeCats],
  )

  const gammes = useMemo<GammeRow[]>(
    () => gammesQuery.data ?? [],
    [gammesQuery.data],
  )

  // Projection des catégories réelles + fabrique du bac virtuel « Non classé »,
  // consommées par `useCatalogueDrill` (bac + orphelins, drill, resync).
  const realCats = useMemo<CatalogueDrillCat[]>(
    () =>
      gammeCats.map((c) => ({
        id: c.id,
        nom: c.nom,
        parent_id: c.parent_id,
        site_id: c.site_id,
        description: c.description,
        miniature_id: c.miniature_id,
        ordre: c.ordre,
        virtual: false,
      })),
    [gammeCats],
  )
  const makeVirtual = useCallback<() => CatalogueDrillCat>(
    () => ({
      id: NON_CLASSE_ID,
      nom: 'Non classé',
      parent_id: null,
      site_id: siteId,
      description: 'Gammes sans catégorie',
      miniature_id: null,
      ordre: Number.MAX_SAFE_INTEGER,
      virtual: true,
    }),
    [siteId],
  )

  const {
    path,
    current,
    depth,
    childCategories,
    goTo,
    orphans,
    itemsInCurrent: gammesInCurrent,
    openItem: openGamme,
    goToItem: goToGamme,
  } = useCatalogueDrill<GammeRow, CatalogueDrillCat>({
    realCats,
    makeVirtual,
    items: gammes,
    getItemId: gammeId,
    getItemNom: gammeNom,
    getCategorieId: gammeCategorieId,
    useDrill: useGammesDrill,
  })

  // Gammes (rows) sous un nœud de l'arbre AFFICHÉ : catégorie (depth 0) → gammes de
  // TOUTES ses sous-catégories ; sous-catégorie (depth 1) → ses gammes directes ; bac
  // « Non classé » virtuel → les orphelines. Sert au calcul des ids à charger ET au
  // badge agrégé de la carte (MÊME règle à tous les niveaux).
  const gammeRowsUnderNode = useCallback(
    (node: CatalogueDrillCat): GammeRow[] => {
      if (node.virtual) return orphans
      if (depth === 0) {
        const sousCatIds = new Set(
          gammeCats.filter((c) => c.parent_id === node.id).map((c) => c.id),
        )
        return gammes.filter((g) => sousCatIds.has(g.categorie_id))
      }
      return gammes.filter((g) => g.categorie_id === node.id)
    },
    [depth, gammeCats, gammes, orphans],
  )

  // OT à charger pour les badges du palier : gammes LISTÉES (GammeCard) + gammes sous
  // chaque catégorie / sous-catégorie affichée (badge AGRÉGÉ). Au palier
  // sous-catégorie, la clé byGammes est PARTAGÉE avec le panneau OT du bas
  // (SousCategorieSplit → OtListeParGammes) → pas de double fetch. Realtime OT pour
  // que les badges suivent clôtures/réouvertures — NÉCESSAIRE aux paliers
  // catégorie/sous-catégorie où le panneau OT n'est pas (toujours) rendu.
  const gammeIdsBadges = useMemo(() => {
    const ids = new Set<string>()
    for (const g of gammesInCurrent) ids.add(g.id)
    for (const node of childCategories)
      for (const g of gammeRowsUnderNode(node)) ids.add(g.id)
    return [...ids]
  }, [gammesInCurrent, childCategories, gammeRowsUnderNode])
  const otsParGammeQuery = useQuery(
    ordresTravailQueries.byGammes(siteId, gammeIdsBadges),
  )
  useRealtimeRefresh('ordres_travail', OT_QUERY_KEYS)
  // Badges INDISPONIBLES : seulement pendant un fetch réel (`isLoading` — PAS
  // `isPending`, qui reste vrai pour une requête DÉSACTIVÉE quand il n'y a aucune
  // gamme à charger, ce qui masquerait à tort « Vide »), ou en cas d'erreur (on évite
  // d'afficher un statut trompeur calculé sur des OT absents).
  const otsBadgesIndispo =
    otsParGammeQuery.isLoading || otsParGammeQuery.isError
  const otsParGamme = useMemo(() => {
    const map = new Map<string, OtTriable[]>()
    for (const ot of otsParGammeQuery.data ?? []) {
      if (ot.gamme_id === null) continue
      const liste = map.get(ot.gamme_id) ?? []
      liste.push(ot)
      map.set(ot.gamme_id, liste)
    }
    return map
  }, [otsParGammeQuery.data])
  // Gammes (activité + OT) sous un nœud, pour le badge AGRÉGÉ (pire cas — cf.
  // statutAffichageAgrege) de sa CategorieCard / SousCategorieCard.
  const gammesStatutUnderNode = useCallback(
    (node: CatalogueDrillCat): GammeStatutInput[] =>
      gammeRowsUnderNode(node).map((g) => ({
        estActive: g.est_active,
        ots: otsParGamme.get(g.id) ?? [],
      })),
    [gammeRowsUnderNode, otsParGamme],
  )
  // Badge de statut AGRÉGÉ par catégorie/sous-catégorie affichée, MÉMOÏSÉ :
  // l'agrégation + le tri par urgence de TOUS les OT du palier ne se recalculent que
  // si les nœuds affichés ou leurs OT changent — plus à chaque re-render (ouverture
  // de dialog, frappe dans le formulaire catégorie…). Map vide pendant le fetch / sur
  // erreur → badges masqués (cf. statutPending).
  const statutParNode = useMemo(() => {
    const map = new Map<string, ReturnType<typeof statutAffichageAgrege>>()
    if (otsBadgesIndispo) return map
    for (const node of childCategories)
      map.set(
        node.id,
        statutAffichageAgrege({ gammes: gammesStatutUnderNode(node) }),
      )
    return map
  }, [childCategories, gammesStatutUnderNode, otsBadgesIndispo])

  // Ouverture DIRECTE par `?open=<gammeId>` (lien depuis une autre page, ex. onglet
  // Gammes d'un prestataire) : dès que les gammes du site sont chargées, on résout
  // l'id et on délègue à `goToGamme` — MÊME logique catégorie/orphelin/slug que la
  // navigation interne, en REPLACE pour réécrire l'URL sur le chemin propre (le param
  // disparaît). Consommé une seule fois par valeur (ref) → ni boucle, ni ré-ouverture
  // si l'utilisateur remonte ensuite manuellement.
  const { open: openGammeId } = gammesRoute.useSearch()
  const consumedOpenRef = useRef<string | null>(null)
  useEffect(() => {
    if (!openGammeId || gammesQuery.isPending) return
    if (consumedOpenRef.current === openGammeId) return
    consumedOpenRef.current = openGammeId
    const fresh = gammes.find((g) => g.id === openGammeId)
    if (fresh) goToGamme(fresh, { replace: true })
  }, [openGammeId, gammes, gammesQuery.isPending, goToGamme])

  // --- Dialogs ---
  const gammeDialog = useEntityDialog<GammeRow>()
  const suppression = useConfirmDelete<GammeRow>({
    onDelete: (g) => del.mutateAsync(g.id),
    successMessage: 'Gamme supprimée',
  })
  const [categoryForm, setCategoryForm] = useState<{
    open: boolean
    categorie: Categorie | null
    preset?: { scope: 'gamme'; parent_id?: string }
    lockedScope: { portee: 'site'; siteId: string } | null
  }>({ open: false, categorie: null, lockedScope: null })
  const [toDeleteCategorie, setToDeleteCategorie] =
    useState<CatalogueDrillCat | null>(null)

  // La base BLOQUE la suppression d'une catégorie NON VIDE (sous-catégorie ou
  // gamme rattachée). Pré-calcul pour le message et la désactivation du bouton.
  const categorieEnfants = {
    sousCategories:
      toDeleteCategorie !== null &&
      gammeCats.some((c) => c.parent_id === toDeleteCategorie.id),
    contenus:
      toDeleteCategorie !== null &&
      gammes.some((g) => g.categorie_id === toDeleteCategorie.id),
    labelContenu: 'gammes',
  }

  // Catégorie de SITE uniquement gérable ici (le commun, issu de la Bibliothèque,
  // reste navigable mais non modifiable) ; jamais le bac virtuel « Non classé ».
  const canManageCat = (c: CatalogueDrillCat) =>
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
      onClick={gammeDialog.openCreate}
    />
  ) : null

  // --- En-tête : titre (racine) ou fil d'Ariane (descente) + actions. ---
  // Description affichée dans la topbar : celle DU NŒUD courant (catégorie,
  // sous-catégorie ou gamme) quand elle existe, sinon repli sur la description
  // générale de la section → la ligne n'est jamais vide ni muette.
  const nodeDescription = (d: string | null | undefined) =>
    d?.trim() ? d.trim() : SECTION_DESCRIPTION
  // Fil d'Ariane « Plan de maintenance › … › nœud ». `segs` est TOUJOURS un préfixe
  // de `path`, donc l'index `i` indexe `path` directement (clic = descente à ce palier).
  const crumbs = (segs: CatalogueDrillCat[]): PageHeaderCrumb[] =>
    drillCrumbs(segs, goTo, {
      label: 'Plan de maintenance',
      onClick: () => goTo([]),
    })
  let header: React.ReactNode
  if (openGamme !== null) {
    const ancestors = crumbs(path)
    // Top bar : « Modifier » + bouton d'ajout DYNAMIQUE selon l'onglet actif
    // (Lier équipements / Rattacher document), enregistré par GammeDetail via
    // useTabAddAction. Plus de bouton « Créer OT » désactivé.
    const modifierBtn = canEdit ? (
      <TooltipIconButton
        icon={<Pencil />}
        label="Modifier la gamme"
        variant="outline"
        onClick={() => gammeDialog.openEdit(openGamme)}
      />
    ) : null
    // Supprimer : miroir de l'action de la carte de liste (même mutation delete,
    // même confirmation), réservé canEdit.
    const supprimerBtn = canEdit ? (
      <TooltipIconButton
        icon={<Trash2 className="text-destructive" />}
        label="Supprimer la gamme"
        variant="outline"
        onClick={() => suppression.demander(openGamme)}
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
    const ancestors = crumbs(path.slice(0, -1))
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
          key={gammeDialog.dialogKey}
          open={gammeDialog.open}
          onOpenChange={gammeDialog.onOpenChange}
          siteId={siteId}
          gamme={gammeDialog.entity}
          // À la création depuis une sous-catégorie : la pré-sélectionner.
          presetCategorieId={
            gammeDialog.entity || current?.virtual ? undefined : current?.id
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
          // Permet de déplacer une sous-catégorie vers une autre catégorie racine
          // du site (parents = `parentCandidates`), malgré le mode minimal.
          allowReparent
        />
      )}

      <ConfirmDeleteCategorieDialog
        categorie={toDeleteCategorie}
        onClose={() => setToDeleteCategorie(null)}
        enfants={categorieEnfants}
      />

      <ConfirmDeleteDialog
        {...suppression.dialogProps}
        entityLabel={
          suppression.toDelete
            ? `la gamme « ${suppression.toDelete.nom} »`
            : 'la gamme'
        }
        warning="Cette suppression est définitive. Les opérations de la gamme sont retirées."
      />
    </>
  )

  // VUE DÉTAIL : une gamme ouverte. Le Provider permet à l'onglet actif
  // (GammeDetail) d'enregistrer son action « ajouter », rendue dans la top bar.
  if (openGamme !== null) {
    return (
      <TabActionContext.Provider value={gammeActionApi}>
        <div className="flex min-h-0 flex-1 flex-col">
          <FillHeader>{header}</FillHeader>
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
        <FillHeader>{header}</FillHeader>

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
                    {childCategories.map((cat) => {
                      const menuActions = canManageCat(cat)
                        ? actionsEditionSuppression({
                            onModifier: () => {
                              const full = categoriesById.get(cat.id)
                              if (full) handleEditCategory(full)
                            },
                            onSupprimer: () => setToDeleteCategorie(cat),
                          })
                        : undefined
                      const onClick = () => goTo([...path, cat])
                      // Racine (depth 0) = catégories (+ bac « Non classé »
                      // virtuel) ; niveau 1 = sous-catégories. Composants dédiés,
                      // choisis par profondeur.
                      // Badge de statut AGRÉGÉ (pire cas des gammes du périmètre —
                      // catégorie OU sous-catégorie), masqué pendant le fetch / sur
                      // erreur (Map vide alors → undefined). MÊME règle à tous les
                      // niveaux (statutAffichageAgrege, mémoïsé dans statutParNode).
                      const statutNode = statutParNode.get(cat.id)
                      if (depth === 0) {
                        return (
                          <CategorieCard
                            key={cat.id}
                            categorie={cat}
                            urlOf={urlOf}
                            refreshMiniatures={refreshMiniatures}
                            onClick={onClick}
                            menuActions={menuActions}
                            virtual={cat.virtual}
                            statut={statutNode}
                            statutPending={otsBadgesIndispo}
                          />
                        )
                      }
                      return (
                        <SousCategorieCard
                          key={cat.id}
                          sousCategorie={cat}
                          urlOf={urlOf}
                          refreshMiniatures={refreshMiniatures}
                          onClick={onClick}
                          menuActions={menuActions}
                          statut={statutNode}
                          statutPending={otsBadgesIndispo}
                        />
                      )
                    })}
                  </div>
                )}

                {gammesInCurrent.length > 0 && (
                  <div className={listStack}>
                    {gammesInCurrent.map((g) => {
                      const rowActions = canEdit
                        ? actionsEditionSuppression({
                            onModifier: () => gammeDialog.openEdit(g),
                            onSupprimer: () => suppression.demander(g),
                          })
                        : []
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
                          statutOts={otsParGamme.get(g.id) ?? []}
                          statutPending={otsBadgesIndispo}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )
            if (isSubcatLevel && gammesInCurrent.length > 0) {
              // SPLIT 50/50 à double défilement à TOUTES les tailles d'écran : le
              // wrapper borne la hauteur (overflow-hidden) et chaque panneau (gammes
              // / OT) défile indépendamment. `no-scrollbar` masque toute barre
              // résiduelle du wrapper.
              return (
                <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-6 sm:px-6 lg:px-8">
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
