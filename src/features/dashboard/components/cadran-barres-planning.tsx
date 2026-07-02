import { useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  BarresEmpilees,
  type BarreColonne,
} from '@/components/common/charts/barres-empilees'
import type { ChartSegment } from '@/components/common/charts/chart-legend'
import { CelluleDialog } from '@/features/planning/components/cellule-dialog'
import { dateSemaineOt, type PlanningOt } from '@/features/planning/grille'
import {
  ajouterSemaines,
  cleSemaine,
  fenetreSemaines,
  labelSemaine,
  type SemaineIso,
} from '@/features/planning/semaines'
import {
  useFenetreTemporelle,
  type FenetreTemporelle,
} from '@/features/planning/use-fenetre-temporelle'
import { useColonnesAuto } from '@/features/planning/use-colonnes-auto'
import { estPlanifieEnRetard } from '@/features/ordres-travail/statut-affichage'
import {
  libelleStatutOt,
  statutOtTone,
} from '@/features/ordres-travail/schemas'
import type { StatusTone } from '@/components/common/status-badge'
import { DashboardCard } from './dashboard-card'
import { useDashboardData } from '../use-dashboard-data'

interface CadranBarresPlanningProps {
  siteId: string
  /**
   * Fenêtre temporelle fournie par l'orchestrateur (étape 10) pour PARTAGER un unique
   * `centre` + un unique listener clavier avec la frise contrats. Absente → le cadran
   * monte SA PROPRE fenêtre (mode autonome, ex. barres affichées seules).
   *
   * ⚠️ Anti double-listener : on ne monte JAMAIS deux `useFenetreTemporelle`. Le choix
   * autonome/piloté est STABLE sur la vie du composant → seule la branche autonome
   * instancie le hook (donc le seul `keydown`) ; la branche pilotée n'en instancie aucun.
   *
   * NB : seul le `centre` (et la nav clavier) est partagé avec la frise ; le NOMBRE de
   * semaines affichées, lui, est calé sur la largeur PROPRE de ce cadran (cf. `BarresVue`)
   * — sinon, aligné sur la pleine largeur de la frise, les barres se tassaient dans leur
   * colonne étroite.
   */
  fenetre?: FenetreTemporelle
  /** Classes de positionnement dans la grille de la zone synthèse (cf. `ZoneSynthese`). */
  className?: string
}

/**
 * Cadran « Charge par semaine » (zone 1 milieu du tableau de bord) : un histogramme
 * empilé « une barre par semaine », 7 états par barre (En retard, Rouvert, En cours,
 * Clôturé, Annulé, Planifié, Programmé), filigrane de l'année, semaine courante mise
 * en évidence. Clic sur une barre → OT de la semaine (fiche directe si un seul, sinon
 * modal `CelluleDialog`). Même source d'OT et mêmes prédicats que la grille planning
 * (`dateSemaineOt`, `statutPlanningOt`) → répartition identique.
 */
export function CadranBarresPlanning({
  siteId,
  fenetre,
  className,
}: CadranBarresPlanningProps) {
  if (fenetre)
    return <BarresVue siteId={siteId} fenetre={fenetre} className={className} />
  return <BarresAutonome siteId={siteId} className={className} />
}

/**
 * Nombre de semaines de la fenêtre TEMPORELLE en mode autonome. Sans importance pour
 * l'affichage (les barres recalculent leur propre fenêtre depuis le `centre`, cf.
 * `BarresVue`) : ne sert qu'à initialiser le hook (centre + nav clavier).
 */
const NB_SEMAINES_HOOK = 12

/**
 * Mode autonome : instancie la fenêtre temporelle (centre + nav clavier). L'affichage
 * se dimensionne ensuite tout seul dans `BarresVue`. Unique branche à poser un listener.
 */
function BarresAutonome({
  siteId,
  className,
}: {
  siteId: string
  className?: string
}) {
  const fenetre = useFenetreTemporelle({ nbSemaines: NB_SEMAINES_HOOK })
  return <BarresVue siteId={siteId} fenetre={fenetre} className={className} />
}

