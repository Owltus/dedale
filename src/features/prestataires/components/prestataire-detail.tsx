import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ClipboardList,
  FileText,
  Pencil,
  Plus,
  Truck,
  Wrench,
} from 'lucide-react'
import { contratsQueries, prestatairesQueries } from '../queries'
import type { ContratRow } from '../queries'
import { useDeleteContrat } from '../mutations'
import { useDeleteDocument } from '@/features/documents/mutations'
import { chaineDeVersions, nbAvenantsDirects, statutContrat } from '../etat'
import { PrestataireFormDialog } from './prestataire-form-dialog'
import { ContratFormDialog } from './contrat-form-dialog'
import { ContratAvenantDialog } from './contrat-avenant-dialog'
import { ContratResilierDialog } from './contrat-resilier-dialog'
import { ContratCard } from './contrat-card'
import { ContratVersionsHistorique } from './contrat-versions-historique'
import { DocumentsTab } from '@/components/common/documents-tab'
import { OtCard } from '@/features/ordres-travail/components/ot-card'
import {
  matchStatutOt,
  statutOtFilterOptions,
} from '@/features/ordres-travail/schemas'
import {
  trierOtParUrgence,
  type OtTriable,
} from '@/features/ordres-travail/tri'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import { OT_QUERY_KEYS } from '@/features/ordres-travail/query-keys'
import { GammeCard } from '@/features/gammes/components/gamme-card'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { listStack } from '@/lib/responsive'
import type { Database } from '@/lib/database.types'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { DetailHeaderCard } from '@/components/common/detail-header-card'
import { DetailTabsShell } from '@/components/common/detail-tabs-shell'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { DocumentsListe } from '@/components/common/documents-liste'
import { NoSearchResults } from '@/components/common/no-search-results'
import {
  FILTRE_NON_TERMINES,
  ListFilterBar,
} from '@/components/common/list-filter-bar'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type Prestataire = Database['public']['Tables']['prestataires']['Row']
type Onglet = 'contrats' | 'gammes' | 'ot' | 'documents'

/** Accès partagé aux vignettes (UNE instance pour toute la fiche → un seul canal). */
interface MiniatureAccess {
  urlOf: (id: string | null) => string | null
  refreshMiniatures: () => void
}

/**
 * Fiche Prestataire détail, calquée sur les fiches Gamme / OT : page autonome
 * (porte sa `PageHeader`), carte d'en-tête `DetailHeaderCard`, barre `SubTabs`
 * (Contrats / Gammes / Ordres de travail / Documents) et zone de contenu défilante.
 * Tout ce qui est rattaché au prestataire, BORNÉ AU SITE ACTIF (décision PO) :
 * contrats (CRUD inline), gammes couvertes par ses contrats (lecture), ses OT
 * (lecture), ses documents. Le front présente ; la base (RLS) cloisonne par site
 * (résultat vide hors scope, jamais d'erreur).
 */
