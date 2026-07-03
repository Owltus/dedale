import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { FileText, Plus } from 'lucide-react'
import {
  documentsQueries,
  typesDocumentsQueries,
} from '@/features/documents/queries'
import {
  useDeleteDocument,
  useUploadDocument,
} from '@/features/documents/mutations'
import { UploadDocumentDialog } from '@/features/documents/components/upload-document-dialog'
import { useUploadDrop } from '@/hooks/use-upload-drop'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { requireNav } from '@/lib/nav-guard'
import * as perm from '@/lib/permissions'
import { PageContainer, FillHeader } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import { NoSearchResults } from '@/components/common/no-search-results'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { ListFilterBar } from '@/components/common/list-filter-bar'
import { DocumentsListe } from '@/components/common/documents-liste'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_app/documents')({
  beforeLoad: ({ context }) => requireNav('/documents', context.queryClient),
  component: DocumentsPage,
})

function DocumentsPage() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  // Hard-delete d'un document = manager + technicien sur leurs sites (migration 053).
  const canDelete = perm.canManageMetier(role)
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

  const up = useUploadDrop({ enabled: canManage })
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const typeNom = useMemo(
    () => new Map(types.map((t) => [t.id, t.nom])),
    [types],
  )

  const hasDocuments = (query.data?.length ?? 0) > 0
  const newButton = canManage ? (
    <Button onClick={up.openUploadEmpty}>
      <Plus /> Ajouter un document
    </Button>
  ) : undefined

  return (
    <PageContainer fill>
      {/* En-tête + barre de filtres : FIXES (hors de la zone défilante). */}
      <FillHeader>
        <PageHeader
          title="Documents"
          description="Bibliothèque documentaire du site (PDF, attestations, rapports…)."
          action={
            canManage ? (
              <TooltipIconButton
                icon={<Plus />}
                label="Ajouter un document"
                variant="outline"
                onClick={up.openUploadEmpty}
              />
            ) : undefined
          }
        />
        {hasDocuments && (
          <div className="mb-4">
            <ListFilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Rechercher un document…"
              filterValue={typeFilter}
              onFilterChange={setTypeFilter}
              options={[
                { value: '', label: 'Tous les types' },
                ...types.map((t) => ({ value: String(t.id), label: t.nom })),
              ]}
              filterLabel="Filtrer par type de document"
            />
          </div>
        )}
      </FillHeader>

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
                <DocumentsListe
                  docs={shown}
                  canDelete={canDelete}
                  onDelete={(doc) => del.mutateAsync(doc.id)}
                  badges={(doc) => (
                    <Badge variant="secondary">
                      {typeNom.get(doc.type_document_id) ?? '—'}
                    </Badge>
                  )}
                  mobileMeta={(doc) => typeNom.get(doc.type_document_id)}
                />
              )
            }}
          </QueryState>
        </div>
        <FileDropOverlay show={up.dragging} />
      </div>

      {canManage && (
        <UploadDocumentDialog
          key={up.uploadOpen ? 'open' : 'closed'}
          open={up.uploadOpen}
          onOpenChange={up.onUploadOpenChange}
          siteId={siteId}
          initialFiles={up.droppedFiles}
          onUpload={({ file, uploadedBy, typeDocumentId }) =>
            upload.mutateAsync({ file, siteId, uploadedBy, typeDocumentId })
          }
          pending={upload.isPending}
        />
      )}
    </PageContainer>
  )
}
