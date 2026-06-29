import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ClipboardList,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Truck,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { contratsQueries, prestatairesQueries } from '../queries'
import { useDeleteContrat } from '../mutations'
import { etatContrat } from '../etat'
import { PrestataireFormDialog } from './prestataire-form-dialog'
import { ContratFormDialog } from './contrat-form-dialog'
import { OtCard } from '@/features/ordres-travail/components/ot-card'
import {
  matchStatutOt,
  statutOtFilterOptions,
} from '@/features/ordres-travail/schemas'
import { trierOtParUrgence } from '@/features/ordres-travail/tri'
import { GammeCard } from '@/features/gammes/components/gamme-card'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { useFileDrop } from '@/hooks/use-file-drop'
import { formatDate } from '@/lib/date'
import { deleteErrorMessage } from '@/lib/form'
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
import { DocumentsTab } from '@/components/common/documents-tab'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
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
  const [contratToDelete, setContratToDelete] = useState<ContratRow | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  // Fichiers issus d'un glisser-déposer pleine page → pré-remplissent l'upload.
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  const delContrat = useDeleteContrat()

  // Glisser-déposer sur TOUTE la page (réservé aux gestionnaires) : un dépôt
  // bascule sur l'onglet Documents et ouvre l'upload pré-rempli des fichiers.
  const { dragging } = useFileDrop({
    enabled: canManage,
    onFiles: (files) => {
      setDroppedFiles(files)
      setOnglet('documents')
      setUploadOpen(true)
    },
  })
  const handleUploadOpenChange = (open: boolean) => {
    setUploadOpen(open)
    if (!open) setDroppedFiles([])
  }

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

  // Top bar : action « + » contextuelle à l'onglet (Nouveau contrat / Rattacher un
  // document), suivie de « Modifier le prestataire », toujours présente. Boutons
  // icône + tooltip (convention PageHeader), réservés aux gestionnaires.
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
      {onglet === 'documents' && (
        <TooltipIconButton
          icon={<Paperclip />}
          label="Rattacher un document"
          variant="outline"
          onClick={() => {
            setDroppedFiles([])
            setUploadOpen(true)
          }}
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

      {/* Zone défilante : `relative` + `min-h-full` → la surcouche de glisser-déposer
          voile toute la hauteur visible ; colonne flex pour que les états vides se
          centrent verticalement. */}
      <div className="relative flex min-h-full flex-col">
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
          <DocumentsTab
            liaison="documents_prestataires"
            parentColumn="prestataire_id"
            parentId={prestataire.id}
            uploadOpen={uploadOpen}
            onUploadOpenChange={handleUploadOpenChange}
            uploadInitialFiles={droppedFiles}
            className="min-h-0 flex-1"
            namingContext={{ prestataire: prestataire.libelle }}
          />
        )}
        {canManage && <FileDropOverlay show={dragging} />}
      </div>

      {canManage && (
        <>
          <PrestataireFormDialog
            key={prestataire.id}
            open={editPrestataire}
            onOpenChange={setEditPrestataire}
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
                  { label: 'Modifier', icon: Pencil, onSelect: () => onEdit(c) },
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
                      <Badge variant="outline">{c.types_contrats.libelle}</Badge>
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
 * Onglet Gammes : gammes COUVERTES par les contrats du prestataire sur le site,
 * en LECTURE SEULE. Réutilise `GammeCard` (variante Bibliothèque) — on masque le
 * prestataire (`showPrestataire={false}`) puisqu'on est déjà sur sa fiche. Pas de
 * navigation : la fiche gamme n'a pas de route directe (explorateur Plan de
 * maintenance à paliers d'URL) → liste informative.
 */
function GammesPanel({
  prestataireId,
  siteId,
  urlOf,
  refreshMiniatures,
}: { prestataireId: string; siteId: string } & MiniatureAccess) {
  const query = useQuery(prestatairesQueries.gammes(prestataireId, siteId))
  return (
    <QueryState
      query={query}
      pending={<ListRowSkeletons count={3} />}
      empty={
        <EmptyState
          icon={Wrench}
          title="Aucune gamme"
          description="Aucune gamme couverte par les contrats de ce prestataire sur le site actif."
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
            />
          ))}
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
  const query = useQuery(prestatairesQueries.ordresTravail(prestataireId, siteId))
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