export function PrestataireDetail({
  prestataire,
  siteId,
  canManage,
  onBack,
}: {
  prestataire: Prestataire
  siteId: string
  canManage: boolean
  onBack: () => void
}) {
  const [onglet, setOnglet] = useState<Onglet>('contrats')
  const [editPrestataire, setEditPrestataire] = useState(false)
  const contratDialog = useEntityDialog<ContratRow>()
  const avenantDialog = useEntityDialog<ContratRow>()
  const resilierDialog = useEntityDialog<ContratRow>()
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  const delContrat = useDeleteContrat()
  const suppressionContrat = useConfirmDelete<ContratRow>({
    onDelete: (c) => delContrat.mutateAsync(c.id),
    successMessage: 'Contrat supprimé',
  })

  // Top bar : action « + » contextuelle à l'onglet (Nouveau contrat), suivie de
  // « Modifier le prestataire », toujours présente. Boutons icône + tooltip
  // (convention PageHeader), réservés aux gestionnaires. L'onglet Documents est en
  // lecture seule (documents des OT) : pas d'action de rattachement ici.
  const headerAction = canManage ? (
    <>
      {onglet === 'contrats' && (
        <TooltipIconButton
          icon={<Plus />}
          label="Nouveau contrat"
          variant="outline"
          onClick={contratDialog.openCreate}
        />
      )}
      <TooltipIconButton
        icon={<Pencil />}
        label="Modifier le prestataire"
        variant="outline"
        onClick={() => setEditPrestataire(true)}
      />
    </>
  ) : undefined

  return (
    // `no-scrollbar` : seule la zone de contenu défile, barre masquée.
    <PageContainer className="no-scrollbar">
      {/* Géométrie portée par DetailTabsShell — la MÊME que la fiche gamme et la
          fiche OT. Ce montage était auparavant réassemblé à la main ici, et
          avait déjà divergé de la brique (état vide, wrapper de corps). */}
      <DetailTabsShell
        tabsAriaLabel="Sections du prestataire"
        value={onglet}
        onValueChange={setOnglet}
        items={[
          { id: 'contrats', label: 'Contrats' },
          { id: 'gammes', label: 'Gammes' },
          { id: 'ot', label: 'Ordres de travail' },
          { id: 'documents', label: 'Documents' },
        ]}
        header={
          <PageHeader
            title={prestataire.libelle}
            breadcrumb={[{ label: 'Prestataires', onClick: onBack }]}
            titleBadges={
              <Badge
                variant={prestataire.est_interne ? 'default' : 'secondary'}
              >
                {prestataire.est_interne ? 'Interne' : 'Externe'}
              </Badge>
            }
            action={headerAction}
          />
        }
        headerCard={
          <DetailHeaderCard
            thumbnail={
              <MiniatureThumb
                url={urlOf(prestataire.miniature_id)}
                fallback={<Truck className="size-10" />}
                alt=""
                onError={refreshMiniatures}
                className="size-full rounded-none"
              />
            }
            fields={[
              prestataire.metier
                ? { label: 'Métier', value: prestataire.metier }
                : null,
              prestataire.ville
                ? { label: 'Ville', value: prestataire.ville }
                : null,
              prestataire.telephone
                ? { label: 'Téléphone', value: prestataire.telephone }
                : null,
              prestataire.email
                ? { label: 'E-mail', value: prestataire.email }
                : null,
            ]}
            columns={2}
          />
        }
      >
        {(actif) => (
          <>
            {actif === 'contrats' && (
              <ContratsPanel
                siteId={siteId}
                prestataireId={prestataire.id}
                prestataireNom={prestataire.libelle}
                canManage={canManage}
                onNew={contratDialog.openCreate}
                onEdit={contratDialog.openEdit}
                onDelete={suppressionContrat.demander}
                onAvenant={avenantDialog.openEdit}
                onResilier={resilierDialog.openEdit}
              />
            )}
            {actif === 'gammes' && (
              <GammesPanel
                prestataireId={prestataire.id}
                siteId={siteId}
                urlOf={urlOf}
                refreshMiniatures={refreshMiniatures}
              />
            )}
            {actif === 'ot' && (
              <OtPanel
                prestataireId={prestataire.id}
                siteId={siteId}
                urlOf={urlOf}
                refreshMiniatures={refreshMiniatures}
              />
            )}
            {actif === 'documents' && (
              <OtDocumentsPanel
                prestataireId={prestataire.id}
                siteId={siteId}
                canDelete={canManage}
              />
            )}
          </>
        )}
      </DetailTabsShell>

      {canManage && (
        <>
          <PrestataireFormDialog
            key={prestataire.id}
            open={editPrestataire}
            onOpenChange={setEditPrestataire}
            siteId={siteId}
            prestataire={prestataire}
          />
          <ContratFormDialog
            key={contratDialog.dialogKey}
            open={contratDialog.open}
            onOpenChange={contratDialog.onOpenChange}
            siteId={siteId}
            prestataireId={prestataire.id}
            contrat={contratDialog.entity}
          />
          {avenantDialog.entity && (
            <ContratAvenantDialog
              key={avenantDialog.dialogKey}
              open={avenantDialog.open}
              onOpenChange={avenantDialog.onOpenChange}
              siteId={siteId}
              prestataireId={prestataire.id}
              parent={avenantDialog.entity}
            />
          )}
          {resilierDialog.entity && (
            <ContratResilierDialog
              key={resilierDialog.dialogKey}
              open={resilierDialog.open}
              onOpenChange={resilierDialog.onOpenChange}
              contrat={resilierDialog.entity}
            />
          )}
          <ConfirmDeleteDialog
            {...suppressionContrat.dialogProps}
            entityLabel={
              suppressionContrat.toDelete
                ? `le contrat « ${suppressionContrat.toDelete.reference} »`
                : 'le contrat'
            }
            warning="Cette suppression est définitive."
          />
        </>
      )}
    </PageContainer>
  )
}