/** Ordre d'empilement (bas → haut) ET ordre de la légende : les 7 états du planning. */
type CleEtat =
  | 'en-retard'
  | 'reouvert'
  | 'en-cours'
  | 'cloture'
  | 'annule'
  | 'planifie'
  | 'programme'

interface DefEtat {
  cle: CleEtat
  label: string
  tone: StatusTone
}

// Libellés/tons dérivés des helpers CANONIQUES (`libelleStatutOt`/`statutOtTone`) —
// sauf « En retard », fait temporel propre au planning (cf. `statutPlanningOt`) → le
// coloriage des barres ne peut jamais diverger de celui des badges / de la grille.
const ETATS: DefEtat[] = [
  { cle: 'en-retard', label: 'En retard', tone: 'destructive' },
  {
    cle: 'reouvert',
    label: libelleStatutOt('reouvert'),
    tone: statutOtTone('reouvert'),
  },
  {
    cle: 'en-cours',
    label: libelleStatutOt('en_cours'),
    tone: statutOtTone('en_cours'),
  },
  {
    cle: 'cloture',
    label: libelleStatutOt('cloture'),
    tone: statutOtTone('cloture'),
  },
  {
    cle: 'annule',
    label: libelleStatutOt('annule'),
    tone: statutOtTone('annule'),
  },
  {
    cle: 'planifie',
    label: libelleStatutOt('planifie'),
    tone: statutOtTone('planifie'),
  },
  {
    cle: 'programme',
    label: libelleStatutOt('planifie', 'programme'),
    tone: statutOtTone('planifie', 'programme'),
  },
]

/**
 * Range un OT dans l'un des 7 états du planning — MÊME classification que
 * `statutPlanningOt` : d'abord « En retard » (planifié à date dépassée, via le prédicat
 * canonique `estPlanifieEnRetard`), sinon le statut métier, l'origine départageant
 * planifié / programmé.
 */
function cleEtatOt(ot: PlanningOt, aujourdHui: Date): CleEtat {
  if (estPlanifieEnRetard(ot, aujourdHui)) return 'en-retard'
  switch (ot.statut) {
    case 'reouvert':
      return 'reouvert'
    case 'en_cours':
      return 'en-cours'
    case 'cloture':
      return 'cloture'
    case 'annule':
      return 'annule'
    default:
      return ot.origine === 'programme' ? 'programme' : 'planifie'
  }
}

/**
 * Rendu des barres. Se dimensionne LUI-MÊME : `useColonnesAuto` mesure la largeur du
 * cadran → un `nbSemaines` adapté à la carte (étroite en zone 1), et la fenêtre de
 * semaines est reconstruite autour du `centre` PARTAGÉ (`fenetre.centre`) → même
 * période de référence et même nav clavier que la frise, sans se tasser. Ne monte
 * AUCUN `useFenetreTemporelle` (pas de listener ici) → sûr aux côtés de la frise.
 */
