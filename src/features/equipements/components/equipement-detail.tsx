import { useMemo, useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  ClipboardList,
  Package,
  Paperclip,
  Plus,
  Tag,
  Wrench,
} from 'lucide-react'
import { equipementsQueries } from '../queries'
import { gammesQueries } from '@/features/gammes/queries'
import { OtListeParGammes } from '@/features/ordres-travail/components/ot-liste-par-gammes'
import { GammesLinkDialog } from './gammes-link-dialog'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { useFileDrop } from '@/hooks/use-file-drop'
import { parseChamps, formatChampValeur } from '@/lib/champs'
import { formatDate } from '@/lib/date'
import { listStack } from '@/lib/responsive'
import { useTabAddAction } from '@/components/common/tab-actions'
import { DetailHeaderCard } from '@/components/common/detail-header-card'
import {
  DetailTabsShell,
  ONGLET_ETAT_VIDE,
} from '@/components/common/detail-tabs-shell'
import { DocumentsTab } from '@/components/common/documents-tab'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import type { Database } from '@/lib/database.types'

type Equipement = Database['public']['Views']['v_equipements_complet']['Row']

type Tab = 'caracteristiques' | 'gammes' | 'ordres' | 'documents'

/**
 * CONTENU de la fiche d'un équipement : système à onglets (Caractéristiques /
 * Gammes / Ordres de travail / Documents), calqué sur `GammeDetail`
 * (features/gammes/components/) — même brique `DetailTabsShell`, même patron
 * de liaison N–N (gammes_equipements, table déjà utilisée en sens inverse par
 * la fiche gamme). L'EN-TÊTE (fil d'Ariane + action « Modifier ») et la
 * navigation restent portés par l'explorateur parent (`EquipementsExplorer`) —
 * ce composant ne rend QUE le corps de la fiche.
 */
