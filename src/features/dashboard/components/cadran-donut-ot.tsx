import { useMemo, useState } from 'react'
import { Donut } from '@/components/common/charts/donut'
import type { ChartSegment } from '@/components/common/charts/chart-legend'
import { CelluleDialog } from '@/features/planning/components/cellule-dialog'
import { estPlanifieEnRetard } from '@/features/ordres-travail/statut-affichage'
import { cleSemaine } from '@/features/planning/semaines'
import { dateSemaineOt } from '@/features/planning/grille'
import type { StatusTone } from '@/components/common/status-badge'
import type { PlanningOt } from '@/features/planning/grille'
import { DashboardCard } from './dashboard-card'
import { CLASSE_CARRE_CADRAN } from './synthese-layout'
import { useDashboardData } from '../use-dashboard-data'

interface CadranDonutOtProps {
  siteId: string
}

/** Une part du donut : segment de dataviz + la LISTE des OT qu'elle représente. */
interface PartOt {
  segment: ChartSegment
  /** Statut terminal (clôturé/annulé) → exclu du « reste à faire » du centre. */
  terminal: boolean
  ots: PlanningOt[]
}

/** Clé de groupe des sous-parts « Cette semaine » (collées, sans espace entre elles). */
const GROUPE_CETTE_SEMAINE = 'cette-semaine'

