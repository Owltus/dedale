import { useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { writeErrorMessage } from '@/lib/form'

/**
 * Descripteur d'une action de statut confirmée (Refuser, Annuler, Réactiver,
 * Anonymiser…). Porte à la fois la **présentation** variable (titre, description,
 * libellé du bouton, ton destructif) et l'**exécution** (mutation async + toast
 * de succès), pour qu'une **même** fiche mutualise un unique `ConfirmDialog`
 * entre plusieurs actions distinctes.
 *
 * Générique sur `P` : le type du contexte/param passé à `run`. Laisse `P = void`
 * (défaut) et capture le contexte dans la fermeture ; ou fixe `P` (ex.
 * `{ statutId: number }`) et renseigne `param` pour les actions paramétrées.
 */
export type ConfirmAction<P = void> = {
  /** Titre de la confirmation (ex. « Refuser l'investissement ? »). */
  title: string
  /** Description sous le titre (ex. l'issue de la transition). */
  description?: ReactNode
  /** Libellé du bouton de confirmation (défaut du dialog : « Confirmer »). */
  confirmLabel?: string
  /** Style destructif du bouton (issue terminale / défavorable). */
  destructive?: boolean
  /** Mutation effective (généralement `change.mutateAsync(...)`). */
  run: (param: P) => Promise<unknown>
  /** Message du toast de succès (ou fabrique, pour un message contextualisé). */
  successMessage: string | ((param: P) => string)
  /** Traduction du message d'erreur (défaut : celle du hook, soit `writeErrorMessage`). */
  errorMessage?: (e: unknown) => string
  /** Appelé APRÈS le succès (toast + fermeture), ex. navigation de repli. */
  onSuccess?: (param: P) => void
  // Sentinelle « pas de paramètre » : quand P = void, `param` est absent ; sinon requis.
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
} & ([P] extends [void] ? { param?: undefined } : { param: P })

interface UseConfirmActionOptions {
  /**
   * Traduction par défaut des erreurs pour toutes les actions (défaut :
   * `writeErrorMessage`, qui traduit les SQLSTATE métier : 42501 hors périmètre,
   * transition d'état interdite…). Surchargeable action par action via
   * `ConfirmAction.errorMessage`.
   */
  errorMessage?: (e: unknown) => string
}

/** Props prêtes à étaler sur `ConfirmDialog`. */
interface ConfirmActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loading: boolean
  onConfirm: () => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  destructive?: boolean
}

/**
 * Factorise le micro-patron « `useState` + `ConfirmDialog` + `mutate` » recopié
 * dans les fiches détail pour les **transitions de statut confirmées**. Là où
 * `useConfirmDelete` gère UNE opération (supprimer) sur des items variables, ce
 * hook gère PLUSIEURS actions distinctes derrière un **unique** `ConfirmDialog` :
 * `demander(action)` ouvre la confirmation de l'action (qui porte son propre
 * titre/description/mutation), `confirmer()` exécute `run` puis toast de succès +
 * fermeture (ou toast d'erreur traduit, dialog laissé ouvert).
 *
 * `dialogProps` embarque à la fois le câblage (`open`/`onOpenChange`/`loading`/
 * `onConfirm`) ET la présentation de l'action courante (`title`/`description`/
 * `confirmLabel`/`destructive`), d'où un branchement en une ligne.
 *
 * Usage — plusieurs actions, un seul dialog :
 * ```tsx
 * const change = useChangerStatutInvestissement()
 * const confirmAction = useConfirmAction<{ statutId: number }>()
 *
 * // Barre de titre :
 * <button onClick={() => confirmAction.demander({
 *   title: "Refuser l'investissement ?",
 *   description: 'L\'investissement passera au statut « Refusé ».',
 *   confirmLabel: 'Refuser',
 *   destructive: true,
 *   param: { statutId: ID_REFUSE },
 *   run: ({ statutId }) => change.mutateAsync({ id: inv.id, statutId }),
 *   successMessage: 'Investissement refusé',
 * })}>Refuser</button>
 *
 * // Un seul dialog en bas de page :
 * <ConfirmDialog {...confirmAction.dialogProps} />
 * ```
 */
export function useConfirmAction<P = void>({
  errorMessage: defaultErrorMessage = writeErrorMessage,
}: UseConfirmActionOptions = {}): {
  /** Action en cours de confirmation (null = dialog fermé). */
  action: ConfirmAction<P> | null
  /** Ouvre la confirmation pour cette action. */
  demander: (action: ConfirmAction<P>) => void
  /** Referme la confirmation sans exécuter. */
  annuler: () => void
  /** Exécute l'action demandée (no-op si aucune ou déjà en cours). */
  confirmer: () => void
  /** Vrai pendant l'exécution (→ spinner + boutons désactivés du dialog). */
  pending: boolean
  /** Paquet câblage + présentation à étaler sur `ConfirmDialog`. */
  dialogProps: ConfirmActionDialogProps
} {
  const [action, setAction] = useState<ConfirmAction<P> | null>(null)
  const [pending, setPending] = useState(false)

  function confirmer(): void {
    if (action === null || pending) return
    const current = action
    // `param` est absent quand P = void ; `run(param)` accepte alors `undefined`.
    const param = current.param as P
    setPending(true)
    void (async () => {
      try {
        await current.run(param)
        toast.success(
          typeof current.successMessage === 'function'
            ? current.successMessage(param)
            : current.successMessage,
        )
        setAction(null)
        current.onSuccess?.(param)
      } catch (e) {
        toast.error((current.errorMessage ?? defaultErrorMessage)(e))
      } finally {
        setPending(false)
      }
    })()
  }

  return {
    action,
    demander: (a) => setAction(a),
    annuler: () => setAction(null),
    confirmer,
    pending,
    dialogProps: {
      open: action !== null,
      onOpenChange: (open) => {
        if (!open) setAction(null)
      },
      loading: pending,
      onConfirm: confirmer,
      title: action?.title ?? '',
      description: action?.description,
      confirmLabel: action?.confirmLabel,
      destructive: action?.destructive,
    },
  }
}
