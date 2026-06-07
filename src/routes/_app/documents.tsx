import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Download, FileText, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  documentsQueries,
  typesDocumentsQueries,
} from '@/features/documents/queries'
import {
  useDeleteDocument,
  useUploadDocument,
} from '@/features/documents/mutations'
import { getSignedUrl } from '@/features/documents/upload'
import { formatMime, formatTaille } from '@/features/documents/format'
import type { DocumentMeta } from '@/features/documents/format'
import { UploadDocumentDialog } from '@/features/documents/components/upload-document-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { errorMessage } from '@/lib/form'
import { cardGrid } from '@/lib/responsive'
import { formatDate } from '@/lib/date'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/_app/documents')({
  component: DocumentsPage,
})

function DocumentsPage() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
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

  return <DocumentsContent siteId={activeSiteId} canManage={canManage} />
}

function DocumentsContent({
  siteId,
  canManage,
}: {
  siteId: string
  canManage: boolean
}) {
  const query = useQuery(documentsQueries.list(siteId))
  const { data: types = [] } = useQuery(typesDocumentsQueries.list())
  const upload = useUploadDocument()
  const del = useDeleteDocument()

  const [uploadOpen, setUploadOpen] = useState(false)
  const [toDelete, setToDelete] = useState<DocumentMeta | null>(null)
  const [search, setSearch] = useState('')

  const typeNom = useMemo(
    () => new Map(types.map((t) => [t.id, t.nom])),
    [types],
  )

  async function handleDownload(doc: DocumentMeta) {
    try {
      const url = await getSignedUrl(doc.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

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

  const newButton = canManage ? (
    <Button onClick={() => setUploadOpen(true)}>
      <Plus /> Ajouter un document
    </Button>
  ) : undefined

  return (
    <PageContainer>
      <PageHeader
        title="Documents"
        description="Bibliothèque documentaire du site (PDF, attestations, rapports…)."
        action={newButton}
      />

      {!query.isPending && !query.isError && query.data.length > 0 && (
        <div className="relative mb-4 max-w-sm">
          <Search className="text-muted-foreground absolute top-1/2 left-2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom…"
            className="pl-8"
          />
        </div>
      )}

      <QueryState
        query={query}
        pending={<CardSkeletons count={4} height="h-36" />}
        empty={
          <EmptyState
            icon={FileText}
            title="Aucun document"
            description={
              canManage
                ? 'Ajoute un premier document à la bibliothèque du site.'
                : 'Aucun document enregistré pour ce site.'
            }
            action={newButton}
          />
        }
      >
        {(documents) => {
          const q = search.trim().toLowerCase()
          const filtered = documents.filter((d) =>
            d.nom_original.toLowerCase().includes(q),
          )
          if (filtered.length === 0)
            return (
              <EmptyState
                icon={Search}
                title="Aucun résultat"
                description="Aucun document ne correspond à ta recherche."
              />
            )
          return (
            <div className={cardGrid.default}>
              {filtered.map((doc) => (
                <Card key={doc.id} className="min-w-0">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle
                        className="truncate text-base"
                        title={doc.nom_original}
                      >
                        {doc.nom_original}
                      </CardTitle>
                      <Badge variant="secondary" className="shrink-0">
                        {formatMime(doc.mime_type)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm">
                    <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
                      <dt>Type</dt>
                      <dd className="text-foreground text-right">
                        {typeNom.get(doc.type_document_id) ?? '—'}
                      </dd>
                      <dt>Taille</dt>
                      <dd className="text-foreground text-right tabular-nums">
                        {formatTaille(doc.taille_octets)}
                      </dd>
                      <dt>Ajouté le</dt>
                      <dd className="text-foreground text-right tabular-nums">
                        {formatDate(doc.uploaded_at)}
                      </dd>
                    </dl>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDownload(doc)}
                      >
                        <Download /> Télécharger
                      </Button>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToDelete(doc)}
                        >
                          <Trash2 /> Supprimer
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        }}
      </QueryState>

      {canManage && (
        <UploadDocumentDialog
          key={uploadOpen ? 'open' : 'closed'}
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          siteId={siteId}
          onUpload={({ file, uploadedBy, typeDocumentId }) =>
            upload.mutateAsync({ file, siteId, uploadedBy, typeDocumentId })
          }
          pending={upload.isPending}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer le document ?"
        description={
          toDelete
            ? `« ${toDelete.nom_original} » sera placé dans la corbeille (récupérable 90 jours).`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </PageContainer>
  )
}
