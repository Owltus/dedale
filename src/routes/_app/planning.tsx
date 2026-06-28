import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { useQuery } from '@tanstack/react-query'
import { CalendarRange, Search } from 'lucide-react'
import { planningQueries } from '@/features/planning/queries'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import { calculerRelevesParOt } from '@/features/ordres-travail/releves'
import { construireLignes } from '@/features/planning/grille'
import type { PlanningOt } from '@/features/planning/grille'
import {
  fenetreSemaines,
  isoLocale,
  lundiDeLaSemaine,
} from '@/features/planning/semaines'
import type { SemaineIso } from '@/features/planning/semaines'
import {
  PlanningGrille,
  PlanningLegende,
} from '@/features/planning/components/planning-grille'
import { CelluleDialog } from '@/features/planning/components/cellule-dialog'
import { useSiteContext } from '@/lib/site-context'
import { formatDate } from '@/lib/date'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { QueryState } from '@/components/common/query-state'
import { SearchInput } from '@/components/common/search-input'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_app/planning')({
  beforeLoad: ({ context }) => requireNav('/planning', context.queryClient),
  component: PlanningPage,
})

const NB_SEMAINES = 12

function PlanningPage() {
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Planning"
        description="Charge prévisionnelle par gamme et par semaine."
        hint="Choisis un site pour voir son planning."
        icon={CalendarRange}
      />
    )
  }

  return <PlanningContent siteId={activeSiteId} />
}

function PlanningContent({ siteId }: { siteId: string }) {
  // Fenêtre figée au montage : lundi de la semaine courante + 12 semaines.
  const { semaines, debutIso, finIso } = useMemo(() => {
    const sems = fenetreSemaines(new Date(), NB_SEMAINES)
    const debut = lundiDeLaSemaine(new Date())
    // Dernier jour de la fenêtre = dimanche de la dernière semaine inclus.
    const fin = new Date(debut)
    fin.setDate(fin.getDate() + NB_SEMAINES * 7 - 1)
    return {
      semaines: sems,
      debutIso: isoLocale(debut),
      finIso: isoLocale(fin),
    }
  }, [])

  const query = useQuery(planningQueries.fenetre(siteId, debutIso, finIso))
  // Relevés du site (même requête groupée et même logique que la page liste) → la
  // popup d'une cellule affiche le relevé comme partout ailleurs.
  const relevesQuery = useQuery(ordresTravailQueries.relevesListe(siteId))
  const releveParOt = useMemo(
    () => calculerRelevesParOt(relevesQuery.data ?? []),
    [relevesQuery.data],
  )

  const [recherche, setRecherche] = useState('')
  const [cellule, setCellule] = useState<{
    ots: PlanningOt[]
    semaine: SemaineIso
  } | null>(null)

  // Dérivation au niveau du composant (impossible d'appeler des hooks dans la
  // render-prop de QueryState). Garde sur `query.data` pendant le chargement.
  const lignes = useMemo(() => construireLignes(query.data ?? []), [query.data])
  const lignesFiltrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    if (!terme) return lignes
    return lignes.filter((l) => l.nomGamme.toLowerCase().includes(terme))
  }, [lignes, recherche])

  const titreSemaine = cellule
    ? `S${String(cellule.semaine.numero)} — semaine du ${formatDate(cellule.semaine.debut)}`
    : ''

  return (
    <PageContainer>
      <PageHeader
        title="Planning"
        description={`Charge prévisionnelle par gamme sur ${String(NB_SEMAINES)} semaines (à partir de cette semaine).`}
      />

      <QueryState
        query={query}
        pending={<Skeleton className="h-96 w-full" />}
        empty={
          <EmptyState
            icon={CalendarRange}
            title="Aucun ordre de travail planifié"
            description="Aucun OT n'est prévu sur cette fenêtre de 12 semaines pour ce site."
          />
        }
      >
        {() => (
          <div className="flex flex-col gap-4">
            <SearchInput
              value={recherche}
              onChange={setRecherche}
              placeholder="Filtrer par gamme…"
              className="max-w-xs"
            />

            {lignesFiltrees.length === 0 ? (
              <EmptyState
                icon={Search}
                title="Aucune gamme ne correspond"
                description="Aucune gamme planifiée ne correspond à cette recherche."
              />
            ) : (
              <PlanningGrille
                lignes={lignesFiltrees}
                semaines={semaines}
                onSelect={(ots, semaine) => setCellule({ ots, semaine })}
              />
            )}

            <PlanningLegende />
          </div>
        )}
      </QueryState>

      <CelluleDialog
        ots={cellule?.ots ?? null}
        releveParOt={releveParOt}
        titreSemaine={titreSemaine}
        onClose={() => setCellule(null)}
      />
    </PageContainer>
  )
}
