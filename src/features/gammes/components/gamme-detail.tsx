import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ClipboardList,
  FileText,
  ListChecks,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { gammesQueries } from '@/features/gammes/queries'
import { useDeleteOperation } from '@/features/gammes/mutations'
import { OperationFormDialog } from '@/features/gammes/components/operation-form-dialog'
import { EquipementsLinkDialog } from '@/features/gammes/components/equipements-link-dialog'
import { GammeModelesSection } from '@/features/gammes/components/gamme-modeles-section'
import { OtListeParGammes } from '@/features/ordres-travail/components/ot-liste-par-gammes'
import { OtCreateDialog } from '@/features/ordres-travail/components/ot-create-dialog'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { equipementsQueries } from '@/features/equipements/queries'
import { useAuth } from '@/auth'
import { useFileDrop } from '@/hooks/use-file-drop'
import { deleteErrorMessage } from '@/lib/form'
import { listStack } from '@/lib/responsive'
import { cn } from '@/lib/utils'
import { SubTabs } from '@/components/common/sub-tabs'
import { SectionHeader } from '@/components/common/section'
import { SplitPane, SplitPanes } from '@/components/common/split-panes'
import { DocumentsTab } from '@/components/common/documents-tab'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import { useTabAddAction } from '@/components/common/tab-actions'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { OperationRow } from '@/components/common/operation-row'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import type { RowAction } from '@/components/common/row-actions'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/database.types'

export type GammeRow = Database['public']['Tables']['gammes']['Row'] & {
  periodicites: {
    id: number
    libelle: string
    jours_periodicite: number
  } | null
  prestataires: { id: string; libelle: string } | null
}

type GammeOperation = Database['public']['Tables']['operations']['Row'] & {
  types_operations: {
    id: number
    libelle: string
    necessite_seuils: boolean
  } | null
  unites: { id: number; nom: string; symbole: string } | null
}

type Tab = 'ordres' | 'operations' | 'equipements' | 'documents'

/**
 * CONTENU de la fiche d'une gamme de SITE (Plan de maintenance) : système à
 * onglets (Ordres de travail / Opérations / Équipements / Documents). L'EN-TÊTE
 * (fil d'Ariane + action « Modifier ») et la navigation sont portés par
 * l'explorateur parent (`GammesExplorer`) — ce composant ne rend QUE le corps de
 * la fiche, calqué sur `EquipementDetail`.
 */
