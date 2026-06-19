import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Download, FileText, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  documentsQueries,
  typesDocumentsQueries,
} from '@/features/documents/queries'
import {
  useDeleteDocument,
  useUploadDocument,
} from '@/features/documents/mutations'
import type { DocumentMeta } from '@/features/documents/format'
import { useDocumentDownload } from '@/features/documents/use-document-download'
import { UploadDocumentDialog } from '@/features/documents/components/upload-document-dialog'
import { DocumentPreviewDialog } from '@/features/documents/components/document-preview-dialog'
import { DocumentRow } from '@/features/documents/components/document-row'
import { useFileDrop } from '@/hooks/use-file-drop'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { deleteErrorMessage } from '@/lib/form'
import { requireNav } from '@/lib/nav-guard'
import { listStack } from '@/lib/responsive'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { NoSearchResults } from '@/components/common/no-search-results'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { SearchInput } from '@/components/common/search-input'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

export const Route = createFileRoute('/_app/documents')({
  beforeLoad: ({ context }) => requireNav('/documents', context.queryClient),
  component: DocumentsPage,
})

function DocumentsPage() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  // Hard-delete d'un document = admin uniquement (RLS `documents_admin_all`).
  const canDelete = perm.isAdmin(role)
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Documents"
        description="Bibliothèque documentaire du site."
        hint="Choisis un site pour consulter sa bibliothèque documentaire."
        icon={FileText}
      />
    )
  }

  return (
    <DocumentsContent
      siteId={activeSiteId}
      canManage={canManage}
      canDelete={canDelete}
    />
  )
}

function DocumentsContent({
  siteId,
  canManage,
  canDelete,
}: {
  siteId: string
  canManage: boolean
  canDelete: boolean
}) {
  const query = useQuery(documentsQueries.list(siteId))
  const { data: types = [] } = useQuery(typesDocumentsQueries.list())
  const upload = useUploadDocument()
  const del = useDeleteDocument()
  const download = useDocumentDownload()

  const [uploadOpen, setUploadOpen] = useState(false)
  // Fichiers issus d'un glisser-déposer sur la page → pré-remplis dans le dialogue.
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
  const [toDelete, setToDelete] = useState<DocumentMeta | null>(null)
  const [toPreview, setToPreview] = useState<DocumentMeta | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const typeNom = useMemo(
    () => new Map(types.map((t) => [t.id, t.nom])),
    [types],
  )

  // Ouverture manuelle (bouton) : aucun fichier pré-rempli.
  function openUploadEmpty() {
    setDroppedFiles([])
    setUploadOpen(true)
  }
  function handleUploadOpenChange(open: boolean) {
    setUploadOpen(open)
    if (!open) setDroppedFiles([])
  }
  // Glisser-déposer sur TOUTE la page (réservé aux rôles pouvant ajouter).
  const { dragging } = useFileDrop({
    enabled: canManage,
    onFiles: (files) => {
      setDroppedFiles(files)
      setUploadOpen(true)
    },
  })

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Document supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  const hasDocuments = (query.data?.length ?? 0) > 0
  const newButton = canManage ? (
    <Button onClick={openUploadEmpty}>
      <Plus /> Ajouter un document
    </Button>
  ) : undefined

  return (
    <PageContainer fill>
      {/* En-tête + barre de filtres : FIXES (hors de la zone défilante). */}
      <div className="shrink-0 px-4 pt-6 sm:px-6 lg:px-8">
        <PageHeader
          title="Documents"
          description="Bibliothèque documentaire du site (PDF, attestations, rapports…)."
          action={
            canManage ? (
              <TooltipIconButton
                icon={<Plus />}
                label="Ajouter un document"
                variant="outline"
                onClick={openUploadEmpty}
              />
            ) : undefined
          }
        />
        {hasDocuments && (
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Rechercher un document…"
              className="flex-1"
            />
            <Select
              aria-label="Filtrer par type de document"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="sm:w-56"
            >
              <option value="">Tous les types</option>
              {types.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.nom}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* Liste : SEULE zone défilante ; se met en valeur pendant le drag (le drop
          reste possible n'importe où sur la page, cf. useFileDrop). */}
      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto px-4 pb-6 sm:px-6 lg:px-8">
          <QueryState
            query={query}
            pending={<ListRowSkeletons count={6} />}
            empty={
              <EmptyState
                icon={FileText}
                title="Aucun document"
                description={
                  canManage
                    ? 'Ajoute un premier document (ou glisse-le sur la page).'
                    : 'Aucun document enregistré pour ce site.'
                }
                action={newButton}
              />
            }
          >
            {(documents) => {
              const q = search.trim().toLowerCase()
              const shown = documents.filter((d) => {
                const okType =
                  typeFilter === '' ||
                  String(d.type_document_id) === typeFilter
                const okNom = q === '' || d.nom_original.toLowerCase().includes(q)
                return okType && okNom
              })
              if (shown.length === 0)
                return (
                  <NoSearchResults description="Aucun document ne correspond à ces critères." />
                )
              return (
                <div className={listStack}>
                  {shown.map((doc) => (
                    <DocumentRow
                      key={doc.id}
                      doc={doc}
                      onClick={() => setToPreview(doc)}
                      badges={
                        <Badge variant="secondary">
                          {typeNom.get(doc.type_document_id) ?? '—'}
                        </Badge>
                      }
                      mobileMeta={typeNom.get(doc.type_document_id)}
                      actions={
                        <>
                          <TooltipIconButton
                            icon={<Download />}
                            label="Télécharger"
                            onClick={() => void download(doc)}
                          />
                          {canDelete && (
                            <TooltipIconButton
                              icon={<Trash2 className="text-destructive" />}
                              label="Supprimer définitivement"
                              onClick={() => setToDelete(doc)}
                            />
                          )}
                        </>
                      }
                    />
                  ))}
                </div>
              )
            }}
          </QueryState>
        </div>
        {dragging && (
          <div className="border-primary bg-primary/5 pointer-events-none absolute inset-x-4 top-0 bottom-6 rounded-lg border-2 border-dashed sm:inset-x-6 lg:inset-x-8" />
        )}
      </div>

      {canManage && (
        <UploadDocumentDialog
          key={uploadOpen ? 'open' : 'closed'}
          open={uploadOpen}
          onOpenChange={handleUploadOpenChange}
          siteId={siteId}
          initialFiles={droppedFiles}
          onUpload={({ file, uploadedBy, typeDocumentId }) =>
            upload.mutateAsync({ file, siteId, uploadedBy, typeDocumentId })
          }
          pending={upload.isPending}
        />
      )}

      <ConfirmDeleteDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        entityLabel={
          toDelete ? `le document « ${toDelete.nom_original} »` : 'le document'
        }
        warning="Suppression définitive : le document est retiré de toutes les fiches où il est rattaché et effacé du stockage."
        loading={del.isPending}
        onConfirm={confirmDelete}
      />

      <DocumentPreviewDialog
        doc={toPreview}
        onOpenChange={(open) => {
          if (!open) setToPreview(null)
        }}
      />
    </PageContainer>
  )
}
