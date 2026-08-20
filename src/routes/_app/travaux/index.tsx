import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowRightLeft, HardHat, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  travauxQueries,
  statutsTravauxQueries,
} from '@/features/travaux/queries'
import { evenementsQueries } from '@/features/evenements/queries'
import {
  useDeleteTravaux,
  useConvertirEnEvenement,
} from '@/features/travaux/mutations'
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
import { writeErrorMessage } from '@/lib/form'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ListPageBody } from '@/components/common/list-page-body'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/travaux/page-meta'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import type { RowAction } from '@/components/common/row-actions'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import {
  matchStatutFilter,
  statutFilterOptions,
  FILTRE_TOUS,
} from '@/components/common/list-filter-bar'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { DocumentIndicator } from '@/components/common/document-indicator'
import type { DocumentMeta } from '@/features/documents/format'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { StatusBadge, statusLabelById } from '@/components/common/status-badge'
import type { Database } from '@/lib/database.types'

type Travaux = Database['public']['Tables']['interventions_travaux']['Row']

export const Route = createFileRoute('/_app/travaux/')({
  component: TravauxPage,
})

function TravauxPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, canManage }) => (
        // Travaux = écran MÉTIER (cf. RLS) : manager/technicien créent/éditent
        // ET SUPPRIMENT sur leurs sites (migration 053), lecteur consulte.
        <TravauxContent
          siteId={siteId}
          canManage={canManage}
          canDelete={canManage}
        />
      )}
    </SiteScopedRoute>
  )
}

function TravauxContent({
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
  const convertir = useConvertirEnEvenement()
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
  function handleCreated(created: Travaux) {
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
          const q = recherche.trim().toLowerCase()
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
              c.titre.toLowerCase().includes(q) ||
              (c.description ?? '').toLowerCase().includes(q)
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
                const docs = documentsParTravaux.get(c.id) ?? []
                return (
                  <ListRow
                    key={c.id}
                    tone={statutTravauxTone(c.statut_travaux_id)}
                    media={<RowMediaIcon icon={HardHat} />}
                    title={c.titre}
                    subtitle={
                      c.description?.trim()
                        ? c.description
                        : `Créé le ${formatDate(c.date_demande)}`
                    }
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
                    mobileBadge={
                      docs.length > 0 ? (
                        <DocumentIndicator
                          documents={docs}
                          entiteNom={c.titre}
                          size="sm"
                        />
                      ) : undefined
                    }
                    // UN SEUL bloc à droite : icône documents (brique commune,
                    // patron OT — rattachés au niveau fiche OU à une tâche,
                    // tous confondus) COLLÉE à la colonne statut/date, dans le
                    // MÊME slot `meta` plutôt qu'un `badges` séparé — sinon les
                    // deux se retrouvent à deux `gap` d'écart (retour
                    // utilisateur : l'icône paraissait très éloignée). `meta`
                    // (contrairement à `badges`/`mobileBadge`) n'est PAS relevé
                    // au-dessus de l'overlay de clic de `ListRow` — sans son
                    // propre `relative z-10`, l'icône restait donc SOUS
                    // l'overlay : le clic ouvrait la fiche au lieu du document
                    // (retour utilisateur : la modale ne s'ouvrait plus). La
                    // Statut au-dessus, date en dessous. PAS de largeur fixe
                    // (`w-32`) sur cette colonne dès qu'une icône la précède :
                    // un statut court (« Ouvert ») laissait alors un vide
                    // invisible entre l'icône et le badge, à l'intérieur même
                    // de la colonne (retour utilisateur : « très grande
                    // distance » — ce n'était pas le `gap`, déjà réduit).
                    meta={
                      <div className="flex items-center gap-2">
                        {docs.length > 0 && (
                          <div className="relative z-10">
                            <DocumentIndicator
                              documents={docs}
                              entiteNom={c.titre}
                              size="sm"
                            />
                          </div>
                        )}
                        <div className="flex flex-col items-end gap-1">
                          <StatusBadge
                            tone={statutTravauxTone(c.statut_travaux_id)}
                          >
                            {statutLabel}
                          </StatusBadge>
                          {/* La date SUIT le statut affiché au-dessus : terminé →
                              date de fin, sinon date de création. */}
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatDate(dateAffichee(c))}
                          </span>
                        </div>
                      </div>
                    }
                    mobileMeta={`${statutLabel} · ${formatDate(dateAffichee(c))}`}
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

      <ConfirmDialog
        open={aConvertir !== null}
        onOpenChange={(open) => !open && setAConvertir(null)}
        title="Convertir en Événement ?"
        description={
          aConvertir
            ? `« ${aConvertir.titre} » sera supprimé et remplacé par un nouvel Événement — toutes les zones concernées et le statut actuel sont conservés. Les documents rattachés suivent la conversion.`
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
              toast.success('Converti en Événement')
              // Slug calculé sur la liste Événements FRAÎCHE (siblings à jour,
              // gère une éventuelle collision de titre) — symétrie segOfUnique.
              const evenements = await qc.fetchQuery(
                evenementsQueries.list(siteId),
              )
              const sibs = evenements.map((e) => ({ nom: e.titre, id: e.id }))
              void navigate({
                to: '/evenements/$evenement',
                params: {
                  evenement: segOfUnique({ nom: titre, id: nouvelId }, sibs),
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
