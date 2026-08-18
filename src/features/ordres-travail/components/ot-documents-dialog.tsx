import { DialogShell } from '@/components/common/dialog-shell'
import { DocumentsListe } from '@/components/common/documents-liste'
import type { DocumentMeta } from '@/features/documents/format'

interface OtDocumentsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documents: DocumentMeta[]
  otNom: string
}

/**
 * Choix parmi les documents d'un OT (≥ 2), ouvert depuis l'icône documents de
 * `OtCard`. Lecture seule (aucune prop d'édition/détachement/suppression) :
 * `DocumentsListe` gère son propre aperçu au clic, sans action de fiche.
 */
export function OtDocumentsDialog({
  open,
  onOpenChange,
  documents,
  otNom,
}: OtDocumentsDialogProps) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={`Documents — ${otNom}`}
      size="md"
    >
      <DocumentsListe docs={documents} />
    </DialogShell>
  )
}
