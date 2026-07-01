import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building, DoorOpen, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  blockingListTitle,
  blockingReason,
  localCascadeWarning,
  localisationsQueries,
} from '../queries'
import {
  useDeleteBatiment,
  useDeleteLocal,
  useDeleteNiveau,
} from '../mutations'
import { BatimentFormDialog } from './batiment-form-dialog'
import { NiveauFormDialog } from './niveau-form-dialog'
import { LocalFormDialog } from './local-form-dialog'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useLocalisationsDrill } from '@/hooks/use-localisations-drill'
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
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import type { Database } from '@/lib/database.types'

type Batiment = Database['public']['Tables']['batiments']['Row']
type Niveau = Database['public']['Tables']['niveaux']['Row']
type Local = Database['public']['Tables']['locaux']['Row']

type Suppression =
  | { kind: 'batiment'; item: Batiment }
  | { kind: 'niveau'; item: Niveau }
  | { kind: 'local'; item: Local }

/**
 * Explorateur des Localisations d'un site : navigation par CHEMIN d'URL
 * (`/localisations/<bâtiment>/<niveau>`), même patron qu'Équipements/Bibliothèque
 * (fil d'Ariane, lignes `ListRow`, boutons icône) mais sur l'arbre hétérogène
 * bâtiment → niveau → local. Racine : bâtiments ; dans un bâtiment : ses niveaux ;
 * dans un niveau : ses locaux (feuilles).
 */
