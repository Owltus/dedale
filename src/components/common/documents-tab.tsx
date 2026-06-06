import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileText, Link2Off, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { documentsQueries } from '@/features/documents/queries'
import type { LiaisonTable } from '@/features/documents/queries'
import {
  useDetachDocument,
  useUploadAndAttach,
} from '@/features/documents/mutations'
import { getSignedUrl } from '@/features/documents/upload'
import {
  formatDate,
  formatMime,
  formatTaille,
} from '@/features/documents/format'
import type { DocumentMeta } from '@/features/documents/format'
import { UploadDocumentDialog } from '@/features/documents/components/upload-document-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { errorMessage } from '@/lib/form'
import * as perm from '@/lib/permissions'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface DocumentsTabProps {
  /** Nom de la table de liaison (ex. 'documents_ordres_travail'). */
  liaison: LiaisonTable
  /** Colonne FK vers l'entité parente (ex. 'ordre_travail_id'). */
  parentColumn: string
  /** Id de l'entité parente à laquelle rattacher les documents. */
  parentId: string
}

/**
 * Onglet « Documents » réutilisable, à embarquer dans les fiches métier
 * (OT, gammes, contrats, prestataires, locaux, équipements, DI…).
 *
 * Liste les documents rattachés à une entité via sa table de liaison,
 * permet d'uploader+rattacher (doctrine 3 étapes a+b+c) et de détacher.
 */
export function DocumentsTab({
  liaison,
  parentColumn,
  parentId,
}: DocumentsTabProps) {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const { activeSiteId } = useSiteContext()

  const query = useQuery(
    documentsQueries.byEntity(liaison, parentColumn, parentId),
  )

  const uploadAttach = useUploadAndAttach()
  const detach = useDetachDocument()

  const [uploadOpen, setUploadOpen] = useState(false)
  const [toDetach, setToDetach] = useState<DocumentMeta | null>(null)

  async function handleDownload(doc: DocumentMeta) {
    try {
      const url = await getSignedUrl(doc.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  function confirmDetach() {
    if (!toDetach) return
    detach.mutate(
      { liaison, parentColumn, parentId, documentId: toDetach.id },
      {
        onSuccess: () => {
          toast.success('Document détaché')
          setToDetach(null)
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  const addButton =
    canManage && activeSiteId ? (
      <Button size="sm" onClick={() => setUploadOpen(true)}>
        <Plus /> Rattacher un document
      </Button>
    ) : undefined

  // Le rattachement insère le `site_id` du site actif sur le document.
  if (!activeSiteId) {
    return (
      <EmptyState
        icon={FileText}
        title="Aucun site actif"
        description="Sélectionne un site pour gérer les documents."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{addButton}</div>

      <QueryState
        query={query}
        pending={
          <CardSkeletons
            count={3}
            height="h-14"
            container="flex flex-col gap-2"
          />
        }
        empty={
          <EmptyState
            icon={FileText}
            title="Aucun document rattaché"
            description={
              canManage
                ? 'Rattache un document à cette fiche.'
                : 'Aucun document rattaché à cette fiche.'
            }
            action={addButton}
          />
        }
      >
        {(list) => (
          <ul className="flex flex-col gap-2">
            {list.map((doc) => (
              <li
                key={doc.id}
                className="bg-card flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <FileText className="text-muted-foreground size-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium"
                      title={doc.nom_original}
                    >
                      {doc.nom_original}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatTaille(doc.taille_octets)} ·{' '}
                      {formatDate(doc.uploaded_at)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {formatMime(doc.mime_type)}
                  </Badge>
                </div>
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
                      onClick={() => setToDetach(doc)}
                    >
                      <Link2Off /> Détacher
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      {canManage && (
        <UploadDocumentDialog
          key={uploadOpen ? 'open' : 'closed'}
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          siteId={activeSiteId}
          title="Rattacher un document"
          description="Le document est ajouté à la bibliothèque du site puis rattaché à cette fiche."
          onUpload={({ file, uploadedBy, typeDocumentId }) =>
            uploadAttach.mutateAsync({
              file,
              siteId: activeSiteId,
              uploadedBy,
              typeDocumentId,
              liaison,
              parentColumn,
              parentId,
            })
          }
          pending={uploadAttach.isPending}
        />
      )}

      <ConfirmDialog
        open={toDetach !== null}
        onOpenChange={(open) => {
          if (!open) setToDetach(null)
        }}
        title="Détacher le document ?"
        description={
          toDetach
            ? `« ${toDetach.nom_original} » sera retiré de cette fiche. Le document reste dans la bibliothèque du site.`
            : undefined
        }
        confirmLabel="Détacher"
        loading={detach.isPending}
        onConfirm={confirmDetach}
      />
    </div>
  )
}
