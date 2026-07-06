import { useState } from 'react'
import { Download, FileText } from 'lucide-react'
import type { RowAction } from '@/components/common/row-actions'
import { DocumentRow } from '@/features/documents/components/document-row'
import { DocumentPreviewDialog } from '@/features/documents/components/document-preview-dialog'
import { useDocumentDownload } from '@/features/documents/use-document-download'
import type { DocumentMeta } from '@/features/documents/format'
import { AlerteJustificatifs } from './alerte-justificatifs'
import { DashboardListCard } from './dashboard-list-card'
import { useDashboardData } from '../use-dashboard-data'

interface DerniersDocumentsProps {
  siteId: string
}

/**
 * Colonne « Documents » du tableau de bord (zone 3, droite) : l'alerte des
 * justificatifs manquants EN TÊTE (`header`), puis les derniers fichiers du site
 * (triés `uploaded_at` DESC par `documentsQueries.list`). Rendu via la brique partagée
 * `DocumentRow` ; clic → aperçu (`DocumentPreviewDialog`, en `after`) ; menu →
 * téléchargement (`useDocumentDownload`).
 *
 * Enveloppe (fit-to-height, carte, état vide centré) : `DashboardListCard`.
 */
export function DerniersDocuments({ siteId }: DerniersDocumentsProps) {
  const { documentsQuery } = useDashboardData(siteId)
  const download = useDocumentDownload()
  const [apercu, setApercu] = useState<DocumentMeta | null>(null)

  return (
    <DashboardListCard
      query={documentsQuery}
      emptyIcon={FileText}
      emptyTitle="Aucun document"
      emptyDescription="Aucun fichier n'a encore été ajouté à ce site."
      header={<AlerteJustificatifs siteId={siteId} />}
      after={
        <DocumentPreviewDialog
          doc={apercu}
          onOpenChange={(o) => {
            if (!o) setApercu(null)
          }}
        />
      }
    >
      {(docs, nbLignes) =>
        docs.slice(0, nbLignes).map((doc) => {
          const actions: RowAction[] = [
            {
              label: 'Télécharger',
              icon: Download,
              onSelect: () => void download(doc),
            },
          ]
          return (
            <DocumentRow
              key={doc.id}
              doc={doc}
              size="xs"
              onClick={() => setApercu(doc)}
              menuActions={actions}
            />
          )
        })
      }
    </DashboardListCard>
  )
}