/**
 * Cadran « Ordres de travail » (zone 1 gauche du tableau de bord) : anneau à TROIS
 * sections MUTUELLEMENT EXCLUSIVES, séparées par un espace —
 *   1. **En retard** (planifié à date dépassée, rouge) ;
 *   2. **En cours** (en_cours/rouvert des semaines PASSÉES, bleu) ;
 *   3. **Cette semaine** : une section SUBDIVISÉE (sous-parts COLLÉES, même `group`)
 *      par statut, pour lire l'avancement de la charge de la semaine ISO courante —
 *      Programmé (gris) / Planifié (violet) / En cours (bleu) / Clôturé (vert) /
 *      Annulé (rouge). Les « En cours de cette semaine » sont DISTINCTS des « En cours »
 *      des semaines passées (section 2) : on ne les confond pas.
 *
 * Appartenance « cette semaine » = `dateSemaineOt` (date de clôture pour un OT terminal,
 * sinon date prévue) dans la semaine ISO courante — MÊME règle que la grille du planning,
 * donc le donut ne diverge jamais du calendrier mural.
 *
 * Au CENTRE, le RESTE À FAIRE = tous les arcs NON terminaux (clôturé + annulé exclus).
 *
 * Présentation dépouillée (demande PO) : carte SANS titre ni légende, donut agrandi,
 * centre = nombre seul. Survol d'une part → infobulle (gérée par `Donut`). Clic sur
 * une part → coquille `CelluleDialog` du planning listant les OT concernés.
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
    const estEnCours = (ot: PlanningOt) =>
      ot.statut === 'en_cours' || ot.statut === 'reouvert'
    // « Cette semaine » = même règle de date que la grille du planning (clôture pour un
    // OT terminal, sinon date prévue). Un OT EN RETARD (date prévue passée) n'y tombe
    // jamais → les deux ne se chevauchent pas.
    const estCetteSemaine = (ot: PlanningOt) =>
      cleSemaine(dateSemaineOt(ot)) === cleCourante

    // Section 1 — En retard (planifié à échéance dépassée).
    const enRetard = ordresTravail.filter((ot) =>
      estPlanifieEnRetard(ot, maintenant),
    )
    // Section 2 — En cours des semaines PASSÉES (hors semaine courante, pour ne pas les
    // confondre avec les « En cours » de la section 3).
    const enCoursPasses = ordresTravail.filter(
      (ot) => estEnCours(ot) && !estCetteSemaine(ot),
    )
    // Section 3 — la charge de la semaine courante, subdivisée par statut.
    const semaine = ordresTravail.filter(
      (ot) => estCetteSemaine(ot) && !estPlanifieEnRetard(ot, maintenant),
    )
    const csProgramme = semaine.filter(
      (ot) => ot.statut === 'planifie' && ot.origine === 'programme',
    )
    const csPlanifie = semaine.filter(
      (ot) => ot.statut === 'planifie' && ot.origine !== 'programme',
    )
    const csEnCours = semaine.filter(estEnCours)
    const csCloture = semaine.filter((ot) => ot.statut === 'cloture')
    const csAnnule = semaine.filter((ot) => ot.statut === 'annule')

    const defs: {
      key: string
      label: string
      tone: StatusTone
      /** Terminal → exclu du « reste à faire » au centre. */
      terminal?: boolean
      /** Sous-part collée de la section « Cette semaine ». */
      group?: string
      /** OT que représente l'arc (dimensionne + colore la part). */
      ots: PlanningOt[]
      /**
       * OT ouverts AU CLIC (défaut = `ots`). Les sous-parts « Cette semaine » ouvrent
       * la section ENTIÈRE (`semaine`) : cliquer « Planifié » liste toute la charge de
       * la semaine, pas seulement les planifiés — le donut segmente, le clic déplie tout.
       */
      clicOts?: PlanningOt[]
      /** Titre du modal au clic (défaut = `label`). */
      clicTitre?: string
    }[] = [
      // 1. En retard = rouge (destructive), comme le badge « En retard ».
      { key: 'en-retard', label: 'En retard', tone: 'destructive', ots: enRetard },
      // 2. En cours (semaines passées) = bleu (info), comme `statutOtTone('en_cours')`.
      { key: 'en-cours', label: 'En cours', tone: 'info', ots: enCoursPasses },
      // 3. Cette semaine, subdivisée (sous-parts COLLÉES) — couleurs = statutOtTone.
      //    Toutes les sous-parts ouvrent la SECTION entière (`semaine` / « Cette semaine »).
      {
        key: 'sem-programme',
        label: 'Cette semaine · Programmé',
        tone: 'neutral', // gris (origine « programme »)
        group: GROUPE_CETTE_SEMAINE,
        ots: csProgramme,
        clicOts: semaine,
        clicTitre: 'Cette semaine',
      },
      {
        key: 'sem-planifie',
        label: 'Cette semaine · Planifié',
        tone: 'violet',
        group: GROUPE_CETTE_SEMAINE,
        ots: csPlanifie,
        clicOts: semaine,
        clicTitre: 'Cette semaine',
      },
      {
        key: 'sem-en-cours',
        label: 'Cette semaine · En cours',
        tone: 'info',
        group: GROUPE_CETTE_SEMAINE,
        ots: csEnCours,
        clicOts: semaine,
        clicTitre: 'Cette semaine',
      },
      {
        key: 'sem-cloture',
        label: 'Cette semaine · Clôturé',
        tone: 'success',
        terminal: true,
        group: GROUPE_CETTE_SEMAINE,
        ots: csCloture,
        clicOts: semaine,
        clicTitre: 'Cette semaine',
      },
      {
        key: 'sem-annule',
        label: 'Cette semaine · Annulé',
        tone: 'destructive',
        terminal: true,
        group: GROUPE_CETTE_SEMAINE,
        ots: csAnnule,
        clicOts: semaine,
        clicTitre: 'Cette semaine',
      },
    ]
    return defs.map(
      ({ key, label, tone, terminal, group, ots, clicOts, clicTitre }) => ({
        segment: {
          key,
          label,
          value: ots.length,
          tone,
          group,
          onClick: () => {
            ouvrir(clicOts ?? ots, clicTitre ?? label)
          },
        },
        terminal: terminal ?? false,
        ots,
      }),
    )
  }, [ordresTravail])

  // Le centre = RESTE À FAIRE = tous les arcs NON terminaux (Clôturé + Annulé de la
  // semaine EXCLUS : c'est déjà « fait »/abandonné). Cadran masqué s'il n'y a AUCUN arc.
  const segments = parts.map((p) => p.segment)
  const totalArcs = segments.reduce((n, s) => n + s.value, 0)
  if (totalArcs === 0) return null
  const total = parts
    .filter((p) => !p.terminal)
    .reduce((n, p) => n + p.segment.value, 0)

  return (
    <DashboardCard
      square
      dense
      className={CLASSE_CARRE_CADRAN}
      contentClassName="flex items-center justify-center"
    >
      <Donut
        segments={segments}
        epaisseur={14}
        // Espace ENTRE sections agrandi (les sous-parts « Cette semaine » d'un même
        // `group` restent collées, gap 0 → seules les 3 sections se détachent nettement).
        gapDeg={10}
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
