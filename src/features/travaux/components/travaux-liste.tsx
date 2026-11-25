import { useState, type ComponentType } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRightLeft, HardHat, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  travauxQueries,
  statutsTravauxQueries,
} from '@/features/travaux/queries'
import { useDeleteTravaux } from '@/features/travaux/mutations'
import {
  statutTravauxTone,
  STATUTS_TRAVAUX_TERMINAUX,
} from '@/features/travaux/etat'
import { dateAffichee } from '@/features/travaux/format'
import { TravauxFormDialog } from '@/features/travaux/components/travaux-form-dialog'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { formatDate } from '@/lib/date'
import { segOfUnique } from '@/lib/slug'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ListPageBody } from '@/components/common/list-page-body'
import { PAGE_META } from '@/features/travaux/page-meta'
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
import { Button } from '@/components/ui/button'
import { statusLabelById } from '@/components/common/status-badge'
import {
  FicheRow,
  lieuPrincipalTexte,
} from '@/features/taches/components/fiche-row'
import type { Database } from '@/lib/database.types'
import { normaliserRecherche } from '@/lib/recherche'

// 098 : enrichi de locaux/équipements (lieu principal) par travauxQueries.list.
type Travaux = Database['public']['Tables']['interventions_travaux']['Row'] & {
  locaux: { id: string; nom: string } | null
  equipements: { id: string; categories: { nom: string } | null } | null
}

