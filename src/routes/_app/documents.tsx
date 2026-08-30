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
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { requireNav } from '@/lib/nav-guard'
import {
  PageContainer,
  FillHeader,
  ScrollBody,
} from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import { NoSearchResults } from '@/components/common/no-search-results'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/documents/page-meta'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import {
  FILTRE_TOUS,
  ListFilterBar,
  matchTypeFilter,
  typeFilterOptions,
} from '@/components/common/list-filter-bar'
import { DocumentsListe } from '@/components/common/documents-liste'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_app/documents')({
  beforeLoad: ({ context }) => requireNav('/documents', context.queryClient),
  component: DocumentsPage,
})

function DocumentsPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, canManage }) => (
        // Hard-delete d'un document = manager + technicien sur leurs sites
        // (migration 053) : même permission que la gestion.
        <DocumentsContent
          siteId={siteId}
          canManage={canManage}
          canDelete={canManage}
        />
      )}
    </SiteScopedRoute>
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
  // Liste en LIVE (upload/suppression visible sans F5, comme le dashboard).
  useRealtimeRefresh('documents', documentsQueries.all())
  const { data: types = [] } = useQuery(typesDocumentsQueries.list())
  const upload = useUploadDocument()
  const del = useDeleteDocument()

  const up = useUploadDrop({ enabled: canManage })
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState(FILTRE_TOUS)

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
          title={PAGE_META.titre}
          description={PAGE_META.description}
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
              options={typeFilterOptions(types)}
              filterLabel="Filtrer par type de document"
            />
          </div>
        )}
      </FillHeader>

      {/* Liste : SEULE zone défilante ; se met en valeur pendant le drag (le drop
          reste possible n'importe où sur la page, cf. useFileDrop). */}
      <ScrollBody className="relative">
        <QueryState
          query={query}
          // size sm : la densité réelle des DocumentRow (h-14). Le défaut md
          // annonçait des lignes h-20, d'où un saut au chargement.
          // count 6 : la page occupe toute la hauteur, 4 lignes (le défaut)
          // laissaient un grand vide sous le squelette.
          pending={<ListRowSkeletons size="sm" count={6} />}
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
              const okType = matchTypeFilter(d.type_document_id, typeFilter)
              const okNom = q === '' || d.nom_original.toLowerCase().includes(q)
              return okType && okNom
            })
            if (shown.length === 0)
              return (
                <NoSearchResults
                  description="Aucun document ne correspond à ces critères."
                  // « Afficher tout » n'apparaît que si quelque chose est
                  // effectivement masqué : un filtre non neutre, ou une
                  // recherche en cours.
                  onReset={
                    typeFilter !== FILTRE_TOUS || search !== ''
                      ? () => {
                          setSearch('')
                          setTypeFilter(FILTRE_TOUS)
                        }
                      : undefined
                  }
                />
              )
            return (
              <DocumentsListe
                docs={shown}
                canEdit={canManage}
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
        <FileDropOverlay show={up.dragging} />
      </ScrollBody>

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
