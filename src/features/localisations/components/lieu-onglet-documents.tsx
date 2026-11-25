import { Paperclip } from 'lucide-react'
import { DocumentsTab } from '@/features/documents/components/documents-tab'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useUploadDrop } from '@/hooks/use-upload-drop'
import * as perm from '@/lib/permissions'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import { useTabAddAction } from '@/components/common/tab-actions'

/**
 * Onglet « Documents » de la fiche d'un lieu : les documents rattachés au lieu
 * (`documents_locaux`), par la brique `DocumentsTab` (envoi en 3 étapes,
 * aperçu, détache). Le bouton + et le glisser-déposer rattachent un document
 * au lieu (rôles métier ; la RLS arbitre).
 */
export function LieuOngletDocuments({ localId }: { localId: string }) {
  const { data: role } = useCurrentRole()
  const canEdit = perm.canManageMetier(role)
  const {
    uploadOpen,
    droppedFiles,
    dragging,
    openUploadEmpty,
    onUploadOpenChange,
  } = useUploadDrop({ enabled: canEdit })
  useTabAddAction(canEdit ? openUploadEmpty : null, 'Rattacher un document', {
    icon: Paperclip,
  })

  return (
    <div className="relative min-h-full">
      <DocumentsTab
        liaison="documents_locaux"
        parentColumn="local_id"
        parentId={localId}
        uploadOpen={uploadOpen}
        onUploadOpenChange={onUploadOpenChange}
        uploadInitialFiles={droppedFiles}
        className="min-h-full"
      />
      <FileDropOverlay show={dragging} />
    </div>
  )
}
