import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CopyPlus, FolderTree, Pencil, Trash2, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { gammesQueries, type GammeBiblioRow } from '../queries'
import { useCopierGamme, useDeleteGamme } from '../mutations'
import { GammeCard } from './gamme-card'
import { GammeBiblioFormDialog } from './gamme-biblio-form-dialog'
import { GammeModelesSection } from './gamme-modeles-section'
import { GammeOperationsSection } from './gamme-operations-section'
import { CopierContenuDialog } from './copier-contenu-dialog'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import {
  categoriesQueries,
  type Categorie,
} from '@/features/categories/queries'
import { CategoryFormDialog } from '@/features/categories/components/category-form-dialog'
import { ConfirmDeleteCategorieDialog } from '@/features/categories/components/confirm-delete-categorie-dialog'
import { CategorieCard } from '@/features/categories/components/categorie-card'
import { SousCategorieCard } from '@/features/categories/components/sous-categorie-card'
import type { CategorieFormValues } from '@/features/categories/schemas'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useBiblioTreeDrill } from '@/hooks/use-biblio-tree-drill'
import { useLeafResync } from '@/hooks/use-leaf-resync'
import { useSiteContext } from '@/lib/site-context'
import { deleteErrorMessage } from '@/lib/form'
import { SCOPE_COMMUN, sousCategoriesNiveau2 } from '@/lib/scope'
import { ScopeSelect } from '@/components/common/scope-select'
import { segOfUnique } from '@/lib/slug'
import * as perm from '@/lib/permissions'
import {
  useTabAddAction,
  useTabHeader,
  type TabHeader,
} from '@/components/common/tab-actions'
import type { PageHeaderCrumb } from '@/components/common/page-header'
import { drillCrumbs } from '@/components/common/drill-crumbs'
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
import type { RowAction } from '@/components/common/row-actions'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { listStack } from '@/lib/responsive'

interface LockedScope {
  portee: 'entreprise' | 'site'
  siteId: string | null
}

interface Preset {
  parent_id?: string
  scope?: CategorieFormValues['scope']
  portee?: CategorieFormValues['portee']
}

interface CategoryFormState {
  open: boolean
  categorie: Categorie | null
  preset?: Preset
  lockedScope: LockedScope | null
}

// Onglet Gammes de la Bibliothèque = COMMUN uniquement : portée entreprise
// verrouillée (site_id NULL) pour toute création de catégorie/sous-catégorie.
const COMMUN_LOCK: LockedScope = { portee: 'entreprise', siteId: null }

/**
 * Panneau « Gammes » de la Bibliothèque : arborescence catégorie/sous-catégorie
 * (scope `gamme`/`mixte`) des gammes-templates COMMUNES (entreprise, `site_id`
 * NULL), en navigation par paliers (calque multi-niveaux du panneau « Modèles
 * d'équipements »). Catalogue commun pur, sans notion de site : l'édition est
 * réservée aux rôles entreprise (admin/manager), les autres rôles métier le
 * lisent et peuvent seulement « Copier vers un site » (export → gamme réelle,
 * qui vit dans la page Gammes opérationnelle). La RLS arbitre l'écriture.
 */