/**
 * Onglet Contrats : liste de `ContratCard` riches + CRUD complet (les dialogues
 * sont pilotés par la fiche hôte). Chaque carte porte statut détaillé, progression,
 * infos adaptatives, historique des versions (chaîne d'avenants) et documents.
 * `list` ne renvoie que les VERSIONS COURANTES ; `versions` (archivés inclus)
 * alimente le comptage d'avenants et l'historique par carte.
 */
function ContratsPanel({
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
      pending={<ListRowSkeletons count={2} />}
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
          className="min-h-40 flex-1 justify-center"
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

/**
 * Onglet Gammes : gammes du prestataire sur le site (lien direct
 * `gammes.prestataire_id`), en LECTURE SEULE. Réutilise `GammeCard` (variante
 * Bibliothèque) — on masque le prestataire (`showPrestataire={false}`) puisqu'on
 * est déjà sur sa fiche. Le clic ouvre la fiche gamme dans le Plan de maintenance
 * via `?open=<id>` (l'explorateur reconstruit le chemin d'URL catégorie → gamme).
 */
function GammesPanel({
  prestataireId,
  siteId,
  urlOf,
  refreshMiniatures,
}: { prestataireId: string; siteId: string } & MiniatureAccess) {
  const navigate = useNavigate()
  const query = useQuery(prestatairesQueries.gammes(prestataireId, siteId))

  // OT des gammes affichées → badge de statut + périodicité sur chaque carte, comme
  // dans le Plan de maintenance (MÊME variante de `GammeCard` via `statutOts`).
  const gammeIds = useMemo(
    () => (query.data ?? []).map((g) => g.id),
    [query.data],
  )
  const otsQuery = useQuery(ordresTravailQueries.byGammes(siteId, gammeIds))
  useRealtimeRefresh('ordres_travail', OT_QUERY_KEYS)
  // Badge masqué seulement pendant un vrai fetch / sur erreur (pas de statut trompeur).
  const otsIndispo = otsQuery.isLoading || otsQuery.isError
  const otsParGamme = useMemo(() => {
    const map = new Map<string, OtTriable[]>()
    for (const ot of otsQuery.data ?? []) {
      if (ot.gamme_id === null) continue
      const liste = map.get(ot.gamme_id) ?? []
      liste.push(ot)
      map.set(ot.gamme_id, liste)
    }
    return map
  }, [otsQuery.data])

  return (
    <QueryState
      query={query}
      pending={<ListRowSkeletons count={3} />}
      empty={
        <EmptyState
          icon={Wrench}
          title="Aucune gamme"
          description="Aucune gamme rattachée à ce prestataire sur le site actif."
          className="min-h-40 flex-1 justify-center"
        />
      }
    >
      {(gammes) => (
        <div className={listStack}>
          {gammes.map((g) => (
            <GammeCard
              key={g.id}
              gamme={g}
              urlOf={urlOf}
              refreshMiniatures={refreshMiniatures}
              showPrestataire={false}
              // Variante « Plan de maintenance » : badge de statut + périodicité.
              statutOts={otsParGamme.get(g.id) ?? []}
              statutPending={otsIndispo}
              // Ouvre la fiche gamme dans le Plan de maintenance : on passe l'id via
              // `?open=` et l'explorateur reconstruit le chemin propre (catégorie →
              // sous-catégorie → gamme) — pas de duplication de cette logique ici.
              onClick={() =>
                void navigate({
                  to: '/gammes/$',
                  params: { _splat: '' },
                  search: { open: g.id },
                })
              }
            />
          ))}
        </div>
      )}
    </QueryState>
  )
}

/**
 * Onglet Documents — documents rattachés aux ORDRES DE TRAVAIL du prestataire (sur
 * le site actif). Réutilise les briques documents standard : `DocumentRow` (rendu
 * identique partout), aperçu au clic, et menu contextuel `Télécharger` +
 * `Supprimer` (hard-delete, gestionnaires uniquement). Pas de détache : ces
 * documents ne sont pas « rattachés au prestataire » mais à ses OT.
 */
function OtDocumentsPanel({
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
      pending={<ListRowSkeletons count={4} />}
      empty={
        <EmptyState
          icon={FileText}
          title="Aucun document"
          description="Aucun document rattaché aux ordres de travail de ce prestataire sur le site actif."
          className="min-h-40 flex-1 justify-center"
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

/**
 * Onglet Ordres de travail : OT du prestataire sur le site, en LECTURE SEULE.
 * Réutilise `OtCard` (clic → fiche OT), la barre `ListFilterBar` + le filtre statut
 * de la page OT (`matchStatutOt` / `statutOtFilterOptions`) et le tri par urgence.
 * Défaut « Non terminés » (un prestataire peut cumuler beaucoup d'historique).
 */
function OtPanel({
  prestataireId,
  siteId,
  urlOf,
  refreshMiniatures,
}: { prestataireId: string; siteId: string } & MiniatureAccess) {
  const query = useQuery(
    prestatairesQueries.ordresTravail(prestataireId, siteId),
  )
  // Onglet OT en LIVE (clôture/changement de statut ailleurs visible sans F5).
  // Canal `ordres_travail` partagé/refcompté avec l'onglet Gammes → aucun surcoût.
  useRealtimeRefresh('ordres_travail', OT_QUERY_KEYS)
  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState<string>(FILTRE_NON_TERMINES)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return trierOtParUrgence(
      (query.data ?? []).filter((ot) => {
        if (!matchStatutOt(ot.statut, statutFilter)) return false
        if (q === '') return true
        return [ot.nom_gamme, ot.nom_equipement].some((v) =>
          v?.toLowerCase().includes(q),
        )
      }),
    )
  }, [query.data, search, statutFilter])

  return (
    <QueryState
      query={query}
      pending={<ListRowSkeletons count={4} />}
      empty={
        <EmptyState
          icon={ClipboardList}
          title="Aucun ordre de travail"
          description="Aucun OT pour ce prestataire sur le site actif."
          className="min-h-40 flex-1 justify-center"
        />
      }
    >
      {() => (
        <div className="flex flex-col gap-4">
          <ListFilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher un ordre de travail…"
            filterValue={statutFilter}
            onFilterChange={setStatutFilter}
            options={statutOtFilterOptions()}
            filterLabel="Filtrer par statut"
            sticky
          />
          {filtered.length === 0 ? (
            <NoSearchResults description="Aucun ordre de travail ne correspond à ces critères." />
          ) : (
            <div className={listStack}>
              {filtered.map((ot) => (
                <OtCard
                  key={ot.id}
                  ot={ot}
                  urlOf={urlOf}
                  refreshMiniatures={refreshMiniatures}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </QueryState>
  )
}
