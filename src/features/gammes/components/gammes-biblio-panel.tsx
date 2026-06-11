import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  Folder,
  FolderTree,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { gammesQueries, type GammeBiblioRow } from '../queries'
import {
  useCopierGamme,
  useDeleteGamme,
  useDeleteOperation,
} from '../mutations'
import { GammeBiblioFormDialog } from './gamme-biblio-form-dialog'
import { OperationFormDialog } from './operation-form-dialog'
import { GammeModelesSection } from './gamme-modeles-section'
import {
  categoriesQueries,
  type Categorie,
} from '@/features/categories/queries'
import { useDeleteCategorie } from '@/features/categories/mutations'
import { CategoryFormDialog } from '@/features/categories/components/category-form-dialog'
import type { CategorieFormValues } from '@/features/categories/schemas'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useSiteContext } from '@/lib/site-context'
import { errorMessage, exportErrorMessage } from '@/lib/form'
import { sousCategoriesNiveau2 } from '@/lib/scope'
import * as perm from '@/lib/permissions'
import { useTabAddAction, useTabTitle } from '@/components/common/tab-actions'
import {
  ExporterVersSiteDialog,
  type ExportOutcome,
} from '@/components/common/exporter-vers-site-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ListRow } from '@/components/common/list-row'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { listStack } from '@/lib/responsive'
import type { Database } from '@/lib/database.types'

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

