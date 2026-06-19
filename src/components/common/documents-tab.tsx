import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ComponentType } from 'react'
import {
  Download,
  FileImage,
  FileText,
  Link2Off,
  Paperclip,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { documentsQueries } from '@/features/documents/queries'
import type { LiaisonTable } from '@/features/documents/queries'
import {
  useDeleteDocument,
  useDetachDocument,
  useUploadAndAttach,
} from '@/features/documents/mutations'
import { getSignedUrl } from '@/features/documents/upload'
import { formatTaille } from '@/features/documents/format'
import type { DocumentMeta } from '@/features/documents/format'
import { UploadDocumentDialog } from '@/features/documents/components/upload-document-dialog'
import { DocumentPreviewDialog } from '@/features/documents/components/document-preview-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { formatDate } from '@/lib/date'
import { useSiteContext } from '@/lib/site-context'
import { errorMessage } from '@/lib/form'
import { cn } from '@/lib/utils'
import { listStack } from '@/lib/responsive'
import * as perm from '@/lib/permissions'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { PdfFileIcon } from '@/components/common/file-format-icons'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'

/**
 * Icône média selon le FORMAT du fichier (≠ type métier « devis/contrat » qui,
 * lui, n'est pas affiché ici) : PDF explicite, image, ou document générique, pour
 * différencier d'un coup d'œil.
 */
function iconeFormat(mime: string): ComponentType<{ className?: string }> {
  if (mime === 'application/pdf') return PdfFileIcon
  if (mime.startsWith('image/')) return FileImage
  return FileText
}

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
  /**
   * Mode CONTRÔLÉ du dialogue d'upload : si l'hôte fournit ce couple, c'est LUI
   * qui ouvre l'upload (typiquement pour poser le bouton « Rattacher » dans sa
   * propre barre de titre). Dans ce mode, l'en-tête interne (titre + bouton)
   * N'EST PAS rendu. Omis → état interne + bouton d'en-tête (comportement par défaut).
   */
  uploadOpen?: boolean
  onUploadOpenChange?: (open: boolean) => void
  /** Fichiers pré-remplis du dialogue (ex. issus d'un glisser-déposer de l'hôte). */
  uploadInitialFiles?: File[]
  /** Type de document pré-sélectionné, par nom (ex. « Devis »). */
  uploadDefaultTypeNom?: string
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
  uploadOpen,
  onUploadOpenChange,
  uploadInitialFiles,
  uploadDefaultTypeNom,
}: DocumentsTabProps) {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  // Hard-delete d'un document = admin uniquement (RLS `documents_admin_all`).
  const canDelete = perm.isAdmin(role)
  const { activeSiteId } = useSiteContext()

  const query = useQuery(
    documentsQueries.byEntity(liaison, parentColumn, parentId),
  )

  const uploadAttach = useUploadAndAttach()
  const detach = useDetachDocument()
  const del = useDeleteDocument()

  const [internalOpen, setInternalOpen] = useState(false)
  const [toDetach, setToDetach] = useState<DocumentMeta | null>(null)
  const [toDelete, setToDelete] = useState<DocumentMeta | null>(null)
  const [toPreview, setToPreview] = useState<DocumentMeta | null>(null)

  // Mode contrôlé si l'hôte fournit le pilotage de l'ouverture (il pose alors
  // son propre déclencheur, ex. dans la barre de titre) ; sinon, état interne.
  const isControlled = onUploadOpenChange !== undefined
  const open = uploadOpen ?? internalOpen
  const setOpen = onUploadOpenChange ?? setInternalOpen

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

  const peutAjouter = canManage && activeSiteId
  // En-tête : bouton icône seule + tooltip (style barre de titre réutilisable).
  const headerAction =
    !isControlled && peutAjouter ? (
      <TooltipIconButton
        icon={<Paperclip />}
        label="Rattacher un document"
        variant="outline"
        onClick={() => setOpen(true)}
      />
    ) : undefined
  // État vide : CTA explicite (libellé visible) pour amorcer le premier ajout.
  const emptyAction = peutAjouter ? (
    <Button size="sm" onClick={() => setOpen(true)}>
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
          <div className={listStack}>
            {list.map((doc) => (
              <ListRow
                key={doc.id}
                size="sm"
                media={<RowMediaIcon icon={iconeFormat(doc.mime_type)} />}
                title={doc.nom_original}
                subtitle={`${formatTaille(doc.taille_octets)} · ${formatDate(doc.uploaded_at)}`}
                onClick={() => setToPreview(doc)}
                actions={
                  <>
                    <TooltipIconButton
                      icon={<Download />}
                      label="Télécharger"
                      onClick={() => void handleDownload(doc)}
                    />
                    {canManage && (
                      <TooltipIconButton
                        icon={<Link2Off />}
                        label="Détacher le document"
                        onClick={() => setToDetach(doc)}
                      />
                    )}
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
        )}
      </QueryState>

      {canManage && (
        <UploadDocumentDialog
          key={open ? 'open' : 'closed'}
          open={open}
          onOpenChange={setOpen}
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
          initialFiles={uploadInitialFiles}
          defaultTypeNom={uploadDefaultTypeNom}
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

      <ConfirmDeleteDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        entityLabel={
          toDelete ? `le document « ${toDelete.nom_original} »` : 'le document'
        }
        warning="Suppression définitive : le document est retiré de TOUTES les fiches où il est rattaché et effacé du stockage."
        loading={del.isPending}
        onConfirm={confirmDelete}
      />

      <DocumentPreviewDialog
        doc={toPreview}
        onOpenChange={(open) => {
          if (!open) setToPreview(null)
        }}
      />
    </div>
  )
}
