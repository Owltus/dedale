import { useState } from 'react'
import type { ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpenCheck,
  CheckCircle2,
  ListChecks,
  Plus,
  ShieldAlert,
} from 'lucide-react'
import {
  observationsQueries,
  otsPourObservationQueries,
} from '@/features/observations/queries'
import {
  LIBELLES_GRAVITE,
  LIBELLES_SOURCE,
  LIBELLES_STATUT,
  SOURCES,
  libelleTypeLigne,
  variantGravite,
  variantStatut,
} from '@/features/observations/schemas'
import { ObservationFormDialog } from '@/features/observations/components/observation-form-dialog'
import { ObservationLeverDialog } from '@/features/observations/components/observation-lever-dialog'
import { useAuth } from '@/auth'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { formatDate } from '@/lib/date'
import { cardGrid } from '@/lib/responsive'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_app/registre')({
  component: RegistrePage,
})

type Tab = 'observations' | 'registre'

function RegistrePage() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const { activeSiteId } = useSiteContext()
  const [tab, setTab] = useState<Tab>('observations')

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Registre de sécurité"
        description="Observations de conformité et registre de sécurité du site."
        hint="Choisis un site pour consulter ses observations et son registre."
        icon={ShieldAlert}
      />
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Registre de sécurité"
        description="Observations de conformité (contrôles, commission, inspections) et registre du site."
      />

      <div className="mb-4 flex gap-1 border-b">
        <TabButton
          active={tab === 'observations'}
          onClick={() => setTab('observations')}
        >
          <ListChecks className="size-4" /> Observations
        </TabButton>
        <TabButton
          active={tab === 'registre'}
          onClick={() => setTab('registre')}
        >
          <BookOpenCheck className="size-4" /> Registre de sécurité
        </TabButton>
      </div>

      {tab === 'observations' ? (
        <ObservationsTab siteId={activeSiteId} canManage={canManage} />
      ) : (
        <RegistreTab siteId={activeSiteId} />
      )}
    </PageContainer>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
        (active
          ? 'border-primary text-foreground'
          : 'text-muted-foreground hover:text-foreground border-transparent')
      }
    >
      {children}
    </button>
  )
}

// --- Onglet Observations ---