const NATURE_LABEL: Record<GammeBiblioRow['nature'], string> = {
  controle_reglementaire: 'Réglementaire',
  maintenance_preventive: 'Maintenance',
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
  const delCategorie = useDeleteCategorie()
  const copierGamme = useCopierGamme()

  // Pile de navigation (catégorie → sous-catégorie). Vide = racine.
  const [path, setPath] = useState<Categorie[]>([])
  const [openGamme, setOpenGamme] = useState<GammeBiblioRow | null>(null)
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
  // Export commun → site : soit une gamme-template, soit une sous-catégorie
  // entière (boucle sur ses gammes communes). `target` survit à la fermeture
  // (la `key` du dialog reste stable) ; il change quand on ouvre une autre source.
  const [exportState, setExportState] = useState<{
    open: boolean
    target:
      | { kind: 'gamme'; gamme: GammeBiblioRow }
      | { kind: 'sousCategorie'; categorie: Categorie }
      | null
  }>({ open: false, target: null })

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
  // Gammes-templates COMMUNES uniquement (les gammes de site vivent dans la page
  // Gammes opérationnelle, pas dans la Bibliothèque).
  const gammes = useMemo(
    () => (gammesQuery.data ?? []).filter((g) => g.site_id === null),
    [gammesQuery.data],
  )

  // Chemin RESYNCHRONISÉ sur la donnée fraîche : on ne garde que le préfixe dont
  // chaque catégorie existe encore (suppression / masquage realtime), en
  // remplaçant chaque entrée par son objet à jour (nom, etc.). Si le dernier
  // élément du chemin disparaît, le chemin se tronque tout seul jusqu'au dernier
  // ancêtre présent — sans fantôme ni instantané périmé. La navigation s'appuie
  // sur ce chemin validé, jamais sur la pile brute (qui peut traîner un fantôme).
  const validPath = useMemo(() => {
    const result: Categorie[] = []
    for (const c of path) {
      const fresh = gammeCats.find((gc) => gc.id === c.id)
      if (!fresh) break
      result.push(fresh)
    }
    return result
  }, [path, gammeCats])
  const current: Categorie | null = validPath.at(-1) ?? null
  // Profondeur de navigation, BORNÉE à 2 niveaux (modèle strict
  // Catégorie niv.1 → Sous-catégorie niv.2 → Gammes) :
  //   0 = racine (catégories niv.1) · 1 = dans une catégorie (sous-catégories
  //   niv.2) · 2 = dans une sous-catégorie (gammes-templates).
  const depth = validPath.length

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
    if (target.kind === 'gamme') {
      await copierGamme.mutateAsync({
        sourceGammeId: target.gamme.id,
        siteCible,
      })
      return {
        ton: 'succes',
        message: `« ${target.gamme.nom} » copiée sur ${surSite}. Retrouve la gamme dans la page Gammes du site.`,
      }
    }
    // Sous-catégorie commune : boucle front sur SES gammes communes, dérivées du
    // cache FRAIS (`gammes`) au moment du confirm — jamais d'instantané périmé.
    // `Promise.allSettled` : un échec sur une gamme n'annule pas les autres.
    const aCopier = gammes.filter(
      (g) => g.categorie_id === target.categorie.id && g.site_id === null,
    )
    if (aCopier.length === 0) {
      return {
        ton: 'echec',
        message: 'Aucune gamme commune à copier dans cette sous-catégorie.',
      }
    }
    const results = await Promise.allSettled(
      aCopier.map((g) =>
        copierGamme.mutateAsync({ sourceGammeId: g.id, siteCible }),
      ),
    )
    const total = results.length
    const reussis = results.filter((r) => r.status === 'fulfilled').length
    const s = total > 1 ? 's' : ''
    if (reussis === total) {
      return {
        ton: 'succes',
        message: `${String(total)} gamme${s} copiée${s} sur ${surSite}. ${
          total > 1 ? 'Retrouve les gammes' : 'Retrouve la gamme'
        } dans la page Gammes du site.`,
      }
    }
    // Bilan partiel/total : on remonte un message représentatif (1er échec),
    // traduit comme partout (RLS 42501 → message clair, pas le brut de la RPC).
    const erreurs = results.flatMap((r) =>
      r.status === 'rejected' ? [exportErrorMessage(r.reason)] : [],
    )
    const [premiereErreur] = erreurs
    const detail = premiereErreur ? ` (${premiereErreur})` : ''
    if (reussis === 0) {
      return { ton: 'echec', message: `Aucune gamme copiée${detail}.` }
    }
    // Partiel : le dialog reste OUVERT. On AVERTIT que relancer recopiera TOUTE
    // la sous-catégorie (RPC non idempotente) → doublons sur les déjà réussies.
    return {
      ton: 'partiel',
      message: `${String(reussis)}/${String(total)} gammes copiées sur ${surSite} ; ${String(
        total - reussis,
      )} en échec${detail}. Attention : relancer recopiera TOUTE la sous-catégorie (doublons des copies déjà réussies).`,
    }
  }

  // Props du dialog d'export dérivées de la source courante. La `key` ne change
  // pas à la fermeture (target conservé) → l'animation de sortie est préservée ;
  // elle change quand on ouvre une AUTRE source → état (site choisi) réinitialisé.
  const exportTarget = exportState.target
  const exportKey =
    exportTarget === null
      ? 'export-none'
      : exportTarget.kind === 'gamme'
        ? `export-gamme-${exportTarget.gamme.id}`
        : `export-souscat-${exportTarget.categorie.id}`
  const exportTitre =
    exportTarget?.kind === 'sousCategorie'
      ? 'Copier la sous-catégorie vers un site'
      : 'Copier la gamme vers un site'
  let exportResume: ReactNode = null
  if (exportTarget?.kind === 'gamme') {
    exportResume = (
      <>
        La gamme <strong>« {exportTarget.gamme.nom} »</strong> et ses opérations
        seront copiées sur le site choisi.
      </>
    )
  } else if (exportTarget?.kind === 'sousCategorie') {
    const nb = gammes.filter(
      (g) => g.categorie_id === exportTarget.categorie.id && g.site_id === null,
    ).length
    exportResume = (
      <>
        Les <strong>{nb}</strong> gamme{nb > 1 ? 's' : ''} commune
        {nb > 1 ? 's' : ''} de <strong>« {exportTarget.categorie.nom} »</strong>{' '}
        seront copiées sur le site choisi.
      </>
    )
  }
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

  // Actions de la barre d'onglet pour la VUE DÉTAIL d'une gamme : on relit la
  // version FRAÎCHE du cache (nom/champs à jour) avant d'éditer ou d'exporter.
  const handleEditOpenGamme = useCallback(() => {
    if (openGamme === null) return
    const fresh = gammes.find((g) => g.id === openGamme.id) ?? openGamme
    setGammeForm({ open: true, gamme: fresh })
  }, [openGamme, gammes])

  const openExportOpenGamme = useCallback(() => {
    if (openGamme === null) return
    const fresh = gammes.find((g) => g.id === openGamme.id) ?? openGamme
    setExportState({ open: true, target: { kind: 'gamme', gamme: fresh } })
  }, [openGamme, gammes])

  const openExportSousCategorieCurrent = useCallback(() => {
    if (current === null) return
    setExportState({
      open: true,
      target: { kind: 'sousCategorie', categorie: current },
    })
  }, [current])

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
              <Button variant="outline" size="sm" onClick={openExportOpenGamme}>
                <CopyPlus /> Copier vers un site
              </Button>
            )}
            {canEntreprise && (
              <Button variant="outline" size="sm" onClick={handleEditOpenGamme}>
                <Pencil /> Modifier la gamme
              </Button>
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
          <Button
            variant="outline"
            size="sm"
            onClick={openExportSousCategorieCurrent}
          >
            <CopyPlus /> Copier vers un site
          </Button>
        ) : undefined,
    }
  }, [
    openGamme,
    depth,
    canEntreprise,
    canExport,
    gammesInCurrent,
    handleAddRootCategory,
    handleAddSubCategory,
    handleAddGamme,
    handleEditOpenGamme,
    openExportOpenGamme,
    openExportSousCategorieCurrent,
  ])

  useTabAddAction(tabAddConfig.action, tabAddConfig.label, {
    extra: tabAddConfig.extra,
  })

  // FIL D'ARIANE = TITRE de la barre d'onglet (remplace le « Bibliothèque » par
  // défaut). Le segment courant fait office de grand titre ; les ancêtres
  // (cliquables, atténués) le précèdent, avec un bouton Retour dès qu'on a
  // quitté la racine. Vue détail : la gamme ouverte devient le titre, sa sous-
  // catégorie passe en ancêtre. Mémoïsé (contrat de `useTabTitle`).
  const titleNode = useMemo<ReactNode>(() => {
    if (openGamme !== null) {
      const fresh = gammes.find((g) => g.id === openGamme.id) ?? openGamme
      const ancestors: BreadcrumbAncestor[] = [
        {
          key: 'racine',
          label: 'Catégories',
          onClick: () => {
            setOpenGamme(null)
            setPath([])
          },
        },
        ...validPath.map((c, i) => ({
          key: c.id,
          label: c.nom,
          onClick: () => {
            setOpenGamme(null)
            setPath(validPath.slice(0, i + 1))
          },
        })),
      ]
      return (
        <TitleBreadcrumb
          ancestors={ancestors}
          current={fresh.nom}
          onBack={() => setOpenGamme(null)}
        />
      )
    }
    if (depth === 0) {
      return <TitleBreadcrumb ancestors={[]} current="Catégories" onBack={null} />
    }
    const ancestors: BreadcrumbAncestor[] = [
      { key: 'racine', label: 'Catégories', onClick: () => setPath([]) },
      ...validPath.slice(0, -1).map((c, i) => ({
        key: c.id,
        label: c.nom,
        onClick: () => setPath(validPath.slice(0, i + 1)),
      })),
    ]
    return (
      <TitleBreadcrumb
        ancestors={ancestors}
        current={current?.nom ?? 'Catégories'}
        onBack={() => setPath(validPath.slice(0, -1))}
      />
    )
  }, [openGamme, gammes, validPath, current, depth])

  useTabTitle(titleNode)

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
    const fresh = gammes.find((g) => g.id === openGamme.id) ?? openGamme
    return (
      <>
        {/* « Modifier la gamme » / « Copier vers un site » vivent dans la barre
            d'onglet (cf. tabAddConfig), pour garder les boutons au même endroit. */}
        <GammeBiblioDetail gamme={fresh} canEdit={canEntreprise} />
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
        pending={<CardSkeletons count={4} />}
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
          if (gammesQuery.isPending) return <CardSkeletons count={4} />
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
                  {childCategories.map((cat) => (
                    <ListRow
                      key={cat.id}
                      icon={<Folder className="size-5" />}
                      title={cat.nom}
                      onClick={() => setPath([...validPath, cat])}
                      actions={
                        canEntreprise ? (
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

              {current !== null && gammesInCurrent.length > 0 && (
                <div className={listStack}>
                  {gammesInCurrent.map((g) => (
                    <ListRow
                      key={g.id}
                      icon={<Wrench className="size-5" />}
                      title={g.nom}
                      badges={
                        <>
                          <Badge
                            variant={
                              g.nature === 'controle_reglementaire'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {NATURE_LABEL[g.nature]}
                          </Badge>
                          <Badge variant="outline">
                            {g.periodicites.libelle}
                          </Badge>
                        </>
                      }
                      onClick={() => setOpenGamme(g)}
                      actions={
                        canExport || canEntreprise ? (
                          <>
                            {canExport && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Copier vers un site"
                                onClick={() => openExportGamme(g)}
                              >
                                <CopyPlus />
                              </Button>
                            )}
                            {canEntreprise && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Modifier la gamme"
                                  onClick={() =>
                                    setGammeForm({ open: true, gamme: g })
                                  }
                                >
                                  <Pencil />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Supprimer la gamme"
                                  onClick={() => setToDeleteGamme(g)}
                                >
                                  <Trash2 />
                                </Button>
                              </>
                            )}
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

      <ConfirmDialog
        open={toDeleteGamme !== null}
        onOpenChange={(open) => {
          if (!open) setToDeleteGamme(null)
        }}
        title="Supprimer la gamme-template ?"
        description={
          toDeleteGamme
            ? `« ${toDeleteGamme.nom} » sera placée dans la corbeille (récupérable 90 jours).`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={delGamme.isPending}
        onConfirm={confirmDeleteGamme}
      />

      <ConfirmDialog
        open={toDeleteCategorie !== null}
        onOpenChange={(open) => {
          if (!open) setToDeleteCategorie(null)
        }}
        title="Supprimer la catégorie ?"
        description={
          toDeleteCategorie
            ? `« ${toDeleteCategorie.nom} » sera placée dans la corbeille (récupérable 90 jours).`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={delCategorie.isPending}
        onConfirm={confirmDeleteCategorie}
      />

      {exportDialog}
    </div>
  )
}

// ----- Fil d'Ariane rendu comme TITRE de la barre d'onglet -----

interface BreadcrumbAncestor {
  /** Clé React stable (id de catégorie, ou « racine »). */
  key: string
  label: string
  onClick: () => void
}

/**
 * Titre « fil d'Ariane » de la barre d'onglet : le segment COURANT fait office
 * de grand titre (`text-2xl`), précédé de ses ancêtres cliquables (petits,
 * atténués, séparés par des chevrons) et, hors racine, d'un bouton Retour.
 * Tout tronque (`min-w-0` / `truncate`) pour ne jamais déborder sur mobile.
 * Générique : réutilisable par tout onglet via `useTabTitle`.
 */
function TitleBreadcrumb({
  ancestors,
  current,
  onBack,
}: {
  ancestors: BreadcrumbAncestor[]
  current: string
  onBack: (() => void) | null
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      {onBack !== null && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Retour"
          className="shrink-0"
        >
          <ChevronLeft />
        </Button>
      )}
      {ancestors.length > 0 && (
        <nav
          aria-label="Fil d'Ariane"
          className="text-muted-foreground flex min-w-0 items-center gap-1 text-sm"
        >
          {ancestors.map((a) => (
            <span key={a.key} className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={a.onClick}
                className="hover:text-foreground truncate"
              >
                {a.label}
              </button>
              <ChevronRight className="size-4 shrink-0" />
            </span>
          ))}
        </nav>
      )}
      <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
        {current}
      </h1>
    </div>
  )
}

// ----- Détail d'une gamme-template : opérations spécifiques -----

type OperationRow = Database['public']['Tables']['operations']['Row'] & {
  types_operations: {
    id: number
    libelle: string
    necessite_seuils: boolean
  } | null
  unites: { id: number; nom: string; symbole: string } | null
}

function GammeBiblioDetail({
  gamme,
  canEdit,
}: {
  gamme: GammeBiblioRow
  /**
   * Édition réservée aux rôles entreprise (admin/manager) : pilote l'affichage
   * des actions sur les opérations. « Modifier la gamme » / « Copier vers un
   * site » vivent désormais dans la barre d'onglet (cf. GammesBiblioPanel).
   */
  canEdit: boolean
}) {
  const query = useQuery(gammesQueries.operations(gamme.id))
  const del = useDeleteOperation()
  const [opForm, setOpForm] = useState<{
    open: boolean
    op: OperationRow | null
  }>({ open: false, op: null })
  const [toDelete, setToDelete] = useState<OperationRow | null>(null)

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Opération supprimée')
        setToDelete(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  const newButton = canEdit ? (
    <Button size="sm" onClick={() => setOpForm({ open: true, op: null })}>
      <Plus /> Ajouter une opération
    </Button>
  ) : undefined

  return (
    <div className="flex flex-col gap-4">
      {/* Le nom de la gamme et le bouton « Retour » vivent dans le titre de la
          barre d'onglet (cf. titleNode). Ici, seuls les badges contextuels. */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={
            gamme.nature === 'controle_reglementaire' ? 'default' : 'secondary'
          }
        >
          {NATURE_LABEL[gamme.nature]}
        </Badge>
        {gamme.periodicites && (
          <Badge variant="outline">{gamme.periodicites.libelle}</Badge>
        )}
      </div>

      {gamme.description && (
        <p className="text-muted-foreground text-sm">{gamme.description}</p>
      )}

      {newButton && <div className="flex justify-end">{newButton}</div>}

      <QueryState
        query={query}
        pending={<Skeleton className="h-40" />}
        empty={
          <EmptyState
            icon={ListChecks}
            title="Aucune opération"
            description={
              canEdit
                ? 'Ajoute les opérations qui composent cette gamme-template.'
                : 'Cette gamme-template ne contient pas d’opération.'
            }
            action={newButton}
          />
        }
      >
        {(operations) => (
          <ul className="flex flex-col gap-2">
            {operations.map((op) => (
              <li
                key={op.id}
                className="bg-card flex items-start justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs tabular-nums">
                      #{op.ordre}
                    </span>
                    <span className="truncate font-medium">{op.nom}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline">
                      {op.types_operations.libelle}
                    </Badge>
                    {(op.seuil_minimum !== null ||
                      op.seuil_maximum !== null) && (
                      <span className="text-muted-foreground">
                        {formatSeuils(op)}
                      </span>
                    )}
                  </div>
                  {op.description && (
                    <p className="text-muted-foreground text-sm">
                      {op.description}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setOpForm({ open: true, op })}
                      aria-label="Modifier l’opération"
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setToDelete(op)}
                      aria-label="Supprimer l’opération"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      <div className="border-t pt-4">
        <GammeModelesSection
          gammeId={gamme.id}
          gammeSiteId={gamme.site_id}
          canEdit={canEdit}
        />
      </div>

      {canEdit && (
        <OperationFormDialog
          key={opForm.op?.id ?? 'new'}
          open={opForm.open}
          onOpenChange={(open) => setOpForm((f) => ({ ...f, open }))}
          gammeId={gamme.id}
          operation={opForm.op}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer l’opération ?"
        description={
          toDelete
            ? `« ${toDelete.nom} » sera définitivement retirée.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function formatSeuils(op: OperationRow): string {
  const sym = op.unites?.symbole ?? ''
  const min = op.seuil_minimum
  const max = op.seuil_maximum
  if (min !== null && max !== null)
    return `${String(min)} – ${String(max)} ${sym}`.trim()
  if (min !== null) return `≥ ${String(min)} ${sym}`.trim()
  if (max !== null) return `≤ ${String(max)} ${sym}`.trim()
  return ''
}
