import { useId, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { statutOperationTone } from '../schemas'
import { statutOpTerminal } from '../operation-predicats'
import { TONE_BORDER } from './operation-row'
import { useLongPress } from '@/hooks/use-long-press'
import { listStack } from '@/lib/responsive'
import { cn } from '@/lib/utils'

interface OperationsGroupeEquipementProps {
  /** Libellé court de l'en-tête (ex. « Chambre 302 »). */
  titre: string
  /** Chemin complet + nom de l'équipement, en infobulle. */
  detail: string | null
  /** Statuts COURANTS (saisies comprises) des lignes du groupe. */
  statuts: string[]
  ouvert: boolean
  onOuvertChange: (ouvert: boolean) => void
  /** Geste de l'en-tête : même bascule que le geste de ligne, sur tout le groupe. */
  onBasculer: () => void
  /** OT verrouillé ou rôle sans droit : le repli reste possible, pas le geste. */
  readOnly: boolean
  /** Les lignes du groupe (`OperationRow`), montées seulement si le groupe est ouvert. */
  children: ReactNode
}

/**
 * Statut représentatif d'un groupe, pour son liseré : tout terminal → terminé
 * (ou non applicable si aucune ligne n'a été faite) ; quelque chose d'entamé →
 * en cours ; sinon en attente.
 */
function statutDuGroupe(statuts: string[]): string {
  if (statuts.every(statutOpTerminal)) {
    return statuts.every((s) => s === 'non_applicable')
      ? 'non_applicable'
      : 'terminee'
  }
  return statuts.some((s) => s !== 'en_attente') ? 'en_cours' : 'en_attente'
}

/**
 * Groupe des lignes d'un OT rattachées à un même équipement : un en-tête repliable
 * (chevron dédié) avec un compteur, au-dessus des lignes inchangées. Le reste de
 * l'en-tête porte le MÊME geste que la ligne (double-clic, appui long, Entrée au
 * clavier). Un groupe replié est DÉMONTÉ : le Tab maison et le focus automatique
 * n'atteignent aucun champ caché, et les saisies, portées par le moteur
 * d'édition, ne sont pas perdues.
 */
export function OperationsGroupeEquipement({
  titre,
  detail,
  statuts,
  ouvert,
  onOuvertChange,
  onBasculer,
  readOnly,
  children,
}: OperationsGroupeEquipementProps) {
  const corpsId = useId()
  const titreId = useId()
  const terminees = statuts.filter(statutOpTerminal).length
  const total = statuts.length
  const tone = statutOperationTone(statutDuGroupe(statuts))

  function basculer() {
    if (readOnly) return
    onBasculer()
    // Évite la sélection de texte déclenchée par le double-clic / l'appui long.
    window.getSelection()?.removeAllRanges()
  }
  // Appui long tactile = même bascule (la souris conserve le double-clic).
  const longPress = useLongPress(basculer, !readOnly)

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-l-4 bg-muted/40 py-1.5 pr-3 pl-1.5 select-none',
          TONE_BORDER[tone],
        )}
        title={detail ?? undefined}
        // Focusable hors lecture seule : Entrée déclenche la bascule (décision D3,
        // aucun bouton visible en plus). Le chevron garde son propre Entrée.
        tabIndex={readOnly ? undefined : 0}
        aria-keyshortcuts={readOnly ? undefined : 'Enter'}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.target !== e.currentTarget) return
          e.preventDefault()
          basculer()
        }}
        // Même garde que la ligne : les contrôles interactifs (le chevron) gardent
        // leur propre comportement — le double-clic ne vaut pas deux replis.
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('input, button, select')) return
          basculer()
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('input, button, select')) return
          longPress.onPointerDown(e)
        }}
        onPointerMove={longPress.onPointerMove}
        onPointerUp={longPress.onPointerUp}
        onPointerLeave={longPress.onPointerLeave}
        onPointerCancel={longPress.onPointerCancel}
      >
        <button
          type="button"
          onClick={() => onOuvertChange(!ouvert)}
          aria-expanded={ouvert}
          aria-controls={corpsId}
          aria-label={`${ouvert ? 'Replier' : 'Déplier'} ${titre}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted pointer-coarse:size-10"
        >
          <ChevronDown
            className={cn(
              'size-4 transition-transform',
              !ouvert && '-rotate-90',
            )}
          />
        </button>
        <p id={titreId} className="min-w-0 flex-1 truncate text-sm font-medium">
          {titre}
        </p>
        <span
          className="shrink-0 text-xs text-muted-foreground tabular-nums"
          aria-label={`${String(terminees)} opération${terminees > 1 ? 's' : ''} terminée${terminees > 1 ? 's' : ''} sur ${String(total)}`}
        >
          {terminees}/{total}
        </span>
      </div>

      {ouvert && (
        <div
          id={corpsId}
          role="group"
          aria-labelledby={titreId}
          className={cn(listStack, 'sm:pl-4')}
        >
          {children}
        </div>
      )}
    </div>
  )
}
