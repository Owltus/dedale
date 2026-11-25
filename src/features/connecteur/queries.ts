import { queryOptions, skipToken } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  lieuDeRetour,
  retourDeConfiance,
} from '@/features/connecteur/confiance'

export const connecteurQueries = {
  all: () => ['oauth-consent'] as const,

  demande: (authorizationId: string | undefined, userId: string) =>
    queryOptions({
      queryKey: [...connecteurQueries.all(), authorizationId, userId],
      retry: false,
      // Sans identifiant d'autorisation dans l'URL, rien à demander.
      queryFn:
        authorizationId === undefined
          ? skipToken
          : async () => {
              const { data, error } =
                await supabase.auth.oauth.getAuthorizationDetails(
                  authorizationId,
                )
              if (error) throw error
              // Déjà autorisé auparavant : Supabase renvoie directement le retour.
              // On ne suit ce retour que s'il mène bien à Claude (154).
              if (!('authorization_id' in data)) {
                if (!retourDeConfiance(data.redirect_url))
                  throw new Error('Adresse de retour non reconnue')
                return { retour: data.redirect_url } as const
              }
              const { data: moi } = await supabase
                .from('users')
                .select('acces_ia, acces_ia_ecriture, est_actif')
                .eq('id', userId)
                .maybeSingle()
                .throwOnError()
              return {
                retour: null,
                client: data.client.name || 'Application inconnue',
                email: data.user.email,
                autorise: moi?.acces_ia === true && moi.est_actif,
                modification: moi?.acces_ia_ecriture === true,
                confiance: retourDeConfiance(data.redirect_uri),
                lieu: lieuDeRetour(data.redirect_uri),
              } as const
            },
    }),
}
