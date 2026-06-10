import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
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
import { useDeleteGamme, useDeleteOperation } from '../mutations'
import { GammeBiblioFormDialog } from './gamme-biblio-form-dialog'
import { OperationFormDialog } from './operation-form-dialog'
import { GammeModelesSection } from './gamme-modeles-section'
import { categoriesQueries, type Categorie } from '@/features/categories/queries'
import { useDeleteCategorie } from '@/features/categories/mutations'
import { CategoryFormDialog } from '@/features/categories/components/category-form-dialog'
import type { CategorieFormValues } from '@/features/categories/schemas'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useScope } from '@/hooks/use-scope'
import { useSiteContext } from '@/lib/site-context'
import { errorMessage } from '@/lib/form'
import { scopeMatches, scopeTarget, sousCategoriesNiveau2 } from '@/lib/scope'
import * as perm from '@/lib/permissions'
import { useTabAddAction } from '@/components/common/tab-actions'
import { ScopeSelect } from '@/components/common/scope-select'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cardGrid } from '@/lib/responsive'
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
  siteId: string | null
}

const NATURE_LABEL: Record<GammeBiblioRow['nature'], string> = {
  controle_reglementaire: 'Réglementaire',
  maintenance_preventive: 'Maintenance',
}

/**
 * Panneau « Gammes » de la Bibliothèque : arborescence catégorie/sous-catégorie
 * (scope `gamme`/`mixte`) des gammes-templates communes/site, en navigation par
 * paliers (calque multi-niveaux du panneau « Modèles d'équipements »). Le
 * périmètre (Tout / Commun / site) est porté par le sélecteur partagé ; la RLS
 * arbitre l'écriture.
 */