export function GammeDetail({
  gamme,
  siteId,
  canEdit,
}: {
  gamme: GammeRow
  siteId: string
  canEdit: boolean
}) {
  const { session } = useAuth()
  const [tab, setTab] = useState<Tab>('ordres')
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  // Dialogues d'ajout pilotés ICI → leur déclencheur vit dans la TOP BAR (via
  // useTabAddAction), plus dans un en-tête de section.
  const [createOtOpen, setCreateOtOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  // Fichiers issus d'un glisser-déposer pleine page → pré-remplissent l'upload.
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])

  // Glisser-déposer sur TOUTE la page (réservé aux éditeurs) : un dépôt bascule
  // sur l'onglet Documents et ouvre l'upload pré-rempli des fichiers.
  const { dragging } = useFileDrop({
    enabled: canEdit,
    onFiles: (files) => {
      setDroppedFiles(files)
      setTab('documents')
      setUploadOpen(true)
    },
  })
  // Fermeture de l'upload : on oublie les fichiers déposés pour repartir propre.
  const handleUploadOpenChange = (open: boolean) => {
    setUploadOpen(open)
    if (!open) setDroppedFiles([])
  }

  // Bouton « ajouter » de la top bar, DYNAMIQUE selon l'onglet actif (Opérations
  // exclu : il garde son propre bouton interne). Enregistré via le contexte
  // d'actions consommé par l'en-tête de l'explorateur.
  const addAction = useMemo<(() => void) | null>(() => {
    if (!canEdit) return null
    // Création d'OT seulement pour une gamme ACTIVE (sinon le backend refuse) ;
    // la gamme courante est pré-remplie et verrouillée dans le dialog.
    if (tab === 'ordres')
      return gamme.est_active ? () => setCreateOtOpen(true) : null
    if (tab === 'equipements') return () => setLinkOpen(true)
    if (tab === 'documents')
      return () => {
        setDroppedFiles([])
        setUploadOpen(true)
      }
    return null
  }, [tab, canEdit, gamme.est_active])
  const addLabel =
    tab === 'ordres'
      ? 'Nouvel ordre de travail'
      : tab === 'equipements'
        ? 'Lier des équipements'
        : tab === 'documents'
          ? 'Rattacher un document'
          : 'Ajouter'
  useTabAddAction(addAction, addLabel, {
    // Icône fidèle au bouton d'origine de chaque onglet (déplacé en top bar) :
    // Paperclip pour « Rattacher un document », Plus partout ailleurs.
    icon: tab === 'documents' ? Paperclip : Plus,
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6 lg:px-8">
      {/* Barre d'onglets FIXE (toujours visible). SEUL le contenu défile → la
          scrollbar apparaît DANS la liste (OT…), sous les onglets. */}
      <div className="shrink-0">
        {/* Carte de la gamme — pour l'instant SEULE la vignette (autres infos à
            ajouter plus tard). Conteneur calqué sur la carte média de ListRow. */}
        <div className="bg-card mb-4 flex h-20 items-stretch overflow-hidden rounded-lg border">
          <div className="aspect-square h-full shrink-0">
            <MiniatureThumb
              url={urlOf(gamme.miniature_id)}
              fallback={<Wrench className="size-10" />}
              alt=""
              onError={refreshMiniatures}
              className="size-full rounded-none"
            />
          </div>
        </div>
        <SubTabs
          ariaLabel="Sections de la gamme"
          variant="segmented"
          value={tab}
          onValueChange={setTab}
          items={[
            {
              id: 'ordres',
              label: 'Ordres de travail',
              icon: <ClipboardList className="size-4" />,
            },
            {
              id: 'operations',
              label: 'Opérations',
              icon: <ListChecks className="size-4" />,
            },
            {
              id: 'equipements',
              label: 'Équipements',
              icon: <Wrench className="size-4" />,
            },
            {
              id: 'documents',
              label: 'Documents',
              icon: <FileText className="size-4" />,
            },
          ]}
        />
      </div>

      {/* SEULE zone défilante. Padding horizontale + marge basse portées par le
          CONTENEUR (px/pb-6). `no-scrollbar` masque la barre. L'onglet Opérations
          est un SPLIT 50/50 → la zone doit être BORNÉE en >= lg (overflow-hidden
          + flex-col) pour que ses deux panneaux défilent ; autres onglets : flux
          défilant normal. */}
      <div
        className={cn(
          'no-scrollbar relative min-h-0 flex-1 overflow-y-auto',
          tab === 'operations' && 'flex flex-col lg:overflow-hidden',
        )}
      >
        {tab === 'ordres' && (
          <OtListeParGammes siteId={siteId} gammeIds={[gamme.id]} />
        )}
        {tab === 'operations' && (
          <OperationsTab
            gammeId={gamme.id}
            gammeSiteId={gamme.site_id}
            canEdit={canEdit}
          />
        )}
        {tab === 'equipements' && (
          <EquipementsTab
            siteId={siteId}
            gammeId={gamme.id}
            canEdit={canEdit}
            linkOpen={linkOpen}
            onLinkOpenChange={setLinkOpen}
          />
        )}
        {tab === 'documents' && (
          <DocumentsTab
            liaison="documents_gammes"
            parentColumn="gamme_id"
            parentId={gamme.id}
            uploadOpen={uploadOpen}
            onUploadOpenChange={handleUploadOpenChange}
            uploadInitialFiles={droppedFiles}
          />
        )}
        {/* Surcouche de glisser-déposer pleine page (réservée aux éditeurs). */}
        {canEdit && <FileDropOverlay show={dragging} />}
      </div>

      {session && (
        <OtCreateDialog
          key={createOtOpen ? 'open' : 'closed'}
          open={createOtOpen}
          onOpenChange={setCreateOtOpen}
          siteId={siteId}
          createdBy={session.user.id}
          presetGammeId={gamme.id}
        />
      )}
    </div>
  )
}

// --- Onglet Opérations ---

