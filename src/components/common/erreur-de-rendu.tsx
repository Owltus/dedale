import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { ErrorState } from '@/components/common/error-state'

/**
 * Écran affiché quand une page plante au rendu (exception non prévue) : en
 * français, avec « Réessayer » qui relit les données de la page et la remonte.
 * Sans lui, TanStack Router affichait son écran par défaut, en anglais
 * (« Something went wrong! »), sans aucune sortie.
 */
export function ErreurDeRendu({ reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <ErrorState
      className="h-full"
      message="Cette page a rencontré un problème inattendu."
      onRetry={() => {
        void router.invalidate()
        reset()
      }}
    />
  )
}
