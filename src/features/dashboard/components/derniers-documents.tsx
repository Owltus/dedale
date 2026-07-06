import { useRef, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { QueryState } from '@/components/common/query-state'
import { EmptyState } from '@/components/common/empty-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import type { RowAction } from '@/components/common/row-actions'
import { DocumentRow } from '@/features/documents/components/document-row'
import { DocumentPreviewDialog } from '@/features/documents/components/document-preview-dialog'
import { useDocumentDownload } from '@/features/documents/use-document-download'
import type { DocumentMeta } from '@/features/documents/format'
import { listStack } from '@/lib/responsive'
import { AlerteJustificatifs } from './alerte-justificatifs'
import { DashboardCard } from './dashboard-card'
import { useDashboardData } from '../use-dashboard-data'
import { useLignesVisibles } from '../use-lignes-visibles'

interface DerniersDocumentsProps {
  siteId: string
}

/** Hauteur d'une `DocumentRow` (`ListRow` média densité `xs`, `h-11`). */
const HAUTEUR_LIGNE = 44

/**
 * Colonne « Documents » du tableau de bord (zone 3, droite) : l'alerte des
 * justificatifs manquants EN TÊTE, puis les derniers fichiers du site (triés
 * `uploaded_at` DESC par `documentsQueries.list`). Rendu via la brique partagée
 * `DocumentRow` ; clic → aperçu (`DocumentPreviewDialog`) ; menu → téléchargement
 * (`useDocumentDownload`).
 *
 * Fit-to-height : la zone de liste (flex-1, `overflow-hidden`) est mesurée par
 * `useLignesVisibles` → on ne rend que le nombre de lignes qui tiennent.
 */
export function DerniersDocuments({ siteId }: DerniersDocumentsProps) {
  const { documentsQuery } = useDashboardData(siteId)
  const download = useDocumentDownload()
  const [apercu, setApercu] = useState<DocumentMeta | null>(null)
  const zoneRef = useRef<HTMLDivElement>(null)
  const nbLignes = useLignesVisibles(zoneRef, HAUTEUR_LIGNE)

  return (
    <DashboardCard
      // Marges internes réduites (24 → 12 px) : padding vertical `py-3` (via className,
      // surcharge le `py-6` de la carte) + horizontal `px-3` (via contentClassName).
      className="py-3 md:min-h-0 md:flex-1"
      contentClassName="flex min-h-0 flex-col gap-3 px-3"
    >
      <AlerteJustificatifs siteId={siteId} />
      <div
        ref={zoneRef}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <QueryState
          query={documentsQuery}
          pending={<ListRowSkeletons count={4} dense />}
          errorClassName="py-6"
          empty={
            // `flex-1` → l'état vide occupe toute la hauteur de la carte ; son
            // `justify-center` interne le centre alors verticalement (et horizontalement).
            <EmptyState
              icon={FileText}
              title="Aucun document"
              description="Aucun fichier n'a encore été ajouté à ce site."
              className="flex-1"
            />
          }
        >
          {(docs) => (
            <div className={listStack}>
              {docs.slice(0, nbLignes).map((doc) => {
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
              })}
            </div>
          )}
        </QueryState>
      </div>

      <DocumentPreviewDialog
        doc={apercu}
        onOpenChange={(o) => {
          if (!o) setApercu(null)
        }}
      />
    </DashboardCard>
  )
}
