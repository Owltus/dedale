import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invokeFunction } from '@/lib/edge'
import { dmbookQueries } from './queries'

interface Reponse {
  etat: string
  message: string
}

export interface ReglageDmbook {
  siteId: string
  adresse: string
  identifiant: string
  /** Vide = on garde le mot de passe déjà enregistré. */
  motDePasse: string
}

/**
 * Gestes de connexion à Dmbook pour UN site (Edge Function `dmbook-connexion`).
 * Le serveur fait UNE tentative et n'envoie le code qu'UNE fois : aucun nouvel
 * essai ici.
 */
export function useConnexionDmbook() {
  const queryClient = useQueryClient()
  const relire = () =>
    queryClient.invalidateQueries({
      queryKey: dmbookQueries.connexions().queryKey,
    })
  const enregistrer = useMutation({
    mutationFn: (r: ReglageDmbook) =>
      invokeFunction<Reponse>('dmbook-connexion', {
        action: 'enregistrer',
        site_id: r.siteId,
        adresse: r.adresse,
        identifiant: r.identifiant,
        mot_de_passe: r.motDePasse,
      }),
    onSettled: relire,
  })
  const connecter = useMutation({
    mutationFn: (siteId: string) =>
      invokeFunction<Reponse>('dmbook-connexion', {
        action: 'connecter',
        site_id: siteId,
      }),
    onSettled: relire,
  })
  const envoyerCode = useMutation({
    mutationFn: ({ siteId, code }: { siteId: string; code: string }) =>
      invokeFunction<Reponse>('dmbook-connexion', {
        action: 'code',
        site_id: siteId,
        code,
      }),
    onSettled: relire,
  })
  return { enregistrer, connecter, envoyerCode }
}
