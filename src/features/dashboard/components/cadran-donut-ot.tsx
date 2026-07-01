import { useMemo, useState } from 'react'
import { Donut } from '@/components/common/charts/donut'
import type { ChartSegment } from '@/components/common/charts/chart-legend'
import { CelluleDialog } from '@/features/planning/components/cellule-dialog'
import { estPlanifieEnRetard } from '@/features/ordres-travail/statut-affichage'
import { cleSemaine } from '@/features/planning/semaines'
import type { StatusTone } from '@/components/common/status-badge'
import type { PlanningOt } from '@/features/planning/grille'
import { DashboardCard } from './dashboard-card'
import { useDashboardData } from '../use-dashboard-data'

interface CadranDonutOtProps {
  siteId: string
}

/** Parse `YYYY-MM-DD` en Date LOCALE à minuit (sans fuseau) — cf. `stats.ts`. */
function parseDateLocale(value: string): Date {
  const [a, m, j] = value.slice(0, 10).split('-').map(Number)
  return new Date(a ?? 1970, (m ?? 1) - 1, j ?? 1)
}

/** Une part du donut : segment de dataviz + la LISTE des OT qu'elle représente. */
interface PartOt {
  segment: ChartSegment
  ots: PlanningOt[]
}

/**
 * Cadran « Ordres de travail » (zone 1 gauche du tableau de bord) : anneau à quatre
 * parts MUTUELLEMENT EXCLUSIVES — En retard / Cette semaine (planifié échéance cette
 * semaine ISO) / En cours (en_cours ou rouvert) / Clôturé (clôturé cette semaine,
 * contexte « fait »). Au CENTRE, le RESTE À FAIRE = somme des trois premières, les
 * clôturés EXCLUS. Prédicats canoniques (`estPlanifieEnRetard`, `cleSemaine`) +
 * couleurs alignées sur le planning → le donut ne diverge jamais des badges.
 *
 * Présentation dépouillée (demande PO) : carte SANS titre ni légende, donut agrandi,
 * centre = nombre seul. Survol d'une part → infobulle (gérée par `Donut`). Clic sur
 * une part → coquille `CelluleDialog` du planning listant les OT de la catégorie
 * (chaque `OtCard` du modal ouvre ensuite sa fiche).
 * **Total à faire = 0 → le cadran ne se rend pas** (l'orchestrateur masque la colonne).
 */
export function CadranDonutOt({ siteId }: CadranDonutOtProps) {
  const { ordresTravail } = useDashboardData(siteId)
  const [cellule, setCellule] = useState<{
    ots: PlanningOt[]
    titre: string
  } | null>(null)

  // Clic sur une part → modal listant les OT de cette catégorie (comme le clic sur un
  // n° de semaine du planning). La navigation vers une fiche se fait ensuite depuis le
  // modal, en cliquant une `OtCard`.
  const ouvrir = (ots: PlanningOt[], titre: string) => {
    if (ots.length > 0) setCellule({ ots, titre })
  }

  // Listes par part, filtrées avec les prédicats canoniques (une seule lecture
  // d'horloge partagée par tous les prédicats de ce recalcul).
  const parts = useMemo<PartOt[]>(() => {
    const maintenant = new Date()
    const cleCourante = cleSemaine(maintenant)

    const enRetard = ordresTravail.filter((ot) =>
      estPlanifieEnRetard(ot, maintenant),
    )
    const cetteSemaine = ordresTravail.filter(
      (ot) =>
        ot.statut === 'planifie' &&
        cleSemaine(parseDateLocale(ot.date_prevue)) === cleCourante,
    )
    const enCours = ordresTravail.filter(
      (ot) => ot.statut === 'en_cours' || ot.statut === 'reouvert',
    )
    // Clôturés CETTE SEMAINE (date de clôture dans la semaine ISO courante) : borne
    // volontaire — sinon tout l'historique clôturé écraserait le donut. Arc de
    // CONTEXTE « fait cette semaine », à côté du « reste à faire ».
    const clotureSemaine = ordresTravail.filter(
      (ot) =>
        ot.statut === 'cloture' &&
        ot.date_cloture !== null &&
        cleSemaine(new Date(ot.date_cloture)) === cleCourante,
    )

    const defs: {
      key: string
      label: string
      tone: StatusTone
      ots: PlanningOt[]
    }[] = [
      {
        key: 'en-retard',
        label: 'En retard',
        tone: 'destructive',
        ots: enRetard,
      },
      {
        key: 'cette-semaine',
        label: 'Cette semaine',
        // MÊME code couleur que la charge/planning : « Cette semaine » = jaune
        // (cf. `statutAffichageOt` + surlignage jaune de la semaine courante du planning).
        tone: 'yellow',
        ots: cetteSemaine,
      },
      // « En cours » (en_cours/rouvert) = bleu, comme `statutOtTone('en_cours')`.
      { key: 'en-cours', label: 'En cours', tone: 'info', ots: enCours },
      // « Clôturé » (cette semaine) = vert, comme `statutOtTone('cloture')`.
      {
        key: 'cloture',
        label: 'Clôturé',
        tone: 'success',
        ots: clotureSemaine,
      },
    ]
    return defs.map(({ key, label, tone, ots }) => ({
      segment: {
        key,
        label,
        value: ots.length,
        tone,
        onClick: () => {
          ouvrir(ots, label)
        },
      },
      ots,
    }))
  }, [ordresTravail])

  // Le centre = RESTE À FAIRE = En retard + Cette semaine + En cours (les clôturés en
  // sont EXCLUS : « Clôturé » est un arc de contexte « fait cette semaine »). Toutes les
  // catégories sont mutuellement exclusives par statut → pas de double comptage. Cadran
  // masqué s'il n'y a AUCUNE activité (aucun arc).
  const segments = parts.map((p) => p.segment)
  const totalArcs = segments.reduce((n, s) => n + s.value, 0)
  if (totalArcs === 0) return null
  const total = segments
    .filter((s) => s.key !== 'cloture')
    .reduce((n, s) => n + s.value, 0)

  return (
    <DashboardCard
      square
      dense
      className="w-full max-w-[300px] justify-self-center lg:w-[300px]"
      contentClassName="flex items-center justify-center"
    >
      <Donut
        segments={segments}
        epaisseur={20}
        className="aspect-square h-full max-h-full w-full"
        centre={
          <span className="text-4xl leading-none font-semibold">{total}</span>
        }
      />

      <CelluleDialog
        ots={cellule?.ots ?? null}
        titre={cellule?.titre ?? ''}
        onClose={() => setCellule(null)}
      />
    </DashboardCard>
  )
}
