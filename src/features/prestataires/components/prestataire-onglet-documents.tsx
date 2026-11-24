import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { prestatairesQueries } from '../queries'
import { useDeleteDocument } from '@/features/documents/mutations'
import { ONGLET_ETAT_VIDE } from '@/components/common/detail-tabs-shell'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { DocumentsListe } from '@/features/documents/components/documents-liste'

/**
 * Onglet Documents — documents rattachés aux ORDRES DE TRAVAIL du prestataire (sur
 * le site actif). Réutilise les briques documents standard : `DocumentRow` (rendu
 * identique partout), aperçu au clic, et menu contextuel `Télécharger` +
 * `Supprimer` (hard-delete, gestionnaires uniquement). Pas de détache : ces
 * documents ne sont pas « rattachés au prestataire » mais à ses OT.
 */
export function OtDocumentsPanel({
  prestataireId,
  siteId,
  canDelete,
}: {
  prestataireId: string
  siteId: string
  canDelete: boolean
}) {
  const query = useQuery(
    prestatairesQueries.documentsViaOt(prestataireId, siteId),
  )
  const del = useDeleteDocument()

  return (
    <QueryState
      query={query}
      // `size="sm"` : `DocumentsListe` rend des `DocumentRow`, dont le défaut
      // est `sm` (h-14). Le défaut du squelette est `md` (h-20) → 24 px d'écart.
      pending={<ListRowSkeletons size="sm" count={4} />}
      empty={
        <EmptyState
          icon={FileText}
          title="Aucun document"
          description="Aucun document rattaché aux ordres de travail de ce prestataire sur le site actif."
          className={ONGLET_ETAT_VIDE}
        />
      }
    >
      {(list) => (
        // Liste documents mutualisée (DocumentRow + Télécharger/Supprimer + aperçu
        // + confirmation impact-aware). Pas de détache : ces documents sont
        // rattachés aux OT du prestataire, pas au prestataire lui-même.
        <DocumentsListe
          docs={list}
          canEdit={canDelete}
          canDelete={canDelete}
          onDelete={(doc) => del.mutateAsync(doc.id)}
        />
      )}
    </QueryState>
  )
}
