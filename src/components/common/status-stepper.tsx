import { Fragment } from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StepperStep {
  /** Libellé de l'étape (sous la pastille). */
  label: string
  /**
   * État de l'étape :
   * - `done` : franchie (pastille pleine + ✓) ;
   * - `current` : étape en cours (pastille cerclée, mise en évidence) ;
   * - `upcoming` : à venir (pastille atténuée) ;
   * - `rejected` : issue défavorable terminale (pastille destructive + ✗).
   */
  state: 'done' | 'current' | 'upcoming' | 'rejected'
}

/** Texte d'état (lecteur d'écran) — l'info ne doit pas passer que par la couleur. */
const ETAT_SR: Record<StepperStep['state'], string> = {
  done: 'franchi',
  current: 'en cours',
  upcoming: 'à venir',
  rejected: 'refusé',
}

/**
 * Frise d'avancement générique (aucune logique métier) : une suite d'étapes
 * reliées par un connecteur, à empiler dans une `Card`. L'appelant calcule
 * l'état de chaque étape (cf. `features/<x>/etat.ts`). Réutilisable pour tout
 * suivi de statut.
 *
 * Le connecteur se colore (success) quand l'étape précédente est franchie ET
 * que la suivante n'est pas un refus → lecture immédiate de la progression sans
 * suggérer qu'un refus est « favorable ». Accessibilité : `aria-current` sur
 * l'étape en cours + texte d'état `sr-only` (l'info ne passe pas que par la
 * couleur/l'icône). Tolère les libellés longs (troncature) et le débordement
 * (scroll horizontal) pour tenir sur mobile.
 */
export function StatusStepper({ steps }: { steps: StepperStep[] }) {
  return (
    <ol aria-label="Avancement" className="flex items-start overflow-x-auto">
      {steps.map((step, i) => {
        const connecteurFranchi =
          steps[i - 1]?.state === 'done' && step.state !== 'rejected'
        return (
          <Fragment key={i}>
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'mt-4 h-0.5 min-w-6 flex-1 rounded-full',
                  connecteurFranchi ? 'bg-success' : 'bg-border',
                )}
              />
            )}
            <li
              aria-current={step.state === 'current' ? 'step' : undefined}
              className="flex shrink-0 flex-col items-center gap-1.5"
            >
              <span
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border text-sm font-medium',
                  step.state === 'done' &&
                    'border-success bg-success text-success-foreground',
                  step.state === 'current' &&
                    'border-primary text-primary ring-primary/25 ring-2',
                  step.state === 'upcoming' &&
                    'border-border text-muted-foreground',
                  step.state === 'rejected' &&
                    'border-destructive bg-destructive text-white',
                )}
              >
                {step.state === 'done' ? (
                  <Check className="size-4" />
                ) : step.state === 'rejected' ? (
                  <X className="size-4" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                title={step.label}
                className={cn(
                  'max-w-24 truncate text-center text-xs',
                  step.state === 'upcoming'
                    ? 'text-muted-foreground'
                    : 'text-foreground',
                )}
              >
                {step.label}
              </span>
              <span className="sr-only">{ETAT_SR[step.state]}</span>
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}
