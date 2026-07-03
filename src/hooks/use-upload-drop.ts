import { useState } from 'react'
import { useFileDrop } from './use-file-drop'

/**
 * Factorise le bloc « upload + glisser-déposer pleine page » des fiches détail
 * et pages documents : états `uploadOpen` + `droppedFiles`, ouverture VIDE par
 * bouton (`openUploadEmpty`), fermeture qui OUBLIE les fichiers déposés
 * (repartir propre au coup suivant), et `useFileDrop` branché pour « fichiers
 * déposés n'importe où sur la page → dialog d'upload pré-rempli ».
 *
 * `dragging` alimente la surcouche visuelle (`FileDropOverlay`).
 *
 * Usage :
 * ```tsx
 * const upload = useUploadDrop({ enabled: canManage })
 * <Button onClick={upload.openUploadEmpty}>Ajouter un document</Button>
 * <DocumentsTab
 *   uploadOpen={upload.uploadOpen}
 *   onUploadOpenChange={upload.onUploadOpenChange}
 *   uploadInitialFiles={upload.droppedFiles}
 * />
 * <FileDropOverlay show={upload.dragging} />
 * ```
 */
export function useUploadDrop({ enabled }: { enabled: boolean }): {
  /** Vrai si le dialog d'upload est ouvert. */
  uploadOpen: boolean
  /** Fichiers issus d'un glisser-déposer, pré-remplis dans le dialog. */
  droppedFiles: File[]
  /** Vrai pendant le survol d'un drag de fichiers (→ `FileDropOverlay`). */
  dragging: boolean
  /** Ouverture manuelle (bouton) : aucun fichier pré-rempli. */
  openUploadEmpty: () => void
  /** À brancher sur le dialog : la fermeture oublie les fichiers déposés. */
  onUploadOpenChange: (open: boolean) => void
} {
  const [uploadOpen, setUploadOpen] = useState(false)
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])

  // Glisser-déposer sur TOUTE la page (réservé aux rôles pouvant ajouter).
  const { dragging } = useFileDrop({
    enabled,
    onFiles: (files) => {
      setDroppedFiles(files)
      setUploadOpen(true)
    },
  })

  return {
    uploadOpen,
    droppedFiles,
    dragging,
    openUploadEmpty: () => {
      setDroppedFiles([])
      setUploadOpen(true)
    },
    onUploadOpenChange: (open) => {
      setUploadOpen(open)
      if (!open) setDroppedFiles([])
    },
  }
}
