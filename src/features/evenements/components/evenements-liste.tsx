import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowRightLeft,
  OctagonAlert,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  evenementsQueries,
  statutsEvenementsQueries,
} from '@/features/evenements/queries'
import { travauxQueries } from '@/features/travaux/queries'
import {
  useDeleteEvenement,
  useConvertirEnTravaux,
} from '@/features/evenements/mutations'
import {
  statutEvenementTone,
  STATUTS_EVENEMENTS_TERMINAUX,
} from '@/features/evenements/etat'
import { EvenementFormDialog } from '@/features/evenements/components/evenement-form-dialog'
import { dateAffichee } from '@/features/evenements/format'
import { PAGE_META } from '@/features/evenements/page-meta'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { formatDate } from '@/lib/date'
import { segOfUnique } from '@/lib/slug'
import { writeErrorMessage } from '@/lib/erreurs'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ListPageBody } from '@/components/common/list-page-body'
import { QueryState } from '@/components/common/query-state'
import type { RowAction } from '@/components/common/row-actions'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import {
  matchStatutFilter,
  statutFilterOptions,
  FILTRE_TOUS,
} from '@/components/common/list-filter-bar'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import type { DocumentMeta } from '@/features/documents/format'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { statusLabelById } from '@/components/common/status-badge'
import {
  FicheRow,
  lieuPrincipalTexte,
} from '@/features/taches/components/fiche-row'
import { Button } from '@/components/ui/button'
import type { Database } from '@/lib/database.types'
import { normaliserRecherche } from '@/lib/recherche'

// 098 : enrichi de locaux/équipements (lieu principal) par evenementsQueries.list.
type Evenement = Database['public']['Tables']['evenements']['Row'] & {
  locaux: { id: string; nom: string } | null
  equipements: { id: string; categories: { nom: string } | null } | null
}

