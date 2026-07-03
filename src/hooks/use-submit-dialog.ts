import { toast } from 'sonner'
import { writeErrorMessage } from '@/lib/form'

interface UseSubmitDialogOptions<Parsed, Result> {
  /** Écriture effective (mutateAsync…) avec les données VALIDÉES par le resolver. */
  onSubmit: (data: Parsed) => Promise<Result>
  /** Message du toast de succès (ou fabrique depuis le résultat d'`onSubmit`). */
  successMessage: string | ((result: Result) => string)
  /** Fermeture du dialog, appelée après le toast de succès. */
  close: () => void
  /**
   * Traduction du message d'erreur serveur (défaut : `writeErrorMessage`, qui
   * traduit les SQLSTATE : 42501 hors périmètre, 23505 doublon, 23503 FK…).
   */
  errorMessage?: (e: unknown) => string
  /** Appelé APRÈS le succès (toast + fermeture), ex. redirection vers la fiche. */
  onSuccess?: (result: Result) => void
}

/**
 * Plomberie de soumission d'une modale **react-hook-form** : enveloppe la mutation
 * d'un `try/catch` → toast de succès + fermeture (ou toast d'erreur traduit, dialog
 * laissé ouvert). Ne gère NI l'état, NI la validation (c'est RHF + `zodResolver`).
 * Le résultat est passé à `form.handleSubmit(...)` :
 *
 * ```tsx
 * const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues })
 * const submit = useSubmitDialog<Values>({ onSubmit, successMessage, close })
 * <FormDialog onSubmit={form.handleSubmit(submit)} pending={form.formState.isSubmitting}>
 * ```
 */
export function useSubmitDialog<Parsed, Result = unknown>({
  onSubmit,
  successMessage,
  close,
  errorMessage = writeErrorMessage,
  onSuccess,
}: UseSubmitDialogOptions<Parsed, Result>): (data: Parsed) => Promise<void> {
  return async (data: Parsed) => {
    try {
      const result = await onSubmit(data)
      toast.success(
        typeof successMessage === 'function'
          ? successMessage(result)
          : successMessage,
      )
      close()
      onSuccess?.(result)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
}