export function TravauxListe({
  siteId,
  canManage,
  canDelete,
  ConvertirEnEvenement,
}: {
  siteId: string
  canManage: boolean
  canDelete: boolean
  /**
   * Confirmation de conversion en Événement, INJECTÉE par la route (elle vit
   * dans la feature evenements, qui dépend déjà de travaux : pas de cycle).
   */
  ConvertirEnEvenement: ComponentType<{
    siteId: string
    aConvertir: { id: string; titre: string } | null
    onFermer: () => void
  }>
}) {
  const navigate = useNavigate()
  const query = useQuery(travauxQueries.list(siteId))
  // Liste en LIVE (nouveau chantier/travaux visible sans F5).
  useRealtimeRefresh('interventions_travaux', travauxQueries.all())
  const { data: statuts = [] } = useQuery(statutsTravauxQueries.list())
  // Documents rattachés aux travaux du site, en UNE requête groupée (fiche
  // ET tâches confondues) — même patron que la carte OT.
  const documentsQuery = useQuery(travauxQueries.documentsParTravaux(siteId))
  const documentsParTravaux =
    documentsQuery.data ?? new Map<string, DocumentMeta[]>()
  const del = useDeleteTravaux()
  const [aConvertir, setAConvertir] = useState<Travaux | null>(null)
  const dialog = useEntityDialog<Travaux>()
  const suppression = useConfirmDelete<Travaux>({
    onDelete: (t) => del.mutateAsync(t.id),
    successMessage: 'Travaux supprimé',
  })
  const [recherche, setRecherche] = useState('')
  // Défaut « TOUS les statuts » (décision PO) : la liste sert autant à consulter
  // l'historique des travaux réalisés qu'à suivre ceux en cours. Masquer les
  // terminés cachait la moitié de l'information au premier coup d'œil. Le filtre
  // reste là pour isoler les travaux actifs.
  const [statutFilter, setStatutFilter] = useState(FILTRE_TOUS)

  const statutNom = new Map(statuts.map((s) => [s.id, s.nom]))
  const statutOptions = statutFilterOptions(
    [...statuts].sort((a, b) => a.id - b.id),
  )

  // Après création : rediriger vers la fiche (où l'on ajoute les tâches). On
  // calcule le slug avec les frères ACTUELS + le nouveau (symétrie segOfUnique).
  function handleCreated(created: { id: string; titre: string }) {
    const sibs = [...(query.data ?? []), created].map((c) => ({
      nom: c.titre,
      id: c.id,
    }))
    void navigate({
      to: '/travaux/$travaux',
      params: {
        travaux: segOfUnique({ nom: created.titre, id: created.id }, sibs),
      },
    })
  }

  const newButton = canManage ? (
    <Button onClick={dialog.openCreate}>
      <Plus /> Nouveau travaux
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
              label="Nouveau travaux"
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
            icon={HardHat}
            title="Aucun travaux"
            description={
              canManage
                ? 'Crée un premier travaux pour suivre des travaux ponctuels.'
                : 'Aucun travaux enregistré pour ce site.'
            }
            action={newButton}
          />
        }
      >
        {(travaux) => {
          const q = normaliserRecherche(recherche)
          const shown = travaux.filter((c) => {
            if (
              !matchStatutFilter(
                c.statut_travaux_id,
                statutFilter,
                STATUTS_TRAVAUX_TERMINAUX,
              )
            )
              return false
            if (q === '') return true
            return (
              normaliserRecherche(c.titre).includes(q) ||
              normaliserRecherche(c.description ?? '').includes(q) ||
              normaliserRecherche(c.locaux?.nom ?? '').includes(q)
            )
          })
          // Frères pour le slug d'URL : MÊME ensemble qu'à la résolution dans la
          // fiche détail (symétrie segOfUnique), sur la liste NON filtrée.
          const sibs = travaux.map((c) => ({ nom: c.titre, id: c.id }))
          return (
            <ListPageBody
              search={recherche}
              onSearchChange={setRecherche}
              searchPlaceholder="Rechercher un travaux…"
              filterValue={statutFilter}
              onFilterChange={setStatutFilter}
              options={statutOptions}
              filterLabel="Filtrer par statut"
              isEmpty={shown.length === 0}
              emptySearchDescription="Aucun travaux ne correspond à ces critères."
            >
              {shown.map((c) => {
                // Libellé TOUJOURS défini (repli « Statut inconnu ») : le
                // référentiel arrive après la liste, et un badge conditionnel
                // apparaissait donc au second rendu — la ligne bougeait.
                const statutLabel = statusLabelById(
                  c.statut_travaux_id,
                  statutNom,
                )
                const editable =
                  // 085 : statut libre, plus de verrouillage (comme
                  // Événements) — un travaux Terminé reste modifiable.
                  canManage
                // Composé à la main (pas actionsEditionSuppression) pour
                // insérer « Convertir » entre Modifier et Supprimer.
                const rowActions: RowAction[] = []
                if (editable) {
                  rowActions.push({
                    label: 'Modifier',
                    icon: Pencil,
                    onSelect: () => dialog.openEdit(c),
                  })
                }
                if (canManage) {
                  rowActions.push({
                    label: 'Convertir en Événement',
                    icon: ArrowRightLeft,
                    onSelect: () => setAConvertir(c),
                    separatorBefore: rowActions.length > 0,
                  })
                }
                if (canDelete) {
                  rowActions.push({
                    label: 'Supprimer',
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => suppression.demander(c),
                    separatorBefore: true,
                  })
                }
                const lieuTexte = lieuPrincipalTexte(c)
                const texteHabituel = c.description?.trim()
                  ? c.description
                  : `Créé le ${formatDate(c.date_demande)}`
                return (
                  <FicheRow
                    key={c.id}
                    icon={HardHat}
                    tone={statutTravauxTone(c.statut_travaux_id)}
                    titre={c.titre}
                    sousTitre={
                      lieuTexte
                        ? `${lieuTexte} · ${texteHabituel}`
                        : texteHabituel
                    }
                    statutLabel={statutLabel}
                    date={dateAffichee(c)}
                    documents={documentsParTravaux.get(c.id) ?? []}
                    onClick={() =>
                      void navigate({
                        to: '/travaux/$travaux',
                        params: {
                          travaux: segOfUnique(
                            { nom: c.titre, id: c.id },
                            sibs,
                          ),
                        },
                      })
                    }
                    menuActions={rowActions.length ? rowActions : undefined}
                  />
                )
              })}
            </ListPageBody>
          )
        }}
      </QueryState>

      {canManage && (
        <TravauxFormDialog
          key={dialog.dialogKey}
          open={dialog.open}
          onOpenChange={dialog.onOpenChange}
          siteId={siteId}
          travaux={dialog.entity}
          onCreated={handleCreated}
        />
      )}

      <ConfirmDeleteDialog
        {...suppression.dialogProps}
        entityLabel={
          suppression.toDelete
            ? `le travaux « ${suppression.toDelete.titre} »`
            : 'le travaux'
        }
        warning="Cette suppression est définitive. Le travaux et ses liaisons (locaux, équipements) sont retirés ; les documents rattachés restent dans la bibliothèque du site."
      />

      <ConvertirEnEvenement
        siteId={siteId}
        aConvertir={aConvertir}
        onFermer={() => setAConvertir(null)}
      />
    </PageContainer>
  )
}
