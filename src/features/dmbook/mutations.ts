import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invokeFunction } from '@/lib/edge'

interface Reponse {
  etat: string
  message: string
}

/**
 * Gestes de connexion à Dmbook (Edge Function `dmbook-connexion`). Le serveur
 * fait UNE tentative et n'envoie le code qu'UNE fois : aucun nouvel essai ici.
 */
export function useConnexionDmbook() {
  const queryClient = useQueryClient()
  const relire = () =>
    queryClient.invalidateQueries({ queryKey: ['dmbook', 'etat'] })
  const connecter = useMutation({
    mutationFn: () =>
      invokeFunction<Reponse>('dmbook-connexion', { action: 'connecter' }),
    onSettled: relire,
  })
  const envoyerCode = useMutation({
    mutationFn: (code: string) =>
      invokeFunction<Reponse>('dmbook-connexion', { action: 'code', code }),
    onSettled: relire,
  })
  return { connecter, envoyerCode }
}