function BarresVue({
  siteId,
  fenetre,
  className,
}: {
  siteId: string
  fenetre: FenetreTemporelle
  className?: string
}) {
  const { ordresTravail } = useDashboardData(siteId)
  const navigate = useNavigate()
  const [cellule, setCellule] = useState<{
    ots: PlanningOt[]
    titre: string
  } | null>(null)

  // Fenêtre PROPRE au cadran : nb de semaines calé sur SA largeur, centré sur le
  // `centre` partagé avec la frise.
  const mesureRef = useRef<HTMLDivElement>(null)
  // Même logique responsive que le planning, calibrée pour la carte : colonne cible
  // ~44 px (fines → on en affiche plus), sans colonne de gauche, bornée à 6–26 semaines.
  const { nbSemaines } = useColonnesAuto(mesureRef, {
    cellSize: 44,
    familleMin: 0,
    minSemaines: 6,
    maxSemaines: 26,
  })
  const semaines = useMemo(
    () =>
      fenetreSemaines(
        ajouterSemaines(fenetre.centre, -Math.floor(nbSemaines / 2)),
        nbSemaines,
      ),
    [fenetre.centre, nbSemaines],
  )

  const cleSemaineCourante = useMemo(() => cleSemaine(new Date()), [])

  // OT groupés par semaine ISO (date effective = clôture si terminal, sinon prévue,
  // cf. `dateSemaineOt`) — MÊME positionnement que la grille planning.
  const parSemaine = useMemo(() => {
    const map = new Map<string, PlanningOt[]>()
    for (const ot of ordresTravail) {
      const cle = cleSemaine(dateSemaineOt(ot))
      const arr = map.get(cle)
      if (arr) arr.push(ot)
      else map.set(cle, [ot])
    }
    return map
  }, [ordresTravail])

  // Une colonne par semaine visible ; chaque colonne empile les 7 états.
  const colonnes = useMemo<BarreColonne[]>(() => {
    const aujourdHui = new Date()
    return semaines.map((s) => {
      const ots = parSemaine.get(s.cle) ?? []
      const compte = new Map<CleEtat, number>()
      for (const ot of ots) {
        const cle = cleEtatOt(ot, aujourdHui)
        compte.set(cle, (compte.get(cle) ?? 0) + 1)
      }
      const enCours = s.cle === cleSemaineCourante
      const segments: ChartSegment[] = ETATS.map((etat) => ({
        key: etat.cle,
        label: etat.label,
        value: compte.get(etat.cle) ?? 0,
        tone: etat.tone,
      }))
      return {
        cle: s.cle,
        label: `S${String(s.numero)}`,
        enCours,
        segments,
      }
    })
  }, [semaines, parSemaine, cleSemaineCourante])

  // Année en filigrane : celle de la semaine centrale de la fenêtre visible.
  const filigrane = useMemo(() => {
    const milieu = semaines[Math.floor(semaines.length / 2)]
    return milieu ? String(milieu.annee) : undefined
  }, [semaines])

  const semaineParCle = useMemo(() => {
    const map = new Map<string, SemaineIso>()
    for (const s of semaines) map.set(s.cle, s)
    return map
  }, [semaines])

  // Clic sur une barre : 1 OT → fiche directe, ≥ 2 → modal (patron du planning).
  const ouvrirSemaine = (cle: string) => {
    const ots = parSemaine.get(cle) ?? []
    const [premier] = ots
    if (ots.length === 1 && premier) {
      void navigate({
        to: '/ordres-travail/$otId',
        params: { otId: premier.id },
      })
    } else if (ots.length > 1) {
      const s = semaineParCle.get(cle)
      setCellule({ ots, titre: s ? labelSemaine(s) : '' })
    }
  }

  return (
    <DashboardCard
      className={className}
      contentClassName="flex min-h-0 flex-col gap-3"
    >
      {/* Zone de tracé : `flex-1` → la carte est étirée à la hauteur de la rangée de la
          grille intrinsèque (rangées AUTO = hauteur des carrés voisins), et le tracé la
          remplit. `min-h-[150px]` garantit une hauteur correcte quand les barres sont
          SEULES sur leur rangée (donut ET sunburst `null`, ou barres pleine largeur en
          config tablette). Rangées AUTO → la carte n'est jamais comprimée sous ce
          minimum, donc plus de débordement du SVG (le garde-fou `overflow-hidden` de
          BarresEmpilees reste en dernier rempart). `mesureRef` = calcul du nb de semaines. */}
      <div ref={mesureRef} className="min-h-[150px] flex-1">
        <BarresEmpilees
          colonnes={colonnes}
          filigrane={filigrane}
          onColonneClick={ouvrirSemaine}
        />
      </div>

      <CelluleDialog
        ots={cellule?.ots ?? null}
        titre={cellule?.titre ?? ''}
        onClose={() => setCellule(null)}
      />
    </DashboardCard>
  )
}
