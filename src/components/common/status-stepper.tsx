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
  /**
   * Étape ACTIONNABLE : un clic sur la pastille déclenche `onStepClick` (passage
   * vers ce statut). Sans ce flag — ou sans `onStepClick` — la pastille reste un
   * simple indicateur. Indépendant de `state` (ex. une étape `done` peut rester
   * actionnable = réouverture).
   */
  actionable?: boolean
}

/** Texte d'état (lecteur d'écran) — l'info ne doit pas passer que par la couleur. */
const ETAT_SR: Record<StepperStep['state'], string> = {
  done: 'franchi',
  current: 'en cours',
  upcoming: 'à venir',
  rejected: 'refusé',
}

const PASTILLE_BASE =
  'flex size-8 items-center justify-center rounded-full border text-sm font-medium'

function pastilleStateClass(state: StepperStep['state']): string {
  return cn(
    state === 'done' && 'border-success bg-success text-success-foreground',
    state === 'current' && 'border-primary text-primary ring-primary/25 ring-2',
    state === 'upcoming' && 'border-border text-muted-foreground',
    state === 'rejected' && 'border-destructive bg-destructive text-white',
  )
}

function pastilleContenu(state: StepperStep['state'], index: number) {
  if (state === 'done') return <Check className="size-4" />
  if (state === 'rejected') return <X className="size-4" />
  return index + 1
}

/**
 * Frise d'avancement générique (aucune logique métier) : une suite d'étapes
 * reliées par un connecteur, à empiler dans une `Card`. L'appelant calcule
 * l'état de chaque étape (cf. `features/<x>/etat.ts`). Réutilisable pour tout
 * suivi de statut.
 *
 * Les pastilles peuvent devenir CLIQUABLES : si `onStepClick` est fourni, toute
 * étape marquée `actionable` est rendue en `<button>` (clic = passage vers ce
 * statut). C'est ainsi qu'on change de statut directement depuis la frise, sans
 * liste d'actions séparée.
 *
 * Le connecteur se colore (success) quand l'étape précédente est franchie ET
 * que la suivante n'est pas un refus → lecture immédiate de la progression sans
 * suggérer qu'un refus est « favorable ». Accessibilité : `aria-current` sur
 * l'étape en cours + texte d'état `sr-only` (l'info ne passe pas que par la
 * couleur/l'icône). Tolère les libellés longs (troncature) et le débordement
 * (scroll horizontal) pour tenir sur mobile.
 */
export function StatusStepper({
  steps,
  onStepClick,
  disabled = false,
}: {
  steps: StepperStep[]
  /** Rendu cliquable des étapes `actionable`. Reçoit l'index de l'étape cliquée. */
  onStepClick?: (index: number) => void
  /** Désactive temporairement tous les clics (ex. mutation en cours). */
  disabled?: boolean
}) {
  return (
    <ol aria-label="Avancement" className="flex items-start overflow-x-auto">
      {steps.map((step, i) => {
        const connecteurFranchi =
          steps[i - 1]?.state === 'done' && step.state !== 'rejected'
        const clickable = onStepClick !== undefined && step.actionable === true
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
              {clickable ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onStepClick(i)}
                  aria-label={`Passer à « ${step.label} »`}
                  title={`Passer à « ${step.label} »`}
                  className={cn(
                    PASTILLE_BASE,
                    pastilleStateClass(step.state),
                    'focus-visible:ring-ring/50 cursor-pointer transition hover:brightness-95 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                >
                  {pastilleContenu(step.state, i)}
                </button>
              ) : (
                <span className={cn(PASTILLE_BASE, pastilleStateClass(step.state))}>
                  {pastilleContenu(step.state, i)}
                </span>
              )}
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
