import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ClipboardList,
  Download,
  FileText,
  Pencil,
  Plus,
  Trash2,
  Truck,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { contratsQueries, prestatairesQueries } from '../queries'
import { useDeleteContrat } from '../mutations'
import { useDeleteDocument } from '@/features/documents/mutations'
import { etatContrat } from '../etat'
import { PrestataireFormDialog } from './prestataire-form-dialog'
import { ContratFormDialog } from './contrat-form-dialog'
import { OtCard } from '@/features/ordres-travail/components/ot-card'
import {
  matchStatutOt,
  statutOtFilterOptions,
} from '@/features/ordres-travail/schemas'
import {
  trierOtParUrgence,
  type OtTriable,
} from '@/features/ordres-travail/tri'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import { GammeCard } from '@/features/gammes/components/gamme-card'
import { DocumentRow } from '@/features/documents/components/document-row'
import { DocumentPreviewDialog } from '@/features/documents/components/document-preview-dialog'
import { useDocumentDownload } from '@/features/documents/use-document-download'
import type { DocumentMeta } from '@/features/documents/format'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { formatDate } from '@/lib/date'
import { deleteErrorMessage, errorMessage } from '@/lib/form'
import { listStack } from '@/lib/responsive'
import type { Database } from '@/lib/database.types'
import type { RowAction } from '@/components/common/row-actions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { DetailHeaderCard } from '@/components/common/detail-header-card'
import { SubTabs } from '@/components/common/sub-tabs'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { NoSearchResults } from '@/components/common/no-search-results'
import {
  FILTRE_NON_TERMINES,
  ListFilterBar,
} from '@/components/common/list-filter-bar'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type Prestataire = Database['public']['Tables']['prestataires']['Row']
type ContratRow = Database['public']['Tables']['contrats']['Row'] & {
  types_contrats: { id: number; libelle: string } | null
}
type Onglet = 'contrats' | 'gammes' | 'ot' | 'documents'

/** Accès partagé aux vignettes (UNE instance pour toute la fiche → un seul canal). */
interface MiniatureAccess {
  urlOf: (id: string | null) => string | null
  refreshMiniatures: () => void
}

/**
 * Fiche Prestataire détail, calquée sur les fiches Gamme / OT : page autonome
 * (porte sa `PageHeader`), carte d'en-tête `DetailHeaderCard`, barre `SubTabs`
 * (Contrats / Gammes / Ordres de travail / Documents) et zone de contenu défilante.
 * Tout ce qui est rattaché au prestataire, BORNÉ AU SITE ACTIF (décision PO) :
 * contrats (CRUD inline), gammes couvertes par ses contrats (lecture), ses OT
 * (lecture), ses documents. Le front présente ; la base (RLS) cloisonne par site
 * (résultat vide hors scope, jamais d'erreur).
 */
