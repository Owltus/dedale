import { useQuery } from '@tanstack/react-query'
import { FileText, Plus } from 'lucide-react'
import { contratsQueries } from '../queries'
import type { ContratRow } from '../queries'
import { chaineDeVersions, nbAvenantsDirects, statutContrat } from '../etat'
import { ContratCard } from './contrat-card'
import { ContratCardSkeleton } from './contrat-card-skeleton'
import { ContratVersionsHistorique } from './contrat-versions-historique'
import { DocumentsTab } from '@/features/documents/components/documents-tab'
import { listStack } from '@/lib/responsive'
import { ONGLET_ETAT_VIDE } from '@/components/common/detail-tabs-shell'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { Button } from '@/components/ui/button'

/**
 * Onglet Contrats : liste de `ContratCard` riches + CRUD complet (les dialogues
 * sont pilotés par la fiche hôte). Chaque carte porte statut détaillé, progression,
 * infos adaptatives, historique des versions (chaîne d'avenants) et documents.
 * `list` ne renvoie que les VERSIONS COURANTES ; `versions` (archivés inclus)
 * alimente le comptage d'avenants et l'historique par carte.
 */
export function ContratsPanel({
  siteId,
  prestataireId,
  prestataireNom,
  canManage,
  onNew,
  onEdit,
  onDelete,
  onAvenant,
  onResilier,
}: {
  siteId: string
  prestataireId: string
  prestataireNom: string
  canManage: boolean
  onNew: () => void
  onEdit: (contrat: ContratRow) => void
  onDelete: (contrat: ContratRow) => void
  onAvenant: (contrat: ContratRow) => void
  onResilier: (contrat: ContratRow) => void
}) {
  const query = useQuery(contratsQueries.list(siteId, prestataireId))
  const versionsQuery = useQuery(
    contratsQueries.versions(siteId, prestataireId),
  )
  const tous = (versionsQuery.data ?? []) as ContratRow[]
  const newButton = canManage ? (
    <Button onClick={onNew}>
      <Plus /> Nouveau contrat
    </Button>
  ) : undefined

  return (
    <QueryState
      query={query}
      pending={<ContratCardSkeleton count={2} />}
      empty={
        <EmptyState
          icon={FileText}
          title="Aucun contrat"
          description={
            canManage
              ? 'Ajoute un contrat pour ce prestataire sur le site actif.'
              : 'Aucun contrat sur le site actif.'
          }
          action={newButton}
          className={ONGLET_ETAT_VIDE}
        />
      }
    >
      {(contrats) => (
        <div className={listStack}>
          {(contrats as ContratRow[]).map((c) => {
            const statut = statutContrat(c).statut
            // Résilié/expiré → documents en lecture seule (archivé accepterait
            // encore des docs, mais les archivés ne sont pas dans cette liste).
            const isDocReadonly = statut === 'resilie' || statut === 'expire'
            const chaine = chaineDeVersions(tous, c.id)
            return (
              <ContratCard
                key={c.id}
                contrat={c}
                canManage={canManage}
                nbAvenants={nbAvenantsDirects(tous, c.id)}
                onEdit={() => {
                  onEdit(c)
                }}
                onAvenant={() => {
                  onAvenant(c)
                }}
                onResilier={() => {
                  onResilier(c)
                }}
                onSupprimer={() => {
                  onDelete(c)
                }}
              >
                <ContratVersionsHistorique chaine={chaine} courantId={c.id} />
                <details className="rounded-md border px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                    Documents
                  </summary>
                  <div className="pt-2">
                    <DocumentsTab
                      liaison="documents_contrats"
                      parentColumn="contrat_id"
                      parentId={c.id}
                      canAttach={!isDocReadonly}
                      uploadDefaultTypeNom="Contrat"
                      namingContext={{
                        prestataire: prestataireNom,
                        objet: c.reference,
                      }}
                    />
                  </div>
                </details>
              </ContratCard>
            )
          })}
        </div>
      )}
    </QueryState>
  )
}
