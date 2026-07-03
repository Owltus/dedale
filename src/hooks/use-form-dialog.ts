import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import type { ZodError } from 'zod'
import { fieldErrors, writeErrorMessage } from '@/lib/form'

/**
 * Contrat minimal d'un schéma Zod (`safeParse`) : évite de figer les génériques
 * internes de Zod et accepte tout schéma (objet, raffiné…).
 */
interface SchemaLike<Parsed> {
  safeParse: (
    values: unknown,
  ) =>
    | { success: true; data: Parsed }
    | { success: false; error: ZodError }
}

interface UseFormDialogOptions<Values extends object, Parsed, Result> {
  /** Schéma Zod validé au submit (défini au niveau module, cf. conventions). */
  schema: SchemaLike<Parsed>
  /**
   * Fabrique des valeurs initiales (évaluée UNE fois au montage) : le reset se
   * fait par REMONTAGE `key` côté hôte (`dialogKey` de `useEntityDialog`),
   * jamais par un `useEffect` de reset.
   */
  initialValues: () => Values
  /** Écriture effective (mutateAsync…) avec les données VALIDÉES. */
  onSubmit: (data: Parsed) => Promise<Result>
  /** Message du toast de succès (ou fabrique depuis le résultat d'`onSubmit`). */
  successMessage: string | ((result: Result) => string)
  /** Fermeture du dialog, appelée après le toast de succès. */
  close: () => void
  /**
   * Traduction du message d'erreur serveur (défaut : `writeErrorMessage`).
   * Surcharge possible par formulaire (codes Postgres spécifiques…).
   */
  errorMessage?: (e: unknown) => string
  /** Appelé APRÈS le succès (toast + fermeture), ex. redirection vers la fiche. */
  onSuccess?: (result: Result) => void
}

/**
 * Pipeline commun des modales de formulaire (état contrôlé + Zod), factorisé :
 * `values` (init par fabrique) + `errors` par champ + `set(champ, valeur)` +
 * `submit()` = `safeParse` → erreurs de champ OU `await onSubmit(parsed.data)`
 * + toast de succès + fermeture, erreur serveur → toast traduit (dialog laissé
 * ouvert). Le composant `FormDialog` (common) reste purement présentationnel.
 *
 * Usage :
 * ```tsx
 * const form = useFormDialog({
 *   schema: siteSchema,
 *   initialValues: () => initialValues(site),
 *   onSubmit: (data) =>
 *     site ? update.mutateAsync({ id: site.id, values: data }) : create.mutateAsync(data),
 *   successMessage: isEdit ? 'Site modifié' : 'Site créé',
 *   close: () => onOpenChange(false),
 * })
 * <FormDialog … onSubmit={() => void form.submit()} pending={form.pending}>
 *   <TextField label="Nom" value={form.values.nom} onChange={(v) => form.set('nom', v)} error={form.errors.nom} />
 * </FormDialog>
 * ```
 */
export function useFormDialog<Values extends object, Parsed, Result = void>({
  schema,
  initialValues,
  onSubmit,
  successMessage,
  close,
  errorMessage = writeErrorMessage,
  onSuccess,
}: UseFormDialogOptions<Values, Parsed, Result>): {
  /** Valeurs contrôlées du formulaire. */
  values: Values
  /** Mise à jour libre (multi-champs, valeurs non scalaires…). */
  setValues: Dispatch<SetStateAction<Values>>
  /** Met à jour UN champ (typé sur `Values`). */
  set: <K extends keyof Values>(key: K, value: Values[K]) => void
  /** Erreurs Zod par champ (première erreur par champ). */
  errors: Record<string, string>
  /** Valide puis soumet — à appeler via `onSubmit={() => void form.submit()}`. */
  submit: () => Promise<void>
  /** Vrai pendant l'écriture (→ prop `pending` de `FormDialog`). */
  pending: boolean
} {
  const [values, setValues] = useState<Values>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  function set<K extends keyof Values>(key: K, value: Values[K]): void {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function submit(): Promise<void> {
    if (pending) return
    const parsed = schema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setPending(true)
    try {
      const result = await onSubmit(parsed.data)
      toast.success(
        typeof successMessage === 'function'
          ? successMessage(result)
          : successMessage,
      )
      close()
      onSuccess?.(result)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  return { values, setValues, set, errors, submit, pending }
}