export function EvenementsListe({
  siteId,
  canManage,
  canDelete,
}: {
  siteId: string
  canManage: boolean
  canDelete: boolean
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const query = useQuery(evenementsQueries.list(siteId))
  // Journal en LIVE : un événement consigné par un collègue apparaît sans F5.
  useRealtimeRefresh('evenements', evenementsQueries.all())
  const { data: statuts = [] } = useQuery(statutsEvenementsQueries.list())
  // Documents rattachés aux événements du site, en UNE requête groupée
  // (fiche ET tâches confondues) — même patron que la carte OT.
  const documentsQuery = useQuery(
    evenementsQueries.documentsParEvenement(siteId),
  )
  const documentsParEvenement =
    documentsQuery.data ?? new Map<string, DocumentMeta[]>()
  const del = useDeleteEvenement()
  const convertir = useConvertirEnTravaux()
  const [aConvertir, setAConvertir] = useState<Evenement | null>(null)
  const dialog = useEntityDialog<Evenement>()
  const suppression = useConfirmDelete<Evenement>({
    onDelete: (e) => del.mutateAsync(e.id),
    successMessage: 'Événement supprimé',
  })
  const [recherche, setRecherche] = useState('')
  // Défaut « TOUS les statuts » : un journal se consulte en ENTIER. Masquer les
  // événements clôturés cachait l'essentiel du registre, et la page s'ouvrait
  // souvent sur « Aucun résultat » alors qu'elle contenait tout l'historique.
  // Même défaut sur Travaux ; Demandes, Investissements et OT gardent « non
  // terminés », ce sont des listes de travail.
  const [statutFilter, setStatutFilter] = useState(FILTRE_TOUS)

  const statutNom = new Map(statuts.map((s) => [s.id, s.nom]))
  const statutOptions = statutFilterOptions(
    [...statuts].sort((a, b) => a.id - b.id),
  )

  function ouvrir(
    ev: { id: string; titre: string },
    sibs: { nom: string; id: string }[],
  ) {
    void navigate({
      to: '/evenements/$evenement',
      params: { evenement: segOfUnique({ nom: ev.titre, id: ev.id }, sibs) },
    })
  }

  const newButton = canManage ? (
    <Button onClick={dialog.openCreate}>
      <Plus /> Consigner un événement
    </Button>
  ) : undefined

  return (
    <PageContainer>
      <PageHeader
        title={PAGE_META.titre}
        description={PAGE_META.description}
        action={
          canManage ? (
            <TooltipIconButton
              icon={<Plus />}
              label="Consigner un événement"
              variant="outline"
              onClick={dialog.openCreate}
            />
          ) : undefined
        }
      />

      <QueryState
        query={query}
        pending={<ListRowSkeletons />}
        empty={
          <EmptyState
            icon={OctagonAlert}
            title="Aucun événement"
            description={
              canManage
                ? 'Consigne un premier événement pour tenir le journal de l’établissement.'
                : 'Aucun événement consigné pour ce site.'
            }
            action={newButton}
          />
        }
      >
        {(evenements) => {
          const q = normaliserRecherche(recherche)
          const shown = evenements.filter((ev) => {
            if (
              !matchStatutFilter(
                ev.statut_evenement_id,
                statutFilter,
                STATUTS_EVENEMENTS_TERMINAUX,
              )
            )
              return false
            if (q === '') return true
            // 098 : le lieu principal (facultatif, à plat) entre à nouveau
            // dans la recherche — obsolète depuis 086 (lieu déplacé vers
            // evenements_lieux, 0..N, non cherché), corrigé avec le lieu
            // principal qui le remplace pour le cas simple.
            return (
              normaliserRecherche(ev.titre).includes(q) ||
              normaliserRecherche(ev.description ?? '').includes(q) ||
              normaliserRecherche(ev.locaux?.nom ?? '').includes(q)
            )
          })
          // Frères pour le slug : MÊME ensemble qu'à la résolution du détail
          // (symétrie segOfUnique), sur la liste NON filtrée.
          const sibs = evenements.map((e) => ({ nom: e.titre, id: e.id }))

          return (
            <ListPageBody
              search={recherche}
              onSearchChange={setRecherche}
              searchPlaceholder="Rechercher un événement…"
              filterValue={statutFilter}
              onFilterChange={setStatutFilter}
              options={statutOptions}
              filterLabel="Filtrer par statut"
              isEmpty={shown.length === 0}
              emptySearchDescription="Aucun événement ne correspond à ces critères."
            >
              {shown.map((ev) => {
                const statutLabel = statusLabelById(
                  ev.statut_evenement_id,
                  statutNom,
                )
                // Composé à la main (pas actionsEditionSuppression) pour
                // insérer « Convertir » entre Modifier et Supprimer.
                const rowActions: RowAction[] = []
                if (canManage) {
                  rowActions.push({
                    label: 'Modifier',
                    icon: Pencil,
                    onSelect: () => dialog.openEdit(ev),
                  })
                  rowActions.push({
                    label: 'Convertir en Travaux',
                    icon: ArrowRightLeft,
                    onSelect: () => setAConvertir(ev),
                    separatorBefore: true,
                  })
                }
                if (canDelete) {
                  rowActions.push({
                    label: 'Supprimer',
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => suppression.demander(ev),
                    separatorBefore: true,
                  })
                }
                const lieuTexte = lieuPrincipalTexte(ev)
                const texteHabituel = ev.description?.trim()
                  ? ev.description
                  : `Survenu le ${formatDate(ev.date_evenement)}`
                return (
                  <FicheRow
                    key={ev.id}
                    icon={OctagonAlert}
                    tone={statutEvenementTone(ev.statut_evenement_id)}
                    titre={ev.titre}
                    sousTitre={
                      lieuTexte
                        ? `${lieuTexte} · ${texteHabituel}`
                        : texteHabituel
                    }
                    statutLabel={statutLabel}
                    // Clôturé → date de clôture, sinon date de survenue.
                    date={dateAffichee(ev)}
                    documents={documentsParEvenement.get(ev.id) ?? []}
                    onClick={() => ouvrir(ev, sibs)}
                    menuActions={rowActions.length ? rowActions : undefined}
                  />
                )
              })}
            </ListPageBody>
          )
        }}
      </QueryState>

      {canManage && (
        <EvenementFormDialog
          key={dialog.dialogKey}
          open={dialog.open}
          onOpenChange={dialog.onOpenChange}
          siteId={siteId}
          evenement={dialog.entity}
          onCreated={(cree) => {
            const sibs = [...(query.data ?? []), cree].map((e) => ({
              nom: e.titre,
              id: e.id,
            }))
            ouvrir(cree, sibs)
          }}
        />
      )}

      <ConfirmDeleteDialog
        {...suppression.dialogProps}
        entityLabel={
          suppression.toDelete
            ? `l’événement « ${suppression.toDelete.titre} »`
            : 'l’événement'
        }
        warning="Cette suppression est définitive. Les documents rattachés restent dans la bibliothèque du site."
      />

      <ConfirmDialog
        open={aConvertir !== null}
        onOpenChange={(open) => !open && setAConvertir(null)}
        title="Convertir en Travaux ?"
        description={
          aConvertir
            ? `« ${aConvertir.titre} » sera supprimé et remplacé par un nouveau Travaux — tous les lieux concernés et le statut actuel sont conservés. Les documents rattachés suivent la conversion.`
            : undefined
        }
        confirmLabel="Convertir"
        loading={convertir.isPending}
        onConfirm={() => {
          if (!aConvertir) return
          const titre = aConvertir.titre
          void (async () => {
            try {
              const nouvelId = await convertir.mutateAsync(aConvertir.id)
              setAConvertir(null)
              toast.success('Converti en Travaux')
              // Slug calculé sur la liste Travaux FRAÎCHE (siblings à jour,
              // gère une éventuelle collision de titre) — symétrie segOfUnique.
              const travaux = await qc.fetchQuery(travauxQueries.list(siteId))
              const sibs = travaux.map((t) => ({ nom: t.titre, id: t.id }))
              void navigate({
                to: '/travaux/$travaux',
                params: {
                  travaux: segOfUnique({ nom: titre, id: nouvelId }, sibs),
                },
              })
            } catch (e) {
              toast.error(writeErrorMessage(e))
            }
          })()
        }}
      />
    </PageContainer>
  )
}
