import { useState, type ReactNode } from 'react'
import { Download, Link2Off, Trash2 } from 'lucide-react'
import { DocumentRow } from '@/features/documents/components/document-row'
import { DocumentPreviewDialog } from '@/features/documents/components/document-preview-dialog'
import { useDocumentDownload } from '@/features/documents/use-document-download'
import type { DocumentMeta } from '@/features/documents/format'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { deleteErrorMessage } from '@/lib/form'
import { listStack } from '@/lib/responsive'
import type { RowAction } from '@/components/common/row-actions'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'

const DEFAULT_DELETE_WARNING =
  'Suppression définitive : le document est retiré de TOUTES les fiches où il est rattaché et effacé du stockage.'

interface DocumentsListeProps {
  /** Documents à lister (déjà chargés / filtrés par l'hôte). */
  docs: DocumentMeta[]
  /** Autorise l'action « Supprimer » (hard-delete). Requiert `onDelete`. */
  canDelete?: boolean
  /**
   * Suppression effective (ex. `del.mutateAsync(doc.id)`). La liste porte le
   * toast (« Document supprimé » / erreur) et la confirmation impact-aware.
   */
  onDelete?: (doc: DocumentMeta) => Promise<unknown>
  /** Autorise l'action « Détacher » (retirer de la fiche courante). Requiert `onDetach`. */
  canDetach?: boolean
  /** Détachement effectif (ex. `detach.mutateAsync(...)`). Porte toast + confirmation. */
  onDetach?: (doc: DocumentMeta) => Promise<unknown>
  /** Badges à droite d'une rangée (ex. type de document), masqués sous `sm`. */
  badges?: (doc: DocumentMeta) => ReactNode
  /** Repli mobile de l'info clé (sous le titre, sous `sm`). */
  mobileMeta?: (doc: DocumentMeta) => ReactNode
  /**
   * Clic sur une rangée. Défaut : ouvre l'APERÇU interne
   * (`DocumentPreviewDialog`). Fournir une fonction remplace ce comportement
   * (l'aperçu interne n'est alors pas rendu).
   */
  onPreview?: (doc: DocumentMeta) => void
  /** Avertissement du modal de suppression (défaut : retiré de toutes les fiches + stockage). */
  deleteWarning?: ReactNode
  /**
   * Traducteur du message d'erreur de suppression/détachement. Défaut :
   * `deleteErrorMessage` (traduit les codes SQLSTATE : 42501 hors périmètre,
   * PGRST116 déjà supprimé, 23503 FK…). À surcharger pour un message contextuel.
   */
  errorTranslate?: (e: unknown) => string
  /** Classe du conteneur de liste (défaut : `listStack`). */
  className?: string
}

/**
 * Liste de DOCUMENTS réutilisable : une pile de `DocumentRow` (rendu unique) avec
 * menu contextuel Télécharger / Détacher / Supprimer, aperçu au clic et
 * confirmations intégrées. La liste PORTE le téléchargement, l'aperçu et les
 * dialogues de confirmation (via `useConfirmDelete`) + leurs toasts ; l'hôte ne
 * fournit que les données, les droits et les mutations. Source commune de la
 * bibliothèque documentaire et des onglets « Documents » des fiches.
 */
export function DocumentsListe({
  docs,
  canDelete = false,
  onDelete,
  canDetach = false,
  onDetach,
  badges,
  mobileMeta,
  onPreview,
  deleteWarning = DEFAULT_DELETE_WARNING,
  errorTranslate = deleteErrorMessage,
  className,
}: DocumentsListeProps) {
  const download = useDocumentDownload()
  const [toPreview, setToPreview] = useState<DocumentMeta | null>(null)

  const showDelete = canDelete && onDelete !== undefined
  const showDetach = canDetach && onDetach !== undefined

  // Confirmations mutualisées (état + pending + toast + câblage du dialog).
  const suppression = useConfirmDelete<DocumentMeta>({
    onDelete: (doc) => (onDelete ? onDelete(doc) : Promise.resolve()),
    successMessage: 'Document supprimé',
    errorMessage: errorTranslate,
  })
  const detachement = useConfirmDelete<DocumentMeta>({
    onDelete: (doc) => (onDetach ? onDetach(doc) : Promise.resolve()),
    successMessage: 'Document détaché',
    errorMessage: errorTranslate,
  })

  return (
    <>
      <div className={className ?? listStack}>
        {docs.map((doc) => {
          const actions: RowAction[] = [
            {
              label: 'Télécharger',
              icon: Download,
              onSelect: () => void download(doc),
            },
          ]
          if (showDetach)
            actions.push({
              label: 'Détacher',
              icon: Link2Off,
              onSelect: () => detachement.demander(doc),
            })
          if (showDelete)
            actions.push({
              label: 'Supprimer',
              icon: Trash2,
              destructive: true,
              onSelect: () => suppression.demander(doc),
            })
          return (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onClick={() => (onPreview ? onPreview(doc) : setToPreview(doc))}
              badges={badges?.(doc)}
              mobileMeta={mobileMeta?.(doc)}
              menuActions={actions}
            />
          )
        })}
      </div>

      {onPreview === undefined && (
        <DocumentPreviewDialog
          doc={toPreview}
          onOpenChange={(open) => {
            if (!open) setToPreview(null)
          }}
        />
      )}

      {showDetach && (
        <ConfirmDialog
          {...detachement.dialogProps}
          title="Détacher le document ?"
          description={
            detachement.toDelete
              ? `« ${detachement.toDelete.nom_original} » sera retiré de cette fiche. Le document reste dans la bibliothèque du site.`
              : undefined
          }
          confirmLabel="Détacher"
        />
      )}

      {showDelete && (
        <ConfirmDeleteDialog
          {...suppression.dialogProps}
          entityLabel={
            suppression.toDelete
              ? `le document « ${suppression.toDelete.nom_original} »`
              : 'le document'
          }
          warning={deleteWarning}
        />
      )}
    </>
  )
}