export function GammesBiblioPanel() {
  const { data: role } = useCurrentRole()
  // Onglet COMMUN uniquement : l'ÉDITION (catégories, sous-catégories, gammes-
  // templates, opérations, liaisons modèles) est réservée aux rôles entreprise
  // (admin/manager). Les autres rôles métier lisent le catalogue et peuvent
  // seulement « Copier vers un site » (export commun → site).
  const canEntreprise = perm.canManageAdmin(role)
  // `sites` (get_my_sites) : cibles possibles d'une copie commun → site.
  const { sites } = useSiteContext()
  const canExport = perm.canManageMetier(role) && sites.length > 0

  const gammesQuery = useQuery(gammesQueries.biblioPool())
  const categoriesQuery = useQuery(categoriesQueries.pool())
  // Mises à jour live (gammes ET catégories) entre fenêtres / comptes.
  useRealtimeRefresh('gammes', gammesQueries.all())
  useRealtimeRefresh('categories', categoriesQueries.all())
  const delGamme = useDeleteGamme()
  const copierGamme = useCopierGamme()
  // Vignettes des contenus (images de cards) : URL signées résolues en lot.
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  // Catégories de gamme COMMUNES (site_id NULL), actives, scope gamme/mixte :
  // l'onglet ne montre/édite que le périmètre entreprise.
  const gammeCats = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (c) =>
          c.site_id === null &&
          c.est_actif &&
          (c.scope === 'gamme' || c.scope === 'mixte'),
      ),
    [categoriesQuery.data],
  )
  // Gammes-templates COMMUNES uniquement : le pool `biblioPool` filtre déjà
  // `site_id IS NULL` côté serveur (les gammes de site vivent dans la page Gammes
  // opérationnelle, pas dans la Bibliothèque).
  const gammes = useMemo(() => gammesQuery.data ?? [], [gammesQuery.data])

  // NAVIGATION PAR CHEMIN via le hook partagé : la descente (catégorie →
  // sous-catégorie → gamme) vit dans le CHEMIN d'URL en NOMS slugifiés
  // (`/bibliotheque/gammes/<cat>/<sous>/<gamme>`) → bouton retour du navigateur
  // pas-à-pas + liens LISIBLES. `gammeCats` (modèle STRICT à 2 niveaux) borne le
  // chemin à la catégorie/sous-catégorie ; le segment restant est la FEUILLE (la
  // gamme), résolue plus bas (`openGamme`, avec repli au déplacement). `goToCats`
  // = navigation vers un PRÉFIXE (PUSH) ; `goToLeaf` = chemin + gamme.
  const {
    path: validPath,
    current,
    depth,
    goTo: goToCats,
    goToLeaf,
    leafSeg,
  } = useBiblioTreeDrill('gammes', gammeCats)

  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({
    open: false,
    categorie: null,
    lockedScope: null,
  })
  const [gammeForm, setGammeForm] = useState<{
    open: boolean
    gamme: GammeBiblioRow | null
  }>({ open: false, gamme: null })
  const [toDeleteGamme, setToDeleteGamme] = useState<GammeBiblioRow | null>(
    null,
  )
  const [toDeleteCategorie, setToDeleteCategorie] = useState<Categorie | null>(
    null,
  )
  // Copie « vers un site » d'un conteneur (catégorie ou sous-catégorie) avec
  // sélection fine (CopierContenuDialog → RPC copier_categorie, image comprise).
  // C'est l'UNIQUE chemin de copie d'une sous-catégorie (card depth 1 ET barre
  // d'onglet depth 2).
  const [copierContenu, setCopierContenu] = useState<Categorie | null>(null)
  // Export commun → site d'une GAMME-template (sa copie fine via RPC copier_gamme).
  // `target` survit à la fermeture (la `key` du dialog reste stable) ; il change
  // quand on ouvre une autre gamme source.
  const [exportState, setExportState] = useState<{
    open: boolean
    target: { kind: 'gamme'; gamme: GammeBiblioRow } | null
  }>({ open: false, target: null })

  // Chemin de catégories RÉEL d'une gamme, remonté depuis `categorie_id`
  // (sous-catégorie niv.2 → racine) sur la donnée FRAÎCHE. Sert à GÉNÉRER une URL
  // cohérente avec la catégorie courante de la gamme — même après un déplacement
  // realtime — et à dériver le fil d'Ariane d'une gamme ouverte (constat #1).
  const pathForGamme = useCallback(
    (g: GammeBiblioRow): Categorie[] => {
      const sousCat = gammeCats.find((c) => c.id === g.categorie_id)
      if (!sousCat) return []
      const racine =
        sousCat.parent_id !== null
          ? (gammeCats.find((c) => c.id === sousCat.parent_id) ?? null)
          : null
      return racine ? [racine, sousCat] : [sousCat]
    },
    [gammeCats],
  )

  // Gamme ouverte (vue détail), relue dans le pool FRAIS, résolue en DEUX temps :
  //  1) NOMINAL : la gamme dont `segOfUnique === leafSeg` (frères = les gammes de
  //     la sous-catégorie résolue) DANS la sous-catégorie de l'URL.
  //  2) ROBUSTESSE AU DÉPLACEMENT (realtime, ou édition de la catégorie depuis le
  //     détail) : si la gamme n'est plus dans cette sous-catégorie, on retombe sur
  //     une correspondance GLOBALE NON AMBIGUË — une seule gamme commune dont
  //     `segOfUnique(g, ses frères réels)` vaut `leafSeg`. Le fil d'Ariane
  //     (`gammePath`, dérivé de `categorie_id`) suit alors la NOUVELLE catégorie →
  //     l'URL reste cohérente SANS re-navigation. Ambiguë / introuvable → `null`
  //     (repli propre vers la vue navigation). `leafSeg` = 1er segment non consommé
  //     par le chemin de catégories (borné à 2 niveaux par le hook) = slug de gamme.
  const openGamme = useMemo(() => {
    if (leafSeg === undefined) return null
    const sousCat = validPath.length === 2 ? validPath[1] : null
    if (!sousCat) return null
    // 1) Résolution nominale dans la sous-catégorie de l'URL.
    const ici = gammes.filter((g) => g.categorie_id === sousCat.id)
    const direct = ici.find((g) => segOfUnique(g, ici) === leafSeg)
    if (direct) return direct
    // 2) Gamme déplacée : correspondance globale unique (sinon null).
    const candidats = gammes.filter(
      (g) =>
        segOfUnique(
          g,
          gammes.filter((s) => s.categorie_id === g.categorie_id),
        ) === leafSeg,
    )
    return candidats.length === 1 ? (candidats[0] ?? null) : null
  }, [leafSeg, validPath, gammes])

  // ANCÊTRES du fil d'Ariane d'une gamme OUVERTE, dérivés de sa catégorie RÉELLE
  // (`categorie_id`) et non des slugs bruts (constat #1) : les ancêtres cliquables
  // ramènent vers la VRAIE sous-catégorie de la gamme, et l'URL reste cohérente
  // même après un déplacement realtime.
  const gammePath = useMemo<Categorie[]>(
    () => (openGamme !== null ? pathForGamme(openGamme) : []),
    [openGamme, pathForGamme],
  )

  // Ouvre une gamme (PUSH) : chemin dérivé de sa catégorie RÉELLE + slug du nom
  // désambiguïsé sur ses frères (les gammes de sa sous-catégorie), via `goToLeaf`.
  const goToGamme = useCallback(
    (g: GammeBiblioRow, opts?: { replace?: boolean }) => {
      const siblings = gammes.filter((x) => x.categorie_id === g.categorie_id)
      goToLeaf(pathForGamme(g), segOfUnique(g, siblings), {
        replace: opts?.replace,
      })
    },
    [goToLeaf, gammes, pathForGamme],
  )

  // Re-synchronise l'URL si la GAMME OUVERTE est renommée/déplacée (« Modifier »
  // depuis la barre d'onglet, ou réception realtime) : son slug change → l'URL ne
  // la résout plus → on réécrit son chemin frais (REPLACE) sans fermer le détail ;
  // supprimée → repli propre vers la navigation.
  useLeafResync({
    leafSeg,
    openItem: openGamme,
    items: gammes,
    goToItem: goToGamme,
  })

  // Sous-catégories du palier courant : racines (niv.1) à la racine, sinon les
  // enfants directs (niv.2). Au niveau 2 (sous-catégorie ouverte) : aucun
  // sous-niveau (profondeur max atteinte).
  const childCategories = useMemo(() => {
    if (depth >= 2) return []
    const list =
      current === null
        ? gammeCats.filter((c) => c.parent_id === null)
        : gammeCats.filter((c) => c.parent_id === current.id)
    return [...list].sort(
      (a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom),
    )
  }, [gammeCats, current, depth])

  // Gammes-templates rangées dans la sous-catégorie courante : visibles
  // UNIQUEMENT au niveau 2 (une gamme pointe toujours une sous-catégorie niv.2).
  const gammesInCurrent = useMemo(
    () =>
      depth === 2 && current !== null
        ? gammes.filter((g) => g.categorie_id === current.id)
        : [],
    [gammes, current, depth],
  )

  // --- Cibles d'ajout (commun uniquement, réservé aux rôles entreprise) ---
  // Création possible dans la catégorie courante (sous-catégorie au niveau 1,
  // gamme au niveau 2) : tout est commun, seul l'admin/manager édite.
  const canAddInside = current !== null && canEntreprise

  // --- Export commun → site ---
  // Bouton « Copier vers un site » : ouvre une vraie gamme de site (la RPC reste
  // l'arbitre réel des droits sur le site cible).
  function openExportGamme(gamme: GammeBiblioRow) {
    setExportState({ open: true, target: { kind: 'gamme', gamme } })
  }

  async function handleExportConfirm(
    siteCible: string,
  ): Promise<ExportOutcome> {
    const target = exportState.target
    if (!target) return { ton: 'echec', message: 'Rien à copier.' }
    // Nom du site cible (pour indiquer OÙ retrouver la copie). Le site est choisi
    // dans `sites`, donc résolu ; repli défensif sur « le site » sinon.
    const nomSite = sites.find((s) => s.id === siteCible)?.nom
    const surSite = nomSite ? `le site « ${nomSite} »` : 'le site'
    await copierGamme.mutateAsync({
      sourceGammeId: target.gamme.id,
      siteCible,
    })
    return {
      ton: 'succes',
      message: `« ${target.gamme.nom} » copiée sur ${surSite}. Retrouve la gamme dans la page Plan de maintenance du site.`,
    }
  }

  // Props du dialog d'export dérivées de la source courante. La `key` ne change
  // pas à la fermeture (target conservé) → l'animation de sortie est préservée ;
  // elle change quand on ouvre une AUTRE source → état (site choisi) réinitialisé.
  const exportTarget = exportState.target
  const exportKey =
    exportTarget === null
      ? 'export-none'
      : `export-gamme-${exportTarget.gamme.id}`
  const exportTitre = 'Copier la gamme vers un site'
  const exportResume: ReactNode =
    exportTarget !== null ? (
      <>
        La gamme <strong>« {exportTarget.gamme.nom} »</strong> et ses opérations
        seront copiées sur le site choisi.
      </>
    ) : null
  const exportDialog = canExport ? (
    <ExporterVersSiteDialog
      key={exportKey}
      open={exportState.open}
      onOpenChange={(open) => setExportState((s) => ({ ...s, open }))}
      titre={exportTitre}
      resume={exportResume}
      onConfirm={handleExportConfirm}
    />
  ) : null

  const handleAddRootCategory = useCallback(() => {
    setCategoryForm({
      open: true,
      categorie: null,
      preset: { scope: 'gamme' },
      lockedScope: COMMUN_LOCK,
    })
  }, [])

  const handleAddSubCategory = useCallback(() => {
    if (current === null) return
    setCategoryForm({
      open: true,
      categorie: null,
      preset: { scope: 'gamme', parent_id: current.id },
      lockedScope: COMMUN_LOCK,
    })
  }, [current])

  const handleAddGamme = useCallback(() => {
    setGammeForm({ open: true, gamme: null })
  }, [])

  // Actions de la barre d'onglet pour la VUE DÉTAIL d'une gamme. `openGamme` est
  // DÉJÀ issu de `gammes.find(...)` au rendu courant (donnée FRAÎCHE) : pas de
  // re-find redondant, on l'utilise directement.
  const handleEditOpenGamme = useCallback(() => {
    if (openGamme === null) return
    setGammeForm({ open: true, gamme: openGamme })
  }, [openGamme])

  const openExportOpenGamme = useCallback(() => {
    if (openGamme === null) return
    setExportState({ open: true, target: { kind: 'gamme', gamme: openGamme } })
  }, [openGamme])

  // BARRE D'ONGLET = unique point d'entrée des actions, dépendant de la vue
  // courante (« boutons toujours au même endroit ») :
  //   • détail d'une gamme  → extra « Copier vers un site » + « Modifier la
  //     gamme » (aucune création : le + est masqué) ;
  //   • racine (depth 0)    → + « Nouvelle catégorie » ;
  //   • catégorie (depth 1) → + « Nouvelle sous-catégorie » ;
  //   • sous-cat. (depth 2) → + « Nouvelle gamme », et extra « Copier vers un
  //     site » s'il y a au moins une gamme.
  // La création n'est proposée qu'aux rôles entreprise ; l'export selon
  // `canExport`. action / label / extra sont MÉMOÏSÉS (un seul useMemo) pour ne
  // pas se ré-enregistrer en boucle dans la barre d'onglet.
  const tabAddConfig = useMemo<{
    action: (() => void) | null
    label: string
    extra?: ReactNode
  }>(() => {
    if (openGamme !== null) {
      const extra =
        canExport || canEntreprise ? (
          <div className="flex flex-wrap items-center gap-2">
            {canExport && (
              <TooltipIconButton
                icon={<CopyPlus />}
                label="Copier vers un site"
                variant="outline"
                onClick={openExportOpenGamme}
              />
            )}
            {canEntreprise && (
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier la gamme"
                variant="outline"
                onClick={handleEditOpenGamme}
              />
            )}
          </div>
        ) : undefined
      return { action: null, label: 'Modifier la gamme', extra }
    }
    if (depth === 0) {
      return {
        action: canEntreprise ? handleAddRootCategory : null,
        label: 'Nouvelle catégorie',
      }
    }
    if (depth === 1) {
      return {
        action: canEntreprise ? handleAddSubCategory : null,
        label: 'Nouvelle sous-catégorie',
      }
    }
    return {
      action: canEntreprise ? handleAddGamme : null,
      label: 'Nouvelle gamme',
      extra:
        canExport && gammesInCurrent.length > 0 ? (
          <TooltipIconButton
            icon={<CopyPlus />}
            label="Copier vers un site"
            variant="outline"
            // Même chemin que la card depth 1 : copie FINE de la sous-catégorie
            // courante via CopierContenuDialog → RPC copier_categorie (image
            // comprise). `current` est non nul ici (depth 2).
            onClick={() => {
              if (current !== null) setCopierContenu(current)
            }}
          />
        ) : undefined,
    }
  }, [
    openGamme,
    depth,
    canEntreprise,
    canExport,
    gammesInCurrent,
    current,
    handleAddRootCategory,
    handleAddSubCategory,
    handleAddGamme,
    handleEditOpenGamme,
    openExportOpenGamme,
  ])

  // Périmètre VERROUILLÉ « Commun » : le Plan de maintenance est commun-only, mais
  // on affiche quand même l'indicateur (non ouvrable) pour une interface homogène
  // avec les autres onglets de la Bibliothèque.
  const scopeDisplay = useMemo(
    // Plan de maintenance = commun uniquement → vrai dropdown NATIVEMENT désactivé
    // (grisé), pas un simulacre.
    () => <ScopeSelect value={SCOPE_COMMUN} disabled fluid />,
    [],
  )
  useTabAddAction(tabAddConfig.action, tabAddConfig.label, {
    // Le filtre de périmètre = `extra` (sa propre ligne pleine largeur sur mobile) ;
    // les boutons (Copier / Modifier) = `actions` (compacts, en haut à droite).
    extra: scopeDisplay,
    actions: tabAddConfig.extra,
  })

  // En-tête de descente (catégorie ou gamme ouverte) : le titre SUIT le nœud
  // courant et les ancêtres cliquables (chemin RÉEL des catégories) alimentent le
  // fil « Bibliothèque › Plan de maintenance › … » rendu par <Tabs>. Vue détail :
  // la gamme ouverte devient le segment courant (titre), sa sous-catégorie passe
  // en ancêtre. À la RACINE (depth 0) → `null` : titre de section « Bibliothèque ».
  // Mémoïsé (contrat de `useTabHeader`).
  const header = useMemo<TabHeader | null>(() => {
    if (openGamme !== null) {
      // `openGamme` est déjà la donnée FRAÎCHE (issu de `gammes.find`) : pas de
      // re-find. Ancêtres dérivés de la catégorie RÉELLE de la gamme (`gammePath`),
      // pas du chemin brut de l'URL (constat #1).
      const breadcrumb: PageHeaderCrumb[] = drillCrumbs(gammePath, goToCats)
      return {
        title: openGamme.nom,
        breadcrumb,
        description: openGamme.description?.trim()
          ? openGamme.description.trim()
          : undefined,
      }
    }
    if (depth === 0) {
      return null
    }
    const breadcrumb: PageHeaderCrumb[] = drillCrumbs(
      validPath.slice(0, -1),
      goToCats,
    )
    return {
      title: current?.nom ?? 'Plan de maintenance',
      breadcrumb,
      description: current?.description?.trim()
        ? current.description.trim()
        : undefined,
    }
  }, [openGamme, validPath, gammePath, current, depth, goToCats])

  useTabHeader(header)

  function handleEditCategory(categorie: Categorie) {
    setCategoryForm({
      open: true,
      categorie,
      lockedScope: null,
    })
  }

  function confirmDeleteGamme() {
    if (!toDeleteGamme) return
    delGamme.mutate(toDeleteGamme.id, {
      onSuccess: () => {
        toast.success('Gamme-template supprimée')
        setToDeleteGamme(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }
  // Catégories sélectionnables dans le formulaire de gamme (édition) : même
  // portée que la gamme éditée, pour rester cohérent avec la RLS.
  const editGammeCategories = useMemo(() => {
    const g = gammeForm.gamme
    if (!g) return []
    // Sous-catégories de niveau 2 COMMUNES (parent = racine commune). `gammeCats`
    // est déjà restreinte au commun, au scope gamme/mixte et aux catégories
    // actives ; le helper n'arbitre plus que le niveau 2 (périmètre commun, `null`).
    const valides = sousCategoriesNiveau2(gammeCats, null).map(
      ({ sous }) => sous,
    )
    // Repli : `gammes.categorie_id` est NOT NULL, donc une gamme pointe toujours
    // une sous-catégorie. Si celle-ci est masquée (inactive) et donc absente des
    // candidates, on la réinjecte pour que le select affiche la valeur réelle.
    if (!valides.some((c) => c.id === g.categorie_id)) {
      const assigned = (categoriesQuery.data ?? []).find(
        (c) => c.id === g.categorie_id,
      )
      if (assigned) return [...valides, assigned]
    }
    return valides
  }, [gammeForm.gamme, gammeCats, categoriesQuery.data])

  // Catégories proposées comme PARENT à l'édition d'une catégorie : RACINES
  // (`parent_id` nul) COMMUNES de scope gamme/mixte. On limite à la racine pour
  // rester sur le modèle strict à 2 niveaux — rattacher sous une sous-catégorie
  // créerait un niveau 3 que la base refuse. (Le backend reste le filet pour le
  // cas d'une racine ayant déjà des enfants.)
  const parentCandidates = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (c) =>
          c.site_id === null &&
          c.parent_id === null &&
          (c.scope === 'gamme' || c.scope === 'mixte'),
      ),
    [categoriesQuery.data],
  )

  // ----- VUE DÉTAIL : une gamme-template ouverte -----
  if (openGamme !== null) {
    // `openGamme` est déjà la donnée FRAÎCHE (issu de `gammes.find`) : pas de
    // re-find redondant, on le passe directement au détail.
    return (
      <>
        {/* « Modifier la gamme » / « Copier vers un site » vivent dans la barre
            d'onglet (cf. tabAddConfig), pour garder les boutons au même endroit. */}
        <GammeBiblioDetail gamme={openGamme} canEdit={canEntreprise} />
        {canEntreprise && (
          <GammeBiblioFormDialog
            key={`edit-${gammeForm.gamme?.id ?? 'none'}-${String(gammeForm.open)}`}
            open={gammeForm.open}
            onOpenChange={(open) => setGammeForm((f) => ({ ...f, open }))}
            gamme={gammeForm.gamme}
            categories={editGammeCategories.map((c) => ({
              id: c.id,
              nom: c.nom,
            }))}
          />
        )}
        {exportDialog}
      </>
    )
  }

  // ----- VUE NAVIGATION (racine ou dans une catégorie) -----
  // Le fil d'Ariane vit désormais dans le TITRE de la barre d'onglet
  // (cf. titleNode / useTabTitle), plus dans le contenu.
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
              canEntreprise
                ? 'Crée une première catégorie avec le bouton + en haut à droite.'
                : 'Aucune catégorie pour le moment.'
            }
          />
        }
      >
        {() => {
          // La requête des gammes (biblioPool) alimente compteurs et listes : on
          // surface son état ici, sinon une erreur du pool serait avalée et un
          // « catégorie vide » clignoterait avant l'arrivée des gammes.
          if (gammesQuery.isPending) return <ListRowSkeletons count={4} />
          if (gammesQuery.isError) {
            return <ErrorState onRetry={() => void gammesQuery.refetch()} />
          }
          const nothing =
            childCategories.length === 0 && gammesInCurrent.length === 0
          if (nothing) {
            return (
              <EmptyState
                icon={depth === 2 ? Wrench : FolderTree}
                title={
                  current === null
                    ? 'Aucune catégorie ici'
                    : depth === 1
                      ? 'Catégorie vide'
                      : 'Sous-catégorie vide'
                }
                description={
                  current === null
                    ? 'Aucune catégorie commune pour le moment.'
                    : depth === 1
                      ? canAddInside
                        ? 'Ajoute une sous-catégorie.'
                        : 'Aucune sous-catégorie pour le moment.'
                      : canAddInside
                        ? 'Ajoute une gamme-template.'
                        : 'Aucune gamme-template pour le moment.'
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
                    if (canExport)
                      rowActions.push({
                        label: 'Copier vers un site',
                        icon: CopyPlus,
                        onSelect: () => setCopierContenu(cat),
                      })
                    if (canEntreprise) {
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
                    const menuActions = rowActions.length
                      ? rowActions
                      : undefined
                    // Descendre d'un palier (PUSH) : on ajoute la catégorie au
                    // chemin courant → `cat` à la racine, `sous` au niveau 1.
                    const onClick = () => goToCats([...validPath, cat])
                    // Racine (depth 0) = catégories, niveau 1 = sous-catégories :
                    // composants dédiés. Tout est commun ici → pas de badge de
                    // périmètre.
                    return depth === 0 ? (
                      <CategorieCard
                        key={cat.id}
                        categorie={cat}
                        urlOf={urlOf}
                        refreshMiniatures={refreshMiniatures}
                        onClick={onClick}
                        menuActions={menuActions}
                      />
                    ) : (
                      <SousCategorieCard
                        key={cat.id}
                        sousCategorie={cat}
                        urlOf={urlOf}
                        refreshMiniatures={refreshMiniatures}
                        onClick={onClick}
                        menuActions={menuActions}
                      />
                    )
                  })}
                </div>
              )}

              {current !== null && gammesInCurrent.length > 0 && (
                <div className={listStack}>
                  {gammesInCurrent.map((g) => {
                    const rowActions: RowAction[] = []
                    if (canExport)
                      rowActions.push({
                        label: 'Copier vers un site',
                        icon: CopyPlus,
                        onSelect: () => openExportGamme(g),
                      })
                    if (canEntreprise) {
                      rowActions.push({
                        label: 'Modifier',
                        icon: Pencil,
                        onSelect: () => setGammeForm({ open: true, gamme: g }),
                      })
                      rowActions.push({
                        label: 'Supprimer',
                        icon: Trash2,
                        destructive: true,
                        onSelect: () => setToDeleteGamme(g),
                      })
                    }
                    return (
                      <GammeCard
                        key={g.id}
                        gamme={g}
                        urlOf={urlOf}
                        refreshMiniatures={refreshMiniatures}
                        // Ouvrir une gamme (PUSH) : chemin dérivé de sa catégorie
                        // RÉELLE (cohérent même après un déplacement realtime).
                        onClick={() => goToGamme(g)}
                        menuActions={rowActions.length ? rowActions : undefined}
                        // Template commun : pas de prestataire (renseigné après
                        // copie sur un site) → on masque la méta prestataire.
                        showPrestataire={false}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        }}
      </QueryState>

      {/* Création / édition de catégorie commune (scope gamme). */}
      {canEntreprise && (
        <CategoryFormDialog
          key={
            // `open` dans la key : le dialog est monté en permanence et son état
            // initial (scope, portée…) est calculé une seule fois au montage. Sans
            // ce discriminant, ouvrir le « + » ne recrée pas le composant → il
            // garderait le scope par défaut (`equipement`) au lieu du preset
            // (`gamme`). Le remontage à chaque ouverture force `initialValues` à
            // relire le preset/lockedScope courant.
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
          canEntreprise
          siteId={null}
          siteName={null}
          lockedScope={
            categoryForm.categorie ? undefined : categoryForm.lockedScope
          }
          minimal
          // Onglet Gammes : une catégorie est toujours `scope = 'gamme'` et
          // commune (site_id null). Type et Portée n'ont donc aucun sens ici, ni
          // en création ni en édition → masqués (valeurs d'origine préservées).
          hideScope
          hidePortee
          // Formulaire épuré (création comme édition) : pas de texte d'aide.
          hideDescription
        />
      )}

      {/* Création / édition d'une gamme-template commune dans la sous-catégorie
          courante (niveau 2 : une gamme pointe toujours une sous-catégorie). */}
      {canEntreprise && depth === 2 && current !== null && (
        <GammeBiblioFormDialog
          key={`gamme-${gammeForm.gamme?.id ?? `new-${current.id}`}-${String(gammeForm.open)}`}
          open={gammeForm.open}
          onOpenChange={(open) => setGammeForm((f) => ({ ...f, open }))}
          gamme={gammeForm.gamme}
          categories={editGammeCategories.map((c) => ({
            id: c.id,
            nom: c.nom,
          }))}
          lockedCategorieId={gammeForm.gamme ? undefined : current.id}
        />
      )}

      <ConfirmDeleteDialog
        open={toDeleteGamme !== null}
        onOpenChange={(open) => {
          if (!open) setToDeleteGamme(null)
        }}
        entityLabel={
          toDeleteGamme
            ? `la gamme-template « ${toDeleteGamme.nom} »`
            : 'la gamme-template'
        }
        warning="Ses opérations seront également supprimées définitivement."
        loading={delGamme.isPending}
        onConfirm={confirmDeleteGamme}
      />

      <ConfirmDeleteCategorieDialog
        categorie={toDeleteCategorie}
        onClose={() => setToDeleteCategorie(null)}
        enfants={{
          sousCategories: gammeCats.some(
            (c) => c.parent_id === toDeleteCategorie?.id,
          ),
          contenus: gammes.some(
            (g) => g.categorie_id === toDeleteCategorie?.id,
          ),
          labelContenu: 'gammes',
        }}
      />

      {exportDialog}
      {copierContenu !== null && (
        <CopierContenuDialog
          key={copierContenu.id}
          open
          onOpenChange={(o) => {
            if (!o) setCopierContenu(null)
          }}
          source={copierContenu}
          sousCats={gammeCats.filter((c) => c.parent_id === copierContenu.id)}
          gammes={gammes}
          sites={sites}
        />
      )}
    </div>
  )
}

// ----- Détail d'une gamme-template : opérations spécifiques -----

function GammeBiblioDetail({
  gamme,
  canEdit,
}: {
  gamme: GammeBiblioRow
  /**
   * Édition réservée aux rôles entreprise (admin/manager) : pilote l'affichage
   * des actions. « Modifier la gamme » / « Copier vers un site » vivent dans la
   * barre d'onglet (cf. GammesBiblioPanel) ; « Ajouter une opération » vit dans
   * l'en-tête de la section Opérations (calque exact de la section Modèles liés).
   */
  canEdit: boolean
}) {
  // Vignette de la gamme (image de sa card d'en-tête) : URL signées en lot.
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  // Opérations en TEMPS RÉEL (comme les liaisons modèles via gamme_modeles) :
  // abonnement porté ICI par l'hôte (la brique GammeOperationsSection ne s'abonne
  // pas elle-même — le calque gamme de SITE, lui, ne s'y abonne pas). Si
  // `operations` n'est pas dans la publication realtime Supabase, l'abonnement
  // reste inerte — aucune erreur (cf. `useRealtimeRefresh`).
  useRealtimeRefresh('operations', gammesQueries.all())

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Card de la gamme (image + nom + description) en tête, à la place de
          l'ancien bandeau type/périodicité/description. Statique (pas de drill :
          la gamme est déjà ouverte) ; ses actions vivent dans la barre d'onglet. */}
      <div className="shrink-0">
        <ListRow
          media={
            <MiniatureThumb
              url={urlOf(gamme.miniature_id)}
              fallback={<Wrench className="size-10" />}
              alt=""
              onError={refreshMiniatures}
              className="size-full rounded-none"
            />
          }
          title={gamme.nom}
          subtitle={
            gamme.description?.trim() ? gamme.description.trim() : undefined
          }
        />
      </div>

      {/* DEUX sections sœurs. Sur grand écran (`lg`+), chacune occupe 50% de la
          hauteur restante (grid-rows-2) avec son PROPRE scroll interne. Sous `lg`
          (tablette/mobile), on EMPILE en flux naturel et c'est la PAGE qui défile
          (un seul scroll) au lieu de deux mini-scrollers imbriqués de ~150px. */}
      <div className="flex flex-col gap-6 lg:grid lg:min-h-0 lg:flex-1 lg:grid-rows-2 lg:gap-4">
        <GammeOperationsSection
          gammeId={gamme.id}
          canEdit={canEdit}
          variant="panel"
        />

        <div className="lg:min-h-0 lg:overflow-y-auto">
          <GammeModelesSection
            gammeId={gamme.id}
            gammeSiteId={gamme.site_id}
            canEdit={canEdit}
          />
        </div>
      </div>
    </div>
  )
}
