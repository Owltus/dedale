import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Boxes,
  ChevronRight,
  CopyPlus,
  MapPin,
  Package,
  Pencil,
  Plus,
  Tag,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  equipementsQueries,
  modelesEquipementsQueries,
} from '@/features/equipements/queries'
import { useDeleteEquipement } from '@/features/equipements/mutations'
import { EquipementFormDialog } from '@/features/equipements/components/equipement-form-dialog'
import { InstancierDialog } from '@/features/equipements/components/instancier-dialog'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { deleteErrorMessage } from '@/lib/form'
import { parseChamps, formatChampValeur } from '@/lib/champs'
import { cardGrid } from '@/lib/responsive'
import * as perm from '@/lib/permissions'
import { formatDate } from '@/lib/date'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { SubTabs } from '@/components/common/sub-tabs'
import { EmptyState } from '@/components/common/empty-state'
import { SearchInput } from '@/components/common/search-input'
import { NoSearchResults } from '@/components/common/no-search-results'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type Equipement = Database['public']['Views']['v_equipements_complet']['Row']

export const Route = createFileRoute('/_app/equipements')({
  beforeLoad: ({ context }) => requireNav('/equipements', context.queryClient),
  component: EquipementsPage,
})

const GRID = cardGrid.default

type Tab = 'equipements' | 'modeles'

function EquipementsPage() {
  const { activeSiteId } = useSiteContext()
  const { data: role } = useCurrentRole()
  const canEdit = perm.canManageMetier(role)

  const [tab, setTab] = useState<Tab>('equipements')
  // Détail équipement en page (pas de route) : équipement sélectionné.
  const [selected, setSelected] = useState<Equipement | null>(null)

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Équipements"
        description="Parc matériel et modèles d’équipement du site."
        hint="Choisis un site actif pour gérer ses équipements."
        icon={Package}
      />
    )
  }

  if (selected) {
    return (
      <EquipementDetail
        siteId={activeSiteId}
        equipement={selected}
        canEdit={canEdit}
        onBack={() => setSelected(null)}
      />
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Équipements"
        description="Parc matériel et modèles d’équipement du site."
      />

      <SubTabs
        ariaLabel="Sections des équipements"
        value={tab}
        onValueChange={setTab}
        items={[
          {
            id: 'equipements',
            label: 'Équipements',
            icon: <Package className="size-4" />,
          },
          {
            id: 'modeles',
            label: 'Modèles',
            icon: <Boxes className="size-4" />,
          },
        ]}
      />

      {tab === 'equipements' ? (
        <EquipementsList
          siteId={activeSiteId}
          canEdit={canEdit}
          onOpen={setSelected}
        />
      ) : (
        <ModelesList siteId={activeSiteId} canEdit={canEdit} />
      )}
    </PageContainer>
  )
}

// --- Liste des équipements ---