export function LocalisationsExplorer({ siteId }: { siteId: string }) {
  const { data: role } = useCurrentRole()
  const canEdit = perm.canManageMetier(role)
  const { segs, goTo } = useLocalisationsDrill()
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  const batimentsQuery = useQuery(localisationsQueries.batiments(siteId))
  const batiments = useMemo(
    () => batimentsQuery.data ?? [],
    [batimentsQuery.data],
  )
  const batiment = useMemo(() => {
    if (segs[0] === undefined) return null
    return batiments.find((b) => segOfUnique(b, batiments) === segs[0]) ?? null
  }, [segs, batiments])

  const niveauxQuery = useQuery(
    localisationsQueries.niveaux(batiment?.id ?? null),
  )
  const niveaux = useMemo(() => niveauxQuery.data ?? [], [niveauxQuery.data])
  const niveau = useMemo(() => {
    if (segs[1] === undefined || !batiment) return null
    return niveaux.find((n) => segOfUnique(n, niveaux) === segs[1]) ?? null
  }, [segs, batiment, niveaux])

  const locauxQuery = useQuery(localisationsQueries.locaux(niveau?.id ?? null))
  const { data: types = [] } = useQuery(localisationsQueries.typesLocaux())
  const typeLabel = (id: number | null) =>
    id === null ? null : (types.find((t) => t.id === id)?.libelle ?? null)

  // Surfaces ROULÉES : un niveau = somme de ses locaux, un bâtiment = somme de ses
  // niveaux (vues d'agrégation). Indexées par id pour l'affichage.
  const batimentsSurfaceQuery = useQuery(
    localisationsQueries.batimentsSurface(siteId),
  )
  const niveauxSurfaceQuery = useQuery(
    localisationsQueries.niveauxSurface(batiment?.id ?? null),
  )
  const surfaceBatiment = useMemo(
    () =>
      new Map(
        (batimentsSurfaceQuery.data ?? []).map((r) => [r.batiment_id, r]),
      ),
    [batimentsSurfaceQuery.data],
  )
  const surfaceNiveau = useMemo(
    () =>
      new Map((niveauxSurfaceQuery.data ?? []).map((r) => [r.niveau_id, r])),
    [niveauxSurfaceQuery.data],
  )
  // Libellé surface roulée : « X m² » (+ « · Y m² chauffé » si chauffé > 0).
  // `undefined` si surface nulle → pas de bruit « 0 m² ».
  const surfaceLabel = (row?: {
    surface_m2: number | null
    surface_chauffee_m2: number | null
  }) => {
    const total = row?.surface_m2 ?? 0
    if (total <= 0) return undefined
    const chauffee = row?.surface_chauffee_m2 ?? 0
    return chauffee > 0
      ? `${String(total)} m² · ${String(chauffee)} m² chauffé`
      : `${String(total)} m²`
  }

  const delBatiment = useDeleteBatiment()
  const delNiveau = useDeleteNiveau()
  const delLocal = useDeleteLocal()

  const [batForm, setBatForm] = useState<{
    open: boolean
    batiment: Batiment | null
  }>({ open: false, batiment: null })
  const [nivForm, setNivForm] = useState<{
    open: boolean
    niveau: Niveau | null
  }>({ open: false, niveau: null })
  const [locForm, setLocForm] = useState<{
    open: boolean
    local: Local | null
  }>({ open: false, local: null })
  const [toDelete, setToDelete] = useState<Suppression | null>(null)

  function goToBatiment(b: Batiment) {
    goTo([segOfUnique(b, batiments)])
  }
  function goToNiveau(n: Niveau) {
    if (!batiment) return
    goTo([segOfUnique(batiment, batiments), segOfUnique(n, niveaux)])
  }

  const del =
    toDelete?.kind === 'batiment'
      ? delBatiment
      : toDelete?.kind === 'niveau'
        ? delNiveau
        : delLocal
  function confirmDelete() {
    if (!toDelete) return
    const labels = {
      batiment: 'Bâtiment supprimé',
      niveau: 'Niveau supprimé',
      local: 'Local supprimé',
    }
    del.mutate(toDelete.item.id, {
      onSuccess: () => {
        toast.success(labels[toDelete.kind])
        setToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  // Enfants BLOQUANTS de la cible (FK RESTRICT) comptés EN AMONT, à l'ouverture
  // de la confirmation, pour expliquer précisément le refus (nombre + noms) au
  // lieu d'une erreur opaque. Le local n'est PAS une feuille :
  // `equipements.local_id` est RESTRICT. La base reste l'arbitre réel.
  const blockingQuery = useQuery(
    localisationsQueries.blockingChildren(
      toDelete ? { kind: toDelete.kind, id: toDelete.item.id } : null,
    ),
  )
  const blockingCount = blockingQuery.data?.count ?? 0
  const deleteBlocked = toDelete !== null && blockingCount > 0
  // Vérification impossible (réseau/RLS) : on n'autorise PAS la suppression « à
  // l'aveugle ». On désactive et on l'explique, plutôt que de laisser la base
  // renvoyer son erreur opaque.
  const verifFailed = toDelete !== null && blockingQuery.isError
  // Liens d'un local supprimés EN CASCADE (DI, tâches de travaux, documents) :
  // non bloquants mais retirés → on les compte pour prévenir avant suppression.
  const cascadeQuery = useQuery(
    localisationsQueries.localCascade(
      toDelete?.kind === 'local' ? toDelete.item.id : null,
    ),
  )
  const cascadeWarn = cascadeQuery.data
    ? localCascadeWarning(cascadeQuery.data)
    : null

  // --- En-tête (titre racine ou fil d'Ariane) + action de création du palier. ---
  const newBtn = (label: string, onClick: () => void) =>
    canEdit ? (
      <TooltipIconButton
        icon={<Plus />}
        label={label}
        variant="outline"
        onClick={onClick}
      />
    ) : null

  // Description de SECTION, affichée à toutes les profondeurs → zone jamais vide.
  const sectionDescription = 'Bâtiments, niveaux et locaux du site.'
  let header: ReactNode
  if (niveau && batiment) {
    const ancestors: PageHeaderCrumb[] = [
      { label: 'Localisations', onClick: () => goTo([]) },
      {
        label: batiment.nom,
        onClick: () => goToBatiment(batiment),
        // Frères = autres bâtiments du site → saut latéral (caret ▾) depuis un niveau.
        siblings: batiments
          .filter((b) => b.id !== batiment.id)
          .sort((a, b) => a.nom.localeCompare(b.nom))
          .map((b) => ({ label: b.nom, onClick: () => goToBatiment(b) })),
      },
    ]
    header = (
      <PageHeader
        breadcrumb={ancestors}
        title={niveau.nom}
        description={sectionDescription}
        action={
          newBtn('Nouveau local', () =>
            setLocForm({ open: true, local: null }),
          ) ?? undefined
        }
      />
    )
  } else if (batiment) {
    const ancestors: PageHeaderCrumb[] = [
      { label: 'Localisations', onClick: () => goTo([]) },
    ]
    header = (
      <PageHeader
        breadcrumb={ancestors}
        title={batiment.nom}
        description={sectionDescription}
        action={
          newBtn('Nouveau niveau', () =>
            setNivForm({ open: true, niveau: null }),
          ) ?? undefined
        }
      />
    )
  } else {
    header = (
      <PageHeader
        title="Localisations"
        description={sectionDescription}
        action={
          newBtn('Nouveau bâtiment', () =>
            setBatForm({ open: true, batiment: null }),
          ) ?? undefined
        }
      />
    )
  }

  const dialogs = (
    <>
      {canEdit && (
        <BatimentFormDialog
          key={`bat-${batForm.batiment?.id ?? 'new'}-${String(batForm.open)}`}
          open={batForm.open}
          onOpenChange={(open) => setBatForm((f) => ({ ...f, open }))}
          siteId={siteId}
          batiment={batForm.batiment}
        />
      )}
      {canEdit && batiment && (
        <NiveauFormDialog
          key={`niv-${nivForm.niveau?.id ?? 'new'}-${String(nivForm.open)}`}
          open={nivForm.open}
          onOpenChange={(open) => setNivForm((f) => ({ ...f, open }))}
          batimentId={batiment.id}
          siteId={siteId}
          niveau={nivForm.niveau}
        />
      )}
      {canEdit && niveau && (
        <LocalFormDialog
          key={`loc-${locForm.local?.id ?? 'new'}-${String(locForm.open)}`}
          open={locForm.open}
          onOpenChange={(open) => setLocForm((f) => ({ ...f, open }))}
          niveauId={niveau.id}
          siteId={siteId}
          local={locForm.local}
        />
      )}
      <ConfirmDeleteDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        entityLabel={
          toDelete?.kind === 'batiment'
            ? `le bâtiment « ${toDelete.item.nom} »`
            : toDelete?.kind === 'niveau'
              ? `le niveau « ${toDelete.item.nom} »`
              : toDelete?.kind === 'local'
                ? `le local « ${toDelete.item.nom} »`
                : 'l’élément'
        }
        blocked={deleteBlocked || verifFailed}
        loadingImpacts={blockingQuery.isFetching}
        blockedReason={
          verifFailed
            ? 'Impossible de vérifier le contenu de cet élément. Réessaie dans un instant.'
            : toDelete
              ? blockingReason(toDelete.kind, blockingCount)
              : undefined
        }
        impactsTitle={
          toDelete ? blockingListTitle(toDelete.kind, blockingCount) : undefined
        }
        impacts={blockingQuery.data?.names}
        warning={
          cascadeWarn
            ? `Cette suppression est définitive. ${cascadeWarn}`
            : 'Cette suppression est définitive.'
        }
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </>
  )

  // Actions (modifier / supprimer) d'une ligne, réservées au rôle métier.
  // La suppression d'un conteneur non vide reste arbitrée par la confirmation
  // (`deleteBlocked`) → l'action figure toujours dans le menu, comme avant.
  const rowActions = (
    onEdit: () => void,
    onDelete: () => void,
  ): RowAction[] | undefined =>
    canEdit
      ? [
          { label: 'Modifier', icon: Pencil, onSelect: onEdit },
          {
            label: 'Supprimer',
            icon: Trash2,
            destructive: true,
            onSelect: onDelete,
          },
        ]
      : undefined

  let content: ReactNode
  if (niveau) {
    content = (
      <QueryState
        query={locauxQuery}
        pending={<ListRowSkeletons count={4} />}
        empty={
          <EmptyState
            icon={DoorOpen}
            title="Aucun local"
            description={
              canEdit
                ? 'Crée le premier local de ce niveau.'
                : 'Aucun local dans ce niveau.'
            }
          />
        }
      >
        {(locaux) => (
          <div className={listStack}>
            {locaux.map((l) => (
              <ListRow
                key={l.id}
                media={
                  <MiniatureThumb
                    url={urlOf(l.miniature_id)}
                    fallback={<DoorOpen className="size-10" />}
                    alt=""
                    onError={refreshMiniatures}
                    className="size-full rounded-none"
                  />
                }
                title={l.nom}
                subtitle={
                  [
                    typeLabel(l.type_local_id),
                    l.surface_m2 === null ? null : `${String(l.surface_m2)} m²`,
                    l.chauffe_climatise ? 'Chauffé/climatisé' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                menuActions={rowActions(
                  () => setLocForm({ open: true, local: l }),
                  () => setToDelete({ kind: 'local', item: l }),
                )}
              />
            ))}
          </div>
        )}
      </QueryState>
    )
  } else if (batiment) {
    content = (
      <QueryState
        query={niveauxQuery}
        pending={<ListRowSkeletons count={4} />}
        empty={
          <EmptyState
            icon={Layers}
            title="Aucun niveau"
            description={
              canEdit
                ? 'Crée le premier niveau de ce bâtiment.'
                : 'Aucun niveau dans ce bâtiment.'
            }
          />
        }
      >
        {(items) => (
          <div className={listStack}>
            {items.map((n) => (
              <ListRow
                key={n.id}
                media={
                  <MiniatureThumb
                    url={urlOf(n.miniature_id)}
                    fallback={<Layers className="size-10" />}
                    alt=""
                    onError={refreshMiniatures}
                    className="size-full rounded-none"
                  />
                }
                title={n.nom}
                subtitle={n.description ?? undefined}
                meta={surfaceLabel(surfaceNiveau.get(n.id))}
                mobileMeta={surfaceLabel(surfaceNiveau.get(n.id))}
                onClick={() => goToNiveau(n)}
                menuActions={rowActions(
                  () => setNivForm({ open: true, niveau: n }),
                  () => setToDelete({ kind: 'niveau', item: n }),
                )}
              />
            ))}
          </div>
        )}
      </QueryState>
    )
  } else {
    content = (
      <QueryState
        query={batimentsQuery}
        pending={<ListRowSkeletons count={4} />}
        empty={
          <EmptyState
            icon={Building}
            title="Aucun bâtiment"
            description={
              canEdit
                ? 'Crée le premier bâtiment de ce site.'
                : 'Aucun bâtiment sur ce site.'
            }
          />
        }
      >
        {(items) => (
          <div className={listStack}>
            {items.map((b) => (
              <ListRow
                key={b.id}
                media={
                  <MiniatureThumb
                    url={urlOf(b.miniature_id)}
                    fallback={<Building className="size-10" />}
                    alt=""
                    onError={refreshMiniatures}
                    className="size-full rounded-none"
                  />
                }
                title={b.nom}
                subtitle={b.description ?? undefined}
                meta={surfaceLabel(surfaceBatiment.get(b.id))}
                mobileMeta={surfaceLabel(surfaceBatiment.get(b.id))}
                onClick={() => goToBatiment(b)}
                menuActions={rowActions(
                  () => setBatForm({ open: true, batiment: b }),
                  () => setToDelete({ kind: 'batiment', item: b }),
                )}
              />
            ))}
          </div>
        )}
      </QueryState>
    )
  }

  // En-tête FIXE + corps DÉFILANT (mode `fill` de PageContainer), cohérent avec
  // Sites/Documents : seul le corps défile, le PageHeader reste en place.
  return (
    <>
      <div className="shrink-0 px-4 pt-6 sm:px-6 lg:px-8">{header}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-8">
        {content}
      </div>
      {dialogs}
    </>
  )
}
