import { useState } from 'react'
import { FileText } from 'lucide-react'
import { DocumentPreviewDialog } from '@/features/documents/components/document-preview-dialog'
import { DocumentsListe } from '@/components/common/documents-liste'
import { DialogShell } from '@/components/common/dialog-shell'
import type { DocumentMeta } from '@/features/documents/format'

interface DocumentIndicatorProps {
  /**
   * Documents rattachés à l'entité de la carte (calculés en amont par le
   * conteneur, une seule requête groupée pour toute la liste — jamais une
   * par carte, cf. `ordresTravailQueries.documentsParOt` et ses miroirs
   * `travauxQueries.documentsParTravaux` / `evenementsQueries.documentsParEvenement`).
   * Vide → rien n'est rendu.
   */
  documents: DocumentMeta[]
  /** Nom de l'entité, pour le titre de la modale de choix (≥ 2 documents). */
  entiteNom: string
  /** Taille de l'icône — `sm` (size-10) pour les contextes compacts (ex. popup planning), `md` (size-12) par défaut. */
  size?: 'sm' | 'md'
}

/**
 * Icône « documents rattachés » d'une carte de liste : un document → aperçu
 * direct au clic, plusieurs → modale de choix (liste en lecture seule).
 * Introduite par `OtCard` (page Ordres de travail), désormais commune à
 * toute carte qui veut le même repère visuel (Travaux, Événements…).
 */
export function DocumentIndicator({
  documents,
  entiteNom,
  size = 'md',
}: DocumentIndicatorProps) {
  const [preview, setPreview] = useState<DocumentMeta | null>(null)
  const [listeOpen, setListeOpen] = useState(false)

  if (documents.length === 0) return null

  function ouvrir() {
    if (documents.length === 1) setPreview(documents[0] ?? null)
    else setListeOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={ouvrir}
        aria-label={
          documents.length > 1 ? 'Voir les documents' : 'Voir le document'
        }
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        <FileText
          strokeWidth={1.25}
          className={size === 'sm' ? 'size-10' : 'size-12'}
        />
      </button>
      <DocumentPreviewDialog
        doc={preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      />
      {documents.length > 1 && (
        <DialogShell
          open={listeOpen}
          onOpenChange={setListeOpen}
          title={`Documents — ${entiteNom}`}
          size="md"
        >
          <DocumentsListe docs={documents} />
        </DialogShell>
      )}
    </>
  )
}
