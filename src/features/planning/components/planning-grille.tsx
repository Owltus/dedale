import { LIBELLES_STATUT_OT } from '@/features/ordres-travail/schemas'
import type { LigneGamme, PlanningOt } from '@/features/planning/grille'
import type { SemaineIso } from '@/features/planning/semaines'
import { cn } from '@/lib/utils'

/**
 * Couleur de fond de la cellule selon le statut de l'OT, alignée sur les
 * variantes de Badge OT (tokens sémantiques uniquement). Si plusieurs statuts
 * cohabitent, on prend le plus « avancé » visible.
 */
function classeStatut(statut: string): string {
  switch (statut) {
    case 'cloture':
      return 'bg-primary text-primary-foreground'
    case 'annule':
      return 'bg-destructive text-white'
    case 'en_cours':
    case 'reouvert':
      return 'bg-secondary text-secondary-foreground'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

/** Priorité d'affichage quand une cellule mélange plusieurs statuts. */
const ORDRE_STATUT: Record<string, number> = {
  annule: 0,
  en_cours: 1,
  reouvert: 1,
  planifie: 2,
  cloture: 3,
}

function statutDominant(ots: PlanningOt[]): string {
  return ots.reduce<string>((meilleur, ot) => {
    const rangCourant = ORDRE_STATUT[meilleur] ?? 99
    const rangNouveau = ORDRE_STATUT[ot.statut] ?? 99
    return rangNouveau < rangCourant ? ot.statut : meilleur
  }, ots[0]?.statut ?? 'planifie')
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
    <div className="border-border overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-border border-b">
            <th className="bg-card sticky left-0 z-10 min-w-48 px-3 py-2 text-left font-medium">
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
                const statut = statutDominant(ots)
                const libelle = LIBELLES_STATUT_OT[statut] ?? statut
                return (
                  <td key={s.cle} className="px-1 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => onSelect(ots, s)}
                      title={`${ligne.nomGamme} — S${String(s.numero)} — ${libelle}${
                        ots.length > 1 ? ` (${String(ots.length)})` : ''
                      }`}
                      className={cn(
                        'focus-visible:ring-ring inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs font-medium transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none',
                        classeStatut(statut),
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
  )
}
