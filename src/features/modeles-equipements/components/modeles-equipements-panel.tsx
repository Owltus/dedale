import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronRight,
  CopyPlus,
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
import { categoriesQueries } from '@/features/categories/queries'
import { CategoryFormDialog } from '@/features/categories/components/category-form-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useScope } from '@/hooks/use-scope'
import { useBiblioDrill } from '@/hooks/use-biblio-drill'
import { useSiteContext } from '@/lib/site-context'
import { errorMessage } from '@/lib/form'
import { scopeMatches, scopeTarget } from '@/lib/scope'
import * as perm from '@/lib/permissions'
import { useTabAddAction, useTabTitle } from '@/components/common/tab-actions'
import { TitleBreadcrumb } from '@/components/common/title-breadcrumb'
import { ScopeSelect } from '@/components/common/scope-select'
import {
  ExporterVersSiteDialog,
  type ExportOutcome,
} from '@/components/common/exporter-vers-site-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cardGrid } from '@/lib/responsive'

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

/**
 * Panneau « Modèles d'équipements » : navigation à UN seul niveau.
 * - Racine : la liste des catégories d'équipement (bouton « Nouvelle catégorie »).
 * - Dans une catégorie : ses modèles (le bouton passe à « Nouveau modèle »).
 * Le périmètre (Commun / site) est porté par le sélecteur ; les catégories sont
 * créables en commun ET sur les sites accessibles (la RLS arbitre).
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
  const copierModele = useCopierModeleEquipement()

  const [categoryFormOpen, setCategoryFormOpen] = useState(false)
  const [modeleForm, setModeleForm] = useState<{
    open: boolean
    modele: ModeleEquipement | null
  }>({ open: false, modele: null })
  const [toDelete, setToDelete] = useState<ModeleEquipement | null>(null)
  // Export d'un modèle COMMUN vers un site choisi (snapshot indépendant).
  const [exportState, setExportState] = useState<{
    open: boolean
    modele: ModeleEquipement | null
  }>({ open: false, modele: null })

  // Bouton « Copier vers un site » : seulement sur un modèle COMMUN et si
  // l'utilisateur a au moins un site accessible (la RPC reste l'arbitre réel).
  const canExport = canManage && sites.length > 0
  async function handleExportConfirm(
    siteCible: string,
  ): Promise<ExportOutcome> {
    const modele = exportState.modele
    if (!modele) return { ton: 'echec', message: 'Aucun modèle à copier.' }
    await copierModele.mutateAsync({ sourceModeleId: modele.id, siteCible })
    // Nom du site cible (pour indiquer OÙ retrouver la copie). Le site est choisi
    // dans `sites`, donc résolu ; repli défensif sur « le site » sinon.
    const nomSite = sites.find((s) => s.id === siteCible)?.nom
    const surSite = nomSite ? `le site « ${nomSite} »` : 'le site'
    return {
      ton: 'succes',
      message: `« ${modele.nom} » copié sur ${surSite}. La copie apparaît dans sa catégorie (badge Site), visible sous le périmètre « Commun » ou « Tout ».`,
    }
  }

  // Catégories d'équipement (actives, scope equipement/mixte).
  const equipmentCats = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (c) => c.est_actif && (c.scope === 'equipement' || c.scope === 'mixte'),
      ),
    [categoriesQuery.data],
  )
  // Navigation à un niveau (catégorie ouverte) portée par l'URL — calque du
  // patron Gammes via le hook partagé. `equipmentCats` = TOUTES les catégories
  // (non filtrées par périmètre) → le segment se résout quel que soit le filtre.
  const { selected: openCategory, open: ouvrirCategorie } = useBiblioDrill(
    'modeles-equipements',
    equipmentCats,
  )

  const modeles = useMemo(() => modelesQuery.data ?? [], [modelesQuery.data])
  // Nombre de modèles par catégorie (compteur des cartes).
  const countByCategory = useMemo(() => {
    const counts = new Map<string, number>()
    // `categorie_id` est désormais NOT NULL : tout modèle est rangé sous une catégorie.
    for (const m of modeles) {
      counts.set(m.categorie_id, (counts.get(m.categorie_id) ?? 0) + 1)
    }
    return counts
  }, [modeles])

  // Création de CATÉGORIE (racine) : adopte le périmètre choisi. Désactivée sur
  // « Tout », ou sur Commun sans le droit entreprise.
  const targetSiteId = scopeTarget(scope)
  const canAddCategory =
    canManage &&
    targetSiteId !== undefined &&
    (targetSiteId !== null || canEntreprise)
  const categoryLockedScope =
    targetSiteId === undefined
      ? null
      : {
          portee:
            targetSiteId === null ? ('entreprise' as const) : ('site' as const),
          siteId: targetSiteId,
        }

  // Création de MODÈLE dans la catégorie ouverte : portée héritée de la catégorie.
  const canAddModele =
    openCategory !== null &&
    canManage &&
    (openCategory.site_id !== null || canEntreprise)
  const modeleLockedScope =
    openCategory !== null
      ? {
          portee:
            openCategory.site_id === null
              ? ('entreprise' as const)
              : ('site' as const),
          siteId: openCategory.site_id,
        }
      : null

  const scopeControl = useMemo(
    () => <ScopeSelect value={scope} onChange={setScope} />,
    [scope, setScope],
  )
  const handleAddCategory = useCallback(() => setCategoryFormOpen(true), [])
  const handleAddModele = useCallback(
    () => setModeleForm({ open: true, modele: null }),
    [],
  )

  // Barre d'onglet = unique point d'entrée des actions, selon la vue (« boutons
  // toujours au même endroit ») : racine → + Nouvelle catégorie (+ périmètre) ;
  // catégorie ouverte → + Nouveau modèle (créé dans cette catégorie).
  const atRoot = openCategory === null
  useTabAddAction(
    canManage ? (atRoot ? handleAddCategory : handleAddModele) : null,
    atRoot ? 'Nouvelle catégorie' : 'Nouveau modèle',
    atRoot
      ? { disabled: !canAddCategory, extra: scopeControl }
      : { disabled: !canAddModele },
  )

  // Titre : libellé de l'onglet à la racine (défaut de <Tabs>), nom de la
  // catégorie ouverte en détail (fil d'Ariane sans ancêtre, comme Gammes).
  const titleNode = useMemo<ReactNode>(
    () =>
      openCategory === null ? null : (
        <TitleBreadcrumb ancestors={[]} current={openCategory.nom} />
      ),
    [openCategory],
  )
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

  // ----- VUE DÉTAIL : une catégorie ouverte → ses modèles -----
  if (openCategory !== null) {
    const visibleModeles = modeles.filter(
      (m) => m.categorie_id === openCategory.id,
    )
    return (
      <div className="flex flex-col gap-4">
        {/* Le nom de la catégorie vit dans le titre (fil d'Ariane) et « Nouveau
            modèle » dans la barre d'onglet. Ici, seul le badge de périmètre. */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={openCategory.site_id === null ? 'secondary' : 'outline'}
          >
            {openCategory.site_id === null ? 'Commun' : 'Site'}
          </Badge>
        </div>

        <QueryState
          query={modelesQuery}
          pending={<CardSkeletons count={4} />}
          empty={
            <EmptyState
              icon={Package}
              title="Aucun modèle dans cette catégorie"
              description={
                canAddModele
                  ? 'Crée le premier avec « Nouveau modèle » ci-dessus.'
                  : 'Aucun modèle pour le moment.'
              }
            />
          }
        >
          {() =>
            visibleModeles.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Aucun modèle dans cette catégorie"
                description={
                  canAddModele
                    ? 'Crée le premier avec « Nouveau modèle » ci-dessus.'
                    : 'Aucun modèle pour le moment.'
                }
              />
            ) : (
              <div className={cardGrid.compact}>
                {visibleModeles.map((modele) => {
                  const canEditThis = canEntreprise || modele.site_id !== null
                  return (
                    <Card key={modele.id} className="min-w-0">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="truncate">
                            {modele.nom}
                          </CardTitle>
                          {/* Portée : distingue une copie de site de son original
                              commun (même catégorie commune, mais site_id ≠ null). */}
                          <div className="flex shrink-0 items-center gap-2">
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
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
                        <span>
                          {specCount(modele.specifications)} caractéristique
                          {specCount(modele.specifications) > 1 ? 's' : ''}
                        </span>
                        {((canManage && canEditThis) ||
                          (canExport && modele.site_id === null)) && (
                          <div className="flex flex-wrap gap-2">
                            {/* Copie commun → site : uniquement sur un modèle COMMUN. */}
                            {canExport && modele.site_id === null && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setExportState({ open: true, modele })
                                }
                              >
                                <CopyPlus /> Copier vers un site
                              </Button>
                            )}
                            {/* Le garde extérieur implique déjà `canManage`. */}
                            {canEditThis && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setModeleForm({ open: true, modele })
                                  }
                                >
                                  <Pencil /> Modifier
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setToDelete(modele)}
                                >
                                  <Trash2 /> Supprimer
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )
          }
        </QueryState>

        {canManage && (
          <ModeleEquipementFormDialog
            key={modeleForm.modele?.id ?? `new-${openCategory.id}`}
            open={modeleForm.open}
            onOpenChange={(open) => setModeleForm((f) => ({ ...f, open }))}
            modele={modeleForm.modele}
            categories={equipmentCats.map((c) => ({ id: c.id, nom: c.nom }))}
            canEntreprise={canEntreprise}
            siteId={openCategory.site_id}
            siteName={null}
            lockedScope={modeleForm.modele ? undefined : modeleLockedScope}
            lockedCategorieId={modeleForm.modele ? undefined : openCategory.id}
            minimal
          />
        )}

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

        {canExport && (
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
        )}
      </div>
    )
  }

  // ----- VUE RACINE : la liste des catégories d'équipement -----
  const visibleCats = equipmentCats
    .filter((c) => scopeMatches(scope, c.site_id))
    .sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom))

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
              canAddCategory
                ? 'Crée une première catégorie avec le bouton + en haut à droite.'
                : 'Aucune catégorie accessible.'
            }
          />
        }
      >
        {() =>
          visibleCats.length === 0 ? (
            <EmptyState
              icon={FolderTree}
              title="Aucune catégorie ici"
              description="Aucune catégorie dans ce périmètre pour le moment."
            />
          ) : (
            <div className={cardGrid.compact}>
              {visibleCats.map((cat) => {
                const count = countByCategory.get(cat.id) ?? 0
                return (
                  <Card
                    key={cat.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Ouvrir la catégorie ${cat.nom}`}
                    className="focus-visible:ring-ring min-w-0 cursor-pointer transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:outline-none"
                    onClick={() => ouvrirCategorie(cat)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        ouvrirCategorie(cat)
                      }
                    }}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="truncate">{cat.nom}</CardTitle>
                        {cat.site_id === null && (
                          <Badge variant="secondary">Commun</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="text-muted-foreground flex items-center justify-between text-sm">
                      <span>
                        {count} modèle{count > 1 ? 's' : ''}
                      </span>
                      <ChevronRight className="size-4 shrink-0" />
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )
        }
      </QueryState>

      {canManage && (
        <CategoryFormDialog
          key={`cat-new-${scope}-${String(categoryFormOpen)}`}
          open={categoryFormOpen}
          onOpenChange={setCategoryFormOpen}
          categorie={null}
          preset={{ scope: 'equipement' }}
          categories={categoriesQuery.data ?? []}
          canEntreprise={canEntreprise}
          siteId={categoryLockedScope?.siteId ?? null}
          siteName={null}
          lockedScope={categoryLockedScope}
          minimal
        />
      )}
    </div>
  )
}
