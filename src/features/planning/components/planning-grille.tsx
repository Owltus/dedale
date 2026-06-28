import { statutAffichageOt } from '@/features/ordres-travail/statut-affichage'
import type { StatusTone } from '@/components/common/status-badge'
import type { LigneGamme, PlanningOt } from '@/features/planning/grille'
import type { SemaineIso } from '@/features/planning/semaines'
import { cn } from '@/lib/utils'

/**
 * Couleur de fond SOLIDE d'une cellule selon la TONALITÉ du statut d'affichage
 * de l'OT — même source que le badge (`statutAffichageOt`), donc toute évolution
 * du code couleur se répercute ici. Remplissage plein (≠ pastille teintée du
 * badge) pour une lecture dense ; chaque tonalité a son couple `-foreground`
 * garantissant le contraste en thème clair comme sombre.
 */
const TONE_CELL: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  destructive: 'bg-destructive text-white',
  info: 'bg-info text-info-foreground',
  violet: 'bg-violet text-violet-foreground',
  yellow: 'bg-yellow text-yellow-foreground',
}

/** Priorité d'affichage quand une cellule mélange plusieurs tonalités (le plus
 *  urgent d'abord : retard/annulé → cette semaine → à venir → en cours →
 *  planifié → clôturé → repos). */
const PRIORITE_TONE: StatusTone[] = [
  'destructive',
  'yellow',
  'warning',
  'info',
  'violet',
  'success',
  'neutral',
]

/** Statut d'affichage (libellé + tonalité) le plus prioritaire de la cellule. */
function affichageDominant(ots: PlanningOt[]) {
  return ots
    .map((ot) =>
      statutAffichageOt({
        statut: ot.statut,
        origine: ot.origine,
        datePrevue: ot.date_prevue,
        toleranceJours: ot.tolerance_jours,
      }),
    )
    .reduce((meilleur, courant) =>
      PRIORITE_TONE.indexOf(courant.tone) < PRIORITE_TONE.indexOf(meilleur.tone)
        ? courant
        : meilleur,
    )
}

// Légende : tonalité → libellé, dans l'ordre d'urgence. MÊME source de couleur
// (TONE_CELL) que les cellules de la grille → la légende ne peut plus diverger.
const LEGENDE_PLANNING: { tone: StatusTone; libelle: string }[] = [
  { tone: 'destructive', libelle: 'En retard / annulé' },
  { tone: 'yellow', libelle: 'Cette semaine' },
  { tone: 'warning', libelle: 'À venir / réouvert' },
  { tone: 'info', libelle: 'En cours' },
  { tone: 'violet', libelle: 'Planifié' },
  { tone: 'success', libelle: 'Clôturé' },
  { tone: 'neutral', libelle: 'Programmé / plus tard' },
]

/**
 * Légende des couleurs du planning. Dérivée de `TONE_CELL` (source UNIQUE,
 * partagée avec le coloriage des cellules) : changer une couleur de statut met à
 * jour la grille ET la légende d'un seul geste.
 */
export function PlanningLegende() {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
      {LEGENDE_PLANNING.map((i) => (
        <span key={i.tone} className="flex items-center gap-1.5">
          <span className={cn('size-3 rounded', TONE_CELL[i.tone])} />
          {i.libelle}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="text-primary">●</span>
        Gamme réglementaire
      </span>
    </div>
  )
}

interface PlanningGrilleProps {
  lignes: LigneGamme[]
  semaines: SemaineIso[]
  onSelect: (ots: PlanningOt[], semaine: SemaineIso) => void
}

/** Grille dense gamme (lignes) × semaine ISO (colonnes). */
export function PlanningGrille({
  lignes,
  semaines,
  onSelect,
}: PlanningGrilleProps) {
  return (
    <>
      <p className="text-muted-foreground mb-2 text-xs lg:hidden">
        Faites défiler horizontalement pour voir toutes les semaines.
      </p>
      <div className="border-border overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-border border-b">
              <th className="bg-card sticky left-0 z-10 min-w-32 px-3 py-2 text-left font-medium sm:min-w-48">
                Gamme
              </th>
              {semaines.map((s) => (
                <th
                  key={s.cle}
                  className="text-muted-foreground min-w-14 px-1 py-2 text-center font-medium"
                >
                  <div className="text-foreground">S{s.numero}</div>
                  <div className="text-xs">
                    {s.debut.toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne) => (
              <tr
                key={ligne.cle}
                className="border-border border-b last:border-0"
              >
                <th
                  scope="row"
                  className={cn(
                    'bg-card sticky left-0 z-10 max-w-64 truncate px-3 py-2 text-left font-normal',
                    ligne.reglementaire && 'border-primary border-l-4',
                  )}
                  title={
                    ligne.reglementaire
                      ? `${ligne.nomGamme} (réglementaire)`
                      : ligne.nomGamme
                  }
                >
                  <span className="truncate">{ligne.nomGamme}</span>
                  {ligne.reglementaire && (
                    <span className="text-primary ml-1 text-xs">●</span>
                  )}
                </th>
                {semaines.map((s) => {
                  const ots = ligne.parSemaine.get(s.cle)
                  if (!ots || ots.length === 0) {
                    return <td key={s.cle} className="px-1 py-1" />
                  }
                  const affichage = affichageDominant(ots)
                  return (
                    <td key={s.cle} className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => onSelect(ots, s)}
                        title={`${ligne.nomGamme} — S${String(s.numero)} — ${affichage.label}${
                          ots.length > 1 ? ` (${String(ots.length)})` : ''
                        }`}
                        className={cn(
                          'focus-visible:ring-ring inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs font-medium transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none',
                          TONE_CELL[affichage.tone],
                        )}
                      >
                        {ots.length > 1 ? ots.length : ''}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