function ObservationsTab({
  siteId,
  canManage,
}: {
  siteId: string
  canManage: boolean
}) {
  const { session } = useAuth()
  const [statut, setStatut] = useState('')
  const [source, setSource] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [toLever, setToLever] = useState<{
    id: string
    description: string
  } | null>(null)

  // Préchargement des OT pour ne pas bloquer l'ouverture du dialog de création.
  useQuery(otsPourObservationQueries.list(siteId))

  const query = useQuery(observationsQueries.list(siteId, { statut, source }))

  const newButton =
    canManage && session ? (
      <Button onClick={() => setCreateOpen(true)}>
        <Plus /> Nouvelle observation
      </Button>
    ) : undefined

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="grid gap-1">
            <label className="text-muted-foreground text-xs" htmlFor="f-statut">
              Statut
            </label>
            <Select
              id="f-statut"
              value={statut}
              onChange={(e) => setStatut(e.target.value)}
              className="w-auto"
            >
              <option value="">Tous</option>
              {Object.entries(LIBELLES_STATUT).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1">
            <label className="text-muted-foreground text-xs" htmlFor="f-source">
              Source
            </label>
            <Select
              id="f-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-auto"
            >
              <option value="">Toutes</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {LIBELLES_SOURCE[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {newButton}
      </div>

      <QueryState
        query={query}
        pending={<CardSkeletons count={4} height="h-44" />}
        empty={
          <EmptyState
            icon={ListChecks}
            title="Aucune observation"
            description={
              canManage
                ? 'Crée une observation pour suivre une réserve de conformité.'
                : 'Aucune observation enregistrée pour ce site.'
            }
            action={newButton}
          />
        }
      >
        {(observations) => (
          <div className={cardGrid.default}>
            {observations.map((o) => {
              const enRetard =
                o.statut === 'en_cours' &&
                o.echeance !== null &&
                o.echeance < today
              return (
                <Card key={o.id} className="min-w-0">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm leading-snug break-words">
                        {o.description}
                      </CardTitle>
                      <Badge
                        variant={variantStatut(o.statut)}
                        className="shrink-0"
                      >
                        {LIBELLES_STATUT[o.statut] ?? o.statut}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={variantGravite(o.gravite)}>
                        {LIBELLES_GRAVITE[o.gravite] ?? o.gravite}
                      </Badge>
                      <Badge variant="outline">
                        {LIBELLES_SOURCE[o.source] ?? o.source}
                      </Badge>
                      {enRetard && (
                        <Badge variant="destructive">En retard</Badge>
                      )}
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <dt className="text-muted-foreground">Échéance</dt>
                      <dd className="text-right">{formatDate(o.echeance)}</dd>
                      <dt className="text-muted-foreground">OT lié</dt>
                      <dd className="truncate text-right">
                        {o.ordres_travail?.nom_gamme ?? '—'}
                      </dd>
                      <dt className="text-muted-foreground">Équipement</dt>
                      <dd className="truncate text-right">
                        {o.equipements?.nom ?? '—'}
                      </dd>
                      {o.statut === 'levee' && (
                        <>
                          <dt className="text-muted-foreground">Levée le</dt>
                          <dd className="text-right">
                            {formatDate(o.date_levee)}
                          </dd>
                        </>
                      )}
                    </dl>
                    {o.statut === 'levee' && o.commentaire_levee && (
                      <p className="text-muted-foreground border-l-2 pl-2 text-xs italic">
                        {o.commentaire_levee}
                      </p>
                    )}
                    {canManage && session && o.statut === 'en_cours' && (
                      <div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setToLever({
                              id: o.id,
                              description: o.description,
                            })
                          }
                        >
                          <CheckCircle2 /> Lever
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

      {canManage && session && (
        <ObservationFormDialog
          key={createOpen ? 'open' : 'closed'}
          open={createOpen}
          onOpenChange={setCreateOpen}
          siteId={siteId}
          createdBy={session.user.id}
        />
      )}

      {canManage && session && toLever && (
        <ObservationLeverDialog
          key={toLever.id}
          open
          onOpenChange={(open) => {
            if (!open) setToLever(null)
          }}
          observationId={toLever.id}
          description={toLever.description}
          leveeBy={session.user.id}
        />
      )}
    </div>
  )
}

// --- Onglet Registre de sécurité (lecture) ---

function RegistreTab({ siteId }: { siteId: string }) {
  const query = useQuery(observationsQueries.registre(siteId))

  return (
    <QueryState
      query={query}
      pending={<Skeleton className="h-64 w-full" />}
      empty={
        <EmptyState
          icon={BookOpenCheck}
          title="Registre vide"
          description="Les contrôles réglementaires clôturés et les observations du site apparaîtront ici."
        />
      }
    >
      {(lignes) => (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Objet</th>
                <th className="px-3 py-2 font-medium">Gravité</th>
                <th className="px-3 py-2 font-medium">Statut</th>
                <th className="px-3 py-2 font-medium">Échéance</th>
                <th className="px-3 py-2 font-medium">Intervenant</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={l.ref_id ?? `ligne-${String(i)}`} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDate(l.date_ligne)}
                  </td>
                  <td className="px-3 py-2">
                    {libelleTypeLigne(l.type_ligne)}
                  </td>
                  <td className="px-3 py-2">{l.objet ?? '—'}</td>
                  <td className="px-3 py-2">
                    {l.gravite ? (
                      <Badge variant={variantGravite(l.gravite)}>
                        {LIBELLES_GRAVITE[l.gravite] ?? l.gravite}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {l.statut ? (
                      <Badge variant={variantStatut(l.statut)}>
                        {LIBELLES_STATUT[l.statut] ?? l.statut}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDate(l.echeance)}
                  </td>
                  <td className="px-3 py-2">{l.intervenant ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </QueryState>
  )
}
