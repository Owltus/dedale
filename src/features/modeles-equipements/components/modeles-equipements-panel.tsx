import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  FolderTree,
  Package,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { modelesEquipementsQueries, type ModeleEquipement } from '../queries'
import { useDeleteModeleEquipement } from '../mutations'
import { ModeleEquipementFormDialog } from './modele-equipement-form-dialog'
import { categoriesQueries } from '@/features/categories/queries'
import { CategoryFormDialog } from '@/features/categories/components/category-form-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useScope } from '@/hooks/use-scope'
import { errorMessage } from '@/lib/form'
import { scopeMatches, scopeTarget } from '@/lib/scope'
import * as perm from '@/lib/permissions'
import { useTabAddAction } from '@/components/common/tab-actions'
import { ScopeSelect } from '@/components/common/scope-select'
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

  const modelesQuery = useQuery(modelesEquipementsQueries.pool())
  const categoriesQuery = useQuery(categoriesQueries.pool())
  // Mises à jour live (modèles ET catégories) entre fenêtres / comptes.
  useRealtimeRefresh('modeles_equipements', modelesEquipementsQueries.all())
  useRealtimeRefresh('categories', categoriesQueries.all())
  const del = useDeleteModeleEquipement()

  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null)
  const [categoryFormOpen, setCategoryFormOpen] = useState(false)
  const [modeleForm, setModeleForm] = useState<{
    open: boolean
    modele: ModeleEquipement | null
  }>({ open: false, modele: null })
  const [toDelete, setToDelete] = useState<ModeleEquipement | null>(null)

  // Catégories d'équipement (actives, scope equipement/mixte).
  const equipmentCats = (categoriesQuery.data ?? []).filter(
    (c) => c.est_actif && (c.scope === 'equipement' || c.scope === 'mixte'),
  )
  const openCategory =
    openCategoryId !== null
      ? (equipmentCats.find((c) => c.id === openCategoryId) ?? null)
      : null

  const modeles = useMemo(() => modelesQuery.data ?? [], [modelesQuery.data])
  // Nombre de modèles par catégorie (compteur des cartes).
  const countByCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of modeles) {
      if (m.categorie_id !== null) {
        counts.set(m.categorie_id, (counts.get(m.categorie_id) ?? 0) + 1)
      }
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

  // En-tête : SEULEMENT à la racine → + Catégorie (+ sélecteur de périmètre).
  // Dans une catégorie, la création de modèle est un bouton EN CONTEXTE (plus bas).
  useTabAddAction(
    openCategory === null && canManage ? handleAddCategory : null,
    'Nouvelle catégorie',
    openCategory === null
      ? { disabled: !canAddCategory, extra: scopeControl }
      : undefined,
  )

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
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpenCategoryId(null)}
          >
            <ChevronLeft /> Catégories
          </Button>
          <ChevronRight className="text-muted-foreground size-4" />
          <span className="font-medium">{openCategory.nom}</span>
          <Badge
            variant={openCategory.site_id === null ? 'secondary' : 'outline'}
          >
            {openCategory.site_id === null ? 'Commun' : 'Site'}
          </Badge>
          {canManage && (
            <Button
              size="sm"
              className="ml-auto"
              onClick={handleAddModele}
              disabled={!canAddModele}
            >
              <Plus /> Nouveau modèle
            </Button>
          )}
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
                          {!modele.est_actif && (
                            <Badge variant="outline">Masqué</Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="text-muted-foreground flex flex-col gap-2 text-sm">
                        <span>
                          {specCount(modele.specifications)} caractéristique
                          {specCount(modele.specifications) > 1 ? 's' : ''}
                        </span>
                        {canManage && canEditThis && (
                          <div className="flex gap-2">
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
                    className="min-w-0 cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => setOpenCategoryId(cat.id)}
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
          key={`cat-new-${scope}`}
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