export function EquipementDetail({
  equipement,
  siteId,
  canEdit,
}: {
  equipement: Equipement
  siteId: string
  canEdit: boolean
}) {
  const equipementId = equipement.id ?? ''
  const [tab, setTab] = useState<Tab>('caracteristiques')
  const specs = parseChamps(equipement.specifications)
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  const liesQuery = useQuery(equipementsQueries.gammesLiees(equipementId))
  const liesIds = liesQuery.data ?? []

  const [linkOpen, setLinkOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  // Fichiers issus d'un glisser-déposer pleine page → pré-remplissent l'upload.
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])

  // Glisser-déposer sur TOUTE la page (réservé aux éditeurs) : un dépôt bascule
  // sur l'onglet Documents et ouvre l'upload pré-rempli des fichiers — même
  // patron que GammeDetail.
  const { dragging } = useFileDrop({
    enabled: canEdit,
    onFiles: (files) => {
      setDroppedFiles(files)
      setTab('documents')
      setUploadOpen(true)
    },
  })
  const handleUploadOpenChange = (open: boolean) => {
    setUploadOpen(open)
    if (!open) setDroppedFiles([])
  }

  // Bouton « ajouter » de la top bar, DYNAMIQUE selon l'onglet actif — même
  // patron que GammeDetail (Caractéristiques/Ordres exclus : lecture seule).
  const addAction = useMemo<(() => void) | null>(() => {
    if (!canEdit) return null
    if (tab === 'gammes') return () => setLinkOpen(true)
    if (tab === 'documents')
      return () => {
        setDroppedFiles([])
        setUploadOpen(true)
      }
    return null
  }, [tab, canEdit])
  const addLabel =
    tab === 'gammes'
      ? 'Lier des gammes'
      : tab === 'documents'
        ? 'Rattacher un document'
        : 'Ajouter'
  useTabAddAction(addAction, addLabel, {
    icon: tab === 'documents' ? Paperclip : Plus,
  })

  return (
    <>
      <DetailTabsShell
        className="px-4 pb-6 sm:px-6 lg:px-8"
        tabsAriaLabel="Sections de l'équipement"
        headerCard={
          <DetailHeaderCard
            columns={2}
            thumbnail={
              <MiniatureThumb
                url={urlOf(equipement.miniature_id)}
                fallback={<Package className="size-10" />}
                alt=""
                onError={refreshMiniatures}
                className="size-full rounded-none"
              />
            }
            fields={[
              { label: 'Catégorie', value: equipement.categorie_nom },
              {
                label: 'Emplacement',
                value: equipement.localisation_complete ?? equipement.local_nom,
              },
              {
                label: 'Mise en service',
                value: formatDate(equipement.date_mise_en_service),
              },
              {
                label: 'Fin de garantie',
                value: formatDate(equipement.date_fin_garantie),
              },
            ]}
          />
        }
        items={[
          { id: 'caracteristiques', label: 'Caractéristiques' },
          { id: 'gammes', label: 'Gammes' },
          { id: 'ordres', label: 'Ordres de travail' },
          { id: 'documents', label: 'Documents' },
        ]}
        value={tab}
        onValueChange={setTab}
        overlay={canEdit ? <FileDropOverlay show={dragging} /> : undefined}
      >
        {() => (
          <>
            {tab === 'caracteristiques' && (
              <CaracteristiquesTab specs={specs} />
            )}
            {tab === 'gammes' && (
              <GammesTab siteId={siteId} liesQuery={liesQuery} />
            )}
            {tab === 'ordres' &&
              (liesIds.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="Aucune gamme liée"
                  description="Lie une gamme dans l'onglet Gammes pour voir ses ordres de travail ici."
                  className={ONGLET_ETAT_VIDE}
                />
              ) : (
                <OtListeParGammes siteId={siteId} gammeIds={liesIds} />
              ))}
            {tab === 'documents' && (
              <DocumentsTab
                liaison="documents_equipements"
                parentColumn="equipement_id"
                parentId={equipementId}
                uploadOpen={uploadOpen}
                onUploadOpenChange={handleUploadOpenChange}
                uploadInitialFiles={droppedFiles}
                className="min-h-full"
              />
            )}
          </>
        )}
      </DetailTabsShell>

      {canEdit && (
        <GammesLinkDialog
          key={liesIds.join(',')}
          open={linkOpen}
          onOpenChange={setLinkOpen}
          siteId={siteId}
          equipementId={equipementId}
          current={liesIds}
        />
      )}
    </>
  )
}

// --- Onglet Caractéristiques ---

function CaracteristiquesTab({
  specs,
}: {
  specs: ReturnType<typeof parseChamps>
}) {
  if (specs.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Aucune caractéristique"
        description="Aucune caractéristique technique renseignée pour cet équipement."
        className={ONGLET_ETAT_VIDE}
      />
    )
  }
  return (
    <dl className={listStack}>
      {specs.map((champ, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
        >
          <Tag className="size-4 shrink-0 text-muted-foreground" />
          <dt className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {champ.cle}
          </dt>
          <dd className="max-w-[60%] text-right text-sm font-medium break-words">
            {formatChampValeur(champ, champ.valeur ?? null)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

// --- Onglet Gammes ---

function GammesTab({
  siteId,
  liesQuery,
}: {
  siteId: string
  liesQuery: UseQueryResult<string[]>
}) {
  const gammesQuery = useQuery(gammesQueries.list(siteId))

  const lies = useMemo(() => {
    const gammes = gammesQuery.data ?? []
    const liesIds = liesQuery.data ?? []
    return gammes.filter((g) => liesIds.includes(g.id))
  }, [gammesQuery.data, liesQuery.data])

  return (
    <QueryState query={liesQuery} pending={<ListRowSkeletons count={3} />}>
      {() =>
        lies.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="Aucune gamme"
            className={ONGLET_ETAT_VIDE}
          />
        ) : (
          <div className={listStack}>
            {lies.map((g) => (
              <ListRow
                key={g.id}
                media={<RowMediaIcon icon={Wrench} />}
                title={g.nom}
                subtitle={
                  g.description?.trim() ? g.description.trim() : undefined
                }
              />
            ))}
          </div>
        )
      }
    </QueryState>
  )
}
