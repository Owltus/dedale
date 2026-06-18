import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileText, Link2Off, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { documentsQueries } from '@/features/documents/queries'
import type { LiaisonTable } from '@/features/documents/queries'
import {
  useDetachDocument,
  useUploadAndAttach,
} from '@/features/documents/mutations'
import { getSignedUrl } from '@/features/documents/upload'
import { formatMime, formatTaille } from '@/features/documents/format'
import type { DocumentMeta } from '@/features/documents/format'
import { UploadDocumentDialog } from '@/features/documents/components/upload-document-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { formatDate } from '@/lib/date'
import { useSiteContext } from '@/lib/site-context'
import { errorMessage } from '@/lib/form'
import { cn } from '@/lib/utils'
import * as perm from '@/lib/permissions'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface DocumentsTabProps {
  /** Nom de la table de liaison (ex. 'documents_ordres_travail'). */
  liaison: LiaisonTable
  /** Colonne FK vers l'entité parente (ex. 'ordre_travail_id'). */
  parentColumn: string
  /** Id de l'entité parente à laquelle rattacher les documents. */
  parentId: string
  /**
   * Restreint les formats acceptés à l'upload (défaut : PDF + WebP). Ex.
   * `MIME_PDF` pour n'autoriser que le PDF (investissements). Transmis tel quel
   * au dialogue d'upload.
   */
  acceptedMimes?: readonly string[]
  /**
   * Titre de section (ex. « Documents »). Si fourni, l'en-tête affiche le titre
   * à gauche et le bouton de rattachement (icône + tooltip) à droite, sur une
   * seule ligne. Sans titre, seul le bouton est rendu (aligné à droite).
   */
  title?: string
}

/**
 * Onglet « Documents » réutilisable, à embarquer dans les fiches métier
 * (OT, gammes, contrats, prestataires, locaux, équipements, DI…).
 *
 * Liste les documents rattachés à une entité via sa table de liaison,
 * permet d'uploader+rattacher (doctrine 3 étapes a+b+c) et de détacher.
 *
 * Le droit d'écriture (rattacher/détacher) suit `canManageMetier` — le miroir
 * de la RLS des tables `documents_*` — indépendamment du `canManage` de la
 * fiche hôte : un rôle autorisé en base voit les actions, même si la fiche
 * elle-même est en lecture seule pour lui.
 */
export function DocumentsTab({
  liaison,
  parentColumn,
  parentId,
  acceptedMimes,
  title,
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

  const peutAjouter = canManage && activeSiteId
  // En-tête : bouton icône seule + tooltip (style barre de titre réutilisable).
  const headerAction = peutAjouter ? (
    <TooltipIconButton
      icon={<Paperclip />}
      label="Rattacher un document"
      variant="outline"
      onClick={() => setUploadOpen(true)}
    />
  ) : undefined
  // État vide : CTA explicite (libellé visible) pour amorcer le premier ajout.
  const emptyAction = peutAjouter ? (
    <Button size="sm" onClick={() => setUploadOpen(true)}>
      <Paperclip /> Rattacher un document
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
      {(title != null || headerAction != null) && (
        <div
          className={cn(
            'flex items-center gap-4',
            title != null ? 'justify-between' : 'justify-end',
          )}
        >
          {title && (
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          )}
          {headerAction}
        </div>
      )}

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
            action={emptyAction}
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
          acceptedMimes={acceptedMimes}
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