function EquipementsList({
  siteId,
  canEdit,
  onOpen,
}: {
  siteId: string
  canEdit: boolean
  onOpen: (eq: Equipement) => void
}) {
  const query = useQuery(equipementsQueries.list(siteId))
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  const del = useDeleteEquipement()
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<{ open: boolean; eq: Equipement | null }>({
    open: false,
    eq: null,
  })
  const [toDelete, setToDelete] = useState<Equipement | null>(null)

  function confirmDelete() {
    if (!toDelete?.id) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Équipement supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(deleteErrorMessage(e)),
    })
  }

  const newButton = canEdit ? (
    <Button onClick={() => setForm({ open: true, eq: null })}>
      <Plus /> Nouvel équipement
    </Button>
  ) : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher par nom ou code…"
          className="max-w-xs flex-1"
        />
        {newButton}
      </div>

      <QueryState
        query={query}
        pending={<CardSkeletons count={6} height="h-32" />}
        empty={
          <EmptyState
            icon={Package}
            title="Aucun équipement"
            description={
              canEdit
                ? 'Crée le premier équipement de ce site.'
                : 'Aucun équipement sur ce site.'
            }
            action={newButton}
          />
        }
      >
        {(equipements) => {
          const q = search.trim().toLowerCase()
          const filtered = q
            ? equipements.filter(
                (e) =>
                  (e.nom ?? '').toLowerCase().includes(q) ||
                  (e.code_inventaire ?? '').toLowerCase().includes(q),
              )
            : equipements
          if (filtered.length === 0) {
            return (
              <NoSearchResults description="Aucun équipement ne correspond à ta recherche." />
            )
          }
          return (
            <div className={GRID}>
              {filtered.map((e) => (
                <Card key={e.id} className="min-w-0">
                  <CardHeader>
                    <div className="flex min-w-0 items-center gap-3">
                      <MiniatureThumb
                        url={urlOf(e.miniature_id)}
                        fallback={<Package className="size-5" />}
                        alt=""
                        onError={refreshMiniatures}
                        className="size-10 shrink-0 rounded-md"
                      />
                      <CardTitle className="truncate">{e.nom}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      {e.code_inventaire && (
                        <Badge variant="secondary">{e.code_inventaire}</Badge>
                      )}
                      {e.categorie_nom && (
                        <Badge variant="outline">
                          <Tag className="size-3" /> {e.categorie_nom}
                        </Badge>
                      )}
                    </div>
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="size-3 shrink-0" />
                      {e.localisation_courte ?? e.local_nom ?? '—'}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => onOpen(e)}>
                        <ChevronRight /> Détail
                      </Button>
                      {canEdit && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setForm({ open: true, eq: e })}
                          >
                            <Pencil /> Modifier
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setToDelete(e)}
                          >
                            <Trash2 /> Supprimer
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        }}
      </QueryState>

      {canEdit && (
        <EquipementFormDialog
          key={form.eq?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          siteId={siteId}
          equipement={form.eq}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer l’équipement ?"
        description={
          toDelete
            ? `« ${toDelete.nom ?? ''} » sera placé dans la corbeille (suppression définitive après 90 jours).`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

// --- Détail équipement (en page) ---

function EquipementDetail({
  siteId,
  equipement: equipementProp,
  canEdit,
  onBack,
}: {
  siteId: string
  equipement: Equipement
  canEdit: boolean
  onBack: () => void
}) {
  // On re-dérive l'équipement depuis la liste (cache TanStack) pour refléter
  // les données fraîches après une édition (sinon la fiche resterait figée).
  const { data: list = [] } = useQuery(equipementsQueries.list(siteId))
  const equipement =
    list.find((e) => e.id === equipementProp.id) ?? equipementProp
  const [editOpen, setEditOpen] = useState(false)
  const specs = parseChamps(equipement.specifications)
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  return (
    <PageContainer>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
        <ArrowLeft /> Retour aux équipements
      </Button>

      <PageHeader
        title={equipement.nom ?? 'Équipement'}
        description={equipement.localisation_complete ?? undefined}
        action={
          canEdit ? (
            <Button onClick={() => setEditOpen(true)}>
              <Pencil /> Modifier
            </Button>
          ) : undefined
        }
      />

      <MiniatureThumb
        url={urlOf(equipement.miniature_id)}
        fallback={<Package className="size-10" />}
        alt=""
        onError={refreshMiniatures}
        className="mb-4 size-24 rounded-lg"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <InfoRow
              label="Code inventaire"
              value={equipement.code_inventaire}
            />
            <InfoRow label="Catégorie" value={equipement.categorie_nom} />
            <InfoRow
              label="Emplacement"
              value={equipement.localisation_complete ?? equipement.local_nom}
            />
            <InfoRow
              label="Mise en service"
              value={formatDate(equipement.date_mise_en_service)}
            />
            <InfoRow
              label="Fin de garantie"
              value={formatDate(equipement.date_fin_garantie)}
            />
            <InfoRow label="Commentaires" value={equipement.commentaires} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Caractéristiques techniques</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {specs.length === 0 ? (
              <p className="text-muted-foreground">
                Aucune caractéristique renseignée.
              </p>
            ) : (
              <dl className="flex flex-col gap-2">
                {specs.map((champ, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <dt className="text-muted-foreground truncate">
                      {champ.cle}
                    </dt>
                    <dd className="font-medium break-words">
                      {formatChampValeur(champ, champ.valeur ?? null)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <PlaceholderCard title="Gammes" />
        <PlaceholderCard title="Ordres de travail" />
        <PlaceholderCard title="Documents" />
      </div>

      {canEdit && (
        <EquipementFormDialog
          key={equipement.id ?? 'edit'}
          open={editOpen}
          onOpenChange={setEditOpen}
          siteId={siteId}
          equipement={equipement}
        />
      )}
    </PageContainer>
  )
}

function InfoRow({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words">{value ?? '—'}</span>
    </div>
  )
}

function PlaceholderCard({ title }: { title: string }) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-muted-foreground text-base">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        À venir.
      </CardContent>
    </Card>
  )
}

// --- Liste des modèles d'équipement ---

type ModeleRow = Database['public']['Tables']['modeles_equipements']['Row'] & {
  // `modeles_equipements.categorie_id` est NOT NULL → l'embed est toujours présent.
  categories: { id: string; nom: string }
}

function ModelesList({
  siteId,
  canEdit,
}: {
  siteId: string
  canEdit: boolean
}) {
  const query = useQuery(modelesEquipementsQueries.list(siteId))
  const [instancier, setInstancier] = useState<ModeleRow | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <QueryState
        query={query}
        pending={<CardSkeletons count={6} height="h-32" />}
        empty={
          <EmptyState
            icon={Boxes}
            title="Aucun modèle"
            description="La bibliothèque de modèles d’équipement est vide pour ce site."
          />
        }
      >
        {(modeles) => (
          <div className={GRID}>
            {modeles.map((m) => {
              const specs = parseChamps(m.specifications)
              return (
                <Card key={m.id} className="min-w-0">
                  <CardHeader>
                    <CardTitle className="truncate">{m.nom}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={m.site_id ? 'secondary' : 'outline'}>
                        {m.site_id ? 'Site' : 'Entreprise'}
                      </Badge>
                      {m.categories.nom && (
                        <Badge variant="outline">
                          <Tag className="size-3" /> {m.categories.nom}
                        </Badge>
                      )}
                    </div>
                    <span className="line-clamp-2 min-h-5">
                      {m.description ??
                        (specs.length > 0
                          ? `${String(specs.length)} caractéristique(s)`
                          : '—')}
                    </span>
                    {canEdit && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => setInstancier(m)}>
                          <CopyPlus /> Instancier
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </QueryState>

      {canEdit && (
        <InstancierDialog
          key={instancier?.id ?? 'none'}
          open={instancier !== null}
          onOpenChange={(open) => {
            if (!open) setInstancier(null)
          }}
          siteId={siteId}
          modeleId={instancier?.id ?? null}
          modeleNom={instancier?.nom ?? null}
        />
      )}
    </div>
  )
}

// --- Helpers ---