function OperationsTab({
  gammeId,
  gammeSiteId,
  canEdit,
}: {
  gammeId: string
  gammeSiteId: string | null
  canEdit: boolean
}) {
  const query = useQuery(gammesQueries.operations(gammeId))
  const del = useDeleteOperation()
  const [form, setForm] = useState<{
    open: boolean
    op: GammeOperation | null
  }>({ open: false, op: null })
  const [toDelete, setToDelete] = useState<GammeOperation | null>(null)

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Opération supprimée')
        setToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  // « Ajouter une opération » : icône seule + tooltip, dans l'en-tête de SA section
  // (calque exact de « Importer un modèle » de GammeModelesSection).
  const addButton = canEdit ? (
    <TooltipIconButton
      icon={<Plus />}
      label="Ajouter une opération"
      onClick={() => setForm({ open: true, op: null })}
    />
  ) : undefined

  return (
    <>
      <SplitPanes>
        <SplitPane
          header={
            <SectionHeader
              icon={ListChecks}
              title="Opérations spécifiques"
              action={addButton}
            />
          }
        >
          <QueryState
            query={query}
            pending={<ListRowSkeletons dense count={3} />}
            empty={<EmptyState icon={ListChecks} title="Aucune opération" />}
          >
            {(operations) => (
              <div className={listStack}>
                {operations.map((op) => {
                  const rowActions: RowAction[] = []
                  if (canEdit) {
                    rowActions.push({
                      label: 'Modifier',
                      icon: Pencil,
                      onSelect: () => setForm({ open: true, op }),
                    })
                    rowActions.push({
                      label: 'Supprimer',
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => setToDelete(op),
                    })
                  }
                  return (
                    <OperationRow
                      key={op.id}
                      nom={op.nom}
                      description={op.description}
                      typeLibelle={op.types_operations.libelle}
                      necessiteSeuils={op.types_operations.necessite_seuils}
                      seuilMin={op.seuil_minimum}
                      seuilMax={op.seuil_maximum}
                      uniteSymbole={op.unites?.symbole}
                      menuActions={rowActions.length ? rowActions : undefined}
                    />
                  )
                })}
              </div>
            )}
          </QueryState>
        </SplitPane>
        <GammeModelesSection
          fill
          gammeId={gammeId}
          gammeSiteId={gammeSiteId}
          canEdit={canEdit}
        />
      </SplitPanes>

      {canEdit && (
        <OperationFormDialog
          key={`op-${form.op?.id ?? 'new'}-${String(form.open)}`}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          gammeId={gammeId}
          operation={form.op}
        />
      )}

      <ConfirmDeleteDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        entityLabel={
          toDelete ? `l’opération « ${toDelete.nom} »` : 'l’opération'
        }
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </>
  )
}

// --- Onglet Équipements ---

function EquipementsTab({
  siteId,
  gammeId,
  canEdit,
  linkOpen,
  onLinkOpenChange,
}: {
  siteId: string
  gammeId: string
  canEdit: boolean
  linkOpen: boolean
  onLinkOpenChange: (open: boolean) => void
}) {
  const equipementsQuery = useQuery(equipementsQueries.list(siteId))
  const liesQuery = useQuery(gammesQueries.equipementsLies(gammeId))
  const liesIds = liesQuery.data ?? []

  const lies = useMemo(() => {
    const equipements = equipementsQuery.data ?? []
    const ids = liesQuery.data ?? []
    return equipements.filter((e) => e.id !== null && ids.includes(e.id))
  }, [equipementsQuery.data, liesQuery.data])

  return (
    <>
      <QueryState
        query={liesQuery}
        pending={<ListRowSkeletons dense count={3} />}
      >
        {() =>
          lies.length === 0 ? (
            <EmptyState icon={Wrench} title="Aucun équipement" />
          ) : (
            <div className={listStack}>
              {lies.map((e) => (
                <ListRow
                  key={e.id ?? ''}
                  media={<RowMediaIcon icon={Wrench} />}
                  title={e.nom}
                  badges={
                    e.code_inventaire ? (
                      <Badge variant="secondary">{e.code_inventaire}</Badge>
                    ) : undefined
                  }
                  mobileMeta={e.code_inventaire ?? undefined}
                />
              ))}
            </div>
          )
        }
      </QueryState>

      {canEdit && (
        <EquipementsLinkDialog
          key={liesIds.join(',')}
          open={linkOpen}
          onOpenChange={onLinkOpenChange}
          siteId={siteId}
          gammeId={gammeId}
          current={liesIds}
        />
      )}
    </>
  )
}
