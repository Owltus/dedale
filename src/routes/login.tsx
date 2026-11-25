import { createFileRoute, redirect } from '@tanstack/react-router'
import { ConnexionEcran } from '@/features/connexion/components/connexion-ecran'

/**
 * `autorisation` : identifiant d'une demande d'accès du connecteur Claude
 * (écran /oauth/consent) à reprendre après la connexion. On ne garde QUE cet
 * identifiant, jamais une adresse de retour : pas de redirection ouverte.
 */
const AUTORISATION = /^[A-Za-z0-9_-]{1,128}$/

export const Route = createFileRoute('/login')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { autorisation?: string } =>
    typeof search.autorisation === 'string' &&
    AUTORISATION.test(search.autorisation)
      ? { autorisation: search.autorisation }
      : {},
  beforeLoad: ({ context, search }) => {
    // Déjà connecté → pas de raison de voir la page de login.
    if (context.auth.session) {
      if (search.autorisation)
        throw redirect({
          to: '/oauth/consent',
          search: { authorization_id: search.autorisation },
        })
      throw redirect({ to: '/' })
    }
  },
  component: ConnexionEcran,
})