export function PrestataireDetail({
  prestataire,
  siteId,
  canManage,
  onBack,
}: {
  prestataire: Prestataire
  siteId: string
  canManage: boolean
  onBack: () => void
}) {
  const [onglet, setOnglet] = useState<Onglet>('contrats')
  const [editPrestataire, setEditPrestataire] = useState(false)
  const [contratForm, setContratForm] = useState<{
    open: boolean
    contrat: ContratRow | null
  }>({ open: false, contrat: null })
  const [contratToDelete, setContratToDelete] = useState<ContratRow | null>(
    null,
  )
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  const delContrat = useDeleteContrat()

  function confirmDeleteContrat() {
    if (!contratToDelete) return
    delContrat.mutate(contratToDelete.id, {
      onSuccess: () => {
        toast.success('Contrat supprimé')
        setContratToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  // Top bar : action « + » contextuelle à l'onglet (Nouveau contrat), suivie de
  // « Modifier le prestataire », toujours présente. Boutons icône + tooltip
  // (convention PageHeader), réservés aux gestionnaires. L'onglet Documents est en
  // lecture seule (documents des OT) : pas d'action de rattachement ici.
  const headerAction = canManage ? (
    <>
      {onglet === 'contrats' && (
        <TooltipIconButton
          icon={<Plus />}
          label="Nouveau contrat"
          variant="outline"
          onClick={() => setContratForm({ open: true, contrat: null })}
        />
      )}
      <TooltipIconButton
        icon={<Pencil />}
        label="Modifier le prestataire"
        variant="outline"
        onClick={() => setEditPrestataire(true)}
      />
    </>
  ) : undefined

  return (
    // `no-scrollbar` : seule la zone de contenu (2e enfant) défile, barre masquée.
    // L'en-tête (1er enfant : top bar + carte + onglets) reste FIXE.
    <PageContainer className="no-scrollbar">
      <div>
        <PageHeader
          title={prestataire.libelle}
          breadcrumb={[{ label: 'Prestataires', onClick: onBack }]}
          titleBadges={
            <Badge variant={prestataire.est_interne ? 'default' : 'secondary'}>
              {prestataire.est_interne ? 'Interne' : 'Externe'}
            </Badge>
          }
          action={headerAction}
        />

        <DetailHeaderCard
          className="mb-4"
          thumbnail={
            <MiniatureThumb
              url={urlOf(prestataire.miniature_id)}
              fallback={<Truck className="size-8" />}
              alt=""
              onError={refreshMiniatures}
              className="size-full rounded-none"
            />
          }
          fields={[
            prestataire.metier
              ? { label: 'Métier', value: prestataire.metier }
              : null,
            prestataire.ville
              ? { label: 'Ville', value: prestataire.ville }
              : null,
            prestataire.telephone
              ? { label: 'Téléphone', value: prestataire.telephone }
              : null,
            prestataire.email
              ? { label: 'E-mail', value: prestataire.email }
              : null,
          ]}
          columns={2}
        />

        <SubTabs
          ariaLabel="Sections du prestataire"
          variant="segmented"
          value={onglet}
          onValueChange={setOnglet}
          items={[
            { id: 'contrats', label: 'Contrats' },
            { id: 'gammes', label: 'Gammes' },
            { id: 'ot', label: 'Ordres de travail' },
            { id: 'documents', label: 'Documents' },
          ]}
        />
      </div>

      {/* Zone défilante : colonne flex `min-h-full` pour que les états vides se
          centrent verticalement. */}
      <div className="flex min-h-full flex-col">
        {onglet === 'contrats' && (
          <ContratsPanel
            siteId={siteId}
            prestataireId={prestataire.id}
            canManage={canManage}
            onNew={() => setContratForm({ open: true, contrat: null })}
            onEdit={(c) => setContratForm({ open: true, contrat: c })}
            onDelete={(c) => setContratToDelete(c)}
          />
        )}
        {onglet === 'gammes' && (
          <GammesPanel
            prestataireId={prestataire.id}
            siteId={siteId}
            urlOf={urlOf}
            refreshMiniatures={refreshMiniatures}
          />
        )}
        {onglet === 'ot' && (
          <OtPanel
            prestataireId={prestataire.id}
            siteId={siteId}
            urlOf={urlOf}
            refreshMiniatures={refreshMiniatures}
          />
        )}
        {onglet === 'documents' && (
          <OtDocumentsPanel
            prestataireId={prestataire.id}
            siteId={siteId}
            canDelete={canManage}
          />
        )}
      </div>

      {canManage && (
        <>
          <PrestataireFormDialog
            key={prestataire.id}
            open={editPrestataire}
            onOpenChange={setEditPrestataire}
            siteId={siteId}
            prestataire={prestataire}
          />
          <ContratFormDialog
            key={contratForm.contrat?.id ?? 'new'}
            open={contratForm.open}
            onOpenChange={(open) => setContratForm((f) => ({ ...f, open }))}
            siteId={siteId}
            prestataireId={prestataire.id}
            contrat={contratForm.contrat}
          />
          <ConfirmDeleteDialog
            open={contratToDelete !== null}
            onOpenChange={(open) => {
              if (!open) setContratToDelete(null)
            }}
            entityLabel={
              contratToDelete
                ? `le contrat « ${contratToDelete.reference} »`
                : 'le contrat'
            }
            warning="Cette suppression est définitive."
            loading={delContrat.isPending}
            onConfirm={confirmDeleteContrat}
          />
        </>
      )}
    </PageContainer>
  )
}

/** Onglet Contrats : liste + CRUD (les dialogues sont pilotés par la fiche hôte). */
function ContratsPanel({
  siteId,
  prestataireId,
  canManage,
  onNew,
  onEdit,
  onDelete,
}: {
  siteId: string
  prestataireId: string
  canManage: boolean
  onNew: () => void
  onEdit: (contrat: ContratRow) => void
  onDelete: (contrat: ContratRow) => void
}) {
  const query = useQuery(contratsQueries.list(siteId, prestataireId))
  const newButton = canManage ? (
    <Button onClick={onNew}>
      <Plus /> Nouveau contrat
    </Button>
  ) : undefined

  return (
    <QueryState
      query={query}
      pending={<ListRowSkeletons count={2} />}
      empty={
        <EmptyState
          icon={FileText}
          title="Aucun contrat"
          description={
            canManage
              ? 'Ajoute un contrat pour ce prestataire sur le site actif.'
              : 'Aucun contrat sur le site actif.'
          }
          action={newButton}
          className="min-h-40 flex-1 justify-center"
        />
      }
    >
      {(contrats) => (
        <div className={listStack}>
          {(contrats as ContratRow[]).map((c) => {
            const etat = etatContrat(c.date_debut, c.date_fin)
            const actions: RowAction[] = canManage
              ? [
                  {
                    label: 'Modifier',
                    icon: Pencil,
                    onSelect: () => onEdit(c),
                  },
                  {
                    label: 'Supprimer',
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => onDelete(c),
                  },
                ]
              : []
            return (
              <ListRow
                key={c.id}
                media={<RowMediaIcon icon={FileText} />}
                title={c.reference}
                subtitle={`Du ${formatDate(c.date_debut)} au ${formatDate(c.date_fin)}${c.objet_avenant ? ` — avenant : ${c.objet_avenant}` : ''}`}
                badges={
                  <>
                    <Badge variant={etat.variant}>{etat.label}</Badge>
                    {c.types_contrats && (
                      <Badge variant="outline">
                        {c.types_contrats.libelle}
                      </Badge>
                    )}
                  </>
                }
                mobileMeta={etat.label}
                menuActions={actions.length ? actions : undefined}
              />
            )
          })}
        </div>
      )}
    </QueryState>
  )
}

/**
 * Onglet Gammes : gammes du prestataire sur le site (lien direct
 * `gammes.prestataire_id`), en LECTURE SEULE. Réutilise `GammeCard` (variante
 * Bibliothèque) — on masque le prestataire (`showPrestataire={false}`) puisqu'on
 * est déjà sur sa fiche. Le clic ouvre la fiche gamme dans le Plan de maintenance
 * via `?open=<id>` (l'explorateur reconstruit le chemin d'URL catégorie → gamme).
 */
function GammesPanel({
  prestataireId,
  siteId,
  urlOf,
  refreshMiniatures,
}: { prestataireId: string; siteId: string } & MiniatureAccess) {
  const navigate = useNavigate()
  const query = useQuery(prestatairesQueries.gammes(prestataireId, siteId))

  // OT des gammes affichées → badge de statut + périodicité sur chaque carte, comme
  // dans le Plan de maintenance (MÊME variante de `GammeCard` via `statutOts`).
  const gammeIds = useMemo(
    () => (query.data ?? []).map((g) => g.id),
    [query.data],
  )
  const otsQuery = useQuery(ordresTravailQueries.byGammes(siteId, gammeIds))
  useRealtimeRefresh('ordres_travail', ordresTravailQueries.all())
  // Badge masqué seulement pendant un vrai fetch / sur erreur (pas de statut trompeur).
  const otsIndispo = otsQuery.isLoading || otsQuery.isError
  const otsParGamme = useMemo(() => {
    const map = new Map<string, OtTriable[]>()
    for (const ot of otsQuery.data ?? []) {
      if (ot.gamme_id === null) continue
      const liste = map.get(ot.gamme_id) ?? []
      liste.push(ot)
      map.set(ot.gamme_id, liste)
    }
    return map
  }, [otsQuery.data])

  return (
    <QueryState
      query={query}
      pending={<ListRowSkeletons count={3} />}
      empty={
        <EmptyState
          icon={Wrench}
          title="Aucune gamme"
          description="Aucune gamme rattachée à ce prestataire sur le site actif."
          className="min-h-40 flex-1 justify-center"
        />
      }
    >
      {(gammes) => (
        <div className={listStack}>
          {gammes.map((g) => (
            <GammeCard
              key={g.id}
              gamme={g}
              urlOf={urlOf}
              refreshMiniatures={refreshMiniatures}
              showPrestataire={false}
              // Variante « Plan de maintenance » : badge de statut + périodicité.
              statutOts={otsParGamme.get(g.id) ?? []}
              statutPending={otsIndispo}
              // Ouvre la fiche gamme dans le Plan de maintenance : on passe l'id via
              // `?open=` et l'explorateur reconstruit le chemin propre (catégorie →
              // sous-catégorie → gamme) — pas de duplication de cette logique ici.
              onClick={() =>
                void navigate({
                  to: '/gammes/$',
                  params: { _splat: '' },
                  search: { open: g.id },
                })
              }
            />
          ))}
        </div>
      )}
    </QueryState>
  )
}

/**
 * Onglet Documents — documents rattachés aux ORDRES DE TRAVAIL du prestataire (sur
 * le site actif). Réutilise les briques documents standard : `DocumentRow` (rendu
 * identique partout), aperçu au clic, et menu contextuel `Télécharger` +
 * `Supprimer` (hard-delete, gestionnaires uniquement). Pas de détache : ces
 * documents ne sont pas « rattachés au prestataire » mais à ses OT.
 */
function OtDocumentsPanel({
  prestataireId,
  siteId,
  canDelete,
}: {
  prestataireId: string
  siteId: string
  canDelete: boolean
}) {
  const query = useQuery(
    prestatairesQueries.documentsViaOt(prestataireId, siteId),
  )
  const [toPreview, setToPreview] = useState<DocumentMeta | null>(null)
  const [toDelete, setToDelete] = useState<DocumentMeta | null>(null)
  const download = useDocumentDownload()
  const del = useDeleteDocument()

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Document supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  return (
    <QueryState
      query={query}
      pending={<ListRowSkeletons count={4} />}
      empty={
        <EmptyState
          icon={FileText}
          title="Aucun document"
          description="Aucun document rattaché aux ordres de travail de ce prestataire sur le site actif."
          className="min-h-40 flex-1 justify-center"
        />
      }
    >
      {(list) => (
        <div className={listStack}>
          {list.map((doc) => {
            const actions: RowAction[] = [
              {
                label: 'Télécharger',
                icon: Download,
                onSelect: () => void download(doc),
              },
            ]
            if (canDelete)
              actions.push({
                label: 'Supprimer',
                icon: Trash2,
                destructive: true,
                onSelect: () => setToDelete(doc),
              })
            return (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onClick={() => setToPreview(doc)}
                menuActions={actions}
              />
            )
          })}

          <DocumentPreviewDialog
            doc={toPreview}
            onOpenChange={(open) => {
              if (!open) setToPreview(null)
            }}
          />
          <ConfirmDeleteDialog
            open={toDelete !== null}
            onOpenChange={(open) => {
              if (!open) setToDelete(null)
            }}
            entityLabel={
              toDelete
                ? `le document « ${toDelete.nom_original} »`
                : 'le document'
            }
            warning="Suppression définitive : le document est retiré de TOUTES les fiches où il est rattaché et effacé du stockage."
            loading={del.isPending}
            onConfirm={confirmDelete}
          />
        </div>
      )}
    </QueryState>
  )
}

/**
 * Onglet Ordres de travail : OT du prestataire sur le site, en LECTURE SEULE.
 * Réutilise `OtCard` (clic → fiche OT), la barre `ListFilterBar` + le filtre statut
 * de la page OT (`matchStatutOt` / `statutOtFilterOptions`) et le tri par urgence.
 * Défaut « Non terminés » (un prestataire peut cumuler beaucoup d'historique).
 */
function OtPanel({
  prestataireId,
  siteId,
  urlOf,
  refreshMiniatures,
}: { prestataireId: string; siteId: string } & MiniatureAccess) {
  const query = useQuery(
    prestatairesQueries.ordresTravail(prestataireId, siteId),
  )
  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState<string>(FILTRE_NON_TERMINES)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return trierOtParUrgence(
      (query.data ?? []).filter((ot) => {
        if (!matchStatutOt(ot.statut, statutFilter)) return false
        if (q === '') return true
        return [ot.nom_gamme, ot.nom_equipement].some((v) =>
          v?.toLowerCase().includes(q),
        )
      }),
    )
  }, [query.data, search, statutFilter])

  return (
    <QueryState
      query={query}
      pending={<ListRowSkeletons count={4} />}
      empty={
        <EmptyState
          icon={ClipboardList}
          title="Aucun ordre de travail"
          description="Aucun OT pour ce prestataire sur le site actif."
          className="min-h-40 flex-1 justify-center"
        />
      }
    >
      {() => (
        <div className="flex flex-col gap-4">
          <ListFilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher un ordre de travail…"
            filterValue={statutFilter}
            onFilterChange={setStatutFilter}
            options={statutOtFilterOptions()}
            filterLabel="Filtrer par statut"
            sticky
          />
          {filtered.length === 0 ? (
            <NoSearchResults description="Aucun ordre de travail ne correspond à ces critères." />
          ) : (
            <div className={listStack}>
              {filtered.map((ot) => (
                <OtCard
                  key={ot.id}
                  ot={ot}
                  urlOf={urlOf}
                  refreshMiniatures={refreshMiniatures}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </QueryState>
  )
}