export function GammesBiblioPanel() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const canEntreprise = perm.canManageAdmin(role)
  const { scope, setScope } = useScope()
  const { activeSite } = useSiteContext()

  const gammesQuery = useQuery(gammesQueries.biblioPool())
  const categoriesQuery = useQuery(categoriesQueries.pool())
  // Mises à jour live (gammes ET catégories) entre fenêtres / comptes.
  useRealtimeRefresh('gammes', gammesQueries.all())
  useRealtimeRefresh('categories', categoriesQueries.all())
  const delGamme = useDeleteGamme()
  const delCategorie = useDeleteCategorie()

  // Pile de navigation (catégorie → sous-catégorie). Vide = racine.
  const [path, setPath] = useState<Categorie[]>([])
  const [openGamme, setOpenGamme] = useState<GammeBiblioRow | null>(null)
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({
    open: false,
    categorie: null,
    lockedScope: null,
    siteId: null,
  })
  const [gammeForm, setGammeForm] = useState<{
    open: boolean
    gamme: GammeBiblioRow | null
  }>({ open: false, gamme: null })
  const [toDeleteGamme, setToDeleteGamme] = useState<GammeBiblioRow | null>(null)
  const [toDeleteCategorie, setToDeleteCategorie] = useState<Categorie | null>(
    null,
  )

  // Catégories de gamme (actives, scope gamme/mixte).
  const gammeCats = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (c) => c.est_actif && (c.scope === 'gamme' || c.scope === 'mixte'),
      ),
    [categoriesQuery.data],
  )
  const gammes = useMemo(() => gammesQuery.data ?? [], [gammesQuery.data])

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
        ? gammeCats.filter(
            (c) => c.parent_id === null && scopeMatches(scope, c.site_id),
          )
        : gammeCats.filter((c) => c.parent_id === current.id)
    return [...list].sort(
      (a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom),
    )
  }, [gammeCats, current, scope, depth])

  // Gammes-templates rangées dans la sous-catégorie courante : visibles
  // UNIQUEMENT au niveau 2 (une gamme pointe toujours une sous-catégorie niv.2).
  const gammesInCurrent = useMemo(
    () =>
      depth === 2 && current !== null
        ? gammes.filter((g) => g.categorie_id === current.id)
        : [],
    [gammes, current, depth],
  )

  // Compteurs des cartes (sous-catégories + gammes directes).
  const childCountByCat = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of gammeCats) {
      if (c.parent_id) counts.set(c.parent_id, (counts.get(c.parent_id) ?? 0) + 1)
    }
    return counts
  }, [gammeCats])
  const gammeCountByCat = useMemo(() => {
    const counts = new Map<string, number>()
    // `gammes.categorie_id` est NOT NULL : chaque gamme compte pour sa catégorie.
    for (const g of gammes) {
      counts.set(g.categorie_id, (counts.get(g.categorie_id) ?? 0) + 1)
    }
    return counts
  }, [gammes])

  // --- Cibles d'ajout selon le périmètre ---
  const targetSiteId = scopeTarget(scope)
  const canAddRootCategory =
    canManage &&
    targetSiteId !== undefined &&
    (targetSiteId !== null || canEntreprise)

  // Inside : créer sous-catégorie/gamme hérite de la portée de la catégorie.
  const currentLockedScope: LockedScope | null =
    current === null
      ? null
      : {
          portee: current.site_id === null ? 'entreprise' : 'site',
          siteId: current.site_id,
        }
  const canAddInside =
    current !== null &&
    canManage &&
    (current.site_id !== null || canEntreprise)
  // Sous-catégorie : seulement au niveau 1 (sous une catégorie racine).
  // Nouvelle gamme : seulement au niveau 2 (dans une sous-catégorie).
  const canAddSubCategory = depth === 1 && canAddInside
  const canAddGamme = depth === 2 && canAddInside

  const scopeControl = useMemo(
    () => <ScopeSelect value={scope} onChange={setScope} />,
    [scope, setScope],
  )
  const handleAddRootCategory = useCallback(() => {
    const locked: LockedScope | null =
      targetSiteId === undefined
        ? null
        : {
            portee: targetSiteId === null ? 'entreprise' : 'site',
            siteId: targetSiteId,
          }
    setCategoryForm({
      open: true,
      categorie: null,
      preset: { scope: 'gamme' },
      lockedScope: locked,
      siteId: locked?.siteId ?? null,
    })
  }, [targetSiteId])

  // En-tête : bouton + SEULEMENT à la racine (Nouvelle catégorie + sélecteur de
  // périmètre). Dans une catégorie / un détail, la création passe par des boutons
  // en contexte.
  const atRoot = openGamme === null && current === null
  useTabAddAction(
    atRoot && canManage ? handleAddRootCategory : null,
    'Nouvelle catégorie',
    atRoot ? { disabled: !canAddRootCategory, extra: scopeControl } : undefined,
  )

  function handleAddSubCategory() {
    if (current === null) return
    setCategoryForm({
      open: true,
      categorie: null,
      preset: {
        scope: 'gamme',
        parent_id: current.id,
        portee: currentLockedScope?.portee,
      },
      lockedScope: currentLockedScope,
      siteId: current.site_id,
    })
  }
  function handleEditCategory(categorie: Categorie) {
    setCategoryForm({
      open: true,
      categorie,
      lockedScope: null,
      siteId: categorie.site_id,
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
    // Mêmes règles EXACTES que `gammesQueries.sousCategories` (helper partagé) :
    // sous-catégories de niveau 2 (parent = racine accessible) dont le périmètre
    // est commun (`site_id` NULL) OU le même site que la gamme. `gammeCats` est
    // déjà restreinte au scope gamme/mixte et aux catégories actives.
    const valides = sousCategoriesNiveau2(gammeCats, g.site_id).map(
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

  // Catégories proposées comme PARENT à l'édition d'une catégorie : restreintes
  // aux RACINES (`parent_id` nul) de scope gamme/mixte et de portée compatible
  // (commun, ou le même site que la catégorie éditée). On limite à la racine pour
  // rester sur le modèle strict à 2 niveaux — rattacher sous une sous-catégorie
  // créerait un niveau 3 que la base refuse. (Le backend reste le filet pour le
  // cas d'une racine ayant déjà des enfants.)
  const parentCandidates = useMemo(() => {
    const edited = categoryForm.categorie
    return (categoriesQuery.data ?? []).filter((c) => {
      if (c.parent_id !== null) return false
      if (c.scope !== 'gamme' && c.scope !== 'mixte') return false
      if (!edited) return true
      return c.site_id === null || c.site_id === edited.site_id
    })
  }, [categoriesQuery.data, categoryForm.categorie])

  // ----- VUE DÉTAIL : une gamme-template ouverte -----
  if (openGamme !== null) {
    const fresh = gammes.find((g) => g.id === openGamme.id) ?? openGamme
    const canEditThis = canEntreprise || fresh.site_id !== null
    return (
      <>
        <GammeBiblioDetail
          gamme={fresh}
          canManage={canManage}
          canEdit={canEditThis}
          onBack={() => setOpenGamme(null)}
          onEdit={() => setGammeForm({ open: true, gamme: fresh })}
        />
        {canManage && (
          <GammeBiblioFormDialog
            key={`edit-${gammeForm.gamme?.id ?? 'none'}`}
            open={gammeForm.open}
            onOpenChange={(open) => setGammeForm((f) => ({ ...f, open }))}
            gamme={gammeForm.gamme}
            categories={editGammeCategories.map((c) => ({
              id: c.id,
              nom: c.nom,
            }))}
            canEntreprise={canEntreprise}
            siteId={fresh.site_id}
            siteName={activeSite?.nom ?? null}
          />
        )}
      </>
    )
  }

  // ----- VUE NAVIGATION (racine ou dans une catégorie) -----
  return (
    <div className="flex flex-col gap-4">
      {current !== null && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPath(validPath.slice(0, -1))}
          >
            <ChevronLeft /> Retour
          </Button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setPath([])}
          >
            Catégories
          </button>
          {validPath.map((c, i) => (
            // `c` provient du chemin validé → nom déjà à jour (donnée fraîche).
            <span key={c.id} className="flex items-center gap-2">
              <ChevronRight className="text-muted-foreground size-4" />
              <button
                type="button"
                className={
                  i === validPath.length - 1
                    ? 'font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }
                onClick={() => setPath(validPath.slice(0, i + 1))}
              >
                {c.nom}
              </button>
            </span>
          ))}
          <Badge variant={current.site_id === null ? 'secondary' : 'outline'}>
            {current.site_id === null ? 'Commun' : 'Site'}
          </Badge>
          {canManage && (depth === 1 || depth === 2) && (
            <div className="ml-auto flex flex-wrap gap-2">
              {/* Niveau 1 : on crée des sous-catégories (pas de gamme ici). */}
              {depth === 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddSubCategory}
                  disabled={!canAddSubCategory}
                >
                  <Folder /> Sous-catégorie
                </Button>
              )}
              {/* Niveau 2 : on crée des gammes (profondeur max, pas de sous-cat.). */}
              {depth === 2 && (
                <Button
                  size="sm"
                  onClick={() => setGammeForm({ open: true, gamme: null })}
                  disabled={!canAddGamme}
                >
                  <Plus /> Nouvelle gamme
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <QueryState
        query={categoriesQuery}
        pending={<CardSkeletons count={4} />}
        empty={
          <EmptyState
            icon={FolderTree}
            title="Aucune catégorie"
            description={
              canAddRootCategory
                ? 'Crée une première catégorie avec le bouton + en haut à droite.'
                : 'Aucune catégorie accessible.'
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
                    ? 'Aucune catégorie dans ce périmètre pour le moment.'
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
                <div className={cardGrid.compact}>
                  {childCategories.map((cat) => {
                    const subs = childCountByCat.get(cat.id) ?? 0
                    const nb = gammeCountByCat.get(cat.id) ?? 0
                    const canEditCat = canEntreprise || cat.site_id !== null
                    return (
                      <Card key={cat.id} className="min-w-0">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="truncate">
                              {cat.nom}
                            </CardTitle>
                            {cat.site_id === null && (
                              <Badge variant="secondary">Commun</Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            {subs > 0 && (
                              <Badge variant="outline">
                                {subs} sous-catégorie{subs > 1 ? 's' : ''}
                              </Badge>
                            )}
                            <span>
                              {nb} gamme{nb > 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() => setPath([...validPath, cat])}
                            >
                              <ChevronRight /> Ouvrir
                            </Button>
                            {canManage && canEditCat && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditCategory(cat)}
                                >
                                  <Pencil /> Modifier
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setToDeleteCategorie(cat)}
                                >
                                  <Trash2 /> Supprimer
                                </Button>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}

              {current !== null && gammesInCurrent.length > 0 && (
                <div className={cardGrid.default}>
                  {gammesInCurrent.map((g) => {
                    const canEditThis = canEntreprise || g.site_id !== null
                    return (
                      <Card key={g.id} className="min-w-0">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="truncate">{g.nom}</CardTitle>
                            {g.site_id === null && (
                              <Badge variant="secondary">Commun</Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
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
                          </div>
                          <span className="truncate">
                            {g.prestataires.libelle}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => setOpenGamme(g)}>
                              <ChevronRight /> Détail
                            </Button>
                            {canManage && canEditThis && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setGammeForm({ open: true, gamme: g })
                                  }
                                >
                                  <Pencil /> Modifier
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setToDeleteGamme(g)}
                                >
                                  <Trash2 /> Supprimer
                                </Button>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          )
        }}
      </QueryState>

      {/* Création / édition de catégorie (scope gamme). */}
      {canManage && (
        <CategoryFormDialog
          key={
            categoryForm.categorie
              ? `cat-edit-${categoryForm.categorie.id}-${scope}`
              : `cat-new-${categoryForm.preset?.parent_id ?? 'root'}-${scope}`
          }
          open={categoryForm.open}
          onOpenChange={(open) => setCategoryForm((f) => ({ ...f, open }))}
          categorie={categoryForm.categorie}
          preset={categoryForm.preset}
          categories={parentCandidates}
          canEntreprise={canEntreprise}
          siteId={categoryForm.siteId}
          siteName={activeSite?.nom ?? null}
          lockedScope={categoryForm.categorie ? undefined : categoryForm.lockedScope}
          minimal
        />
      )}

      {/* Création / édition d'une gamme-template dans la sous-catégorie courante
          (niveau 2 uniquement : une gamme pointe toujours une sous-catégorie). */}
      {canManage && depth === 2 && current !== null && (
        <GammeBiblioFormDialog
          key={`gamme-${gammeForm.gamme?.id ?? `new-${current.id}`}`}
          open={gammeForm.open}
          onOpenChange={(open) => setGammeForm((f) => ({ ...f, open }))}
          gamme={gammeForm.gamme}
          categories={editGammeCategories.map((c) => ({
            id: c.id,
            nom: c.nom,
          }))}
          canEntreprise={canEntreprise}
          siteId={current.site_id}
          siteName={activeSite?.nom ?? null}
          lockedScope={gammeForm.gamme ? undefined : currentLockedScope}
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
  canManage,
  canEdit,
  onBack,
  onEdit,
}: {
  gamme: GammeBiblioRow
  canManage: boolean
  canEdit: boolean
  onBack: () => void
  onEdit: () => void
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

  const newButton =
    canManage && canEdit ? (
      <Button size="sm" onClick={() => setOpForm({ open: true, op: null })}>
        <Plus /> Ajouter une opération
      </Button>
    ) : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft /> Retour
        </Button>
        <span className="font-medium">{gamme.nom}</span>
        <Badge variant={gamme.site_id === null ? 'secondary' : 'outline'}>
          {gamme.site_id === null ? 'Commun' : 'Site'}
        </Badge>
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
        {canManage && canEdit && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={onEdit}
          >
            <Pencil /> Modifier la gamme
          </Button>
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
              canManage && canEdit
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
                {canManage && canEdit && (
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
          canEdit={canManage && canEdit}
        />
      </div>

      {canManage && canEdit && (
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
          toDelete ? `« ${toDelete.nom} » sera définitivement retirée.` : undefined
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
